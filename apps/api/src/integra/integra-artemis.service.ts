import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { rethrowArtemis, toArtemisOffsetIso } from '../hikvision-artemis/index';
import { IntegraSiteService } from './integra-site.service';
import { IntegraMediaService } from './integra-media.service';
import { IntegraSyncService } from './integra-sync.service';
import { IntegraPortfolioService } from './integra-portfolio.service';
import { ARTEMIS_DOOR_CONTROL, ARTEMIS_DOOR_STATE } from '../hikvision-artemis/artemis.types';

type Actor = { id?: number; email?: string };

@Injectable()
export class IntegraArtemisService {
  private readonly logger = new Logger(IntegraArtemisService.name);

  constructor(
    private readonly sites: IntegraSiteService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: IntegraMediaService,
    private readonly sync: IntegraSyncService,
    private readonly portfolioSvc: IntegraPortfolioService,
  ) {}

  /** Artemis-only; sitios HCT → 400 con mensaje claro (ADR-0019). */
  private async client(companyId?: number | null, siteId?: number | null) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (!resolved.client) {
      throw new BadRequestException(
        'Operación Artemis no disponible en sitio HCT. Usa sync/stream/open adaptados o cambia provider a ARTEMIS.',
      );
    }
    return { ...resolved, client: resolved.client };
  }

  private async auditMut(
    action: string,
    actor: Actor | undefined,
    companyId: number | null | undefined,
    entityId: number,
    changes: Record<string, unknown>,
  ) {
    try {
      await this.audit.log(
        {
          entityType: 'Integra',
          entityId,
          action,
          changes,
          companyId: companyId ?? null,
          source: 'integra',
        },
        actor?.id,
      );
    } catch (e) {
      this.logger.warn(`Audit Integra falló: ${String(e)}`);
    }
  }

  async health(companyId?: number | null, siteId?: number | null) {
    try {
      const resolved = await this.sites.resolveClient({ companyId, siteId });
      if (resolved.provider === 'HCT' && resolved.hct) {
        if (!resolved.hct.configured) {
          return {
            connected: false,
            configured: false,
            host: resolved.host || null,
            source: resolved.source,
            siteId: resolved.siteId,
            provider: 'HCT',
            version: null,
          };
        }
        await resolved.hct.streamToken();
        if (resolved.siteId) {
          await this.prisma.integraSite.update({
            where: { id: resolved.siteId },
            data: { lastHealthOkAt: new Date() },
          });
        }
        return {
          connected: true,
          configured: true,
          host: resolved.host,
          source: resolved.source,
          siteId: resolved.siteId,
          provider: 'HCT',
          version: { provider: 'HCT' },
        };
      }
      const client = resolved.client;
      if (!client?.configured) {
        return {
          connected: false,
          configured: false,
          host: resolved.host || null,
          source: resolved.source,
          siteId: resolved.siteId,
          provider: 'ARTEMIS',
          version: null,
        };
      }
      const version = await client.version();
      if (resolved.siteId) {
        await this.prisma.integraSite.update({
          where: { id: resolved.siteId },
          data: { lastHealthOkAt: new Date() },
        });
      }
      return {
        connected: true,
        configured: true,
        host: resolved.host,
        source: resolved.source,
        siteId: resolved.siteId,
        provider: 'ARTEMIS',
        version,
      };
    } catch (error) {
      return {
        connected: false,
        configured: false,
        host: null,
        source: null,
        siteId: siteId ?? null,
        version: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async dashboard(
    companyId: number | null,
    siteId?: number | null,
    opts?: { canSettings?: boolean },
  ) {
    if (!companyId) {
      const h = await this.health(null);
      return {
        ...h,
        cameras: 0,
        doors: 0,
        doorsOnline: 0,
        doorsOffline: 0,
        people: 0,
        devices: 0,
        vehicles: 0,
        regions: 0,
        lastSync: null,
        capabilities: await this.portfolioSvc.capabilities(null, null, opts),
      };
    }
    const siteFilter = siteId ? { siteId } : {};
    const [cameras, doors, people, devices, vehicles, regions, lastSync, h, capabilities, doorsOnline, doorsOffline] =
      await Promise.all([
        this.prisma.integraCamera.count({ where: { companyId, ...siteFilter } }),
        this.prisma.integraDoor.count({ where: { companyId, ...siteFilter } }),
        this.prisma.integraPerson.count({ where: { companyId, ...siteFilter } }),
        this.prisma.integraDevice.count({ where: { companyId, ...siteFilter } }),
        this.prisma.integraVehicle.count({ where: { companyId, ...siteFilter } }),
        this.prisma.integraRegion.count({ where: { companyId, ...siteFilter } }),
        this.sync.lastRun(companyId, siteId ?? undefined),
        this.health(companyId, siteId),
        this.portfolioSvc.capabilities(companyId, siteId, opts),
        this.prisma.integraDoor.count({ where: { companyId, ...siteFilter, online: true } }),
        this.prisma.integraDoor.count({ where: { companyId, ...siteFilter, online: false } }),
      ]);
    return {
      ...h,
      cameras,
      doors,
      doorsOnline,
      doorsOffline,
      people,
      devices,
      vehicles,
      regions,
      lastSync,
      capabilities,
    };
  }

  async listAudit(
    companyId: number | null,
    opts: { limit?: number; siteId?: number | null } = {},
  ) {
    const limit = Math.min(Math.max(opts.limit ?? 40, 1), 200);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(companyId != null ? { companyId } : {}),
        OR: [
          { entityType: 'Integra' },
          { source: 'integra' },
          { action: { startsWith: 'integra.' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, email: true, nombre: true } } },
    });
    return {
      total: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityId: r.entityId,
        createdAt: r.createdAt.toISOString(),
        userEmail: r.user?.email || null,
        userName: r.user?.nombre || null,
        changes: r.changes,
      })),
    };
  }

  getPortfolio(
    companyId: number | null,
    isSuperAdmin?: boolean,
    canSettings = true,
  ) {
    return this.portfolioSvc.portfolio({ companyId, isSuperAdmin, canSettings });
  }

  capabilities(
    companyId: number | null,
    siteId?: number | null,
    opts?: { canSettings?: boolean },
  ) {
    return this.portfolioSvc.capabilities(companyId, siteId, opts);
  }

  async listRegions(companyId: number | null, siteId?: number | null) {
    if (companyId) {
      const items = await this.prisma.integraRegion.findMany({
        where: { companyId, ...(siteId ? { siteId } : {}) },
        orderBy: { name: 'asc' },
      });
      return {
        total: items.length,
        source: 'mirror' as const,
        items: items.map((r) => ({
          id: r.indexCode,
          name: r.name,
          parentId: r.parentIndexCode,
        })),
      };
    }
    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.regions(1, 200);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        source: 'live' as const,
        items: (data?.list ?? []).map((r) => ({
          id: String(r.indexCode ?? ''),
          name: r.name || String(r.indexCode ?? ''),
          parentId: r.parentIndexCode,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar regiones');
    }
  }

  async listCameras(companyId: number | null, live = false, siteId?: number | null) {
    if (!live && companyId) {
      const items = await this.prisma.integraCamera.findMany({
        where: { companyId, ...(siteId ? { siteId } : {}) },
        orderBy: { name: 'asc' },
      });
      if (items.length > 0 || !live) {
        return {
          total: items.length,
          source: 'mirror' as const,
          items: items.map((c) => ({
            id: c.cameraIndexCode,
            name: c.name,
            region: c.regionName,
            status: c.status,
            encodeDevIndexCode: c.encodeDevIndexCode,
          })),
        };
      }
    }
    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.cameras(1, 200);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        source: 'live' as const,
        items: (data?.list ?? []).map((c) => ({
          id: String(c.cameraIndexCode ?? ''),
          name: c.cameraName || String(c.cameraIndexCode ?? ''),
          region: c.regionName,
          status: c.status,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar cámaras');
    }
  }

  async preview(companyId: number | null, cameraIndexCode: string, siteId?: number | null) {
    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.previewUrls(cameraIndexCode);
      return {
        cameraIndexCode,
        url: data?.url ?? null,
        protocol: 'rtsp_s',
        note: 'URL RTSP; preferir /stream para HLS',
      };
    } catch (error) {
      rethrowArtemis(error, `No se pudo obtener preview de ${cameraIndexCode}`);
    }
  }

  stream(companyId: number | null, cameraIndexCode: string, siteId?: number | null) {
    return this.media.liveStream(companyId, cameraIndexCode, siteId);
  }

  async playback(
    companyId: number | null,
    cameraIndexCode: string,
    beginTime: string,
    endTime: string,
    siteId?: number | null,
  ) {
    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.playbackUrls(cameraIndexCode, beginTime, endTime);
      return { cameraIndexCode, url: data?.url ?? null, beginTime, endTime };
    } catch (error) {
      rethrowArtemis(error, 'No se pudo obtener playback');
    }
  }

  async capture(companyId: number | null, cameraIndexCode: string, siteId?: number | null) {
    try {
      const { client } = await this.client(companyId, siteId);
      return await client.cameraCapture(cameraIndexCode);
    } catch (error) {
      rethrowArtemis(error, 'No se pudo capturar snapshot');
    }
  }

  async listDoors(companyId: number | null, live = false, siteId?: number | null) {
    if (!live && companyId) {
      const items = await this.prisma.integraDoor.findMany({
        where: { companyId, ...(siteId ? { siteId } : {}) },
        orderBy: { name: 'asc' },
      });
      return {
        total: items.length,
        source: 'mirror' as const,
        items: items.map((d) => ({
          id: d.doorIndexCode,
          name: d.name,
          location: d.regionName,
          online: d.online,
          status: ARTEMIS_DOOR_STATE[String(d.doorState ?? '')] || 'unknown',
          doorState: d.doorState,
        })),
      };
    }
    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.doorList(1, 200);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        source: 'live' as const,
        items: (data?.list ?? []).map((d) => ({
          id: String(d.doorIndexCode ?? d.doorNo ?? ''),
          name: d.doorName || String(d.doorIndexCode ?? ''),
          location: d.regionName,
          online: d.online !== false,
          status: ARTEMIS_DOOR_STATE[String(d.doorState ?? '')] || 'unknown',
          doorState: d.doorState,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar puertas');
    }
  }

  async openDoor(
    companyId: number | null,
    doorIndexCode: string,
    actor?: Actor,
    siteId?: number | null,
  ) {
    return this.controlDoor(companyId, doorIndexCode, ARTEMIS_DOOR_CONTROL.OPEN, actor, siteId);
  }

  async controlDoor(
    companyId: number | null,
    doorIndexCode: string,
    controlType: '0' | '1' | '2' | '3' = ARTEMIS_DOOR_CONTROL.OPEN,
    actor?: Actor,
    siteId?: number | null,
  ) {
    const labels: Record<string, string> = {
      '0': 'remain_open',
      '1': 'close',
      '2': 'open',
      '3': 'remain_closed',
    };
    try {
      const resolved = await this.sites.resolveClient({ companyId, siteId });
      if (resolved.provider === 'HCT' && resolved.hct) {
        if (controlType !== ARTEMIS_DOOR_CONTROL.OPEN) {
          throw new BadRequestException('HCT solo soporta apertura remota (controlType=2)');
        }
        await resolved.hct.remoteDoorControl([doorIndexCode]);
        await this.auditMut('integra.door.open', actor, companyId, resolved.siteId ?? 0, {
          doorIndexCode,
          provider: 'HCT',
          controlType,
          email: actor?.email,
        });
        return { success: true, message: `Puerta ${doorIndexCode} abierta (HCT)`, controlType };
      }
      if (!resolved.client) {
        throw new BadRequestException('Sin cliente Artemis/HCT');
      }
      await resolved.client.doorControl([doorIndexCode], controlType);
      await this.auditMut('integra.door.control', actor, companyId, resolved.siteId ?? 0, {
        doorIndexCode,
        controlType,
        email: actor?.email,
      });
      return {
        success: true,
        message: `Puerta ${doorIndexCode}: ${labels[controlType] || controlType}`,
        controlType,
      };
    } catch (error) {
      rethrowArtemis(error, `No se pudo controlar la puerta ${doorIndexCode}`);
    }
  }

  async listEvents(
    companyId: number | null,
    opts: {
      limit?: number;
      pageNo?: number;
      doorId?: string;
      personId?: string;
      personName?: string;
      eventType?: number;
      startTime?: string;
      endTime?: string;
      siteId?: number | null;
    } = {},
  ) {
    try {
      const { client } = await this.client(companyId, opts.siteId);
      const end = opts.endTime ? new Date(opts.endTime) : new Date();
      const start = opts.startTime
        ? new Date(opts.startTime)
        : new Date(end.getTime() - 24 * 60 * 60 * 1000);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new BadRequestException('startTime/endTime inválidos');
      }
      const pageNo = Math.max(1, opts.pageNo ?? 1);
      const pageSize = Math.min(Math.max(1, opts.limit ?? 50), 200);
      const data = await client.doorEvents(
        toArtemisOffsetIso(start),
        toArtemisOffsetIso(end),
        pageNo,
        pageSize,
        {
          doorIndexCodes: opts.doorId ? [opts.doorId] : undefined,
          eventType: opts.eventType,
        },
      );
      let list = data?.list ?? [];
      if (opts.personId) {
        list = list.filter((e) => String(e.personId ?? '') === String(opts.personId));
      }
      if (opts.personName?.trim()) {
        const q = opts.personName.trim().toLowerCase();
        list = list.filter((e) => String(e.personName || '').toLowerCase().includes(q));
      }
      return {
        total: data?.total ?? list.length,
        pageNo,
        pageSize,
        startTime: toArtemisOffsetIso(start),
        endTime: toArtemisOffsetIso(end),
        items: list.map((e) => ({
          id: String(e.eventId ?? `${e.eventTime}-${e.doorIndexCode}-${e.personId}`),
          doorId: String(e.doorIndexCode ?? ''),
          doorName: e.doorName,
          personId: e.personId ? String(e.personId) : undefined,
          personName: e.personName,
          cardNo: e.cardNo,
          eventType: String(e.eventTypeName || e.eventType || ''),
          eventTypeCode: e.eventType != null ? Number(e.eventType) : undefined,
          timestamp: e.eventTime,
          picUri: e.picUri,
          readerName: e.readerName,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar eventos');
    }
  }

  async eventPicture(companyId: number | null, picUri: string, siteId?: number | null) {
    try {
      const { client } = await this.client(companyId, siteId);
      return await client.eventPictures(picUri);
    } catch (error) {
      rethrowArtemis(error, 'No se pudo obtener foto de evento');
    }
  }

  async listDevices(companyId: number | null, siteId?: number | null) {
    if (companyId) {
      const items = await this.prisma.integraDevice.findMany({
        where: { companyId, ...(siteId ? { siteId } : {}) },
        orderBy: { name: 'asc' },
      });
      return {
        total: items.length,
        items: items.map((d) => ({
          id: d.indexCode,
          name: d.name,
          kind: d.kind,
          ip: d.ip,
          online: d.online,
          deviceType: d.deviceType,
        })),
      };
    }
    return { total: 0, items: [] };
  }

  async listOrgs(companyId: number | null, siteId?: number | null) {
    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.orgList(1, 200);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        items: (data?.list ?? []).map((o) => ({
          id: String(o.orgIndexCode ?? ''),
          name: o.orgName || '',
          parentId: o.parentOrgIndexCode,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar organizaciones');
    }
  }

  async listPeople(companyId: number | null, live = false, siteId?: number | null) {
    if (!live && companyId) {
      const items = await this.prisma.integraPerson.findMany({
        where: { companyId, ...(siteId ? { siteId } : {}) },
        orderBy: { personName: 'asc' },
      });
      return {
        total: items.length,
        source: 'mirror' as const,
        items: items.map((p) => ({
          id: p.personId,
          name: p.personName,
          code: p.personCode,
          orgId: p.orgIndexCode,
          orgName: p.orgName,
        })),
      };
    }
    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.personList(1, 200);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        source: 'live' as const,
        items: (data?.list ?? []).map((p) => ({
          id: String(p.personId ?? ''),
          name: p.personName || '',
          code: p.personCode,
          orgId: p.orgIndexCode,
          orgName: p.orgName,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar personas');
    }
  }

  async getPerson(companyId: number | null, personId: string, siteId?: number | null) {
    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.personInfo(personId);
      return { personId, raw: data };
    } catch (error) {
      rethrowArtemis(error, `No se pudo obtener persona ${personId}`);
    }
  }

  async addPerson(
    companyId: number | null,
    input: { personName: string; personCode?: string; orgIndexCode: string },
    actor?: Actor,
    siteId?: number | null,
  ) {
    try {
      const resolved = await this.client(companyId, siteId);
      const data = await resolved.client.personAdd({
        personName: input.personName,
        personCode: input.personCode,
        orgIndexCode: input.orgIndexCode,
      });
      await this.auditMut('integra.person.add', actor, companyId, resolved.siteId ?? 0, input);
      if (resolved.siteId && companyId) {
        await this.sync.syncSite(companyId, resolved.siteId).catch(() => undefined);
      }
      return { success: true, data };
    } catch (error) {
      rethrowArtemis(error, 'No se pudo crear la persona');
    }
  }

  async deletePerson(
    companyId: number | null,
    personId: string,
    actor?: Actor,
    siteId?: number | null,
  ) {
    try {
      const resolved = await this.client(companyId, siteId);
      await resolved.client.personDelete(personId);
      await this.auditMut('integra.person.delete', actor, companyId, resolved.siteId ?? 0, {
        personId,
      });
      if (companyId) {
        await this.prisma.integraPerson.deleteMany({ where: { companyId, personId } });
      }
      return { success: true };
    } catch (error) {
      rethrowArtemis(error, `No se pudo eliminar persona ${personId}`);
    }
  }

  async listPrivilegeGroups(companyId: number | null, siteId?: number | null) {
    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.privilegeGroups(1, 200);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        items: (data?.list ?? []).map((g) => ({
          id: String(g.privilegeGroupId ?? ''),
          name: g.privilegeGroupName || '',
          description: g.description,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar grupos de privilegio');
    }
  }

  async assignPersonsToGroup(
    companyId: number | null,
    privilegeGroupId: string,
    personIds: string[],
    actor?: Actor,
    siteId?: number | null,
  ) {
    try {
      const resolved = await this.client(companyId, siteId);
      await resolved.client.privilegeAddPersons(privilegeGroupId, personIds);
      await this.auditMut('integra.privilege.assign', actor, companyId, resolved.siteId ?? 0, {
        privilegeGroupId,
        personIds,
      });
      return { success: true };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron asignar personas al grupo');
    }
  }

  async applyAuth(companyId: number | null, actor?: Actor, siteId?: number | null) {
    try {
      const resolved = await this.client(companyId, siteId);
      await resolved.client.authReapplication();
      await this.auditMut('integra.privilege.apply', actor, companyId, resolved.siteId ?? 0, {});
      return { success: true, message: 'Reaplicación de privilegios solicitada' };
    } catch (error) {
      rethrowArtemis(error, 'No se pudo reaplicar privilegios');
    }
  }

  async listVehicles(companyId: number | null, live = false, siteId?: number | null) {
    if (!live && companyId) {
      const items = await this.prisma.integraVehicle.findMany({
        where: { companyId, ...(siteId ? { siteId } : {}) },
        orderBy: { plateNo: 'asc' },
      });
      return {
        total: items.length,
        source: 'mirror' as const,
        items: items.map((v) => ({
          id: v.vehicleId,
          plate: v.plateNo,
          personId: v.personId,
          personName: v.personName,
        })),
      };
    }
    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.vehicleList(1, 200);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        source: 'live' as const,
        items: (data?.list ?? []).map((v) => ({
          id: String(v.vehicleId ?? ''),
          plate: v.plateNo || '',
          personId: v.personId,
          personName: v.personName,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar vehículos');
    }
  }

  async addVehicle(
    companyId: number | null,
    body: { plateNo: string; personId?: string },
    actor?: Actor,
    siteId?: number | null,
  ) {
    try {
      const resolved = await this.client(companyId, siteId);
      const data = await resolved.client.vehicleAdd(body);
      await this.auditMut('integra.vehicle.add', actor, companyId, resolved.siteId ?? 0, body);
      if (resolved.siteId && companyId) {
        await this.sync.syncSite(companyId, resolved.siteId).catch(() => undefined);
      }
      return { success: true, data };
    } catch (error) {
      rethrowArtemis(error, 'No se pudo crear vehículo');
    }
  }

  async updateVehicle(
    companyId: number | null,
    body: Record<string, unknown>,
    actor?: Actor,
    siteId?: number | null,
  ) {
    try {
      const resolved = await this.client(companyId, siteId);
      const data = await resolved.client.vehicleUpdate(body);
      await this.auditMut('integra.vehicle.update', actor, companyId, resolved.siteId ?? 0, body);
      return { success: true, data };
    } catch (error) {
      rethrowArtemis(error, 'No se pudo actualizar vehículo');
    }
  }

  async deleteVehicle(
    companyId: number | null,
    vehicleId: string,
    actor?: Actor,
    siteId?: number | null,
  ) {
    try {
      const resolved = await this.client(companyId, siteId);
      await resolved.client.vehicleDelete(vehicleId);
      await this.auditMut('integra.vehicle.delete', actor, companyId, resolved.siteId ?? 0, {
        vehicleId,
      });
      if (companyId) {
        await this.prisma.integraVehicle.deleteMany({ where: { companyId, vehicleId } });
      }
      return { success: true };
    } catch (error) {
      rethrowArtemis(error, 'No se pudo eliminar vehículo');
    }
  }

  async alarmRecords(companyId: number | null, body: Record<string, unknown>, siteId?: number | null) {
    try {
      const { client } = await this.client(companyId, siteId);
      return await client.eventRecordsPage(body);
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar alarmas');
    }
  }

  async visitorQr(companyId: number | null, body: Record<string, unknown>, siteId?: number | null) {
    try {
      const { client } = await this.client(companyId, siteId);
      return await client.visitorQr(body);
    } catch (error) {
      rethrowArtemis(error, 'No se pudo obtener QR de visita');
    }
  }

  async visitorRegister(
    companyId: number | null,
    body: Record<string, unknown>,
    actor?: Actor,
    siteId?: number | null,
  ) {
    try {
      const resolved = await this.client(companyId, siteId);
      const data = await resolved.client.visitorAppointment(body);
      await this.auditMut('integra.visitor.register', actor, companyId, resolved.siteId ?? 0, body);
      return { success: true, data };
    } catch (error) {
      rethrowArtemis(error, 'No se pudo registrar visita');
    }
  }

  async anprRecords(companyId: number | null, body: Record<string, unknown>, siteId?: number | null) {
    try {
      const { client } = await this.client(companyId, siteId);
      return await client.anprCrossRecords(body);
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar cruces ANPR');
    }
  }
}
