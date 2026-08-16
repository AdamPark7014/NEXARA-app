import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import {
  creditStatus,
  dueDateFromTerms,
  purchaseWarnings,
  resolveUnitPrice,
  type PriceBreak,
  type WholesaleTerms,
} from './wholesale-pricing.js';

/**
 * Compras a mayorista: condiciones de convenio, precio por volumen y crédito.
 *
 * Antes el sistema trataba igual al mayorista con el que hay convenio y al
 * proveedor de una sola compra. Aquí se guardan las condiciones y se resuelve,
 * para una lista de líneas, qué precio toca y si el pedido cabe en el crédito.
 */
@Injectable()
export class WholesaleService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadSupplier(supplierId: number, companyId: number) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, ...companyWhere(companyId) },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return supplier;
  }

  /** Condiciones pactadas más el estado de crédito al día de hoy. */
  async getTerms(supplierId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const supplier = await this.loadSupplier(supplierId, tenantId);
    const saldo = await this.outstandingBalance(supplierId, tenantId);

    return {
      supplierId: supplier.id,
      nombre: supplier.name,
      esMayorista: supplier.esMayorista,
      creditoDias: supplier.creditoDias,
      limiteCredito: toNumberOrNull(supplier.limiteCredito),
      descuentoBase: toNumberOrNull(supplier.descuentoBase),
      leadTimeDias: supplier.leadTimeDias,
      pedidoMinimo: toNumberOrNull(supplier.pedidoMinimo),
      credito: creditStatus(this.termsOf(supplier), saldo),
    };
  }

  /**
   * Actualiza las condiciones de convenio.
   *
   * Sólo se tocan los campos enviados: un formulario que muestra crédito pero
   * no pedido mínimo no debe borrar el mínimo al guardar.
   */
  async updateTerms(
    supplierId: number,
    dto: {
      esMayorista?: boolean;
      creditoDias?: number | null;
      limiteCredito?: number | null;
      descuentoBase?: number | null;
      leadTimeDias?: number | null;
      pedidoMinimo?: number | null;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadSupplier(supplierId, tenantId);

    if (dto.descuentoBase != null && (dto.descuentoBase < 0 || dto.descuentoBase >= 100)) {
      throw new BadRequestException('El descuento debe estar entre 0 y 99.99 %');
    }
    for (const [campo, valor] of Object.entries({
      creditoDias: dto.creditoDias,
      leadTimeDias: dto.leadTimeDias,
      limiteCredito: dto.limiteCredito,
      pedidoMinimo: dto.pedidoMinimo,
    })) {
      if (valor != null && (!Number.isFinite(Number(valor)) || Number(valor) < 0)) {
        throw new BadRequestException(`\`${campo}\` no puede ser negativo`);
      }
    }

    const data: Prisma.SupplierUpdateInput = {};
    if (dto.esMayorista !== undefined) data.esMayorista = dto.esMayorista;
    if (dto.creditoDias !== undefined) data.creditoDias = intOrNull(dto.creditoDias);
    if (dto.leadTimeDias !== undefined) data.leadTimeDias = intOrNull(dto.leadTimeDias);
    if (dto.limiteCredito !== undefined) data.limiteCredito = decimalOrNull(dto.limiteCredito);
    if (dto.descuentoBase !== undefined) data.descuentoBase = decimalOrNull(dto.descuentoBase);
    if (dto.pedidoMinimo !== undefined) data.pedidoMinimo = decimalOrNull(dto.pedidoMinimo);

    await this.prisma.supplier.update({ where: { id: supplierId }, data });
    return this.getTerms(supplierId, tenantId);
  }

  /** Escalones vigentes y vencidos de un mayorista. */
  async listPriceBreaks(supplierId: number, companyId?: number | null, productId?: number) {
    const tenantId = requireCompanyId(companyId);
    await this.loadSupplier(supplierId, tenantId);

    return this.prisma.supplierPriceBreak.findMany({
      where: {
        supplierId,
        ...companyWhere(tenantId),
        ...(productId ? { productId } : {}),
      },
      include: { product: { select: { id: true, sku: true, name: true } } },
      orderBy: [{ productId: 'asc' }, { cantidadMinima: 'asc' }],
    });
  }

  /**
   * Alta o corrección de un escalón.
   *
   * La clave es (proveedor, producto, cantidad mínima): renegociar el precio de
   * "a partir de 100 piezas" corrige esa fila, no crea una segunda que
   * competiría con la primera.
   */
  async upsertPriceBreak(
    supplierId: number,
    dto: {
      productId: number;
      cantidadMinima: number;
      unitPrice: number;
      currency?: string;
      vigenteDesde?: string | null;
      vigenteHasta?: string | null;
      activo?: boolean;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadSupplier(supplierId, tenantId);

    if (!Number.isInteger(dto.productId) || dto.productId <= 0) {
      throw new BadRequestException('Producto inválido');
    }
    if (!Number.isFinite(dto.cantidadMinima) || dto.cantidadMinima <= 0) {
      throw new BadRequestException('La cantidad mínima debe ser mayor que cero');
    }
    if (!Number.isFinite(dto.unitPrice) || dto.unitPrice < 0) {
      throw new BadRequestException('El precio no puede ser negativo');
    }

    const desde = dto.vigenteDesde ? new Date(dto.vigenteDesde) : null;
    const hasta = dto.vigenteHasta ? new Date(dto.vigenteHasta) : null;
    if (desde && hasta && hasta < desde) {
      throw new BadRequestException('La vigencia termina antes de empezar');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, ...companyWhere(tenantId) },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('El producto no existe en esta empresa');

    const cantidad = new Prisma.Decimal(dto.cantidadMinima);
    const comun = {
      unitPrice: new Prisma.Decimal(dto.unitPrice),
      currency: dto.currency?.trim().toUpperCase() || 'MXN',
      vigenteDesde: desde,
      vigenteHasta: hasta,
      activo: dto.activo ?? true,
    };

    return this.prisma.supplierPriceBreak.upsert({
      where: {
        supplierId_productId_cantidadMinima: {
          supplierId,
          productId: dto.productId,
          cantidadMinima: cantidad,
        },
      },
      update: comun,
      create: {
        supplierId,
        productId: dto.productId,
        cantidadMinima: cantidad,
        companyId: tenantId,
        ...comun,
      },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });
  }

  /**
   * Retira un escalón.
   *
   * Se desactiva en vez de borrarse: las órdenes ya emitidas con ese precio
   * deben poder explicarse después.
   */
  async deactivatePriceBreak(supplierId: number, id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const result = await this.prisma.supplierPriceBreak.updateMany({
      where: { id, supplierId, ...companyWhere(tenantId) },
      data: { activo: false },
    });
    if (result.count === 0) throw new NotFoundException('Escalón no encontrado');
    return { deactivated: true };
  }

  /**
   * Precio de una compra antes de emitirla.
   *
   * Para cada línea resuelve el precio que toca por volumen y devuelve el
   * ahorro contra lista; al final avisa si no se llega al pedido mínimo o si la
   * compra se sale del crédito. Son **avisos**: quien autoriza decide.
   */
  async quote(
    supplierId: number,
    items: Array<{ productId: number; quantity: number; listPrice?: number }>,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const supplier = await this.loadSupplier(supplierId, tenantId);

    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Se requiere al menos una línea');
    }

    const productIds = [...new Set(items.map((i) => Number(i.productId)).filter(Boolean))];
    const [breaks, productos] = await Promise.all([
      this.prisma.supplierPriceBreak.findMany({
        where: { supplierId, productId: { in: productIds }, activo: true, ...companyWhere(tenantId) },
      }),
      this.prisma.product.findMany({
        where: { id: { in: productIds }, ...companyWhere(tenantId) },
        select: { id: true, sku: true, name: true, price: true },
      }),
    ]);

    const porProducto = new Map<number, PriceBreak[]>();
    for (const b of breaks) {
      const lista = porProducto.get(b.productId) ?? [];
      lista.push({
        id: b.id,
        cantidadMinima: Number(b.cantidadMinima),
        unitPrice: Number(b.unitPrice),
        currency: b.currency,
        vigenteDesde: b.vigenteDesde,
        vigenteHasta: b.vigenteHasta,
        activo: b.activo,
      });
      porProducto.set(b.productId, lista);
    }
    const catalogo = new Map(productos.map((p) => [p.id, p]));
    const terms = this.termsOf(supplier);
    const at = new Date();

    const lineas = items.map((item) => {
      const producto = catalogo.get(Number(item.productId));
      const listPrice = Number(item.listPrice ?? producto?.price ?? 0);
      const quantity = Number(item.quantity) || 0;
      const precio = resolveUnitPrice({
        listPrice,
        quantity,
        breaks: porProducto.get(Number(item.productId)) ?? [],
        terms,
        at,
      });

      return {
        productId: Number(item.productId),
        sku: producto?.sku ?? null,
        nombre: producto?.name ?? null,
        cantidad: quantity,
        precioLista: listPrice,
        ...precio,
        importe: round2(precio.unitPrice * quantity),
        ahorroLinea: round2(precio.ahorroUnitario * quantity),
      };
    });

    const importe = round2(lineas.reduce((s, l) => s + l.importe, 0));
    const ahorro = round2(lineas.reduce((s, l) => s + l.ahorroLinea, 0));
    const saldo = await this.outstandingBalance(supplierId, tenantId);
    const credito = creditStatus(terms, saldo, importe);

    return {
      supplierId,
      proveedor: supplier.name,
      esMayorista: supplier.esMayorista,
      lineas,
      importe,
      ahorro,
      credito,
      /// Con crédito pactado, cuándo vencería esta compra.
      vencimientoEstimado: dueDateFromTerms(terms, at),
      leadTimeDias: supplier.leadTimeDias,
      avisos: purchaseWarnings({ terms, importe, credito }),
    };
  }

  /** Mayoristas de la empresa con su crédito, para la vista de Administración. */
  async listWholesalers(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const suppliers = await this.prisma.supplier.findMany({
      where: { esMayorista: true, isActive: true, ...companyWhere(tenantId) },
      orderBy: { name: 'asc' },
    });

    const saldos = await this.prisma.invoice.groupBy({
      by: ['supplierId'],
      where: this.payableWhere(tenantId, suppliers.map((s) => s.id)),
      _sum: { totalAmount: true, paidAmount: true },
    });
    const porProveedor = new Map(
      saldos.map((s) => [
        s.supplierId,
        Number(s._sum?.totalAmount ?? 0) - Number(s._sum?.paidAmount ?? 0),
      ]),
    );

    return suppliers.map((s) => ({
      id: s.id,
      nombre: s.name,
      rfc: s.rfc,
      creditoDias: s.creditoDias,
      leadTimeDias: s.leadTimeDias,
      descuentoBase: toNumberOrNull(s.descuentoBase),
      pedidoMinimo: toNumberOrNull(s.pedidoMinimo),
      credito: creditStatus(this.termsOf(s), porProveedor.get(s.id) ?? 0),
    }));
  }

  /**
   * Saldo por pagar: facturas de proveedor emitidas y no liquidadas.
   *
   * Se excluyen borradores y canceladas —no son deuda— y se descuenta lo ya
   * pagado, para que un abono parcial libere crédito.
   */
  private async outstandingBalance(supplierId: number, companyId: number): Promise<number> {
    const agg = await this.prisma.invoice.aggregate({
      where: this.payableWhere(companyId, [supplierId]),
      _sum: { totalAmount: true, paidAmount: true },
    });
    return round2(Number(agg._sum?.totalAmount ?? 0) - Number(agg._sum?.paidAmount ?? 0));
  }

  private payableWhere(companyId: number, supplierIds: number[]) {
    return {
      supplierId: { in: supplierIds },
      type: 'ACCOUNTS_PAYABLE' as const,
      status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as InvoiceStatus[] },
      isCancelled: false,
      deletedAt: null,
      ...companyWhere(companyId),
    };
  }

  private termsOf(supplier: {
    esMayorista: boolean;
    creditoDias: number | null;
    limiteCredito: Prisma.Decimal | null;
    descuentoBase: Prisma.Decimal | null;
    leadTimeDias: number | null;
    pedidoMinimo: Prisma.Decimal | null;
  }): WholesaleTerms {
    return {
      esMayorista: supplier.esMayorista,
      creditoDias: supplier.creditoDias,
      limiteCredito: toNumberOrNull(supplier.limiteCredito),
      descuentoBase: toNumberOrNull(supplier.descuentoBase),
      leadTimeDias: supplier.leadTimeDias,
      pedidoMinimo: toNumberOrNull(supplier.pedidoMinimo),
    };
  }
}

function toNumberOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.floor(Number(value));
}

function decimalOrNull(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value);
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
