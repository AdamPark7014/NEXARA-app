import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CT_WAREHOUSE_OPTIONS, type CtWarehouseOption, stockAtPreferredWarehouse } from '../ct-warehouses.js';
import { CtCatalogSyncService, costMxn, sumStock } from '../sync/ct-catalog-sync.service.js';
import { scoreProducts, type OptimizeMode, type ScoredOffer } from '../scoring/quote-scoring.js';
import { variantesDeAcento } from '../../cotizaciones/partidas-frecuentes.js';

/** Campos mínimos para ranking/UI — evita jalar especificaciones pesadas. */
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
  promociones: true,
} satisfies Prisma.ProductCTSelect;

const PRODUCT_DETAIL_SELECT = {
  ...SEARCH_SELECT,
  especificaciones: true,
} satisfies Prisma.ProductCTSelect;

type SearchRow = Prisma.ProductCTGetPayload<{ select: typeof SEARCH_SELECT }>;

function looksLikeSku(q: string) {
  // Con cifra: «domo» es una palabra, y buscarla solo en la clave no encontraba nada.
  return /^[A-Za-z0-9][A-Za-z0-9._-]{1,24}$/.test(q) && !/\s/.test(q) && /\d/.test(q);
}

function tokenOrFields(token: string): Prisma.ProductCTWhereInput {
  // Campos indexables / útiles; sin descripcion/categoría (más lentos y ruidosos).
  // «camara» también encuentra «Cámara»: `contains` ignora mayúsculas, no acentos.
  return {
    OR: variantesDeAcento(token.toLowerCase()).flatMap((variante) => [
      { clave: { contains: variante, mode: 'insensitive' as const } },
      { numParte: { contains: variante, mode: 'insensitive' as const } },
      { nombre: { contains: variante, mode: 'insensitive' as const } },
      { modelo: { contains: variante, mode: 'insensitive' as const } },
      { marca: { contains: variante, mode: 'insensitive' as const } },
    ]),
  };
}

/** «DS-2FA1208-C16/K» y «ds 2fa1208 c16 k» son el mismo modelo. */
const soloLetrasYCifras = (texto: string) => texto.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** El sync guarda solo los almacenes con piezas: `{}` es que CT no tiene ninguna hoy. */
const SIN_EXISTENCIA: Prisma.ProductCTWhereInput = { existencia: { equals: {} } };
const CON_EXISTENCIA: Prisma.ProductCTWhereInput = { NOT: SIN_EXISTENCIA };

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
  }): Promise<{
    data: ScoredOffer[];
    meta: {
      totalCandidates: number;
      mode: OptimizeMode;
      preferredWarehouse: string;
      warehouses: CtWarehouseOption[];
    };
  }> {
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
    const sinPalabras = { ...where };

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

    // Over-fetch corto. Slim select = menos I/O.
    const fetchTake = inStockOnly ? Math.min(take * 4, 80) : Math.min(take * 2, 48);
    const consulta = {
      select: SEARCH_SELECT,
      orderBy: rawQ ? [{ clave: 'asc' as const }] : [{ updatedAt: 'desc' as const }],
    };

    // Con todo el catálogo, «monitor» en orden de clave llenaría el corte con lo que no hay.
    let rows: SearchRow[] = await this.prisma.productCT.findMany({
      ...consulta,
      where: { AND: [where, CON_EXISTENCIA] },
      take: fetchTake,
    });
    if (!inStockOnly && rows.length < fetchTake) {
      rows = rows.concat(
        await this.prisma.productCT.findMany({
          ...consulta,
          where: { AND: [where, SIN_EXISTENCIA] },
          take: fetchTake - rows.length,
        }),
      );
    }

    // El modelo dicho tal cual no se queda fuera por el corte, aunque hoy no haya piezas.
    const idsExactos = new Set(rawQ ? await this.idsDelModelo(rawQ) : []);
    if (idsExactos.size) {
      const exactas = await this.prisma.productCT.findMany({
        select: SEARCH_SELECT,
        where: { AND: [sinPalabras, { id: { in: [...idsExactos] } }] },
      });
      rows = [...exactas, ...rows.filter((r) => !idsExactos.has(r.id))];
    }

    if (inStockOnly) {
      rows = rows.filter((r) => sumStock(r.existencia) > 0);
    }

    rows.sort((a, b) => {
      const exacto = Number(idsExactos.has(b.id)) - Number(idsExactos.has(a.id));
      if (exacto) return exacto;
      const sa = stockAtPreferredWarehouse(a.existencia, preferred);
      const sb = stockAtPreferredWarehouse(b.existencia, preferred);
      if (sb !== sa) return sb - sa;
      return sumStock(b.existencia) - sumStock(a.existencia);
    });

    const puntuados = scoreProducts(
      rows.slice(0, take).map((r) => ({
        ...r,
        especificaciones: [],
      })),
      {
        mode,
        targetMarginPercent: margin,
        preferredWarehouse: preferred,
      },
    );
    const scored = [...puntuados.filter((o) => idsExactos.has(o.id)), ...puntuados.filter((o) => !idsExactos.has(o.id))];

    return {
      data: scored,
      meta: {
        totalCandidates: rows.length,
        mode,
        preferredWarehouse: preferred,
        warehouses: CT_WAREHOUSE_OPTIONS,
      },
    };
  }

  /** Sin guiones ni espacios: CT escribe «EAP660 HD» y se cotiza «EAP660HD». */
  private async idsDelModelo(q: string): Promise<number[]> {
    const buscado = soloLetrasYCifras(q);
    if (buscado.length < 4) return [];
    const filas = await this.prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM productos_ct
      WHERE activo AND (
        regexp_replace(upper(coalesce(modelo, '')), '[^A-Z0-9]', '', 'g') = ${buscado}
        OR regexp_replace(upper(coalesce("numParte", '')), '[^A-Z0-9]', '', 'g') = ${buscado}
        OR upper(clave) = ${buscado}
      )
      LIMIT 8`;
    return filas.map((f) => f.id);
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
      candidates.map((r) => ({ ...r, especificaciones: [] })),
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

  async getProduct(
    clave: string,
    params?: { optimize?: OptimizeMode; targetMarginPercent?: number },
  ): Promise<{
    data: ScoredOffer;
    meta: { preferredWarehouse: string; warehouses: CtWarehouseOption[] };
  } | null> {
    const row = await this.prisma.productCT.findUnique({
      where: { clave },
      select: PRODUCT_DETAIL_SELECT,
    });
    if (!row) return null;

    const mode = params?.optimize || 'BALANCE';
    const margin = params?.targetMarginPercent ?? 30;
    const preferred = this.sync.preferredWarehouse();
    const scored = scoreProducts([row], {
      mode,
      targetMarginPercent: margin,
      preferredWarehouse: preferred,
    });

    return {
      data: scored[0],
      meta: {
        preferredWarehouse: preferred,
        warehouses: CT_WAREHOUSE_OPTIONS,
      },
    };
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
