import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { withTenantBypassAsync } from '../common/tenant/tenant-context.js';

export type IntegraCapabilities = {
  video: boolean;
  access: boolean;
  people: boolean;
  events: boolean;
  vehicles: boolean;
  anpr: boolean;
  visitors: boolean;
  alarms: boolean;
  settings: boolean;
  /** Staff: true. Cliente: false salvo override explícito. */
  canControlDoors: boolean;
};

function capsFromCounts(
  c: {
    cameras: number;
    doors: number;
    people: number;
    devicesAcs: number;
    devicesEncode: number;
    vehicles: number;
  },
  override?: Record<string, boolean> | null,
  canSettings = true,
  canControlDoors = true,
): IntegraCapabilities {
  const base: IntegraCapabilities = {
    video: c.cameras > 0 || c.devicesEncode > 0,
    access: c.doors > 0 || c.devicesAcs > 0,
    people: c.people > 0 || c.doors > 0,
    events: c.doors > 0 || c.devicesAcs > 0,
    vehicles: c.vehicles > 0,
    anpr: c.vehicles > 0,
    visitors: c.doors > 0 || c.devicesAcs > 0,
    alarms: c.cameras > 0 || c.doors > 0,
    settings: canSettings,
    canControlDoors: canControlDoors && (c.doors > 0 || c.devicesAcs > 0),
  };
  if (!override) return base;
  return {
    ...base,
    ...override,
    settings: canSettings && (override.settings ?? true),
    canControlDoors:
      canControlDoors &&
      (override.canControlDoors ?? base.canControlDoors),
  };
}

/** Exported for unit tests */
export { capsFromCounts as integraCapsFromCounts };

@Injectable()
export class IntegraPortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async capabilities(
    companyId: number | null,
    siteId?: number | null,
    opts?: { canSettings?: boolean; canControlDoors?: boolean },
  ): Promise<IntegraCapabilities> {
    const canSettings = opts?.canSettings !== false;
    const canControlDoors = opts?.canControlDoors !== false;
    if (!companyId) {
      return capsFromCounts(
        {
          cameras: 0,
          doors: 0,
          people: 0,
          devicesAcs: 0,
          devicesEncode: 0,
          vehicles: 0,
        },
        null,
        canSettings,
        canControlDoors,
      );
    }
    const siteFilter = siteId ? { siteId } : {};
    const [cameras, doors, people, devicesAcs, devicesEncode, vehicles, site] =
      await Promise.all([
        this.prisma.integraCamera.count({ where: { companyId, ...siteFilter } }),
        this.prisma.integraDoor.count({ where: { companyId, ...siteFilter } }),
        this.prisma.integraPerson.count({ where: { companyId, ...siteFilter } }),
        this.prisma.integraDevice.count({
          where: { companyId, kind: 'ACS', ...siteFilter },
        }),
        this.prisma.integraDevice.count({
          where: { companyId, kind: 'ENCODE', ...siteFilter },
        }),
        this.prisma.integraVehicle.count({ where: { companyId, ...siteFilter } }),
        siteId
          ? this.prisma.integraSite.findFirst({ where: { id: siteId, companyId } })
          : this.prisma.integraSite.findFirst({
              where: { companyId, isActive: true },
              orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
            }),
      ]);

    const override = (site?.modulesOverride as Record<string, boolean> | null) ?? null;
    return capsFromCounts(
      { cameras, doors, people, devicesAcs, devicesEncode, vehicles },
      override,
      canSettings,
      canControlDoors,
    );
  }

  /**
   * Portfolio multi-empresa: super-admin ve todos los sitios Integra;
   * usuario normal solo la company activa.
   */
  async portfolio(opts: {
    companyId: number | null;
    isSuperAdmin?: boolean;
    /** false para rol cliente — no ve módulo Sitios */
    canSettings?: boolean;
  }) {
    const run = async () => {
      const where: Prisma.IntegraSiteWhereInput = opts.isSuperAdmin
        ? { isActive: true }
        : opts.companyId
          ? { companyId: opts.companyId, isActive: true }
          : { companyId: -1 };

      const sites = await this.prisma.integraSite.findMany({
        where,
        orderBy: [{ companyId: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          companyId: true,
          name: true,
          label: true,
          host: true,
          isDefault: true,
          lastSyncAt: true,
          lastHealthOkAt: true,
          modulesOverride: true,
          serviceClientId: true,
          company: { select: { id: true, legalName: true, tradeName: true, slug: true } },
          _count: {
            select: {
              cameras: true,
              doors: true,
              people: true,
              devices: true,
              vehicles: true,
              regions: true,
            },
          },
        },
      });

      const byCompany = new Map<
        number,
        {
          companyId: number;
          name: string;
          slug: string | null;
          sites: typeof sites;
          totals: {
            cameras: number;
            doors: number;
            people: number;
            devices: number;
            vehicles: number;
            regions: number;
          };
        }
      >();

      for (const s of sites) {
        const name = s.company.tradeName || s.company.legalName;
        let bucket = byCompany.get(s.companyId);
        if (!bucket) {
          bucket = {
            companyId: s.companyId,
            name,
            slug: s.company.slug,
            sites: [],
            totals: { cameras: 0, doors: 0, people: 0, devices: 0, vehicles: 0, regions: 0 },
          };
          byCompany.set(s.companyId, bucket);
        }
        bucket.sites.push(s);
        bucket.totals.cameras += s._count.cameras;
        bucket.totals.doors += s._count.doors;
        bucket.totals.people += s._count.people;
        bucket.totals.devices += s._count.devices;
        bucket.totals.vehicles += s._count.vehicles;
        bucket.totals.regions += s._count.regions;
      }

      const companies = [...byCompany.values()].map((c) => ({
        ...c,
        capabilities: capsFromCounts(
          {
            cameras: c.totals.cameras,
            doors: c.totals.doors,
            people: c.totals.people,
            devicesAcs: c.totals.doors > 0 ? c.totals.devices : 0,
            devicesEncode: c.totals.cameras > 0 ? c.totals.devices : 0,
            vehicles: c.totals.vehicles,
          },
          null,
          opts.canSettings !== false,
        ),
        modules: Object.entries(
          capsFromCounts(
            {
              cameras: c.totals.cameras,
              doors: c.totals.doors,
              people: c.totals.people,
              devicesAcs: c.totals.doors > 0 ? 1 : 0,
              devicesEncode: c.totals.cameras > 0 ? 1 : 0,
              vehicles: c.totals.vehicles,
            },
            null,
            opts.canSettings !== false,
          ),
        )
          .filter(([, on]) => on)
          .map(([k]) => k),
      }));

      return {
        mode: opts.isSuperAdmin ? ('platform' as const) : ('tenant' as const),
        companyCount: companies.length,
        siteCount: sites.length,
        companies,
      };
    };

    if (opts.isSuperAdmin) {
      return withTenantBypassAsync(run);
    }
    return run();
  }
}
