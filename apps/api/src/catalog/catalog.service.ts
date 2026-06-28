import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type CatalogProductQuery = {
  q?: string;
  category?: string;
  brand?: string;
  skip?: number;
  take?: number;
};

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(query: CatalogProductQuery = {}) {
    const where: Record<string, unknown> = { activo: { not: false } };

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

  async getProduct(id: number) {
    return this.prisma.product.findFirst({
      where: { id, activo: { not: false } },
      include: {
        brand: { select: { id: true, name: true } },
        stockLevels: {
          select: { quantity: true, reservedQty: true, warehouse: { select: { id: true, name: true } } },
          take: 5,
        },
      },
    });
  }

  async createProduct(dto: {
    sku: string;
    name: string;
    category?: string;
    subcategory?: string;
    price?: number;
    currency?: string;
    unit?: string;
    imageUrl?: string;
    description?: string;
  }) {
    const existing = await this.prisma.product.findFirst({ where: { sku: dto.sku.trim().toUpperCase() } });
    if (existing) throw new ConflictException(`Ya existe un producto con SKU ${dto.sku}`);
    return this.prisma.product.create({
      data: {
        sku: dto.sku.trim().toUpperCase(),
        name: dto.name.trim(),
        category: dto.category?.trim() || null,
        subcategory: dto.subcategory?.trim() || null,
        price: dto.price ?? null,
        currency: dto.currency?.trim() || 'MXN',
        imageUrl: dto.imageUrl?.trim() || null,
        description: dto.description?.trim() || null,
        specifications: dto.unit?.trim() ? { unit: dto.unit.trim() } : undefined,
        activo: true,
      },
      include: { brand: { select: { id: true, name: true } } },
    });
  }

  async listCategories() {
    const rows = await this.prisma.product.findMany({
      where: { activo: { not: false }, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category).filter(Boolean);
  }
}
