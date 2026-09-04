import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { HikCentralArtemisClient } from '../hikvision-artemis/index';
import { HikConnectTeamsClient } from '../hikvision-hct/index';
import { HikvisionIsapiClient } from '../hikvision-isapi/index';
import { decryptSecret, encryptSecret } from './integra-secrets';

export type IntegraProviderKind = 'ARTEMIS' | 'HCT' | 'ISAPI';

export type ResolvedIntegraClient = {
  provider: IntegraProviderKind;
  /** Artemis client — null salvo provider=ARTEMIS */
  client: HikCentralArtemisClient | null;
  /** HCT client — null salvo provider=HCT */
  hct: HikConnectTeamsClient | null;
  /** ISAPI directo a LAN — null salvo provider=ISAPI (ADR-0019 §5) */
  isapi: HikvisionIsapiClient | null;
  /**
   * Cliente ISAPI para OTRA IP del mismo sitio, con las credenciales del sitio.
   * En LAN un sitio son varios equipos (NVR + cámaras sueltas + terminales) y
   * casi siempre comparten usuario. Null salvo provider=ISAPI.
   */
  isapiForHost: ((host: string) => HikvisionIsapiClient) | null;
  siteId: number | null;
  companyId: number | null;
  host: string;
  source: 'site' | 'env';
};

const PROVIDERS: IntegraProviderKind[] = ['ARTEMIS', 'HCT', 'ISAPI'];

/**
 * El espejo guarda la IP pelada del equipo (`192.168.9.171`); el sitio guarda
 * un host con esquema. Hereda el esquema del sitio para no forzar HTTPS contra
 * un firmware que solo escucha en :80.
 */
function normalizeLanHost(deviceHost: string, siteHost: string): string {
  if (/^https?:\/\//i.test(deviceHost)) return deviceHost.replace(/\/$/, '');
  const scheme = siteHost.startsWith('https://') ? 'https' : 'http';
  return `${scheme}://${deviceHost.replace(/\/$/, '')}`;
}

function normalizeProvider(raw?: string | null): IntegraProviderKind {
  const upper = String(raw || 'ARTEMIS').toUpperCase();
  return (PROVIDERS as string[]).includes(upper)
    ? (upper as IntegraProviderKind)
    : 'ARTEMIS';
}

@Injectable()
export class IntegraSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(companyId: number) {
    return this.prisma.integraSite.findMany({
      where: { companyId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        label: true,
        host: true,
        provider: true,
        isActive: true,
        isDefault: true,
        lastSyncAt: true,
        lastHealthOkAt: true,
        modulesOverride: true,
        serviceClientId: true,
        createdAt: true,
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
  }

  async create(
    companyId: number,
    input: {
      name: string;
      host: string;
      appKey: string;
      appSecret: string;
      isDefault?: boolean;
      label?: string;
      modulesOverride?: Record<string, boolean>;
      provider?: IntegraProviderKind;
      serviceClientId?: number | null;
    },
  ) {
    if (input.isDefault) {
      await this.prisma.integraSite.updateMany({
        where: { companyId },
        data: { isDefault: false },
      });
    }
    const provider = normalizeProvider(input.provider);
    return this.prisma.integraSite.create({
      data: {
        companyId,
        name: input.name.trim(),
        host: input.host.replace(/\/$/, ''),
        appKeyEnc: encryptSecret(input.appKey),
        appSecretEnc: encryptSecret(input.appSecret),
        isDefault: input.isDefault ?? false,
        label: input.label?.trim() || null,
        modulesOverride: input.modulesOverride ?? undefined,
        provider,
        serviceClientId: input.serviceClientId ?? null,
      },
      select: {
        id: true,
        name: true,
        label: true,
        host: true,
        provider: true,
        isActive: true,
        isDefault: true,
        modulesOverride: true,
        serviceClientId: true,
      },
    });
  }

  async update(
    companyId: number,
    siteId: number,
    input: Partial<{
      name: string;
      host: string;
      appKey: string;
      appSecret: string;
      isActive: boolean;
      isDefault: boolean;
      label: string;
      modulesOverride: Record<string, boolean> | null;
      provider: IntegraProviderKind;
      serviceClientId: number | null;
    }>,
  ) {
    const existing = await this.prisma.integraSite.findFirst({
      where: { id: siteId, companyId },
    });
    if (!existing) throw new NotFoundException('Sitio Integra no encontrado');

    if (input.isDefault) {
      await this.prisma.integraSite.updateMany({
        where: { companyId },
        data: { isDefault: false },
      });
    }

    return this.prisma.integraSite.update({
      where: { id: siteId },
      data: {
        name: input.name?.trim(),
        host: input.host?.replace(/\/$/, ''),
        appKeyEnc: input.appKey ? encryptSecret(input.appKey) : undefined,
        appSecretEnc: input.appSecret ? encryptSecret(input.appSecret) : undefined,
        isActive: input.isActive,
        isDefault: input.isDefault,
        label: input.label !== undefined ? input.label.trim() || null : undefined,
        modulesOverride:
          input.modulesOverride === undefined
            ? undefined
            : input.modulesOverride === null
              ? Prisma.DbNull
              : input.modulesOverride,
        provider: input.provider ? normalizeProvider(input.provider) : undefined,
        serviceClientId: input.serviceClientId === undefined ? undefined : input.serviceClientId,
      },
      select: {
        id: true,
        name: true,
        label: true,
        host: true,
        provider: true,
        isActive: true,
        isDefault: true,
        modulesOverride: true,
        serviceClientId: true,
      },
    });
  }

  async remove(companyId: number, siteId: number) {
    const existing = await this.prisma.integraSite.findFirst({
      where: { id: siteId, companyId },
    });
    if (!existing) throw new NotFoundException('Sitio Integra no encontrado');
    await this.prisma.integraSite.delete({ where: { id: siteId } });
    return { success: true };
  }

  /**
   * Resuelve cliente Artemis o HCT: sitio DB (default o siteId) o env INTEGRA_HIK_*.
   */
  async resolveClient(opts: {
    companyId?: number | null;
    siteId?: number | null;
  }): Promise<ResolvedIntegraClient> {
    const companyId = opts.companyId ?? null;

    if (companyId && opts.siteId) {
      const site = await this.prisma.integraSite.findFirst({
        where: { id: opts.siteId, companyId, isActive: true },
      });
      if (site) return this.fromSite(site, companyId);
      // siteId stale (localStorage / otro tenant): caer al default del company.
    }

    if (companyId) {
      const site = await this.prisma.integraSite.findFirst({
        where: { companyId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      });
      if (site) return this.fromSite(site, companyId);
      if (opts.siteId) {
        throw new NotFoundException(
          `Sitio Integra no encontrado (siteId=${opts.siteId})`,
        );
      }
    }

    const host = (this.config.get<string>('INTEGRA_HIK_HOST') || '').replace(/\/$/, '');
    const appKey = this.config.get<string>('INTEGRA_HIK_APP_KEY') || '';
    const appSecret = this.config.get<string>('INTEGRA_HIK_APP_SECRET') || '';
    const timeout = Number(this.config.get('INTEGRA_HIK_TIMEOUT') || 15000);

    if (!host || !appKey || !appSecret) {
      throw new BadRequestException(
        'Sin sitio Integra ni INTEGRA_HIK_* configurados. Crea un sitio o define env.',
      );
    }

    return {
      provider: 'ARTEMIS',
      client: new HikCentralArtemisClient({
        host,
        appKey,
        appSecret,
        timeoutMs: timeout,
        scope: 'integra',
      }),
      hct: null,
      isapi: null,
      isapiForHost: null,
      siteId: null,
      companyId,
      host,
      source: 'env',
    };
  }

  private fromSite(
    site: {
      id: number;
      host: string;
      appKeyEnc: string;
      appSecretEnc: string;
      provider?: string | null;
    },
    companyId: number,
  ): ResolvedIntegraClient {
    const timeout = Number(this.config.get('INTEGRA_HIK_TIMEOUT') || 15000);
    const provider = normalizeProvider(site.provider);
    const appKey = decryptSecret(site.appKeyEnc);
    const appSecret = decryptSecret(site.appSecretEnc);

    if (provider === 'HCT') {
      return {
        provider: 'HCT',
        client: null,
        hct: new HikConnectTeamsClient({
          host: site.host,
          appKey,
          secretKey: appSecret,
          timeoutMs: timeout,
          scope: `integra-hct-${site.id}`,
        }),
        isapi: null,
        isapiForHost: null,
        siteId: site.id,
        companyId,
        host: site.host,
        source: 'site',
      };
    }

    if (provider === 'ISAPI') {
      // Sitio LAN: `host` es la IP del equipo cabecera (NVR o controladora) y
      // las dos columnas cifradas guardan usuario y contraseña de su consola
      // web — no hay appKey/appSecret porque ISAPI no los tiene.
      return {
        provider: 'ISAPI',
        client: null,
        hct: null,
        isapi: new HikvisionIsapiClient({
          host: site.host,
          username: appKey,
          password: appSecret,
          timeoutMs: timeout,
          scope: `integra-isapi-${site.id}`,
        }),
        isapiForHost: (deviceHost: string) =>
          new HikvisionIsapiClient({
            host: normalizeLanHost(deviceHost, site.host),
            username: appKey,
            password: appSecret,
            timeoutMs: timeout,
            scope: `integra-isapi-${site.id}-${deviceHost}`,
          }),
        siteId: site.id,
        companyId,
        host: site.host,
        source: 'site',
      };
    }

    return {
      provider: 'ARTEMIS',
      client: new HikCentralArtemisClient({
        host: site.host,
        appKey,
        appSecret,
        timeoutMs: timeout,
        scope: `integra-site-${site.id}`,
      }),
      hct: null,
      isapi: null,
      isapiForHost: null,
      siteId: site.id,
      companyId,
      host: site.host,
      source: 'site',
    };
  }
}
