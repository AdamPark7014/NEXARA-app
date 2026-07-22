import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCompanyAccess, companyWhere, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';

export type CatalogProductQuery = {
  q?: string;
  category?: string;
  brand?: string;
  skip?: number;
  take?: number;
  companyId?: number | null;
};

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(query: CatalogProductQuery = {}) {
    const where: Record<string, unknown> = {
      activo: { not: false },
      ...companyWhere(query.companyId ?? null),
    };

    if (query.category?.trim()) {
      where.category = { equals: query.category.trim(), mode: 'insensitive' };
    }

    if (query.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
        { subcategory: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.brand?.trim()) {
      where.brand = { name: { contains: query.brand.trim(), mode: 'insensitive' } };
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { brand: { select: { id: true, name: true } } },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.take ?? 50,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total };
  }

  async getProduct(id: number, companyId?: number | null) {
    const product = await this.prisma.product.findFirst({
      where: { id, activo: { not: false }, ...companyWhere(companyId ?? null) },
      include: {
        brand: { select: { id: true, name: true } },
        stockLevels: {
          select: { quantity: true, reservedQty: true, warehouse: { select: { id: true, name: true } } },
          take: 5,
        },
      },
    });
    assertCompanyAccess(product, companyId, 'Producto');
    return product;
  }

  async generateNextSku(companyId?: number | null) {
    const resolved = await resolveRequiredCompanyId(this.prisma, companyId);
    const [latest] = await this.prisma.$queryRaw<Array<{ sku: string }>>`
      SELECT sku FROM "Product"
      WHERE "companyId" = ${resolved} AND sku ~ '^SKU-\\d+$'
      ORDER BY CAST(substring(sku FROM '(\\d+)$') AS INTEGER) DESC
      LIMIT 1
    `;
    if (!latest?.sku) return 'SKU-0001';
    const match = latest.sku.match(/^(SKU-)(\d+)$/i);
    if (!match) return 'SKU-0001';
    const next = Number(match[2]) + 1;
    return `SKU-${String(next).padStart(4, '0')}`;
  }

  async createProduct(dto: {
    sku?: string;
    name: string;
    category?: string;
    subcategory?: string;
    price?: number;
    currency?: string;
    unit?: string;
    imageUrl?: string;
    description?: string;
    satProductKey?: string;
    satUnitKey?: string;
    unitName?: string;
    companyId?: number | null;
  }) {
    const companyId = await resolveRequiredCompanyId(this.prisma, dto.companyId);
    const sku = dto.sku?.trim()
      ? dto.sku.trim().toUpperCase()
      : await this.generateNextSku(companyId);
    const existing = await this.prisma.product.findFirst({ where: { sku, companyId } });
    if (existing) throw new ConflictException(`Ya existe un producto con SKU ${sku}`);
    const unit = dto.unit?.trim() || dto.unitName?.trim() || null;
    return this.prisma.product.create({
      data: {
        sku,
        name: dto.name.trim(),
        category: dto.category?.trim() || null,
        subcategory: dto.subcategory?.trim() || null,
        price: dto.price ?? null,
        currency: dto.currency?.trim() || 'MXN',
        imageUrl: dto.imageUrl?.trim() || null,
        description: dto.description?.trim() || null,
        satProductKey: dto.satProductKey?.trim() || null,
        satUnitKey: dto.satUnitKey?.trim() || null,
        unitName: unit,
        specifications: unit ? { unit } : undefined,
        activo: true,
        companyId,
      },
      include: { brand: { select: { id: true, name: true } } },
    });
  }

  async updateProduct(
    id: number,
    dto: {
      name?: string;
      category?: string;
      subcategory?: string;
      price?: number;
      currency?: string;
      unit?: string;
      imageUrl?: string;
      description?: string;
      satProductKey?: string;
      satUnitKey?: string;
      unitName?: string;
    },
    companyId?: number | null,
  ) {
    const existing = await this.prisma.product.findFirst({
      where: { id, activo: { not: false }, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(existing, companyId, 'Producto');
    if (!existing) throw new ConflictException('Producto no encontrado');
    const unit = dto.unit?.trim() || dto.unitName?.trim() || undefined;
    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        category: dto.category?.trim(),
        subcategory: dto.subcategory?.trim(),
        price: dto.price,
        currency: dto.currency?.trim(),
        imageUrl: dto.imageUrl?.trim(),
        description: dto.description?.trim(),
        satProductKey: dto.satProductKey?.trim(),
        satUnitKey: dto.satUnitKey?.trim(),
        unitName: unit,
        ...(unit
          ? {
              specifications: {
                ...((existing.specifications && typeof existing.specifications === 'object'
                  ? existing.specifications
                  : {}) as object),
                unit,
              },
            }
          : {}),
      },
      include: { brand: { select: { id: true, name: true } } },
    });
  }

  async listCategories(companyId?: number | null) {
    const rows = await this.prisma.product.findMany({
      where: { activo: { not: false }, category: { not: null }, ...companyWhere(companyId ?? null) },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category).filter(Boolean);
  }
}
