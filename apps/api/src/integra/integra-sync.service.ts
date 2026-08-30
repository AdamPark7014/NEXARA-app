import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { HikConnectTeamsClient } from '../hikvision-hct/index';
import { IntegraSiteService } from './integra-site.service';

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
