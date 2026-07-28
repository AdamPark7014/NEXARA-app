import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Dual-scope settings:
 * - companyId null  → platform defaults
 * - companyId set   → tenant overrides (win over platform for the same key)
 *
 * NOT registered in TENANT_SCOPED_MODELS so middleware does not hide platform rows.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId?: number | null) {
    const rows = await this.prisma.systemSetting.findMany({
      where:
        companyId != null && Number(companyId) > 0
          ? { OR: [{ companyId: null }, { companyId: Number(companyId) }] }
          : { companyId: null },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    return this.mergeTenantOverPlatform(rows, companyId);
  }

  async findByCategory(category: string, companyId?: number | null) {
    const rows = await this.prisma.systemSetting.findMany({
      where: {
        category,
        ...(companyId != null && Number(companyId) > 0
          ? { OR: [{ companyId: null }, { companyId: Number(companyId) }] }
          : { companyId: null }),
      },
      orderBy: { key: 'asc' },
    });
    return this.mergeTenantOverPlatform(rows, companyId);
  }

  async getValue(key: string, companyId?: number | null): Promise<string | null> {
    if (companyId != null && Number(companyId) > 0) {
      const tenant = await this.prisma.systemSetting.findFirst({
        where: { key, companyId: Number(companyId) },
      });
      if (tenant) return tenant.value;
    }
    const platform = await this.prisma.systemSetting.findFirst({
      where: { key, companyId: null },
    });
    return platform?.value ?? null;
  }

  async upsert(
    key: string,
    value: string,
    category: string,
    label?: string,
    companyId?: number | null,
  ) {
    const cid =
      companyId != null && Number(companyId) > 0 ? Number(companyId) : null;
    const existing = await this.prisma.systemSetting.findFirst({
      where: { key, companyId: cid },
    });
    if (existing) {
      return this.prisma.systemSetting.update({
        where: { id: existing.id },
        data: { value, category, label: label ?? existing.label, updatedAt: new Date() },
      });
    }
    return this.prisma.systemSetting.create({
      data: { key, value, category, label: label ?? key, companyId: cid },
    });
  }

  async upsertMany(
    settings: { key: string; value: string; category: string; label?: string }[],
    companyId?: number | null,
  ) {
    return Promise.all(
      settings.map((s) => this.upsert(s.key, s.value, s.category, s.label, companyId)),
    );
  }

  async remove(key: string, companyId?: number | null) {
    const cid =
      companyId != null && Number(companyId) > 0 ? Number(companyId) : null;
    const existing = await this.prisma.systemSetting.findFirst({
      where: { key, companyId: cid },
    });
    if (!existing) throw new NotFoundException(`Setting "${key}" no encontrada`);
    return this.prisma.systemSetting.delete({ where: { id: existing.id } });
  }

  /** Tenant row wins; otherwise keep platform. */
  private mergeTenantOverPlatform<T extends { key: string; companyId: number | null }>(
    rows: T[],
    companyId?: number | null,
  ): T[] {
    if (companyId == null || !(Number(companyId) > 0)) {
      return rows.filter((r) => r.companyId == null);
    }
    const byKey = new Map<string, T>();
    for (const row of rows) {
      if (row.companyId == null) {
        if (!byKey.has(row.key)) byKey.set(row.key, row);
      } else if (row.companyId === Number(companyId)) {
        byKey.set(row.key, row);
      }
    }
    return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
}
