import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CtCatalogSyncService, costMxn, stockAtWarehouse, sumStock } from '../sync/ct-catalog-sync.service.js';
import { scoreProducts, type OptimizeMode, type ScoredOffer } from '../scoring/quote-scoring.js';

@Injectable()
export class ProductSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: CtCatalogSyncService,
  ) {}

  async search(params: {
    q?: string;
    brand?: string;
    category?: string;
    subcategory?: string;
    inStockOnly?: boolean;
    optimize?: OptimizeMode;
    targetMarginPercent?: number;
    take?: number;
    includeSubstitutesFor?: string;
  }): Promise<{ data: ScoredOffer[]; meta: { totalCandidates: number; mode: OptimizeMode } }> {
    const take = Math.min(Math.max(params.take || 40, 1), 100);
    const mode = params.optimize || 'BALANCE';
    const margin = params.targetMarginPercent ?? 30;
    const preferred = this.sync.preferredWarehouse();

    const where: Prisma.ProductCTWhereInput = {
      activo: true,
    };

    if (params.brand) where.marca = { contains: params.brand, mode: 'insensitive' };
    if (params.category) where.categoria = { contains: params.category, mode: 'insensitive' };
    if (params.subcategory) where.subcategoria = { contains: params.subcategory, mode: 'insensitive' };

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { clave: { contains: q, mode: 'insensitive' } },
        { numParte: { contains: q, mode: 'insensitive' } },
        { nombre: { contains: q, mode: 'insensitive' } },
        { modelo: { contains: q, mode: 'insensitive' } },
        { marca: { contains: q, mode: 'insensitive' } },
        { descripcion_corta: { contains: q, mode: 'insensitive' } },
        { categoria: { contains: q, mode: 'insensitive' } },
        { subcategoria: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (params.includeSubstitutesFor) {
      where.OR = [
        ...(where.OR || []),
        { sustituto: params.includeSubstitutesFor },
        { clave: params.includeSubstitutesFor },
      ];
    }

    let rows = await this.prisma.productCT.findMany({
      where,
      take: take * 3,
      orderBy: [{ updatedAt: 'desc' }],
    });

    if (params.inStockOnly) {
      rows = rows.filter((r) => sumStock(r.existencia as Record<string, number>) > 0);
    }

    // Prefer preferred warehouse stock when ranking candidates before scoring
    rows.sort((a, b) => {
      const sa = stockAtWarehouse(a.existencia as Record<string, number>, preferred);
      const sb = stockAtWarehouse(b.existencia as Record<string, number>, preferred);
      return sb - sa;
    });

    const scored = scoreProducts(rows.slice(0, take * 2), {
      mode,
      targetMarginPercent: margin,
      preferredWarehouse: preferred,
    }).slice(0, take);

    // Auto-expand substitutes when top results have no stock
    if (scored.length && scored[0].stockTotal === 0 && scored[0].clave) {
      const subs = await this.findSubstitutes(scored[0].clave, mode, margin, 8);
      for (const s of subs) {
        if (!scored.find((x) => x.id === s.id)) {
          s.badges.push('SUBSTITUTE');
          scored.push(s);
        }
      }
    }

    return {
      data: scored.slice(0, take),
      meta: { totalCandidates: rows.length, mode },
    };
  }

  async findSubstitutes(clave: string, mode: OptimizeMode, margin: number, take = 10) {
    const base = await this.prisma.productCT.findUnique({ where: { clave } });
    if (!base) return [];
    const preferred = this.sync.preferredWarehouse();

    const candidates = await this.prisma.productCT.findMany({
      where: {
        activo: true,
        id: { not: base.id },
        OR: [
          { sustituto: base.sustituto || base.clave || undefined },
          { clave: base.sustituto || undefined },
          {
            AND: [
              { subcategoria: base.subcategoria || undefined },
              { marca: base.marca || undefined },
            ],
          },
          { subcategoria: base.subcategoria || undefined },
        ],
      },
      take: 40,
    });

    return scoreProducts(candidates, {
      mode,
      targetMarginPercent: margin,
      preferredWarehouse: preferred,
    })
      .filter((s) => s.stockTotal > 0)
      .slice(0, take)
      .map((s) => {
        if (!s.badges.includes('SUBSTITUTE')) s.badges.push('SUBSTITUTE');
        return s;
      });
  }

  async facets() {
    const [brands, categories] = await Promise.all([
      this.prisma.productCT.groupBy({
        by: ['marca'],
        where: { activo: true, marca: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { marca: 'desc' } },
        take: 80,
      }),
      this.prisma.productCT.groupBy({
        by: ['categoria'],
        where: { activo: true, categoria: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { categoria: 'desc' } },
        take: 60,
      }),
    ]);
    return {
      brands: brands.map((b) => ({ name: b.marca, count: b._count._all })),
      categories: categories.map((c) => ({ name: c.categoria, count: c._count._all })),
    };
  }

  lineFromOffer(
    offer: ScoredOffer,
    qty: number,
    optimizationMode: OptimizeMode,
  ) {
    return {
      productCtId: offer.id,
      category: offer.categoria || 'CT',
      name: offer.nombre || offer.clave || 'Producto',
      description: offer.descripcion,
      brand: offer.marca,
      model: offer.modelo,
      sku: offer.clave,
      partNumber: offer.numParte,
      unit: 'pieza',
      qty: Math.max(1, qty),
      unitPrice: offer.sellPriceSuggested,
      unitCost: offer.costMxn,
      supplierSku: offer.clave,
      marginPercent: offer.marginPercent,
      stockSnapshot: offer.stockTotal,
      leadTimeDays: offer.leadTimeDays,
      scoreReason: offer.badges[0] || 'RECOMMENDED',
      optimizationMode,
      discount: 0,
      tax: 16,
      laborHours: 0,
      laborRate: 0,
      deliveryTime: offer.leadTimeDays <= 1 ? 'Inmediata' : `${offer.leadTimeDays} días`,
    };
  }

  costMxn = costMxn;
}
