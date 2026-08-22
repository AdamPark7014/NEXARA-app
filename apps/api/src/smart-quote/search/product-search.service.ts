import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CtCatalogSyncService, costMxn, stockAtWarehouse, sumStock } from '../sync/ct-catalog-sync.service.js';
import { scoreProducts, type OptimizeMode, type ScoredOffer } from '../scoring/quote-scoring.js';

/** Campos mínimos para ranking/UI — evita jalar especificaciones/promociones pesadas. */
const SEARCH_SELECT = {
  id: true,
  clave: true,
  numParte: true,
  nombre: true,
  modelo: true,
  marca: true,
  categoria: true,
  subcategoria: true,
  descripcion_corta: true,
  imagen: true,
  imageUrl: true,
  thumbnailUrl: true,
  ean: true,
  upc: true,
  precio: true,
  moneda: true,
  tipoCambio: true,
  existencia: true,
  protegido: true,
  activo: true,
  sustituto: true,
} satisfies Prisma.ProductCTSelect;

type SearchRow = Prisma.ProductCTGetPayload<{ select: typeof SEARCH_SELECT }>;

function looksLikeSku(q: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{1,24}$/.test(q) && !/\s/.test(q);
}

function tokenOrFields(token: string): Prisma.ProductCTWhereInput {
  // Campos indexables / útiles; sin descripcion/categoría (más lentos y ruidosos).
  return {
    OR: [
      { clave: { contains: token, mode: 'insensitive' } },
      { numParte: { contains: token, mode: 'insensitive' } },
      { nombre: { contains: token, mode: 'insensitive' } },
      { modelo: { contains: token, mode: 'insensitive' } },
      { marca: { contains: token, mode: 'insensitive' } },
    ],
  };
}

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
    const take = Math.min(Math.max(params.take || 24, 1), 60);
    const mode = params.optimize || 'BALANCE';
    const margin = params.targetMarginPercent ?? 30;
    const preferred = this.sync.preferredWarehouse();
    const inStockOnly = params.inStockOnly !== false;

    const where: Prisma.ProductCTWhereInput = {
      activo: true,
    };

    if (params.brand) where.marca = { contains: params.brand, mode: 'insensitive' };
    if (params.category) where.categoria = { contains: params.category, mode: 'insensitive' };
    if (params.subcategory) where.subcategoria = { contains: params.subcategory, mode: 'insensitive' };

    const rawQ = params.q?.trim() || '';
    if (rawQ) {
      const tokens = rawQ
        .split(/[\s,;|/]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
        .slice(0, 4);

      if (tokens.length <= 1) {
        const q = tokens[0] || rawQ;
        if (looksLikeSku(q)) {
          // Camino rápido SKU: equals / startsWith usa mejor el índice único de clave.
          where.OR = [
            { clave: { equals: q, mode: 'insensitive' } },
            { clave: { startsWith: q, mode: 'insensitive' } },
            { numParte: { contains: q, mode: 'insensitive' } },
            { modelo: { contains: q, mode: 'insensitive' } },
          ];
        } else {
          Object.assign(where, tokenOrFields(q));
        }
      } else {
        where.AND = tokens.map((token) => tokenOrFields(token));
      }
    }

    if (params.includeSubstitutesFor) {
      where.OR = [
        ...(Array.isArray(where.OR) ? where.OR : where.OR ? [where.OR] : []),
        { sustituto: params.includeSubstitutesFor },
        { clave: params.includeSubstitutesFor },
      ];
    }

    // Over-fetch corto: stock se filtra en memoria (JSONB). Slim select = menos I/O.
    const fetchTake = inStockOnly ? Math.min(take * 4, 80) : Math.min(take * 2, 48);

    let rows: SearchRow[] = await this.prisma.productCT.findMany({
      where,
      select: SEARCH_SELECT,
      take: fetchTake,
      orderBy: rawQ ? [{ clave: 'asc' }] : [{ updatedAt: 'desc' }],
    });

    if (inStockOnly) {
      rows = rows.filter((r) => sumStock(r.existencia as Record<string, number>) > 0);
    }

    rows.sort((a, b) => {
      const sa = stockAtWarehouse(a.existencia as Record<string, number>, preferred);
      const sb = stockAtWarehouse(b.existencia as Record<string, number>, preferred);
      if (sb !== sa) return sb - sa;
      return sumStock(b.existencia as Record<string, number>) - sumStock(a.existencia as Record<string, number>);
    });

    const scored = scoreProducts(
      rows.slice(0, take).map((r) => ({
        ...r,
        especificaciones: [],
        promociones: [],
      })),
      {
        mode,
        targetMarginPercent: margin,
        preferredWarehouse: preferred,
      },
    );

    return {
      data: scored,
      meta: { totalCandidates: rows.length, mode },
    };
  }

  async findSubstitutes(clave: string, mode: OptimizeMode, margin: number, take = 10) {
    const base = await this.prisma.productCT.findUnique({
      where: { clave },
      select: { id: true, clave: true, sustituto: true, subcategoria: true, marca: true },
    });
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
      select: SEARCH_SELECT,
      take: 30,
    });

    return scoreProducts(
      candidates.map((r) => ({ ...r, especificaciones: [], promociones: [] })),
      {
        mode,
        targetMarginPercent: margin,
        preferredWarehouse: preferred,
      },
    )
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
      supplierCode: 'CT',
      marginPercent: offer.marginPercent,
      stockSnapshot: offer.stockTotal,
      leadTimeDays: offer.leadTimeDays,
      scoreReason: offer.badges[0] || 'RECOMMENDED',
      optimizationMode,
      discount: 0,
      tax: 16, // CT es sin IVA; se factura IVA al cliente
      laborHours: 0,
      laborRate: 0,
      deliveryTime: offer.leadTimeDays <= 1 ? 'Inmediata' : `${offer.leadTimeDays} días`,
    };
  }

  costMxn = costMxn;
}
