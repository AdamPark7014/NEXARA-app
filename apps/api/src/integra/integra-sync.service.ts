import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { HikConnectTeamsClient } from '../hikvision-hct/index';
import { describeDevice, listAllUserInfo } from '../hikvision-isapi/index';
import { IntegraSiteService, type ResolvedIntegraClient } from './integra-site.service';

/** `http://192.168.9.34` → `192.168.9.34`. */
function hostnameOf(host: string): string {
  return host.replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
}

@Injectable()
export class IntegraSyncService {
  private readonly logger = new Logger(IntegraSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: IntegraSiteService,
  ) {}

  @Cron('*/15 * * * *')
  async cronSyncAll() {
    const active = await this.prisma.integraSite.findMany({
      where: { isActive: true },
      select: { id: true, companyId: true },
    });
    for (const s of active) {
      try {
        await this.syncSite(s.companyId, s.id);
      } catch (e) {
        this.logger.warn(`Sync sitio ${s.id} falló: ${String(e)}`);
      }
    }
  }

  private async drainPages<T>(
    fetchPage: (pageNo: number, pageSize: number) => Promise<{ list?: T[]; total?: number } | null | undefined>,
    pageSize = 200,
    maxPages = 50,
  ): Promise<T[]> {
    const all: T[] = [];
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      const data = await fetchPage(pageNo, pageSize);
      const list = data?.list ?? [];
      all.push(...list);
      if (list.length < pageSize) break;
      const total = data?.total;
      if (typeof total === 'number' && all.length >= total) break;
    }
    return all;
  }

  async syncSite(companyId: number, siteId: number) {
    const run = await this.prisma.integraSyncRun.create({
      data: { companyId, siteId, status: 'RUNNING' },
    });

    try {
      const resolved = await this.sites.resolveClient({ companyId, siteId });
      const now = new Date();

      if (resolved.provider === 'HCT' && resolved.hct) {
        return await this.syncHctSite(companyId, siteId, run.id, resolved.hct, now);
      }

      if (resolved.provider === 'ISAPI' && resolved.isapi) {
        return await this.syncIsapiSite(companyId, siteId, run.id, resolved, now);
      }

      const client = resolved.client;
      if (!client) throw new Error('Sin cliente Artemis para sync');

      const [cams, doors, people, acsDevs, encDevs, vehicles, regions] = await Promise.all([
        this.drainPages((p, s) => client.cameras(p, s), 200),
        this.drainPages((p, s) => client.doorList(p, s), 200),
        this.drainPages((p, s) => client.personList(p, s), 200),
        this.drainPages((p, s) => client.acsDeviceList(p, s).catch(() => ({ list: [] })), 200),
        this.drainPages((p, s) => client.encodeDeviceList(p, s).catch(() => ({ list: [] })), 200),
        this.drainPages((p, s) => client.vehicleList(p, s).catch(() => ({ list: [] })), 200),
        this.drainPages((p, s) => client.regions(p, s).catch(() => ({ list: [] })), 200),
      ]);

      let cameraCount = 0;
      const seenCams = new Set<string>();
      for (const c of cams) {
        const code = String(c.cameraIndexCode ?? '');
        if (!code) continue;
        cameraCount++;
        seenCams.add(code);
        await this.prisma.integraCamera.upsert({
          where: { siteId_cameraIndexCode: { siteId, cameraIndexCode: code } },
          create: {
            companyId,
            siteId,
            cameraIndexCode: code,
            name: c.cameraName || code,
            regionName: c.regionName,
            regionIndexCode: c.regionIndexCode,
            status: c.status != null ? String(c.status) : null,
            encodeDevIndexCode: c.encodeDevIndexCode,
            raw: c as any,
            syncedAt: now,
          },
          update: {
            name: c.cameraName || code,
            regionName: c.regionName,
            regionIndexCode: c.regionIndexCode,
            status: c.status != null ? String(c.status) : null,
            encodeDevIndexCode: c.encodeDevIndexCode,
            raw: c as any,
            syncedAt: now,
          },
        });
      }

      let doorCount = 0;
      const seenDoors = new Set<string>();
      for (const d of doors) {
        const code = String(d.doorIndexCode ?? d.doorNo ?? '');
        if (!code) continue;
        doorCount++;
        seenDoors.add(code);
        const regionIndexCode =
          d.regionIndexCode != null ? String(d.regionIndexCode) : null;
        await this.prisma.integraDoor.upsert({
          where: { siteId_doorIndexCode: { siteId, doorIndexCode: code } },
          create: {
            companyId,
            siteId,
            doorIndexCode: code,
            name: d.doorName || code,
            regionName: d.regionName,
            regionIndexCode,
            online: d.online !== false,
            doorState: d.doorState != null ? String(d.doorState) : null,
            raw: d as any,
            syncedAt: now,
          },
          update: {
            name: d.doorName || code,
            regionName: d.regionName,
            regionIndexCode,
            online: d.online !== false,
            doorState: d.doorState != null ? String(d.doorState) : null,
            raw: d as any,
            syncedAt: now,
          },
        });
      }

      let peopleCount = 0;
      const seenPeople = new Set<string>();
      for (const p of people) {
        const pid = String(p.personId ?? '');
        if (!pid) continue;
        peopleCount++;
        seenPeople.add(pid);
        await this.prisma.integraPerson.upsert({
          where: { siteId_personId: { siteId, personId: pid } },
          create: {
            companyId,
            siteId,
            personId: pid,
            personName: p.personName || pid,
            personCode: p.personCode,
            orgIndexCode: p.orgIndexCode,
            orgName: p.orgName,
            raw: p as any,
            syncedAt: now,
          },
          update: {
            personName: p.personName || pid,
            personCode: p.personCode,
            orgIndexCode: p.orgIndexCode,
            orgName: p.orgName,
            raw: p as any,
            syncedAt: now,
          },
        });
      }

      let deviceCount = 0;
      for (const d of acsDevs) {
        const code = String(d.indexCode ?? '');
        if (!code) continue;
        deviceCount++;
        await this.prisma.integraDevice.upsert({
          where: { siteId_kind_indexCode: { siteId, kind: 'ACS', indexCode: code } },
          create: {
            companyId,
            siteId,
            kind: 'ACS',
            indexCode: code,
            name: (d as any).name || code,
            ip: (d as any).ip || null,
            online: (d as any).online !== false,
            deviceType: (d as any).deviceType != null ? String((d as any).deviceType) : null,
            raw: d as any,
            syncedAt: now,
          },
          update: {
            name: (d as any).name || code,
            ip: (d as any).ip || null,
            online: (d as any).online !== false,
            deviceType: (d as any).deviceType != null ? String((d as any).deviceType) : null,
            raw: d as any,
            syncedAt: now,
          },
        });
      }
      for (const d of encDevs) {
        const code = String(d.indexCode ?? '');
        if (!code) continue;
        deviceCount++;
        await this.prisma.integraDevice.upsert({
          where: { siteId_kind_indexCode: { siteId, kind: 'ENCODE', indexCode: code } },
          create: {
            companyId,
            siteId,
            kind: 'ENCODE',
            indexCode: code,
            name: (d as any).name || code,
            ip: (d as any).ip || null,
            online: (d as any).online !== false,
            deviceType: (d as any).deviceType != null ? String((d as any).deviceType) : null,
            raw: d as any,
            syncedAt: now,
          },
          update: {
            name: (d as any).name || code,
            ip: (d as any).ip || null,
            online: (d as any).online !== false,
            deviceType: (d as any).deviceType != null ? String((d as any).deviceType) : null,
            raw: d as any,
            syncedAt: now,
          },
        });
      }

      let vehicleCount = 0;
      for (const v of vehicles) {
        const vid = String((v as any).vehicleId ?? (v as any).plateNo ?? '');
        if (!vid) continue;
        vehicleCount++;
        await this.prisma.integraVehicle.upsert({
          where: { siteId_vehicleId: { siteId, vehicleId: vid } },
          create: {
            companyId,
            siteId,
            vehicleId: vid,
            plateNo: String((v as any).plateNo ?? vid),
            personId: (v as any).personId != null ? String((v as any).personId) : null,
            personName: (v as any).personName != null ? String((v as any).personName) : null,
            raw: v as any,
            syncedAt: now,
          },
          update: {
            plateNo: String((v as any).plateNo ?? vid),
            personId: (v as any).personId != null ? String((v as any).personId) : null,
            personName: (v as any).personName != null ? String((v as any).personName) : null,
            raw: v as any,
            syncedAt: now,
          },
        });
      }

      let regionCount = 0;
      const seenRegions = new Set<string>();
      for (const r of regions) {
        const code = String((r as any).indexCode ?? '');
        if (!code) continue;
        regionCount++;
        seenRegions.add(code);
        await this.prisma.integraRegion.upsert({
          where: { siteId_indexCode: { siteId, indexCode: code } },
          create: {
            companyId,
            siteId,
            indexCode: code,
            name: (r as any).name || code,
            parentIndexCode: (r as any).parentIndexCode != null ? String((r as any).parentIndexCode) : null,
            raw: r as any,
            syncedAt: now,
          },
          update: {
            name: (r as any).name || code,
            parentIndexCode: (r as any).parentIndexCode != null ? String((r as any).parentIndexCode) : null,
            raw: r as any,
            syncedAt: now,
          },
        });
      }

      // Prune stale mirror rows not seen in this sync
      if (seenCams.size > 0) {
        await this.prisma.integraCamera.deleteMany({
          where: { siteId, cameraIndexCode: { notIn: [...seenCams] } },
        });
      }
      if (seenDoors.size > 0) {
        await this.prisma.integraDoor.deleteMany({
          where: { siteId, doorIndexCode: { notIn: [...seenDoors] } },
        });
      }
      if (seenPeople.size > 0) {
        await this.prisma.integraPerson.deleteMany({
          where: { siteId, personId: { notIn: [...seenPeople] } },
        });
      }
      if (seenRegions.size > 0) {
        await this.prisma.integraRegion.deleteMany({
          where: { siteId, indexCode: { notIn: [...seenRegions] } },
        });
      }

      await this.prisma.integraSite.update({
        where: { id: siteId },
        data: { lastSyncAt: now, lastHealthOkAt: now },
      });

      await this.prisma.integraSyncRun.update({
        where: { id: run.id },
        data: {
          status: 'OK',
          finishedAt: new Date(),
          cameras: cameraCount,
          doors: doorCount,
          people: peopleCount,
          devices: deviceCount,
          vehicles: vehicleCount,
        },
      });

      return {
        runId: run.id,
        cameras: cameraCount,
        doors: doorCount,
        people: peopleCount,
        devices: deviceCount,
        vehicles: vehicleCount,
        regions: regionCount,
      };
    } catch (error) {
      await this.prisma.integraSyncRun.update({
        where: { id: run.id },
        data: {
          status: 'ERROR',
          finishedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  lastRun(companyId: number, siteId?: number) {
    return this.prisma.integraSyncRun.findFirst({
      where: { companyId, ...(siteId ? { siteId } : {}) },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Sync espejo desde ISAPI en LAN (ADR-0019 §5).
   *
   * El **equipo cabecera** (`site.host`, normalmente el NVR) es la fuente de
   * verdad del inventario de video: sus canales ya incluyen las cámaras en
   * plug & play, que viven en el switch PoE interno (`192.168.254.x`) y **no
   * son alcanzables** desde la red del cliente. Por eso el espejo se construye
   * desde el grabador y no barriendo IPs.
   *
   * Los equipos que el grabador no conoce —terminales de control de acceso—
   * se refrescan a partir de las filas `IntegraDevice` que ya existan con IP.
   * Ahí es donde el barrido (`isapi-scan --seed`) los da de alta.
   */
  private async syncIsapiSite(
    companyId: number,
    siteId: number,
    runId: number,
    resolved: ResolvedIntegraClient,
    now: Date,
  ) {
    const head = resolved.isapi;
    if (!head) throw new Error('Sin cliente ISAPI para sync');

    const headIp = hostnameOf(resolved.host);
    // Se describe con el cliente que ya resolvió el sitio, no con uno nuevo.
    const headInfo = await describeDevice(head);
    if (!headInfo.reachable) {
      throw new Error(`Equipo cabecera ${headIp} no respondió: ${headInfo.error ?? 'sin detalle'}`);
    }

    const camerasSeen = new Set<string>();
    const doorsSeen = new Set<string>();
    const devicesSeen = new Set<string>();
    let cameraCount = 0;
    let doorCount = 0;
    let deviceCount = 0;

    const upsertDevice = async (
      indexCode: string,
      kind: 'ENCODE' | 'ACS',
      name: string,
      ip: string | null,
      online: boolean,
      raw: unknown,
    ) => {
      devicesSeen.add(`${kind}:${indexCode}`);
      deviceCount++;
      await this.prisma.integraDevice.upsert({
        where: { siteId_kind_indexCode: { siteId, kind, indexCode } },
        create: {
          companyId,
          siteId,
          kind,
          indexCode,
          name,
          ip,
          online,
          deviceType: 'ISAPI',
          raw: raw as any,
          syncedAt: now,
        },
        update: { name, ip, online, deviceType: 'ISAPI', raw: raw as any, syncedAt: now },
      });
    };

    const upsertCamera = async (
      cameraIndexCode: string,
      name: string,
      online: boolean,
      raw: unknown,
    ) => {
      camerasSeen.add(cameraIndexCode);
      cameraCount++;
      await this.prisma.integraCamera.upsert({
        where: { siteId_cameraIndexCode: { siteId, cameraIndexCode } },
        create: {
          companyId,
          siteId,
          cameraIndexCode,
          name,
          status: online ? 'online' : 'offline',
          encodeDevIndexCode: headIp,
          raw: raw as any,
          syncedAt: now,
        },
        update: {
          name,
          status: online ? 'online' : 'offline',
          encodeDevIndexCode: headIp,
          raw: raw as any,
          syncedAt: now,
        },
      });
    };

    // ── 1. Equipo cabecera y sus canales ──────────────────────────────────
    await upsertDevice(
      headIp,
      headInfo.kind === 'ACS' ? 'ACS' : 'ENCODE',
      headInfo.identity?.deviceName || headInfo.identity?.model || headIp,
      headIp,
      true,
      { role: headInfo.role, identity: headInfo.identity },
    );

    const proxyByStreamId = new Map<string, (typeof headInfo.proxyChannels)[number]>();
    for (const p of headInfo.proxyChannels) for (const id of p.streamIds) proxyByStreamId.set(id, p);

    for (const ch of headInfo.videoChannels) {
      // Solo el stream principal: el sub es la misma cámara a menor calidad.
      if (ch.streamIndex !== 1 || !ch.enabled) continue;
      const proxy = proxyByStreamId.get(ch.id);
      // En un grabador, un canal sin cámara enrolada es una ranura vacía.
      if (headInfo.role === 'NVR' && (!proxy || !proxy.online)) continue;

      await upsertCamera(
        `${headIp}|${ch.id}`,
        proxy?.name || ch.name || `${headIp} ch${ch.id}`,
        proxy ? proxy.online : true,
        {
          channelId: ch.id,
          channelNumber: ch.channelNumber,
          codec: ch.codec,
          width: ch.width,
          height: ch.height,
          rtsp: ch.rtspRedacted,
          // El parque sale de fábrica con el audio apagado en el canal. Se
          // guarda lo que el equipo reporta para no prometer sonido que no hay.
          hasAudio: ch.audio === true,
          audioCodec: ch.audioCodec,
          // La domo se sondea en el descubrimiento; guardarlo evita volver a
          // preguntárselo al equipo cada vez que alguien abre el foco.
          ptz: ch.ptz === true,
          source: proxy
            ? {
                ipAddress: proxy.ipAddress,
                model: proxy.model,
                serialNumber: proxy.serialNumber,
                connMode: proxy.connMode,
                // `plugplay` = detrás del PoE del NVR: nunca alcanzable directo.
                reachableDirectly: proxy.connMode === 'manual',
              }
            : null,
        },
      );

      if (proxy) {
        await upsertDevice(
          proxy.serialNumber || `${headIp}-ch${proxy.channel}`,
          'ENCODE',
          proxy.name || `Canal ${proxy.channel}`,
          proxy.ipAddress,
          proxy.online,
          proxy,
        );
      }
    }

    // ── 2. Equipos ya registrados que el cabecera no conoce ───────────────
    // Terminales de acceso, típicamente: no cuelgan del grabador.
    //
    // Se excluye todo lo que el cabecera ya cubre. Sin ese filtro, cada sync
    // volvería a sondear una por una las cámaras que el NVR acaba de reportar
    // —incluidas las de plug & play, que desde aquí ni siquiera existen— y
    // serían decenas de peticiones de más cada 15 minutos.
    const covered = new Set<string>([headIp]);
    for (const p of headInfo.proxyChannels) if (p.ipAddress) covered.add(p.ipAddress);

    const known = await this.prisma.integraDevice.findMany({
      where: { siteId, ip: { not: null } },
      select: { ip: true, kind: true },
    });
    const extraIps = [
      ...new Set(known.map((d) => d.ip as string).filter((ip) => ip && !covered.has(ip))),
    ];

    for (const ip of extraIps) {
      const client = resolved.isapiForHost?.(ip);
      if (!client) continue;
      let info: Awaited<ReturnType<typeof describeDevice>>;
      try {
        info = await describeDevice(client);
      } catch (e) {
        this.logger.warn(`ISAPI ${ip} no respondió: ${String(e)}`);
        continue;
      }

      const kind = info.kind === 'ACS' ? 'ACS' : 'ENCODE';
      await upsertDevice(
        info.identity?.serialNumber || ip,
        kind,
        info.identity?.deviceName || info.identity?.model || ip,
        ip,
        info.reachable,
        { role: info.role, identity: info.identity },
      );

      if (info.accessControl) {
        // Una terminal DS-K1T gobierna una puerta; el id documentado es 1.
        const doorIndexCode = `${ip}|1`;
        doorsSeen.add(doorIndexCode);
        doorCount++;
        const name = info.identity?.deviceName || info.identity?.model || ip;
        await this.prisma.integraDoor.upsert({
          where: { siteId_doorIndexCode: { siteId, doorIndexCode } },
          create: {
            companyId,
            siteId,
            doorIndexCode,
            name,
            online: info.reachable,
            raw: { ip, doorNo: 1, model: info.identity?.model } as any,
            syncedAt: now,
          },
          update: { name, online: info.reachable, syncedAt: now },
        });

        // La terminal lleva cámara: es la que mira a quien pasa por la puerta.
        // Entra al inventario de video para poder verla desde la consola —
        // sigue siendo un equipo ACS, así que no se le deriva sub-stream: no
        // tiene. Se guarda su id de stream tal cual y si trae audio.
        const videoCh = info.videoChannels.find((c) => c.enabled) || info.videoChannels[0];
        if (videoCh) {
          const cameraIndexCode = `${ip}|${videoCh.id}`;
          camerasSeen.add(cameraIndexCode);
          cameraCount++;
          await upsertCamera(cameraIndexCode, `${name} (puerta)`, info.reachable, {
            channelId: videoCh.id,
            // Id exacto: la terminal solo publica el 101.
            streamId: videoCh.id,
            channelNumber: videoCh.channelNumber,
            codec: videoCh.codec,
            width: videoCh.width,
            height: videoCh.height,
            rtsp: videoCh.rtspRedacted,
            hasAudio: videoCh.audio === true,
            audioCodec: videoCh.audioCodec,
            deviceKind: 'ACS',
            doorIndexCode,
            source: {
              ipAddress: ip,
              model: info.identity?.model ?? null,
              serialNumber: info.identity?.serialNumber ?? null,
              connMode: 'manual',
              reachableDirectly: true,
            },
          });
        }
      }
    }

    // ── 3. Personas desde cada terminal ACS (UserInfo/Search) ─────────────
    // Sin HikCentral: la fuente de verdad es el propio equipo. Misma persona
    // en varios lectores → mismo employeeNo → un solo IntegraPerson.
    const peopleSeen = new Set<string>();
    let peopleCount = 0;
    let peopleFetchOk = false;
    const acsIps = [
      ...new Set(
        (
          await this.prisma.integraDevice.findMany({
            where: { siteId, kind: 'ACS', ip: { not: null } },
            select: { ip: true },
          })
        )
          .map((d) => d.ip as string)
          .filter(Boolean),
      ),
    ];
    for (const ip of acsIps) {
      const client = resolved.isapiForHost?.(ip);
      if (!client) continue;
      try {
        const users = await listAllUserInfo(client);
        peopleFetchOk = true;
        for (const u of users) {
          const personId = String(u.employeeNo).trim();
          if (!personId) continue;
          peopleSeen.add(personId);
          const personName = String(u.name || personId).trim() || personId;
          await this.prisma.integraPerson.upsert({
            where: { siteId_personId: { siteId, personId } },
            create: {
              companyId,
              siteId,
              personId,
              personName,
              personCode: personId,
              orgIndexCode: null,
              orgName: u.userType != null ? String(u.userType) : null,
              raw: { ...u, sourceIp: ip } as any,
              syncedAt: now,
            },
            update: {
              personName,
              personCode: personId,
              orgName: u.userType != null ? String(u.userType) : null,
              raw: { ...u, sourceIp: ip } as any,
              syncedAt: now,
            },
          });
        }
      } catch (e) {
        this.logger.warn(`ISAPI UserInfo en ${ip}: ${String(e)}`);
      }
    }
    peopleCount = peopleSeen.size;
    if (peopleFetchOk && peopleSeen.size) {
      await this.prisma.integraPerson.deleteMany({
        where: { siteId, personId: { notIn: [...peopleSeen] } },
      });
    }

    // ── 4. Purga de lo que ya no está ─────────────────────────────────────
    await this.prisma.integraCamera.deleteMany({
      where: { siteId, cameraIndexCode: { notIn: [...camerasSeen] } },
    });
    if (doorsSeen.size) {
      await this.prisma.integraDoor.deleteMany({
        where: { siteId, doorIndexCode: { notIn: [...doorsSeen] } },
      });
    }

    await this.prisma.integraSite.update({
      where: { id: siteId },
      data: { lastSyncAt: now, lastHealthOkAt: now },
    });
    await this.prisma.integraSyncRun.update({
      where: { id: runId },
      data: {
        status: 'OK',
        finishedAt: new Date(),
        cameras: cameraCount,
        doors: doorCount,
        people: peopleCount,
        devices: deviceCount,
        vehicles: 0,
      },
    });

    return {
      runId,
      provider: 'ISAPI' as const,
      cameras: cameraCount,
      doors: doorCount,
      people: peopleCount,
      devices: deviceCount,
      vehicles: 0,
      regions: 0,
    };
  }

  /** Sync espejo desde HCT (cameras/doors/devices documentados). */
  private async syncHctSite(
    companyId: number,
    siteId: number,
    runId: number,
    hct: HikConnectTeamsClient,
    now: Date,
  ) {
    const [cams, doors, devices] = await Promise.all([
      hct.cameras(1, 500),
      hct.doors(1, 500),
      hct.devices(1, 200).catch(() => ({ deviceList: [] })),
    ]);

    let cameraCount = 0;
    for (const c of cams?.cameraList ?? []) {
      const code = String(c.cameraID ?? c.cameraId ?? '');
      if (!code) continue;
      cameraCount++;
      const name = String(c.cameraName ?? c.name ?? code);
      await this.prisma.integraCamera.upsert({
        where: { siteId_cameraIndexCode: { siteId, cameraIndexCode: code } },
        create: {
          companyId,
          siteId,
          cameraIndexCode: code,
          name,
          regionName: c.areaName != null ? String(c.areaName) : null,
          regionIndexCode: c.areaID != null ? String(c.areaID) : null,
          status: null,
          encodeDevIndexCode: c.deviceSerial != null ? String(c.deviceSerial) : null,
          raw: c as any,
          syncedAt: now,
        },
        update: {
          name,
          regionName: c.areaName != null ? String(c.areaName) : null,
          regionIndexCode: c.areaID != null ? String(c.areaID) : null,
          encodeDevIndexCode: c.deviceSerial != null ? String(c.deviceSerial) : null,
          raw: c as any,
          syncedAt: now,
        },
      });
    }

    let doorCount = 0;
    for (const d of doors?.doorList ?? []) {
      const code = String(d.doorID ?? d.doorId ?? d.elementId ?? '');
      if (!code) continue;
      doorCount++;
      const name = String(d.doorName ?? d.name ?? code);
      await this.prisma.integraDoor.upsert({
        where: { siteId_doorIndexCode: { siteId, doorIndexCode: code } },
        create: {
          companyId,
          siteId,
          doorIndexCode: code,
          name,
          regionName: d.areaName != null ? String(d.areaName) : null,
          regionIndexCode: d.areaID != null ? String(d.areaID) : null,
          online: true,
          doorState: null,
          raw: d as any,
          syncedAt: now,
        },
        update: {
          name,
          regionName: d.areaName != null ? String(d.areaName) : null,
          regionIndexCode: d.areaID != null ? String(d.areaID) : null,
          raw: d as any,
          syncedAt: now,
        },
      });
    }

    let deviceCount = 0;
    for (const d of devices?.deviceList ?? []) {
      const code = String(d.deviceSerial ?? d.deviceID ?? d.id ?? '');
      if (!code) continue;
      deviceCount++;
      const kind =
        String(d.deviceCategory || d.category || '').toLowerCase().includes('access')
          ? 'ACS'
          : 'ENCODE';
      await this.prisma.integraDevice.upsert({
        where: { siteId_kind_indexCode: { siteId, kind, indexCode: code } },
        create: {
          companyId,
          siteId,
          kind,
          indexCode: code,
          name: String(d.deviceName ?? d.name ?? code),
          ip: d.deviceIP != null ? String(d.deviceIP) : null,
          online: true,
          raw: d as any,
          syncedAt: now,
        },
        update: {
          name: String(d.deviceName ?? d.name ?? code),
          ip: d.deviceIP != null ? String(d.deviceIP) : null,
          raw: d as any,
          syncedAt: now,
        },
      });
    }

    await this.prisma.integraSite.update({
      where: { id: siteId },
      data: { lastSyncAt: now, lastHealthOkAt: now },
    });
    await this.prisma.integraSyncRun.update({
      where: { id: runId },
      data: {
        status: 'OK',
        finishedAt: new Date(),
        cameras: cameraCount,
        doors: doorCount,
        people: 0,
        devices: deviceCount,
        vehicles: 0,
      },
    });

    return {
      runId,
      provider: 'HCT' as const,
      cameras: cameraCount,
      doors: doorCount,
      people: 0,
      devices: deviceCount,
      vehicles: 0,
      regions: 0,
    };
  }
}
