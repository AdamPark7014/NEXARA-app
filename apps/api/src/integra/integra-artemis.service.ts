import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { rethrowArtemis, toArtemisOffsetIso } from '../hikvision-artemis/index';
import {
  captureFingerPrint,
  controlDoor,
  deleteFaceData,
  deleteFingerPrint,
  deleteUserInfo,
  describeAcsEvent,
  downloadFingerPrint,
  identifyDevice,
  listAcsEvents,
  listAllUserInfo,
  mapIsapiUserToPersonDto,
  mapMirrorPersonToDto,
  modifyUserInfo,
  recordUserInfo,
  uploadFaceData,
  uploadFingerPrint,
  searchFaceInfo,
  type IsapiAcsEvent,
  type UserInfoWrite,
} from '../hikvision-isapi/index';
import { IntegraSiteService } from './integra-site.service';
import { IntegraMediaService } from './integra-media.service';
import { IntegraSyncService } from './integra-sync.service';
import { IntegraPortfolioService } from './integra-portfolio.service';
import { IntegraAcsFanoutService } from './integra-acs-fanout.service';
import { IdentityLinkService } from '../identity/identity-link.service';
import {
  deleteAllLocalPersonMedia,
  deleteLocalFingerData,
  deleteLocalPersonFace,
  hasLocalPersonFace,
  listLocalFingerIds,
  readLocalFingerData,
  readLocalPersonFace,
  writeLocalFingerData,
  writeLocalPersonFace,
} from './integra-person-media';
import { ARTEMIS_DOOR_CONTROL, ARTEMIS_DOOR_STATE } from '../hikvision-artemis/artemis.types';

type Actor = { id?: number; email?: string };

/** ISO con offset local — el firmware ACS lo espera así (no siempre acepta Z). */
function toIsapiLocalIso(d: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const hh = pad(Math.floor(Math.abs(off) / 60));
  const mm = pad(Math.abs(off) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${hh}:${mm}`
  );
}

/**
 * Los cuatro `controlType` de Artemis, traducidos al `cmd` que documenta
 * ISAPI en `/AccessControl/RemoteControl/door/{id}`.
 */
const ISAPI_DOOR_CMD: Record<string, 'open' | 'close' | 'alwaysOpen' | 'alwaysClose'> = {
  [ARTEMIS_DOOR_CONTROL.OPEN]: 'open',
  [ARTEMIS_DOOR_CONTROL.CLOSE]: 'close',
  [ARTEMIS_DOOR_CONTROL.REMAIN_OPEN]: 'alwaysOpen',
  [ARTEMIS_DOOR_CONTROL.REMAIN_CLOSED]: 'alwaysClose',
};

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
    private readonly acsFanout: IntegraAcsFanoutService,
    private readonly identity: IdentityLinkService,
  ) {}

  /** Artemis-only; sitios HCT e ISAPI → 400 con mensaje claro (ADR-0019). */
  private async client(companyId?: number | null, siteId?: number | null) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (!resolved.client) {
      throw new BadRequestException(
        `Operación Artemis no disponible en sitio ${resolved.provider}. ` +
          'Usa sync/stream/open adaptados o cambia provider a ARTEMIS.',
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
      if (resolved.provider === 'ISAPI' && resolved.isapi) {
        if (!resolved.isapi.configured) {
          return {
            connected: false,
            configured: false,
            host: resolved.host || null,
            source: resolved.source,
            siteId: resolved.siteId,
            provider: 'ISAPI',
            version: null,
          };
        }
        // `deviceInfo` es la prueba de vida más barata y siempre presente.
        const info = await identifyDevice(resolved.isapi);
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
          provider: 'ISAPI',
          version: {
            provider: 'ISAPI',
            model: info.model,
            firmwareVersion: info.firmwareVersion,
            serialNumber: info.serialNumber,
          },
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
    opts?: { canSettings?: boolean; canControlDoors?: boolean },
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
    opts?: { canSettings?: boolean; canControlDoors?: boolean },
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
          items: items.map((c) => {
            const raw = (c.raw ?? {}) as {
              hasAudio?: boolean;
              deviceKind?: string;
              doorIndexCode?: string;
              channelNumber?: number;
              ptz?: boolean;
              anprCapable?: boolean;
              source?: { ipAddress?: string | null; model?: string | null } | null;
            };
            return {
              id: c.cameraIndexCode,
              name: c.name,
              region: c.regionName,
              regionId: c.regionIndexCode,
              status: c.status,
              encodeDevIndexCode: c.encodeDevIndexCode,
              hasAudio: raw.hasAudio === true,
              // Puesto solo en las terminales de acceso: es la cámara que mira
              // a quien pasa por esa puerta.
              doorIndexCode: raw.doorIndexCode ?? null,
              isDoorCamera: raw.deviceKind === 'ACS',
              // IP del equipo que de verdad ve la escena: los eventos que
              // empuja vienen firmados con ella, no con la del grabador.
              sourceIp: raw.source?.ipAddress ?? null,
              model: raw.source?.model ?? null,
              channelNumber: raw.channelNumber ?? null,
              isPtz:
                raw.ptz === true ||
                /ptz|df8|dome|darkfighter/i.test(`${c.name} ${raw.source?.model || ''}`),
              anprCapable: raw.anprCapable === true,
            };
          }),
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
          regionId: c.regionIndexCode != null ? String(c.regionIndexCode) : null,
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

  stream(
    companyId: number | null,
    cameraIndexCode: string,
    siteId?: number | null,
    opts?: { audio?: boolean },
  ) {
    return this.media.liveStream(companyId, cameraIndexCode, siteId, opts);
  }

  /**
   * Mover la domo es una acción operativa, no una consulta: va con el mismo
   * permiso que abrir una puerta. No se audita cada pulsación —serían cientos
   * por minuto— pero sí ir a una posición memorizada, que es la que cambia
   * a dónde mira la cámara del estacionamiento y se queda así.
   */
  ptzMove(
    companyId: number | null,
    cameraIndexCode: string,
    v: {
      pan?: number;
      tilt?: number;
      zoom?: number;
      durationMs?: number;
      continuous?: boolean;
    },
    siteId?: number | null,
  ) {
    return this.media.ptzMove(companyId, cameraIndexCode, v, siteId);
  }

  ptzStop(companyId: number | null, cameraIndexCode: string, siteId?: number | null) {
    return this.media.ptzStop(companyId, cameraIndexCode, siteId);
  }

  ptzPresets(companyId: number | null, cameraIndexCode: string, siteId?: number | null) {
    return this.media.ptzPresets(companyId, cameraIndexCode, siteId);
  }

  async ptzGoTo(
    companyId: number | null,
    cameraIndexCode: string,
    preset: number,
    actor?: Actor,
    siteId?: number | null,
  ) {
    const r = await this.media.ptzGoTo(companyId, cameraIndexCode, preset, siteId);
    await this.auditMut('integra.ptz.preset', actor, companyId, siteId ?? 0, {
      cameraIndexCode,
      preset,
      email: actor?.email,
    });
    return r;
  }

  /** Enciende/apaga el micrófono en el equipo. Queda escrito allí: se audita. */
  async setCameraAudio(
    companyId: number | null,
    cameraIndexCode: string,
    enabled: boolean,
    actor?: Actor,
    siteId?: number | null,
  ) {
    const result = await this.media.setCameraAudio(companyId, cameraIndexCode, enabled, siteId);
    if (result.changed) {
      await this.auditMut('integra.camera.audio', actor, companyId, siteId ?? 0, {
        cameraIndexCode,
        enabled,
        email: actor?.email,
      });
    }
    return result;
  }

  async playback(
    companyId: number | null,
    cameraIndexCode: string,
    beginTime: string,
    endTime: string,
    siteId?: number | null,
    segmentIndex = 0,
  ) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider === 'ISAPI') {
      return this.media.playbackIsapi(
        companyId,
        cameraIndexCode,
        beginTime,
        endTime,
        siteId,
        segmentIndex,
      );
    }
    if (resolved.provider === 'HCT') {
      throw new BadRequestException('Playback histórico no aplica en sitios HCT');
    }
    try {
      if (!resolved.client) throw new BadRequestException('Sin cliente Artemis');
      const data = await resolved.client.playbackUrls(cameraIndexCode, beginTime, endTime);
      return { cameraIndexCode, url: data?.url ?? null, beginTime, endTime, provider: 'ARTEMIS' as const };
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
          regionId: d.regionIndexCode,
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
          regionId: d.regionIndexCode != null ? String(d.regionIndexCode) : null,
          online: d.online !== false,
          status: ARTEMIS_DOOR_STATE[String(d.doorState ?? '')] || 'unknown',
          doorState: d.doorState,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar puertas');
    }
  }

  /** Workbench: regiones + puertas + cámaras en una round-trip. */
  async getTree(companyId: number | null, siteId?: number | null) {
    const [regions, doors, cameras] = await Promise.all([
      this.listRegions(companyId, siteId),
      this.listDoors(companyId, false, siteId),
      this.listCameras(companyId, false, siteId),
    ]);
    return {
      regions: regions?.items ?? [],
      doors: doors?.items ?? [],
      cameras: cameras?.items ?? [],
      source: {
        regions: regions?.source,
        doors: doors?.source,
        cameras: cameras?.source,
      },
    };
  }

  async openDoor(
    companyId: number | null,
    doorIndexCode: string,
    actor?: Actor,
    siteId?: number | null,
    reason?: string,
  ) {
    return this.controlDoor(
      companyId,
      doorIndexCode,
      ARTEMIS_DOOR_CONTROL.OPEN,
      actor,
      siteId,
      reason,
    );
  }

  async controlDoor(
    companyId: number | null,
    doorIndexCode: string,
    controlType: '0' | '1' | '2' | '3' = ARTEMIS_DOOR_CONTROL.OPEN,
    actor?: Actor,
    siteId?: number | null,
    reason?: string,
  ) {
    const reasonTrim = (reason || '').trim();
    if (reasonTrim.length < 3) {
      throw new BadRequestException('Motivo obligatorio (mín. 3 caracteres)');
    }
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
          reason: reasonTrim,
          email: actor?.email,
        });
        return { success: true, message: `Puerta ${doorIndexCode} abierta (HCT)`, controlType };
      }
      if (resolved.provider === 'ISAPI' && resolved.isapiForHost) {
        // El espejo guarda `<ip>|<doorNo>`: la terminal se manda directo, sin
        // plataforma de por medio.
        const [ip, doorNo] = doorIndexCode.split('|');
        if (!ip || !doorNo) {
          throw new BadRequestException(
            `Puerta ISAPI "${doorIndexCode}" mal formada; se espera "<ip>|<doorNo>"`,
          );
        }
        const isapiCmd = ISAPI_DOOR_CMD[controlType];
        if (!isapiCmd) {
          throw new BadRequestException(`controlType ${controlType} no soportado en ISAPI`);
        }
        await controlDoor(resolved.isapiForHost(ip), doorNo, isapiCmd);
        await this.auditMut('integra.door.control', actor, companyId, resolved.siteId ?? 0, {
          doorIndexCode,
          provider: 'ISAPI',
          controlType,
          cmd: isapiCmd,
          reason: reasonTrim,
          email: actor?.email,
        });
        return {
          success: true,
          message: `Puerta ${doorIndexCode}: ${labels[controlType] || controlType}`,
          controlType,
        };
      }
      if (!resolved.client) {
        throw new BadRequestException('Sin cliente Artemis/HCT/ISAPI');
      }
      await resolved.client.doorControl([doorIndexCode], controlType);
      await this.auditMut('integra.door.control', actor, companyId, resolved.siteId ?? 0, {
        doorIndexCode,
        controlType,
        reason: reasonTrim,
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
      const resolved = await this.sites.resolveClient({
        companyId,
        siteId: opts.siteId,
      });
      const end = opts.endTime ? new Date(opts.endTime) : new Date();
      const start = opts.startTime
        ? new Date(opts.startTime)
        : new Date(end.getTime() - 24 * 60 * 60 * 1000);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new BadRequestException('startTime/endTime inválidos');
      }
      const pageNo = Math.max(1, opts.pageNo ?? 1);
      const pageSize = Math.min(Math.max(1, opts.limit ?? 50), 200);

      if (resolved.provider === 'ISAPI' && resolved.isapiForHost) {
        return await this.listIsapiEvents(resolved, {
          start,
          end,
          pageNo,
          pageSize,
          doorId: opts.doorId,
          personId: opts.personId,
          personName: opts.personName,
        });
      }

      const { client } = await this.client(companyId, opts.siteId);
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

  /**
   * Eventos ACS en vivo desde cada terminal ISAPI (AcsEvent).
   * No hay espejo en Prisma: igual que Artemis, se consultan al equipo.
   */
  private async listIsapiEvents(
    resolved: Awaited<ReturnType<IntegraSiteService['resolveClient']>>,
    opts: {
      start: Date;
      end: Date;
      pageNo: number;
      pageSize: number;
      doorId?: string;
      personId?: string;
      personName?: string;
    },
  ) {
    const siteId = resolved.siteId;
    if (!siteId || !resolved.isapiForHost) {
      throw new BadRequestException('Sitio ISAPI sin cliente');
    }

    const doors = await this.prisma.integraDoor.findMany({
      where: { siteId },
      select: { doorIndexCode: true, name: true, raw: true },
    });
    const doorNameByCode = new Map(doors.map((d) => [d.doorIndexCode, d.name]));

    let targets = doors
      .map((d) => {
        const ip =
          (d.raw as { ip?: string } | null)?.ip ||
          d.doorIndexCode.split('|')[0] ||
          null;
        return ip
          ? { ip, doorIndexCode: d.doorIndexCode, doorName: d.name }
          : null;
      })
      .filter(Boolean) as Array<{ ip: string; doorIndexCode: string; doorName: string }>;

    if (opts.doorId) {
      targets = targets.filter((t) => t.doorIndexCode === opts.doorId);
    }
    if (targets.length === 0) {
      // Fallback: equipos ACS aunque aún no haya puerta espejada.
      const acs = await this.prisma.integraDevice.findMany({
        where: { siteId, kind: 'ACS', ip: { not: null } },
        select: { ip: true, name: true },
      });
      targets = acs.map((d) => ({
        ip: d.ip as string,
        doorIndexCode: `${d.ip}|1`,
        doorName: d.name,
      }));
    }

    const startIso = toIsapiLocalIso(opts.start);
    const endIso = toIsapiLocalIso(opts.end);
    const merged: Array<{
      id: string;
      doorId: string;
      doorName?: string;
      personId?: string;
      personName?: string;
      cardNo?: string;
      eventType: string;
      eventTypeCode?: number;
      timestamp?: string;
      picUri?: string;
      readerName?: string;
    }> = [];

    for (const t of targets) {
      const client = resolved.isapiForHost(t.ip);
      if (!client) continue;
      let events: IsapiAcsEvent[] = [];
      try {
        // Hasta 10 páginas × 30 = 300 por terminal (ventana típica 24 h).
        events = await listAcsEvents(client, {
          startTime: startIso,
          endTime: endIso,
          maxPages: 10,
        });
      } catch (e) {
        this.logger.warn(`AcsEvent ${t.ip}: ${String(e)}`);
        continue;
      }
      for (const ev of events) {
        const empRaw =
          ev.employeeNoString ?? (ev as { employeeNo?: string }).employeeNo ?? null;
        const emp = empRaw != null && String(empRaw).length ? String(empRaw) : undefined;
        merged.push({
          id: String(
            ev.serialNo ??
              `${ev.time}-${t.doorIndexCode}-${emp || ev.cardNo || ''}-${ev.major}-${ev.minor}`,
          ),
          doorId: t.doorIndexCode,
          doorName: doorNameByCode.get(t.doorIndexCode) || t.doorName || ev.doorName,
          personId: emp,
          personName: ev.name,
          cardNo: ev.cardNo != null ? String(ev.cardNo) : undefined,
          eventType: describeAcsEvent(ev),
          eventTypeCode: ev.minor != null ? Number(ev.minor) : undefined,
          timestamp: ev.time,
          picUri: ev.pictureURL != null ? String(ev.pictureURL) : undefined,
          readerName: t.doorName,
        });
      }
    }

    let list = merged;
    if (opts.personId) {
      list = list.filter((e) => String(e.personId ?? '') === String(opts.personId));
    }
    if (opts.personName?.trim()) {
      const q = opts.personName.trim().toLowerCase();
      list = list.filter((e) => String(e.personName || '').toLowerCase().includes(q));
    }
    list.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));

    const total = list.length;
    const startIdx = (opts.pageNo - 1) * opts.pageSize;
    const items = list.slice(startIdx, startIdx + opts.pageSize);
    return {
      total,
      pageNo: opts.pageNo,
      pageSize: opts.pageSize,
      startTime: startIso,
      endTime: endIso,
      source: 'isapi' as const,
      items,
    };
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

  /**
   * Cambia la IP del terminal por su nombre y resuelve las puertas del
   * `RightPlan`. La ficha de una persona tiene que decir «Acceso General», no
   * «192.168.9.163»: la IP es un detalle de instalación, no un dato de negocio.
   */
  private async personLabels(siteId: number | null | undefined) {
    if (!siteId) return { name: () => undefined, doors: () => undefined };
    const [devices, doors] = await Promise.all([
      this.prisma.integraDevice.findMany({
        where: { siteId, ip: { not: null } },
        select: { ip: true, name: true },
      }),
      this.prisma.integraDoor.findMany({
        where: { siteId },
        select: { doorIndexCode: true, name: true },
      }),
    ]);
    const byIp = new Map(devices.map((d) => [d.ip as string, d.name]));
    // `doorIndexCode` es `<ip>|<doorNo>`; el RightPlan de la persona trae el
    // `doorNo` relativo a **su** terminal, así que la IP desempata.
    const byKey = new Map(doors.map((d) => [d.doorIndexCode, d.name]));
    return {
      name: (ip?: string) => (ip ? byIp.get(ip) : undefined),
      doors: (ip: string | undefined, plan: unknown) => {
        if (!ip) return undefined;
        const nos = Array.isArray(plan)
          ? plan
              .map((r) => (r && typeof r === 'object' ? (r as { doorNo?: unknown }).doorNo : null))
              .filter((n): n is number => typeof n === 'number')
          : [];
        const names = nos
          .map((no) => byKey.get(`${ip}|${no}`))
          .filter((n): n is string => Boolean(n));
        return names.length ? names : undefined;
      },
    };
  }

  async listPeople(companyId: number | null, live = false, siteId?: number | null) {
    if (!live && companyId) {
      const items = await this.prisma.integraPerson.findMany({
        where: { companyId, ...(siteId ? { siteId } : {}) },
        orderBy: { personName: 'asc' },
      });
      const label = await this.personLabels(siteId ?? items[0]?.siteId ?? null);
      const mapped = items.map((p) => {
        const dto = mapMirrorPersonToDto(p);
        const localFace = hasLocalPersonFace(companyId, p.personId);
        const localFpIds = listLocalFingerIds(companyId, p.personId);
        return {
          ...dto,
          hasLocalFace: localFace,
          hasFace: Boolean(dto.hasFace || localFace),
          localFpIds,
          sourceName: label.name(dto.sourceIp),
          doorNames: label.doors(dto.sourceIp, dto.rightPlan),
        };
      });
      const withErp = await this.identity.attachErpUsers(companyId, mapped);
      return {
        total: withErp.length,
        source: 'mirror' as const,
        linkModel: 'User.employeeNumber ↔ ACS employeeNo',
        items: withErp,
      };
    }

    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider === 'ISAPI' && resolved.isapiForHost && resolved.siteId) {
      // Live ISAPI: lee UserInfo de cada ACS y opcionalmente refresca el espejo.
      const acs = await this.prisma.integraDevice.findMany({
        where: { siteId: resolved.siteId, kind: 'ACS', ip: { not: null } },
        select: { ip: true },
      });
      const byId = new Map<string, ReturnType<typeof mapIsapiUserToPersonDto>>();
      for (const d of acs) {
        const ip = d.ip as string;
        const client = resolved.isapiForHost(ip);
        if (!client) continue;
        try {
          const users = await listAllUserInfo(client);
          for (const u of users) {
            const id = String(u.employeeNo).trim();
            if (!id || byId.has(id)) continue;
            byId.set(id, mapIsapiUserToPersonDto(u, { sourceIp: ip }));
          }
        } catch (e) {
          this.logger.warn(`UserInfo live ${d.ip}: ${String(e)}`);
        }
      }
      const label = await this.personLabels(resolved.siteId);
      const items = [...byId.values()]
        .map((dto) => {
          const localFace = companyId ? hasLocalPersonFace(companyId, dto.id) : false;
          const localFpIds = companyId ? listLocalFingerIds(companyId, dto.id) : [];
          return {
            ...dto,
            hasLocalFace: localFace,
            hasFace: Boolean(dto.hasFace || localFace),
            localFpIds,
            sourceName: label.name(dto.sourceIp),
            doorNames: label.doors(dto.sourceIp, dto.rightPlan),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const withErp = await this.identity.attachErpUsers(companyId, items);
      return {
        total: withErp.length,
        source: 'live' as const,
        linkModel: 'User.employeeNumber ↔ ACS employeeNo',
        items: withErp,
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
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider === 'ISAPI' && companyId) {
      const row = await this.prisma.integraPerson.findFirst({
        where: {
          companyId,
          personId,
          ...(resolved.siteId ? { siteId: resolved.siteId } : siteId ? { siteId } : {}),
        },
      });
      if (!row) {
        throw new NotFoundException(`Persona ${personId} no está en el espejo — sincroniza el sitio`);
      }
      const dto = mapMirrorPersonToDto(row);
      const label = await this.personLabels(row.siteId);
      const localFace = hasLocalPersonFace(companyId, personId);
      const localFpIds = listLocalFingerIds(companyId, personId);
      const person = {
        ...dto,
        hasLocalFace: localFace,
        hasFace: Boolean(dto.hasFace || localFace),
        localFpIds,
        sourceName: label.name(dto.sourceIp),
        doorNames: label.doors(dto.sourceIp, dto.rightPlan),
      };
      const erpUser = await this.identity.resolvePerson(
        companyId,
        personId,
        row.personCode,
      );
      return {
        personId,
        source: 'mirror' as const,
        provider: 'ISAPI',
        linkModel: 'User.employeeNumber ↔ ACS employeeNo',
        note: 'Edita y sube foto desde esta ficha; se propaga a los terminales DS-K1T.',
        person: { ...person, erpUser },
        erpUser,
        raw: row.raw,
      };
    }

    try {
      const { client } = await this.client(companyId, siteId);
      const data = await client.personInfo(personId);
      return { personId, raw: data };
    } catch (error) {
      rethrowArtemis(error, `No se pudo obtener persona ${personId}`);
    }
  }

  /**
   * Foto de ficha: 1) JPEG local en uploads (lo que el operador subió),
   * 2) GET Digest de `faceURL` del UserInfo si el terminal la entrega.
   * DS-K1T a menudo solo guarda modelo biométrico → sin local = 404 claro.
   */
  async getPersonFace(
    companyId: number | null,
    personId: string,
    siteId?: number | null,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost) {
      throw new BadRequestException('Foto por proxy solo disponible en sitios ISAPI');
    }

    const local = readLocalPersonFace(companyId, personId);
    if (local) return local;

    const row = await this.prisma.integraPerson.findFirst({
      where: {
        companyId,
        personId,
        ...(resolved.siteId ? { siteId: resolved.siteId } : siteId ? { siteId } : {}),
      },
    });
    if (!row) throw new NotFoundException(`Persona ${personId} no encontrada en espejo`);

    const dto = mapMirrorPersonToDto(row);
    if (!dto.faceUrl) {
      throw new NotFoundException(
        `Persona ${personId}: sin JPEG local ni faceURL. El terminal puede tener solo modelo biométrico — sube una foto JPEG desde la ficha.`,
      );
    }

    const sourceIp =
      dto.sourceIp ||
      (
        await this.prisma.integraDevice.findFirst({
          where: { siteId: row.siteId, kind: 'ACS', ip: { not: null } },
          select: { ip: true },
        })
      )?.ip;

    if (!sourceIp) throw new BadRequestException('Sin IP de terminal ACS para obtener la foto');
    const client = resolved.isapiForHost(sourceIp);
    if (!client) throw new BadRequestException('Cliente ISAPI no disponible');

    try {
      return await client.getBinary(dto.faceUrl);
    } catch (e) {
      throw new NotFoundException(
        `No se pudo descargar faceURL (${e instanceof Error ? e.message : String(e)}). Sube un JPEG para guardarlo en NEXARA.`,
      );
    }
  }

  async addPerson(
    companyId: number | null,
    input: {
      personName: string;
      personCode?: string;
      orgIndexCode?: string;
      employeeNo?: string;
      /** Si true (default ISAPI), asigna employeeNo libre cuando no viene código. */
      autoCode?: boolean;
      gender?: string;
      userType?: string;
      validFrom?: string;
      validTo?: string;
      validEnable?: boolean;
      doorRight?: string;
      rightPlan?: unknown;
    },
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider === 'ISAPI' && resolved.isapiForHost && resolved.siteId && companyId) {
      const name = String(input.personName || '').trim();
      if (!name) throw new BadRequestException('Nombre requerido');

      let employeeNo = String(input.employeeNo || input.personCode || '').trim();
      const wantAuto = input.autoCode !== false && !employeeNo;
      if (wantAuto) {
        employeeNo = await this.allocateEmployeeNo(companyId, resolved.siteId);
      }
      if (!employeeNo) throw new BadRequestException('Código de empleado requerido');
      if (employeeNo.length > 32) {
        throw new BadRequestException('Código de empleado demasiado largo (máx 32)');
      }

      const user: UserInfoWrite = {
        employeeNo,
        name,
        userType: input.userType || 'normal',
        gender: input.gender,
        doorRight: input.doorRight,
        RightPlan: input.rightPlan,
        Valid: {
          enable: input.validEnable !== false,
          beginTime: input.validFrom || '2020-01-01T00:00:00',
          endTime: input.validTo || '2037-12-31T23:59:59',
        },
      };
      const results = await this.fanoutAcs(companyId, resolved.siteId, employeeNo, 'person.add', resolved.isapiForHost, async (client) => {
        await recordUserInfo(client, user);
      }, { op: 'userUpsert', user });
      await this.auditMut('integra.person.add', actor, companyId, resolved.siteId, {
        employeeNo,
        results,
        autoCode: wantAuto,
      });
      const allOk = results.length > 0 && results.every((r) => r.ok);
      const anyOk = results.some((r) => r.ok);
      if (anyOk) {
        await this.acsFanout.upsertMirror({
          companyId,
          siteId: resolved.siteId,
          employeeNo,
          name,
          raw: { ...user },
        });
        // Reconcile en background (conteos face/FP); el espejo ya tiene la ficha.
        void this.sync.syncSite(companyId, resolved.siteId).catch(() => undefined);
      }
      return {
        success: allOk,
        partial: anyOk && !allOk,
        employeeNo,
        autoCode: wantAuto,
        results,
        provider: 'ISAPI' as const,
        livePush: true,
        note: allOk
          ? `En vivo en terminales · código ${employeeNo}${wantAuto ? ' (auto)' : ''}.`
          : anyOk
            ? `Alta parcial · código ${employeeNo}: revisa el detalle por IP (reintento en cola).`
            : 'No se pudo crear en ningún terminal.',
      };
    }
    try {
      if (!input.orgIndexCode) throw new BadRequestException('orgIndexCode requerido en Artemis');
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

  /**
   * Código libre para DS-K1T: numérico corto (≤32). Toma el máximo del espejo
   * +1; si no hay numéricos, usa marca de tiempo truncada.
   */
  private async allocateEmployeeNo(companyId: number, siteId: number): Promise<string> {
    const rows = await this.prisma.integraPerson.findMany({
      where: { companyId, siteId },
      select: { personId: true },
    });
    let max = 0;
    for (const r of rows) {
      const id = String(r.personId).trim();
      if (/^\d{1,10}$/.test(id)) {
        const n = Number(id);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    if (max > 0 && max < 2_000_000_000) {
      return String(max + 1);
    }
    // Prefijo corto + segundos: cabe en 32 y evita colisión con cédulas largas.
    return `9${String(Date.now()).slice(-9)}`;
  }

  async updatePerson(
    companyId: number | null,
    personId: string,
    input: {
      personName?: string;
      gender?: string;
      userType?: string;
      validFrom?: string;
      validTo?: string;
      validEnable?: boolean;
      doorRight?: string;
      rightPlan?: unknown;
    },
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost || !resolved.siteId || !companyId) {
      throw new BadRequestException('Edición de ficha solo disponible en sitios ISAPI');
    }
    const employeeNo = String(personId).trim();
    const existing = await this.prisma.integraPerson.findFirst({
      where: { companyId, personId: employeeNo, ...(siteId ? { siteId } : {}) },
    });
    const raw = (existing?.raw && typeof existing.raw === 'object' ? existing.raw : {}) as Record<
      string,
      unknown
    >;
    const user: UserInfoWrite = {
      employeeNo,
      name: (input.personName || existing?.personName || employeeNo).trim(),
      userType: input.userType || (raw.userType != null ? String(raw.userType) : 'normal'),
      gender: input.gender ?? (raw.gender != null ? String(raw.gender) : undefined),
      doorRight:
        input.doorRight ?? (raw.doorRight != null ? String(raw.doorRight) : undefined),
      RightPlan:
        input.rightPlan !== undefined
          ? input.rightPlan
          : (raw.RightPlan ?? raw.rightPlan),
      Valid: {
        enable: input.validEnable !== false,
        beginTime:
          input.validFrom ||
          (raw.Valid as { beginTime?: string } | undefined)?.beginTime ||
          '2020-01-01T00:00:00',
        endTime:
          input.validTo ||
          (raw.Valid as { endTime?: string } | undefined)?.endTime ||
          '2037-12-31T23:59:59',
      },
    };
    const results = await this.fanoutAcs(
      companyId,
      resolved.siteId,
      employeeNo,
      'person.update',
      resolved.isapiForHost,
      async (client) => {
        await modifyUserInfo(client, user);
      },
      { op: 'userUpsert', user },
    );
    await this.auditMut('integra.person.update', actor, companyId, resolved.siteId, {
      employeeNo,
      results,
    });
    const allOk = results.length > 0 && results.every((r) => r.ok);
    const anyOk = results.some((r) => r.ok);
    if (anyOk) {
      await this.acsFanout.upsertMirror({
        companyId,
        siteId: resolved.siteId,
        employeeNo,
        name: user.name,
        raw: { ...raw, ...user },
      });
      void this.sync.syncSite(companyId, resolved.siteId).catch(() => undefined);
    }
    return {
      success: allOk,
      partial: anyOk && !allOk,
      results,
      provider: 'ISAPI' as const,
      livePush: true,
      note: allOk
        ? 'Cambios en vivo a terminales.'
        : anyOk
          ? 'Guardado parcial — revisa IP; reintento en cola.'
          : 'No se pudo guardar en ningún terminal.',
    };
  }

  async deletePerson(
    companyId: number | null,
    personId: string,
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider === 'ISAPI' && resolved.isapiForHost && resolved.siteId && companyId) {
      const id = decodeURIComponent(String(personId || '').trim());
      if (!id) throw new BadRequestException('personId requerido');

      const results = await this.fanoutAcs(
        companyId,
        resolved.siteId,
        id,
        'person.delete',
        resolved.isapiForHost,
        async (client) => {
          await deleteUserInfo(client, id);
        },
        {
          op: 'userDelete',
          user: { employeeNo: id, name: id },
        },
      );
      await this.auditMut('integra.person.delete', actor, companyId, resolved.siteId, {
        personId: id,
        results,
      });

      const allOk = results.length > 0 && results.every((r) => r.ok);
      const anyOk = results.some((r) => r.ok);

      // Solo borramos el espejo si TODOS los terminales confirman. Si no, el sync
      // de 15 min (o live) volvería a meter a la persona y parece que «no borra».
      if (allOk) {
        await this.prisma.integraPerson.deleteMany({
          where: { companyId, personId: id, siteId: resolved.siteId },
        });
        deleteAllLocalPersonMedia(companyId, id);
      }

      return {
        success: allOk,
        partial: anyOk && !allOk,
        results,
        provider: 'ISAPI' as const,
        note: allOk
          ? 'Eliminado en todos los terminales y en el espejo.'
          : anyOk
            ? 'Borrado parcial: sigue en algún terminal; el espejo se conserva. Reintenta o revisa el error por IP.'
            : 'No se pudo eliminar en ningún terminal; el espejo no se tocó.',
      };
    }
    try {
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

  async uploadPersonFace(
    companyId: number | null,
    personId: string,
    jpeg: Buffer,
    actor?: Actor,
    siteId?: number | null,
  ) {
    if (!jpeg?.length) throw new BadRequestException('Imagen JPEG requerida');
    if (jpeg.length < 8_000) {
      throw new BadRequestException(
        'JPEG demasiado pequeño (<8 KB). Usa una foto frontal clara, cara llenando el cuadro (~480–720 px).',
      );
    }
    if (jpeg.length > 1_800_000) {
      throw new BadRequestException(
        'Foto demasiado grande (máx ~1.8 MB). Comprime a JPEG calidad media; los DS-K1T rechazan archivos enormes.',
      );
    }
    // Magic JPEG (FF D8) — PNG/WebP fallan en FaceDataRecord de muchos DS-K1T.
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
      throw new BadRequestException('La foto debe ser JPEG (FF D8). Convierte PNG a JPG antes de subir.');
    }
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost || !resolved.siteId || !companyId) {
      throw new BadRequestException('Subida de rostro solo en sitios ISAPI');
    }
    // Siempre guardar copia local primero: la ficha muestra esta imagen aunque
    // el terminal solo guarde modelo biométrico y no re-entregue JPEG.
    writeLocalPersonFace(companyId, personId, jpeg);

    const results = await this.fanoutAcs(
      companyId,
      resolved.siteId,
      personId,
      'person.face',
      resolved.isapiForHost,
      async (client) => {
        await uploadFaceData(client, { employeeNo: personId, jpeg });
      },
      {
        op: 'faceUpload',
        user: { employeeNo: personId, name: personId },
      },
    );

    // Verificar enrolo con FDSearch (Postman) en terminales que aceptaron.
    const verify: Array<{ deviceIp: string; enrolled: boolean; detail?: string }> = [];
    for (const r of results) {
      if (!r.ok) {
        verify.push({ deviceIp: r.deviceIp, enrolled: false, detail: r.error });
        continue;
      }
      const client = resolved.isapiForHost(r.deviceIp);
      if (!client) {
        verify.push({ deviceIp: r.deviceIp, enrolled: false, detail: 'Sin cliente' });
        continue;
      }
      try {
        const found = await searchFaceInfo(client, { employeeNo: personId });
        verify.push({
          deviceIp: r.deviceIp,
          enrolled: found.total > 0 || found.matches.length > 0,
          detail: found.total > 0 ? `FDSearch total=${found.total}` : 'FDSearch sin match',
        });
      } catch (e) {
        verify.push({
          deviceIp: r.deviceIp,
          enrolled: true, // upload OK; verify opcional
          detail: `Upload OK; FDSearch: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    await this.auditMut('integra.person.face.upload', actor, companyId, resolved.siteId, {
      personId,
      results,
      verify,
      localSaved: true,
      bytes: jpeg.length,
    });
    await this.sync.syncSite(companyId, resolved.siteId).catch(() => undefined);
    const allOk = results.length > 0 && results.every((r) => r.ok);
    const verified = verify.filter((v) => v.enrolled).length;
    return {
      success: allOk,
      partial: results.some((r) => r.ok) && !allOk,
      results,
      verify,
      hasLocalFace: true,
      note: allOk
        ? `Foto en NEXARA (${Math.round(jpeg.length / 1024)} KB) y FaceDataRecord OK. FDSearch confirma en ${verified}/${verify.length} terminales.`
        : results.some((r) => r.ok)
          ? 'Foto guardada en NEXARA; fan-out parcial — revisa el detalle por IP.'
          : 'Foto guardada en NEXARA, pero no se pudo empujar a ningún terminal.',
    };
  }

  async deletePersonFace(
    companyId: number | null,
    personId: string,
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost || !resolved.siteId || !companyId) {
      throw new BadRequestException('Borrado de rostro solo en sitios ISAPI');
    }
    const results = await this.fanoutAcs(
      companyId,
      resolved.siteId,
      personId,
      'person.faceDel',
      resolved.isapiForHost,
      async (client) => {
        await deleteFaceData(client, personId);
      },
      {
        op: 'faceDelete',
        user: { employeeNo: personId, name: personId },
      },
    );
    deleteLocalPersonFace(companyId, personId);
    await this.auditMut('integra.person.face.delete', actor, companyId, resolved.siteId, {
      personId,
      results,
    });
    await this.sync.syncSite(companyId, resolved.siteId).catch(() => undefined);
    return { success: results.some((r) => r.ok), results, hasLocalFace: false };
  }

  /**
   * Captura huella en un terminal concreto (sensor físico) y la propaga
   * (FingerPrintDownload) a todos los ACS. Guarda `fingerData` Base64 en
   * uploads si el capture/upload lo entrega.
   */
  async enrollPersonFingerprint(
    companyId: number | null,
    personId: string,
    input: {
      deviceIp?: string;
      fingerPrintID?: number;
      /** Si ya tienes plantilla (p. ej. re-aplicar), omite captura. */
      fingerData?: string;
      fingerType?: string;
    },
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost || !resolved.siteId || !companyId) {
      throw new BadRequestException('Huella solo en sitios ISAPI');
    }
    const employeeNo = String(personId).trim();
    if (!employeeNo) throw new BadRequestException('personId requerido');
    const fingerPrintID = Math.min(10, Math.max(1, Math.floor(input.fingerPrintID ?? 1) || 1));

    let fingerData = String(input.fingerData || '').trim();
    let quality: number | undefined;
    let captureIp: string | undefined;

    if (!fingerData) {
      const acs = await this.prisma.integraDevice.findMany({
        where: { siteId: resolved.siteId, kind: 'ACS', ip: { not: null } },
        select: { ip: true, name: true, deviceType: true },
      });
      const prefer =
        (input.deviceIp && acs.find((d) => d.ip === input.deviceIp)) ||
        acs.find((d) => /341|fingerprint|FP|huella/i.test(`${d.deviceType || ''} ${d.name || ''}`)) ||
        acs[0];
      if (!prefer?.ip) throw new BadRequestException('Sin terminal ACS para capturar huella');
      captureIp = prefer.ip;
      const client = resolved.isapiForHost(captureIp);
      if (!client) throw new BadRequestException(`Sin cliente ISAPI para ${captureIp}`);
      const captured = await captureFingerPrint(client, fingerPrintID);
      fingerData = captured.fingerData;
      quality = captured.fingerPrintQuality;
    }

    writeLocalFingerData(companyId, employeeNo, fingerPrintID, fingerData);

    const results = await this.fanoutAcs(
      companyId,
      resolved.siteId,
      employeeNo,
      'person.fp',
      resolved.isapiForHost,
      async (client) => {
        await downloadFingerPrint(client, {
          employeeNo,
          fingerPrintID,
          fingerData,
          fingerType: input.fingerType,
        });
      },
    );
    await this.auditMut('integra.person.fp.enroll', actor, companyId, resolved.siteId, {
      personId: employeeNo,
      fingerPrintID,
      captureIp,
      quality,
      results,
    });
    await this.sync.syncSite(companyId, resolved.siteId).catch(() => undefined);
    const allOk = results.length > 0 && results.every((r) => r.ok);
    return {
      success: allOk,
      partial: results.some((r) => r.ok) && !allOk,
      results,
      fingerPrintID,
      fingerPrintQuality: quality,
      captureIp,
      localStored: true,
      localFpIds: listLocalFingerIds(companyId, employeeNo),
      note: allOk
        ? `Huella #${fingerPrintID} digitalizada en NEXARA y aplicada a todos los terminales.`
        : results.some((r) => r.ok)
          ? `Huella #${fingerPrintID} guardada en NEXARA; algunos terminales (p. ej. solo rostro) pueden rechazarla.`
          : 'Plantilla guardada en NEXARA, pero ningún terminal la aceptó.',
    };
  }

  /** Intenta bajar plantilla del ACS (FingerPrintUpload) y guardarla. */
  async fetchPersonFingerprint(
    companyId: number | null,
    personId: string,
    input: { deviceIp?: string; fingerPrintID?: number } = {},
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost || !resolved.siteId || !companyId) {
      throw new BadRequestException('Huella solo en sitios ISAPI');
    }
    const employeeNo = String(personId).trim();
    const fingerPrintID = Math.min(10, Math.max(1, Math.floor(input.fingerPrintID ?? 1) || 1));
    const acs = await this.prisma.integraDevice.findMany({
      where: { siteId: resolved.siteId, kind: 'ACS', ip: { not: null } },
      select: { ip: true },
    });
    const ips = input.deviceIp
      ? [input.deviceIp]
      : acs.map((d) => d.ip as string).filter(Boolean);

    for (const ip of ips) {
      const client = resolved.isapiForHost(ip);
      if (!client) continue;
      try {
        const got = await uploadFingerPrint(client, { employeeNo, fingerPrintID });
        if (got?.fingerData) {
          writeLocalFingerData(companyId, employeeNo, got.fingerNo || fingerPrintID, got.fingerData);
          await this.auditMut('integra.person.fp.fetch', actor, companyId, resolved.siteId, {
            personId: employeeNo,
            fingerPrintID,
            deviceIp: ip,
          });
          return {
            success: true,
            deviceIp: ip,
            fingerPrintID: got.fingerNo || fingerPrintID,
            localStored: true,
            localFpIds: listLocalFingerIds(companyId, employeeNo),
            note: `Plantilla #${fingerPrintID} descargada de ${ip} y guardada en NEXARA.`,
          };
        }
      } catch {
        // probar siguiente terminal
      }
    }

    const local = readLocalFingerData(companyId, employeeNo, fingerPrintID);
    return {
      success: false,
      localStored: Boolean(local),
      localFpIds: listLocalFingerIds(companyId, employeeNo),
      note: local
        ? 'El terminal no exportó fingerData; se conserva la copia local previa.'
        : 'El firmware no exportó la plantilla (solo numOfFP en UserInfo). Enrolá de nuevo desde NEXARA para digitalizarla aquí.',
    };
  }

  async deletePersonFingerprint(
    companyId: number | null,
    personId: string,
    input: { fingerPrintIDs?: number[] } = {},
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost || !resolved.siteId || !companyId) {
      throw new BadRequestException('Huella solo en sitios ISAPI');
    }
    const employeeNo = String(personId).trim();
    const results = await this.fanoutAcs(
      companyId,
      resolved.siteId,
      employeeNo,
      'person.fpDel',
      resolved.isapiForHost,
      async (client) => {
        await deleteFingerPrint(client, employeeNo, input.fingerPrintIDs);
      },
    );
    if (input.fingerPrintIDs?.length) {
      for (const id of input.fingerPrintIDs) deleteLocalFingerData(companyId, employeeNo, id);
    } else {
      deleteLocalFingerData(companyId, employeeNo);
    }
    await this.auditMut('integra.person.fp.delete', actor, companyId, resolved.siteId, {
      personId: employeeNo,
      results,
    });
    await this.sync.syncSite(companyId, resolved.siteId).catch(() => undefined);
    return {
      success: results.some((r) => r.ok),
      results,
      localFpIds: listLocalFingerIds(companyId, employeeNo),
    };
  }

  /** Propaga una operación a todos los terminales ACS del sitio (con reintento). */
  private async fanoutAcs(
    companyId: number,
    siteId: number,
    employeeNo: string,
    op: string,
    isapiForHost: (ip: string) => import('../hikvision-isapi/index').HikvisionIsapiClient | null,
    fn: (client: import('../hikvision-isapi/index').HikvisionIsapiClient) => Promise<void>,
    retry?: {
      op: 'userUpsert' | 'userDisable' | 'userDelete' | 'faceUpload' | 'faceDelete';
      user: UserInfoWrite;
    },
  ): Promise<Array<{ deviceIp: string; ok: boolean; error?: string; attempts?: number }>> {
    const results = await this.acsFanout.fanout({
      companyId,
      siteId,
      op,
      employeeNo,
      isapiForHost,
      fn,
      retry: retry
        ? { companyId, siteId, op: retry.op, user: retry.user }
        : undefined,
    });
    if (results.length === 0) {
      throw new BadRequestException('Sin terminales ACS en el sitio');
    }
    return results;
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
        syncNote:
          'Lista NEXARA. El NVR/PTZ de Oficinas no acepta OCR ANPR (403); las placas no se empujan al equipo.',
        items: items.map((v) => ({
          id: v.vehicleId,
          plate: v.plateNo,
          personId: v.personId,
          personName: v.personName,
        })),
      };
    }
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider === 'ISAPI' && companyId) {
      const sid = siteId ?? resolved.siteId;
      const items = await this.prisma.integraVehicle.findMany({
        where: { companyId, ...(sid ? { siteId: sid } : {}) },
        orderBy: { plateNo: 'asc' },
      });
      return {
        total: items.length,
        source: 'mirror' as const,
        syncNote:
          'Lista NEXARA. El NVR/PTZ de Oficinas no acepta OCR ANPR (403); las placas no se empujan al equipo.',
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
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider === 'ISAPI' && companyId && resolved.siteId) {
      const plate = body.plateNo.trim().toUpperCase();
      if (!plate) throw new BadRequestException('Placa requerida');
      let personName: string | null = null;
      if (body.personId) {
        const p = await this.prisma.integraPerson.findFirst({
          where: { companyId, siteId: resolved.siteId, personId: body.personId },
          select: { personName: true },
        });
        personName = p?.personName ?? null;
      }
      const vehicleId = `local-${plate.replace(/[^A-Z0-9]/gi, '')}`;
      await this.prisma.integraVehicle.upsert({
        where: { siteId_vehicleId: { siteId: resolved.siteId, vehicleId } },
        create: {
          companyId,
          siteId: resolved.siteId,
          vehicleId,
          plateNo: plate,
          personId: body.personId || null,
          personName,
          raw: { source: 'nexara', deviceSync: false },
        },
        update: {
          plateNo: plate,
          personId: body.personId || null,
          personName,
          syncedAt: new Date(),
        },
      });
      await this.auditMut('integra.vehicle.add', actor, companyId, resolved.siteId, {
        plate,
        deviceSync: false,
      });
      return {
        success: true,
        deviceSync: false,
        note: 'Guardada en NEXARA. Este parque no tiene cámara ANPR; no se empuja al NVR.',
      };
    }
    try {
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
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider === 'ISAPI' && companyId && resolved.siteId) {
      const vehicleId = String(body.vehicleId || '');
      const plate = String(body.plateNo || body.plate || '').trim().toUpperCase();
      const personId = body.personId != null ? String(body.personId) : undefined;
      const row = await this.prisma.integraVehicle.findFirst({
        where: { companyId, siteId: resolved.siteId, vehicleId },
      });
      if (!row) throw new NotFoundException('Vehículo no encontrado');
      let personName = row.personName;
      if (personId) {
        const p = await this.prisma.integraPerson.findFirst({
          where: { companyId, siteId: resolved.siteId, personId },
          select: { personName: true },
        });
        personName = p?.personName ?? null;
      }
      await this.prisma.integraVehicle.update({
        where: { id: row.id },
        data: {
          ...(plate ? { plateNo: plate } : {}),
          ...(personId !== undefined ? { personId: personId || null, personName } : {}),
          syncedAt: new Date(),
        },
      });
      await this.auditMut('integra.vehicle.update', actor, companyId, resolved.siteId, body);
      return { success: true, deviceSync: false };
    }
    try {
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
    const resolved = await this.client(companyId, siteId);
    if (resolved.provider === 'ISAPI' && companyId) {
      await this.prisma.integraVehicle.deleteMany({
        where: { companyId, vehicleId, ...(resolved.siteId ? { siteId: resolved.siteId } : {}) },
      });
      await this.auditMut('integra.vehicle.delete', actor, companyId, resolved.siteId ?? 0, {
        vehicleId,
      });
      return { success: true, deviceSync: false };
    }
    try {
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

  /** Cola SOC: alarmas Artemis recientes + estado ack local NEXARA. */
  async alarmQueue(
    companyId: number | null,
    siteId?: number | null,
    opts?: { hours?: number; pageSize?: number },
  ) {
    const hours = Math.min(Math.max(opts?.hours ?? 24, 1), 168);
    const pageSize = Math.min(Math.max(opts?.pageSize ?? 50, 1), 200);
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    const sid = resolved.siteId;
    if (!sid || !companyId) {
      return { items: [], openCount: 0, source: 'none' as const };
    }

    let rawList: Record<string, unknown>[] = [];
    let source: 'artemis' | 'empty' | 'hct' = 'empty';
    if (resolved.provider === 'HCT') {
      source = 'hct';
    } else if (resolved.client) {
      try {
        const data = await resolved.client.eventRecordsPage({
          pageNo: 1,
          pageSize,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });
        rawList = (data as any)?.list || (data as any)?.data?.list || [];
        source = 'artemis';
      } catch {
        rawList = [];
        source = 'empty';
      }
    }

    const acks = await this.prisma.integraAlarmAck.findMany({
      where: { companyId, siteId: sid },
    });
    const ackByExt = new Map(acks.map((a) => [a.externalAlarmId, a]));

    const items = rawList.map((row) => {
      const externalId = alarmExternalId(row);
      const ack = ackByExt.get(externalId);
      const status = ack?.status === 'CLEARED' ? 'CLEARED' : ack ? 'ACK' : 'OPEN';
      return {
        id: externalId,
        status,
        title: humanAlarmTitle(row),
        severity: humanAlarmSeverity(row),
        timestamp: String(
          row.startTime || row.happenTime || row.eventTime || row.time || '',
        ),
        srcName: String(row.srcName || row.regionName || row.doorName || ''),
        cameraIndexCode: row.cameraIndexCode != null ? String(row.cameraIndexCode) : null,
        doorIndexCode: row.doorIndexCode != null ? String(row.doorIndexCode) : null,
        eventType: row.eventType != null ? String(row.eventType) : null,
        note: ack?.note || null,
        ackedAt: ack?.ackedAt?.toISOString() || null,
        clearedAt: ack?.clearedAt?.toISOString() || null,
        raw: row,
      };
    });

    const openCount = items.filter((i) => i.status === 'OPEN').length;
    return { items, openCount, source, siteId: sid };
  }

  async ackAlarm(
    companyId: number | null,
    externalAlarmId: string,
    opts: {
      note?: string;
      actor?: Actor;
      siteId?: number | null;
      status?: 'ACK' | 'CLEARED';
      title?: string;
      severity?: string;
      raw?: unknown;
    },
  ) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    const resolved = await this.sites.resolveClient({ companyId, siteId: opts.siteId });
    const sid = resolved.siteId;
    if (!sid) throw new BadRequestException('Sitio requerido');
    const status = opts.status || 'ACK';
    const note = (opts.note || '').trim() || null;
    const row = await this.prisma.integraAlarmAck.upsert({
      where: {
        siteId_externalAlarmId: { siteId: sid, externalAlarmId },
      },
      create: {
        companyId,
        siteId: sid,
        externalAlarmId,
        status,
        note,
        userId: opts.actor?.id ?? null,
        title: opts.title || null,
        severity: opts.severity || null,
        raw: (opts.raw as any) ?? undefined,
        clearedAt: status === 'CLEARED' ? new Date() : null,
      },
      update: {
        status,
        note,
        userId: opts.actor?.id ?? null,
        title: opts.title || undefined,
        severity: opts.severity || undefined,
        clearedAt: status === 'CLEARED' ? new Date() : null,
        ackedAt: new Date(),
      },
    });
    await this.auditMut(
      status === 'CLEARED' ? 'integra.alarm.clear' : 'integra.alarm.ack',
      opts.actor,
      companyId,
      sid,
      { externalAlarmId, note, status },
    );
    return {
      id: row.externalAlarmId,
      status: row.status,
      note: row.note,
      ackedAt: row.ackedAt.toISOString(),
      clearedAt: row.clearedAt?.toISOString() || null,
    };
  }

  async listFloorplans(companyId: number | null, siteId?: number | null) {
    if (!companyId) return { items: [] };
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    const sid = resolved.siteId;
    if (!sid) return { items: [] };
    const rows = await this.prisma.integraFloorplan.findMany({
      where: { companyId, siteId: sid },
      include: { pins: true },
      orderBy: { id: 'asc' },
    });
    return {
      items: rows.map((f) => ({
        id: f.id,
        name: f.name,
        imageData: f.imageData,
        pins: f.pins.map((p) => ({
          id: p.id,
          entityType: p.entityType,
          entityId: p.entityId,
          label: p.label,
          xPct: p.xPct,
          yPct: p.yPct,
        })),
      })),
    };
  }

  async createFloorplan(
    companyId: number | null,
    input: { name: string; imageData: string },
    siteId?: number | null,
  ) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    const sid = resolved.siteId;
    if (!sid) throw new BadRequestException('Sitio requerido');
    if (!input.imageData || input.imageData.length < 32) {
      throw new BadRequestException('Imagen requerida');
    }
    const row = await this.prisma.integraFloorplan.create({
      data: {
        companyId,
        siteId: sid,
        name: input.name.trim() || 'Plano',
        imageData: input.imageData,
      },
    });
    return { id: row.id, name: row.name };
  }

  async upsertMapPin(
    companyId: number | null,
    floorplanId: number,
    pin: {
      entityType: 'CAMERA' | 'DOOR';
      entityId: string;
      label?: string;
      xPct: number;
      yPct: number;
    },
  ) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    const fp = await this.prisma.integraFloorplan.findFirst({
      where: { id: floorplanId, companyId },
    });
    if (!fp) throw new BadRequestException('Plano no encontrado');
    const row = await this.prisma.integraMapPin.upsert({
      where: {
        floorplanId_entityType_entityId: {
          floorplanId,
          entityType: pin.entityType,
          entityId: pin.entityId,
        },
      },
      create: {
        floorplanId,
        entityType: pin.entityType,
        entityId: pin.entityId,
        label: pin.label || null,
        xPct: pin.xPct,
        yPct: pin.yPct,
      },
      update: {
        label: pin.label || null,
        xPct: pin.xPct,
        yPct: pin.yPct,
      },
    });
    return row;
  }

  async deleteMapPin(companyId: number | null, pinId: number) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    const pin = await this.prisma.integraMapPin.findFirst({
      where: { id: pinId, floorplan: { companyId } },
    });
    if (!pin) throw new BadRequestException('Pin no encontrado');
    await this.prisma.integraMapPin.delete({ where: { id: pinId } });
    return { success: true };
  }

  async visitorRecords(
    companyId: number | null,
    body: Record<string, unknown>,
    siteId?: number | null,
  ) {
    try {
      const { client } = await this.client(companyId, siteId);
      return await client.visitorAppointmentRecords(body);
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar visitas');
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

  async pollLiveEvents(
    companyId: number | null,
    siteId?: number | null,
    limit = 40,
  ) {
    const end = new Date();
    const start = new Date(end.getTime() - 2 * 60 * 60 * 1000);
    try {
      return await this.listEvents(companyId, {
        limit,
        pageNo: 1,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        siteId,
      });
    } catch {
      return { items: [], total: 0, source: 'error' as const };
    }
  }
}

function alarmExternalId(row: Record<string, unknown>): string {
  const id =
    row.eventId ??
    row.id ??
    row.alarmId ??
    `${row.eventType ?? 'e'}-${row.startTime ?? row.happenTime ?? row.eventTime ?? ''}-${row.srcIndex ?? row.srcName ?? ''}`;
  return String(id).slice(0, 220);
}

function humanAlarmTitle(row: Record<string, unknown>): string {
  const name =
    row.eventTypeName ||
    row.srcName ||
    row.regionName ||
    row.doorName ||
    row.eventType ||
    'Alarma';
  return String(name);
}

function humanAlarmSeverity(row: Record<string, unknown>): string {
  const raw = row.eventLvl ?? row.priority ?? row.severity ?? row.eventType;
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n >= 3) return 'alta';
    if (n === 2) return 'media';
    return 'baja';
  }
  return 'media';
}
