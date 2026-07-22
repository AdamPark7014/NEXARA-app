import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export const API_KEY_SCOPES = [
  'accounting.read',
  'accounting.write',
  'procurement.read',
  'procurement.write',
  'webhooks.manage',
  'scim',
] as const;

@Injectable()
export class CompanyApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  listCatalog() {
    return { scopes: API_KEY_SCOPES };
  }

  async list(companyId: number) {
    return this.prisma.companyApiKey.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        createdById: true,
      },
    });
  }

  async create(
    companyId: number,
    dto: { name: string; scopes?: string[]; expiresAt?: string | null },
    userId?: number,
  ) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Nombre requerido');
    const scopes = (dto.scopes || []).filter((s) =>
      (API_KEY_SCOPES as readonly string[]).includes(s),
    );
    if (!scopes.length) {
      throw new BadRequestException('Selecciona al menos un scope válido');
    }

    const raw = `nxk_${randomBytes(24).toString('base64url')}`;
    const keyPrefix = raw.slice(0, 12);
    const keyHash = this.hashKey(raw);

    const row = await this.prisma.companyApiKey.create({
      data: {
        companyId,
        name,
        keyPrefix,
        keyHash,
        scopes,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: userId ?? null,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Solo se devuelve el secreto en create
    return { ...row, apiKey: raw };
  }

  async revoke(id: number, companyId: number) {
    const existing = await this.prisma.companyApiKey.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('API key no encontrada');
    await this.prisma.companyApiKey.update({
      where: { id },
      data: { isActive: false },
    });
    return { ok: true };
  }

  async authenticate(rawKey: string) {
    const key = String(rawKey || '').trim();
    if (!key.startsWith('nxk_')) {
      throw new UnauthorizedException('API key inválida');
    }
    const keyHash = this.hashKey(key);
    const row = await this.prisma.companyApiKey.findUnique({
      where: { keyHash },
      include: { company: { select: { id: true, legalName: true, tradeName: true, isActive: true } } },
    });
    if (!row || !row.isActive || !row.company?.isActive) {
      throw new UnauthorizedException('API key inválida o inactiva');
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('API key expirada');
    }
    void this.prisma.companyApiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      apiKeyId: row.id,
      companyId: row.companyId,
      scopes: row.scopes,
      company: row.company,
    };
  }

  private hashKey(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }
}
