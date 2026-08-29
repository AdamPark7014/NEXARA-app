import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
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

  async syncSite(companyId: number, siteId: number) {
    const run = await this.prisma.integraSyncRun.create({
      data: { companyId, siteId, status: 'RUNNING' },
    });

    try {
      const { client } = await this.sites.resolveClient({ companyId, siteId });
      const now = new Date();

      const [cams, doors, people, acsDevs, encDevs, vehicles] = await Promise.all([
        client.cameras(1, 500),
        client.doorList(1, 500),
        client.personList(1, 500),
        client.acsDeviceList(1, 200).catch(() => ({ list: [] })),
        client.encodeDeviceList(1, 200).catch(() => ({ list: [] })),
        client.vehicleList(1, 500).catch(() => ({ list: [] })),
      ]);

      let cameraCount = 0;
      for (const c of cams?.list ?? []) {
        const code = String(c.cameraIndexCode ?? '');
        if (!code) continue;
        cameraCount++;
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
      for (const d of doors?.list ?? []) {
        const code = String(d.doorIndexCode ?? d.doorNo ?? '');
        if (!code) continue;
        doorCount++;
        await this.prisma.integraDoor.upsert({
          where: { siteId_doorIndexCode: { siteId, doorIndexCode: code } },
          create: {
            companyId,
            siteId,
            doorIndexCode: code,
            name: d.doorName || code,
            regionName: d.regionName,
            online: d.online !== false,
            doorState: d.doorState != null ? String(d.doorState) : null,
            raw: d as any,
            syncedAt: now,
          },
          update: {
            name: d.doorName || code,
            regionName: d.regionName,
            online: d.online !== false,
            doorState: d.doorState != null ? String(d.doorState) : null,
            raw: d as any,
            syncedAt: now,
          },
        });
      }

      let peopleCount = 0;
      for (const p of people?.list ?? []) {
        const pid = String(p.personId ?? '');
        if (!pid) continue;
        peopleCount++;
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
      for (const d of acsDevs?.list ?? []) {
        const code = String(d.indexCode ?? '');
        if (!code) continue;
        deviceCount++;
        await this.prisma.integraDevice.upsert({
          where: { siteId_kind_indexCode: { siteId, kind: 'ACS', indexCode: code } },
          create: {
            companyId,
            siteId,
            indexCode: code,
            name: d.name || code,
            kind: 'ACS',
            ip: d.ip,
            online: d.online !== false,
            deviceType: d.deviceType,
            raw: d as any,
            syncedAt: now,
          },
          update: {
            name: d.name || code,
            ip: d.ip,
            online: d.online !== false,
            deviceType: d.deviceType,
            raw: d as any,
            syncedAt: now,
          },
        });
      }
      for (const d of encDevs?.list ?? []) {
        const code = String(d.indexCode ?? '');
        if (!code) continue;
        deviceCount++;
        await this.prisma.integraDevice.upsert({
          where: { siteId_kind_indexCode: { siteId, kind: 'ENCODE', indexCode: code } },
          create: {
            companyId,
            siteId,
            indexCode: code,
            name: d.name || code,
            kind: 'ENCODE',
            ip: d.ip,
            online: d.online !== false,
            deviceType: d.deviceType,
            raw: d as any,
            syncedAt: now,
          },
          update: {
            name: d.name || code,
            ip: d.ip,
            online: d.online !== false,
            deviceType: d.deviceType,
            raw: d as any,
            syncedAt: now,
          },
        });
      }

      let vehicleCount = 0;
      for (const v of vehicles?.list ?? []) {
        const vid = String(v.vehicleId ?? '');
        if (!vid) continue;
        vehicleCount++;
        await this.prisma.integraVehicle.upsert({
          where: { siteId_vehicleId: { siteId, vehicleId: vid } },
          create: {
            companyId,
            siteId,
            vehicleId: vid,
            plateNo: v.plateNo || vid,
            personId: v.personId,
            personName: v.personName,
            raw: v as any,
            syncedAt: now,
          },
          update: {
            plateNo: v.plateNo || vid,
            personId: v.personId,
            personName: v.personName,
            raw: v as any,
            syncedAt: now,
          },
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
}
