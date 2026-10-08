import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { ROLES } from '../common/rbac/roles.v2.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { TIPOS_ARTICULO, normalizarTipoArticulo, type TipoArticulo } from '../catalog/tipo-articulo.js';
import {
  armarRespuesta,
  normalizarLimite,
  normalizarTipoBusqueda,
  seleccionar,
  tokensDeBusqueda,
  type ArticuloCandidato,
  type HerramientaCandidata,
  type NivelExistencia,
  type RespuestaBusqueda,
} from '../warehouse/busqueda-rapida.js';

/** Lo que el guard deja en `request.user` y aquí importa. */
export type UsuarioBusqueda = {
  permissions?: string[] | null;
  isSuperAdmin?: boolean | null;
  superadmin?: boolean | null;
  role?: string | null;
};

/**
 * Los artículos de almacén solo salen a quien tiene `stock.view` (o es superadmin, que el
 * RbacGuard deja pasar a todo). El resto del personal busca solo herramientas.
 */
export function puedeVerAlmacen(usuario: UsuarioBusqueda | null | undefined): boolean {
  if (!usuario) return false;
  if (usuario.superadmin || usuario.isSuperAdmin || usuario.role === ROLES.SUPER_ADMIN) return true;
  return (usuario.permissions ?? []).includes(PERMISSIONS.STOCK_VIEW);
}

/** Tope de artículos candidatos por búsqueda: de sobra para una caja que enseña 30. */
const TOPE_ARTICULOS = 500;
/** Tope de piezas de herramienta que se leen por búsqueda (el inventario de una empresa). */
const TOPE_HERRAMIENTAS = 5000;

// Quita acentos en la base igual que `normalizarTexto` en la app (mayúsculas y minúsculas).
const CON_ACENTO = 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç';
const SIN_ACENTO = 'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc';

const SELECT_ARTICULO = {
  id: true,
  name: true,
  sku: true,
  tipoArticulo: true,
  category: true,
  subcategory: true,
  codigoBarras: true,
  upc: true,
  ean: true,
  unitName: true,
  imageUrl: true,
  thumbnailUrl: true,
  specifications: true,
  updatedAt: true,
  brand: { select: { name: true } },
  packagings: {
    select: { id: true, nombre: true, piezasPorUnidad: true, esDefaultCompra: true, codigoBarras: true },
  },
} satisfies Prisma.ProductSelect;

type FilaArticulo = Prisma.ProductGetPayload<{ select: typeof SELECT_ARTICULO }>;

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

/** `specifications` es JSON libre: el alta por código guarda ahí `marca` y `modelo`. */
function especificacion(specs: unknown, clave: string): string | null {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return null;
  return texto((specs as Record<string, unknown>)[clave]);
}

export function articuloDeFila(fila: FilaArticulo): ArticuloCandidato {
  return {
    id: fila.id,
    nombre: fila.name,
    sku: fila.sku,
    tipo: fila.tipoArticulo,
    marca: texto(fila.brand?.name) ?? especificacion(fila.specifications, 'marca'),
    modelo: especificacion(fila.specifications, 'modelo'),
    categoria: fila.category,
    subcategoria: fila.subcategory,
    codigoBarras: fila.codigoBarras,
    upc: fila.upc,
    ean: fila.ean,
    unidad: fila.unitName,
    imagenUrl: texto(fila.imageUrl) ?? texto(fila.thumbnailUrl),
    empaques: (fila.packagings ?? []).map((e) => ({
      id: e.id,
      nombre: e.nombre,
      piezasPorUnidad: Number(e.piezasPorUnidad),
      esDefaultCompra: e.esDefaultCompra,
      codigoBarras: e.codigoBarras,
    })),
    actualizadoEn: fila.updatedAt,
  };
}

/**
 * Búsqueda rápida de inventario (`GET tool-requests/busqueda-rapida`). Trae de la base lo de
 * la empresa y deja todo lo demás —coincidencia, orden, conteos y textos— a
 * `warehouse/busqueda-rapida.ts`.
 */
@Injectable()
export class BusquedaRapidaService {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(
    params: { q?: unknown; tipo?: unknown; limite?: unknown; usuario?: UsuarioBusqueda | null },
    companyId?: number | null,
  ): Promise<RespuestaBusqueda> {
    const tenantId = requireCompanyId(companyId);
    const q = typeof params.q === 'string' ? params.q : '';
    const tipo = normalizarTipoBusqueda(params.tipo);
    const limite = normalizarLimite(params.limite);
    const incluyeAlmacen = puedeVerAlmacen(params.usuario);
    const tokens = tokensDeBusqueda(q);

    const [herramientas, almacen] = await Promise.all([
      this.herramientasDeEmpresa(tenantId),
      incluyeAlmacen
        ? this.articulosCandidatos(tenantId, tokens, tipo, limite)
        : Promise.resolve({ articulos: [] as ArticuloCandidato[], totales: undefined }),
    ]);

    const seleccion = seleccionar({
      q,
      tipo,
      limite,
      herramientas,
      articulos: almacen.articulos,
      totalesArticulos: almacen.totales,
    });

    const productIds: number[] = [];
    const piezaIds: number[] = [];
    for (const e of seleccion.elegidos) {
      if (e.origen === 'articulo') productIds.push(e.articulo.id);
      else piezaIds.push(...e.grupo.piezas.filter((p) => p.status !== 'AVAILABLE').map((p) => p.id));
    }

    const [nivelesPorProducto, quienLaTiene] = await Promise.all([
      this.nivelesDe(tenantId, productIds),
      this.quienTieneCada(tenantId, piezaIds),
    ]);

    return armarRespuesta({ q, tipo, incluyeAlmacen, seleccion, nivelesPorProducto, quienLaTiene });
  }

  /** Todas las piezas vivas de la empresa: se agrupan y se filtran en memoria (sin acentos). */
  private async herramientasDeEmpresa(tenantId: number): Promise<HerramientaCandidata[]> {
    const filas: Array<{
      id: number;
      toolName: string;
      model: string | null;
      serialNumber: string | null;
      codigoInterno: string | null;
      barcode: string | null;
      status: string;
      panoramicPhotoUrl: string | null;
      updatedAt: Date | null;
    }> = await (this.prisma as any).toolInventoryItem.findMany({
      where: { ...companyWhere(tenantId), status: { not: 'RETIRED' } },
      select: {
        id: true,
        toolName: true,
        model: true,
        serialNumber: true,
        codigoInterno: true,
        barcode: true,
        status: true,
        panoramicPhotoUrl: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
      take: TOPE_HERRAMIENTAS,
    });
    return (filas ?? []).map((f) => ({
      id: f.id,
      toolName: f.toolName,
      model: f.model,
      serialNumber: f.serialNumber,
      codigoInterno: f.codigoInterno,
      barcode: f.barcode,
      status: String(f.status),
      panoramicPhotoUrl: f.panoramicPhotoUrl,
      actualizadoEn: f.updatedAt,
    }));
  }

  /**
   * Con texto: la base filtra (todas las palabras, sin acentos) y aquí se ordena. Sin texto:
   * los más recientes del tipo pedido, y los totales por tipo se cuentan en la base.
   */
  private async articulosCandidatos(
    tenantId: number,
    tokens: string[],
    tipo: ReturnType<typeof normalizarTipoBusqueda>,
    limite: number,
  ): Promise<{ articulos: ArticuloCandidato[]; totales?: Partial<Record<TipoArticulo | 'SIN_TIPO', number>> }> {
    const base: Prisma.ProductWhereInput = {
      ...(companyWhere(tenantId) as Prisma.ProductWhereInput),
      activo: { not: false },
      itemType: 'PRODUCT',
    };

    if (tokens.length === 0) {
      const [filas, grupos] = await Promise.all([
        tipo === 'HERRAMIENTA'
          ? Promise.resolve([] as FilaArticulo[])
          : this.prisma.product.findMany({
              where: tipo === 'TODOS' ? base : { ...base, tipoArticulo: tipo },
              select: SELECT_ARTICULO,
              orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
              take: limite,
            }),
        this.prisma.product.groupBy({ by: ['tipoArticulo'], where: base, _count: { _all: true } }),
      ]);
      const totales: Partial<Record<TipoArticulo | 'SIN_TIPO', number>> = { SIN_TIPO: 0 };
      for (const t of TIPOS_ARTICULO) totales[t] = 0;
      for (const g of grupos ?? []) {
        const clave = normalizarTipoArticulo(g.tipoArticulo) ?? 'SIN_TIPO';
        totales[clave] = (totales[clave] ?? 0) + (g._count?._all ?? 0);
      }
      return { articulos: (filas ?? []).map(articuloDeFila), totales };
    }

    const ids = await this.idsQueCoinciden(tenantId, tokens);
    if (ids.length === 0) return { articulos: [] };
    const filas = await this.prisma.product.findMany({
      where: { ...base, id: { in: ids } },
      select: SELECT_ARTICULO,
    });
    return { articulos: (filas ?? []).map(articuloDeFila) };
  }

  /**
   * Productos de la empresa donde aparecen todas las palabras en nombre, SKU, categoría,
   * códigos (propio, UPC, EAN, el de cada empaque), marca o modelo. Sin acentos ni mayúsculas,
   * igual que la comparación en memoria (que vuelve a revisar cada fila).
   */
  private async idsQueCoinciden(tenantId: number, tokens: string[]): Promise<number[]> {
    const condiciones = tokens.map((t) => Prisma.sql`strpos(c.texto, ${t}) > 0`);
    const filas = await this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT c.id FROM (
        SELECT p.id, p."updatedAt",
          lower(translate(concat_ws(' ',
            p.name, p.sku, p.category, p.subcategory, p."codigoBarras", p.upc, p.ean,
            b.name, p.specifications->>'marca', p.specifications->>'modelo',
            (SELECT string_agg(pp."codigoBarras", ' ') FROM product_packagings pp WHERE pp."productId" = p.id)
          ), ${CON_ACENTO}, ${SIN_ACENTO})) AS texto
        FROM "Product" p
        LEFT JOIN brands b ON b.id = p."brandId"
        WHERE p."companyId" = ${tenantId}
          AND p.activo IS NOT FALSE
          AND p."itemType" = 'PRODUCT'
      ) c
      WHERE ${Prisma.join(condiciones, ' AND ')}
      ORDER BY c."updatedAt" DESC
      LIMIT ${TOPE_ARTICULOS}
    `);
    return (filas ?? []).map((f) => Number(f.id)).filter((id) => Number.isFinite(id));
  }

  /** Existencia por almacén y ubicación, solo de lo que se va a enseñar. */
  private async nivelesDe(tenantId: number, productIds: number[]) {
    const mapa = new Map<number, NivelExistencia[]>();
    if (productIds.length === 0) return mapa;
    const niveles = await this.prisma.stockLevel.findMany({
      where: { productId: { in: productIds }, ...(companyWhere(tenantId) as Prisma.StockLevelWhereInput) },
      select: {
        productId: true,
        quantity: true,
        minStock: true,
        warehouse: { select: { name: true } },
        location: { select: { code: true, name: true } },
      },
    });
    for (const n of niveles ?? []) {
      const lista = mapa.get(n.productId) ?? [];
      lista.push({
        cantidad: Number(n.quantity ?? 0),
        minimo: Number(n.minStock ?? 0),
        almacen: n.warehouse?.name ?? null,
        ubicacion: n.location?.code || n.location?.name || null,
      });
      mapa.set(n.productId, lista);
    }
    return mapa;
  }

  /**
   * Quién tiene cada pieza que no está disponible: el préstamo en uso manda; si no hay, el
   * kit activo. Solo de las piezas que salen en la página.
   */
  private async quienTieneCada(tenantId: number, piezaIds: number[]) {
    const mapa = new Map<number, string>();
    if (piezaIds.length === 0) return mapa;
    const [kits, prestamos] = await Promise.all([
      (this.prisma as any).toolKitAssignment.findMany({
        where: { inventoryItemId: { in: piezaIds }, isActive: true, ...companyWhere(tenantId) },
        select: { inventoryItemId: true, assignedAt: true, user: { select: { nombre: true, email: true } } },
        orderBy: { assignedAt: 'asc' },
      }) as Promise<Array<{ inventoryItemId: number; user?: { nombre?: string | null; email?: string | null } | null }>>,
      this.prisma.toolRequest.findMany({
        where: { inventoryItemId: { in: piezaIds }, status: 'IN_USE', ...companyWhere(tenantId) },
        select: { inventoryItemId: true, usuario: { select: { nombre: true, email: true } } },
        orderBy: { requestDate: 'asc' },
      }),
    ]);
    const nombre = (u?: { nombre?: string | null; email?: string | null } | null) =>
      texto(u?.nombre) ?? texto(u?.email);
    // El más reciente gana: por eso se recorren en orden ascendente y se sobrescribe.
    for (const k of kits ?? []) {
      const quien = nombre(k.user);
      if (quien && k.inventoryItemId != null) mapa.set(k.inventoryItemId, quien);
    }
    for (const p of prestamos ?? []) {
      const quien = nombre(p.usuario as { nombre?: string | null; email?: string | null } | null);
      if (quien && p.inventoryItemId != null) mapa.set(p.inventoryItemId, quien);
    }
    return mapa;
  }
}
