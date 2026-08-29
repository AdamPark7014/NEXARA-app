import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { HikCentralArtemisClient } from '../hikvision-artemis/index';
import { decryptSecret, encryptSecret } from './integra-secrets';

export type ResolvedIntegraClient = {
  client: HikCentralArtemisClient;
  siteId: number | null;
  companyId: number | null;
  host: string;
  source: 'site' | 'env';
};

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
        isActive: true,
        isDefault: true,
        lastSyncAt: true,
        lastHealthOkAt: true,
        modulesOverride: true,
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
    },
  ) {
    if (input.isDefault) {
      await this.prisma.integraSite.updateMany({
        where: { companyId },
        data: { isDefault: false },
      });
    }
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
      },
      select: {
        id: true,
        name: true,
        label: true,
        host: true,
        isActive: true,
        isDefault: true,
        modulesOverride: true,
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
      },
      select: {
        id: true,
        name: true,
        label: true,
        host: true,
        isActive: true,
        isDefault: true,
        modulesOverride: true,
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
   * Resuelve cliente Artemis: sitio DB (default o siteId) o env INTEGRA_HIK_*.
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
      if (!site) throw new NotFoundException('Sitio Integra no encontrado');
      return this.fromSite(site, companyId);
    }

    if (companyId) {
      const site = await this.prisma.integraSite.findFirst({
        where: { companyId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      });
      if (site) return this.fromSite(site, companyId);
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
      client: new HikCentralArtemisClient({
        host,
        appKey,
        appSecret,
        timeoutMs: timeout,
        scope: 'integra',
      }),
      siteId: null,
      companyId,
      host,
      source: 'env',
    };
  }

  private fromSite(
    site: { id: number; host: string; appKeyEnc: string; appSecretEnc: string },
    companyId: number,
  ): ResolvedIntegraClient {
    const timeout = Number(this.config.get('INTEGRA_HIK_TIMEOUT') || 15000);
    return {
      client: new HikCentralArtemisClient({
        host: site.host,
        appKey: decryptSecret(site.appKeyEnc),
        appSecret: decryptSecret(site.appSecretEnc),
        timeoutMs: timeout,
        scope: `integra-site-${site.id}`,
      }),
      siteId: site.id,
      companyId,
      host: site.host,
      source: 'site',
    };
  }
}
