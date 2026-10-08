import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCompanyAccess, companyWhere, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';
import { claveEmpaque } from '../warehouse/empaque.js';
import {
  MENSAJE_TIPO_INVALIDO,
  TipoArticuloInvalidoError,
  normalizarTipoArticulo,
  unidadParaTipo,
  validarEmpaqueDeTipo,
  type EmpaqueDeAlta,
  type TipoArticulo,
} from './tipo-articulo.js';

/** Lo que regresan el alta, la edición y el detalle: marca y empaques (el de compra primero). */
const INCLUDE_PRODUCTO = {
  brand: { select: { id: true, name: true } },
  packagings: {
    select: { id: true, nombre: true, piezasPorUnidad: true, codigoBarras: true, esDefaultCompra: true },
    orderBy: [{ esDefaultCompra: 'desc' }, { piezasPorUnidad: 'desc' }],
  },
} satisfies Prisma.ProductInclude;

/** Campos de alta/edición que comparten la web y el lector de almacén. */
export type CamposProducto = {
  category?: string;
  subcategory?: string;
  price?: number | null;
  currency?: string;
  unit?: string;
  imageUrl?: string;
  description?: string;
  satProductKey?: string;
  satUnitKey?: string;
  unitName?: string;
  /** EQUIPO | CONSUMIBLE | MEDIDA; null = sin tipo. Ver `tipo-articulo.ts`. */
  tipoArticulo?: string | null;
  /** Empaque por defecto de un consumible («Bote» de 100) o presentación de lo que va por medida. */
  empaque?: { nombre?: unknown; capacidad?: unknown } | null;
};

/** El tipo que mandaron, ya limpio. `undefined` = no lo mandaron (al editar, no se toca). */
function tipoMandado(valor: unknown): TipoArticulo | null | undefined {
  if (valor === undefined) return undefined;
  const tipo = normalizarTipoArticulo(valor);
  if (tipo === undefined) throw new BadRequestException(MENSAJE_TIPO_INVALIDO);
  return tipo;
}

/** El empaque revisado contra el tipo; los errores salen como 400 con el mensaje para la persona. */
function empaqueRevisado(
  tipo: TipoArticulo | null,
  empaque: CamposProducto['empaque'],
): EmpaqueDeAlta | null {
  try {
    return validarEmpaqueDeTipo(tipo, empaque);
  } catch (err) {
    if (err instanceof TipoArticuloInvalidoError) throw new BadRequestException(err.message);
    throw err;
  }
}

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
        ...INCLUDE_PRODUCTO,
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

  async createProduct(
    dto: CamposProducto & {
      sku?: string;
      name: string;
      companyId?: number | null;
      /** Alta desde el lector de almacén: el código con que se escaneó y lo que trajo el catálogo. */
      upc?: string | null;
      ean?: string | null;
      codigoBarras?: string | null;
      brandId?: number | null;
      especificaciones?: Record<string, string>;
    },
  ) {
    const companyId = await resolveRequiredCompanyId(this.prisma, dto.companyId);
    // El tipo y el empaque se revisan antes de tocar la base: un error aquí no deja nada a medias.
    const tipo = tipoMandado(dto.tipoArticulo) ?? null;
    const empaque = empaqueRevisado(tipo, dto.empaque);
    const sku = dto.sku?.trim()
      ? dto.sku.trim().toUpperCase()
      : await this.generateNextSku(companyId);
    const existing = await this.prisma.product.findFirst({ where: { sku, companyId } });
    if (existing) throw new ConflictException(`Ya existe un producto con SKU ${sku}`);
    const unit =
      unidadParaTipo({ tipo, unidadMandada: dto.unit?.trim() || dto.unitName?.trim() }) ?? null;
    const specifications = { ...(dto.especificaciones ?? {}), ...(unit ? { unit } : {}) };
    return this.prisma.$transaction(async (tx) => {
      const creado = await tx.product.create({
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
          tipoArticulo: tipo,
          specifications: Object.keys(specifications).length ? specifications : undefined,
          upc: dto.upc?.trim() || null,
          ean: dto.ean?.trim() || null,
          codigoBarras: dto.codigoBarras?.trim() || null,
          brandId: dto.brandId ?? null,
          activo: true,
          companyId,
        },
        select: { id: true },
      });
      if (empaque) await this.guardarEmpaqueDeCompra(tx, creado.id, companyId, empaque);
      return tx.product.findUniqueOrThrow({ where: { id: creado.id }, include: INCLUDE_PRODUCTO });
    });
  }

  async updateProduct(
    id: number,
    dto: CamposProducto & { name?: string; sku?: string },
    companyId?: number | null,
  ) {
    const existing = await this.prisma.product.findFirst({
      where: { id, activo: { not: false }, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(existing, companyId, 'Producto');
    if (!existing) throw new ConflictException('Producto no encontrado');

    // Sin `tipoArticulo` en el cuerpo, el empaque se revisa contra el tipo que ya tiene.
    const tipoNuevo = tipoMandado(dto.tipoArticulo);
    const tipo = tipoNuevo === undefined ? (normalizarTipoArticulo(existing.tipoArticulo) ?? null) : tipoNuevo;
    const empaque = empaqueRevisado(tipo, dto.empaque);

    const skuMandado = dto.sku?.trim().toUpperCase();
    const sku = skuMandado && skuMandado !== existing.sku ? skuMandado : undefined;
    if (sku) {
      const ocupado = await this.prisma.product.findFirst({
        where: { sku, companyId: existing.companyId, id: { not: id } },
        select: { id: true },
      });
      if (ocupado) throw new ConflictException(`Ya existe un producto con SKU ${sku}`);
    }

    // Al cambiar el tipo se propone su unidad (pz o m), sin pisar una unidad capturada a mano.
    const unit =
      tipoNuevo === undefined
        ? dto.unit?.trim() || dto.unitName?.trim() || undefined
        : unidadParaTipo({
            tipo: tipoNuevo,
            unidadMandada: dto.unit?.trim() || dto.unitName?.trim(),
            unidadActual: existing.unitName,
          });
    const cambiaUnidad = unit !== undefined && unit !== existing.unitName;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          sku,
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
          tipoArticulo: tipoNuevo,
          ...(cambiaUnidad
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
        select: { id: true },
      });
      if (empaque) await this.guardarEmpaqueDeCompra(tx, id, existing.companyId, empaque);
      return tx.product.findUniqueOrThrow({ where: { id }, include: INCLUDE_PRODUCTO });
    });
  }

  /**
   * Deja el empaque como la presentación de compra por defecto. Si el producto ya tiene una
   * con ese nombre («bote» == «Bote») se le corrige lo que trae y conserva su nombre (y su
   * código de barras); si no, se crea. Las demás
   * presentaciones se quedan (pueden tener su código de barras), solo dejan de ser la default.
   */
  private async guardarEmpaqueDeCompra(
    tx: Prisma.TransactionClient,
    productId: number,
    companyId: number,
    empaque: EmpaqueDeAlta,
  ) {
    const actuales = await tx.productPackaging.findMany({
      where: { productId },
      select: { id: true, nombre: true },
    });
    const clave = claveEmpaque(empaque.nombre);
    const mismo = actuales.find((e) => claveEmpaque(e.nombre) === clave);
    await tx.productPackaging.updateMany({
      where: { productId, esDefaultCompra: true, ...(mismo ? { id: { not: mismo.id } } : {}) },
      data: { esDefaultCompra: false },
    });
    const piezasPorUnidad = new Prisma.Decimal(empaque.capacidad);
    if (mismo) {
      await tx.productPackaging.update({
        where: { id: mismo.id },
        data: { piezasPorUnidad, esDefaultCompra: true },
      });
      return;
    }
    await tx.productPackaging.create({
      data: { productId, nombre: empaque.nombre, piezasPorUnidad, esDefaultCompra: true, companyId },
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
