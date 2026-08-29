import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { NocDevice } from '../noc.service.js';

/**
 * Dispositivos CCTV/ACS reales desde el espejo Integra (Prisma).
 * Si no hay sitios/dispositivos, el NOC sigue con sintéticos para otros tipos.
 */
@Injectable()
export class IntegraNocAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async hasMirror(companyId?: number): Promise<boolean> {
    const where = companyId ? { companyId } : {};
    const n = await this.prisma.integraSite.count({ where: { ...where, isActive: true } });
    return n > 0;
  }

  async listDevices(companyId?: number): Promise<NocDevice[]> {
    const whereSite = companyId ? { companyId } : {};
    const sites = await this.prisma.integraSite.findMany({
      where: { ...whereSite, isActive: true },
      select: { id: true, name: true, companyId: true, lastSyncAt: true },
    });
    if (sites.length === 0) return [];

    const siteIds = sites.map((s) => s.id);
    const siteById = new Map(sites.map((s) => [s.id, s]));

    const [cameras, doors, devices] = await Promise.all([
      this.prisma.integraCamera.findMany({ where: { siteId: { in: siteIds } } }),
      this.prisma.integraDoor.findMany({ where: { siteId: { in: siteIds } } }),
      this.prisma.integraDevice.findMany({ where: { siteId: { in: siteIds } } }),
    ]);

    const out: NocDevice[] = [];

    for (const c of cameras) {
      const site = siteById.get(c.siteId);
      const online = c.status === '1' || c.status === 'online' || c.status == null;
      out.push({
        id: `integra-cam-${c.id}`,
        name: c.name,
        type: 'CCTV',
        status: online ? 'ONLINE' : 'OFFLINE',
        branch: site?.name || `site-${c.siteId}`,
        clientName: `company-${c.companyId}`,
        lastSeen: (c.syncedAt || site?.lastSyncAt || new Date()).toISOString(),
        uptimePct30d: online ? 99.2 : 72,
        metadata: {
          source: 'integra',
          cameraIndexCode: c.cameraIndexCode,
          region: c.regionName,
        },
      });
    }

    for (const d of doors) {
      const site = siteById.get(d.siteId);
      out.push({
        id: `integra-door-${d.id}`,
        name: d.name,
        type: 'ACCESS_CONTROL',
        status: d.online ? 'ONLINE' : 'OFFLINE',
        branch: site?.name || `site-${d.siteId}`,
        clientName: `company-${d.companyId}`,
        lastSeen: (d.syncedAt || site?.lastSyncAt || new Date()).toISOString(),
        uptimePct30d: d.online ? 98.5 : 70,
        metadata: {
          source: 'integra',
          doorIndexCode: d.doorIndexCode,
          doorState: d.doorState,
        },
      });
    }

    for (const d of devices) {
      const site = siteById.get(d.siteId);
      out.push({
        id: `integra-dev-${d.id}`,
        name: d.name,
        type: d.kind === 'ENCODE' ? 'CCTV' : 'ACCESS_CONTROL',
        status: d.online ? 'ONLINE' : 'OFFLINE',
        branch: site?.name || `site-${d.siteId}`,
        clientName: `company-${d.companyId}`,
        lastSeen: (d.syncedAt || site?.lastSyncAt || new Date()).toISOString(),
        uptimePct30d: d.online ? 99 : 68,
        ipAddress: d.ip || undefined,
        firmwareVersion: d.deviceType || undefined,
        metadata: {
          source: 'integra',
          kind: d.kind,
          indexCode: d.indexCode,
        },
      });
    }

    return out;
  }
}
