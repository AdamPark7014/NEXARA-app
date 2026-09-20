import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

/**
 * Proveedores y Proyectos para el workspace de Contabilidad.
 *
 * Antes ambas vistas se armaban en el navegador agrupando facturas: el
 * proveedor era un string repetido en `receptorName` y el proyecto era un
 * `projectId` que **no existe** en el modelo Invoice. Aquí se leen las
 * entidades reales:
 *
 *  - Proveedor  → modelo `Supplier` (datos fiscales, crédito, mayoreo).
 *  - Proyecto   → `OperationalProject` (la faceta con camino a facturas)
 *                 y `WorkProject` (obra, con costos propios).
 *
 * Caminos de datos verificados en `schema.prisma`:
 *   Invoice.supplierId            → Supplier
 *   Invoice.activityId            → Activity.projectId → OperationalProject
 *   Invoice.salesProjectOrderId   → SalesProjectOrder.project(SalesProject)
 *                                   ← OperationalProject.salesProjectId
 *   Expense.actividadId           → Activity → OperationalProject
 *   Viatico.actividadId | projectId(SalesProject)
 *   StockMovement.activityId      → Activity → OperationalProject
 *   WorkProjectExpense/Payroll.projectId → WorkProject
 *
 * Aislamiento: todo consulta con `companyWhere(requireCompanyId(...))`.
 * Sin empresa activa no se devuelve nada (fail-closed).
 */

// ── Tipos públicos ──────────────────────────────────────────────────────────

export type CostSource = 'facturas' | 'gastos' | 'viaticos' | 'almacen' | 'nomina';

export type CostCategory = {
  key: string;
  label: string;
  fuente: CostSource;
  monto: number;
  pagado: number;
  pendiente: number;
  conteo: number;
  /** Porcentaje del costo total. Se calcula al resumir. */
  participacionPct: number;
};

export type MarginResult = {
  margen: number;
  /** null cuando no hay ingresos facturados: el porcentaje no significa nada. */
  margenPct: number | null;
};

export type ProjectKind = 'operacional' | 'obra';

export type CostTransaction = {
  key: string;
  tipo: 'factura' | 'gasto' | 'viatico' | 'almacen' | 'nomina';
  documento: string;
  fecha: string | null;
  concepto: string;
  monto: number;
  pagado: number;
  estatus: string;
  categoriaKey: string;
  /** Id del registro de origen, por si la UI necesita abrir el documento. */
  refId: number;
};

// ── Cálculo puro (testeable sin base de datos) ──────────────────────────────

/**
 * Redondeo simétrico. `Math.round(-0.5)` da `-0`, no `-1`: un costo y una
 * pérdida del mismo tamaño se redondearían distinto y los totales dejarían de
 * cuadrar con sus partidas. Aquí el medio centavo siempre se aleja del cero.
 */
function roundAwayFromZero(value: number, factor: number): number {
  const scaled = Math.round(Math.abs(value) * factor) / factor;
  const signed = value < 0 ? -scaled : scaled;
  return signed === 0 ? 0 : signed;
}

/** Centavos exactos: evita que la suma de decimales arrastre ruido flotante. */
export function money(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return roundAwayFromZero(value, 100);
}

/** Decimal de Prisma, null, string… todo termina en número. */
export function toNumber(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Margen = ingresos facturados − costo total.
 * El porcentaje es sobre ingresos; sin ingresos devuelve null en vez de 0,
 * porque «0 % de margen» y «todavía no se factura» no son lo mismo.
 */
export function computeMargin(ingresos: number, costoTotal: number): MarginResult {
  const margen = money(ingresos - costoTotal);
  if (ingresos <= 0) return { margen, margenPct: null };
  return { margen, margenPct: roundAwayFromZero((margen / ingresos) * 100, 10) };
}

/** Acumulador de categorías: suma montos y conserva la fuente. */
export class CostAccumulator {
  private readonly rows = new Map<string, CostCategory>();

  add(input: {
    key: string;
    label: string;
    fuente: CostSource;
    monto: number;
    pagado?: number;
    conteo?: number;
  }): void {
    const current =
      this.rows.get(input.key) ??
      ({
        key: input.key,
        label: input.label,
        fuente: input.fuente,
        monto: 0,
        pagado: 0,
        pendiente: 0,
        conteo: 0,
        participacionPct: 0,
      } satisfies CostCategory);
    current.monto += toNumber(input.monto);
    current.pagado += toNumber(input.pagado);
    current.conteo += input.conteo ?? 1;
    this.rows.set(input.key, current);
  }

  list(): CostCategory[] {
    return Array.from(this.rows.values());
  }
}

/**
 * Cierra el desglose: redondea, calcula pendiente y participación,
 * y ordena de mayor a menor costo (lo primero que mira la contadora).
 */
export function summarizeCostCategories(categories: CostCategory[]): {
  categorias: CostCategory[];
  costoTotal: number;
  costoPagado: number;
  costoPendiente: number;
} {
  const costoTotal = money(categories.reduce((acc, c) => acc + toNumber(c.monto), 0));
  const costoPagado = money(categories.reduce((acc, c) => acc + toNumber(c.pagado), 0));
  const categorias = categories
    .map((c) => {
      const monto = money(c.monto);
      const pagado = money(c.pagado);
      return {
        ...c,
        monto,
        pagado,
        pendiente: money(monto - pagado),
        participacionPct:
          costoTotal > 0 ? roundAwayFromZero((monto / costoTotal) * 100, 10) : 0,
      };
    })
    .filter((c) => c.monto !== 0 || c.conteo > 0)
    .sort((a, b) => b.monto - a.monto);
  return {
    categorias,
    costoTotal,
    costoPagado,
    costoPendiente: money(costoTotal - costoPagado),
  };
}

// ── Constantes de dominio ───────────────────────────────────────────────────

/** Facturas que siguen pesando en el saldo. Igual criterio que el dashboard. */
const OPEN_INVOICE_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;

/** Un gasto o viático rechazado no es costo del proyecto. */
const REJECTED_LABELS = ['Rechazado', 'rechazado', 'RECHAZADO', 'RECHAZADA', 'Rechazada'];

/** Estatus que ya significan dinero salido. */
const PAID_LABELS = new Set(['pagado', 'pagada', 'paid']);

const isPaidLabel = (value: string | null | undefined): boolean =>
  PAID_LABELS.has(String(value ?? '').trim().toLowerCase());

const toIsoDate = (value: Date | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

/**
 * Medianoche UTC del día de una fecha. `dueDate` es columna `Date` (sin hora):
 * comparada contra un `new Date()` con hora, una factura que vence HOY salía
 * vencida en la lista y al corriente en el detalle. Ambos lados usan esto.
 */
const utcMidnight = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

/**
 * «Hoy» es el día del calendario del SERVIDOR, expresado como medianoche UTC
 * para poder compararlo con las columnas `@db.Date`.
 *
 * Con `utcMidnight(new Date())` el día era el UTC: en la Ciudad de México
 * (UTC−6), a partir de las 18:00 «hoy» ya era mañana y la antigüedad de toda
 * la cartera del proveedor saltaba un día — la misma factura decía «al
 * corriente» en CxP (que sí usa el día local) y «vencida · 1 día» aquí.
 */
const hoyDelServidor = (ahora: Date = new Date()): Date =>
  new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));

/** Días completos de retraso. 0 o menos = todavía no vence. */
const daysOverdue = (dueDate: Date | null | undefined, today: Date): number => {
  if (!dueDate) return 0;
  const diff = today.getTime() - utcMidnight(new Date(dueDate)).getTime();
  return diff > 0 ? Math.floor(diff / 86_400_000) : 0;
};

const VIATICO_LABELS: Record<string, string> = {
  COMBUSTIBLE: 'Viáticos · Combustible',
  CASETA: 'Viáticos · Casetas',
  HOSPEDAJE: 'Viáticos · Hospedaje',
  ALIMENTACION: 'Viáticos · Alimentación',
  TRANSPORTE: 'Viáticos · Transporte',
  OTROS: 'Viáticos · Otros',
};

const viaticoLabel = (categoria: string | null | undefined): string => {
  const key = String(categoria ?? '').trim().toUpperCase();
  return VIATICO_LABELS[key] ?? (key ? `Viáticos · ${key}` : 'Viáticos · Sin categoría');
};

// ── Servicio ────────────────────────────────────────────────────────────────

@Injectable()
export class VendorProjectFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ══ PROVEEDORES ══════════════════════════════════════════════════════════

  /**
   * Lista de proveedores desde el modelo `Supplier`, no desde facturas.
   * Un proveedor dado de alta sin facturas aparece con saldo 0; antes era
   * invisible.
   *
   * Sin N+1: cinco agregados con `groupBy` cubren a todos los proveedores.
   */
  async listVendors(
    companyId: number | null | undefined,
    filters?: { q?: string; soloActivos?: boolean },
  ) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);
    const now = new Date();
    const hoy = hoyDelServidor(now);
    const yearStart = new Date(Date.UTC(now.getFullYear(), 0, 1));

    const supplierWhere: Record<string, unknown> = { ...scope };
    if (filters?.soloActivos) supplierWhere.isActive = true;
    if (filters?.q?.trim()) {
      supplierWhere.OR = [
        { name: { contains: filters.q.trim(), mode: 'insensitive' } },
        { rfc: { contains: filters.q.trim(), mode: 'insensitive' } },
      ];
    }

    const suppliers = await this.prisma.supplier.findMany({
      where: supplierWhere,
      select: {
        id: true,
        name: true,
        rfc: true,
        isActive: true,
        esMayorista: true,
        creditoDias: true,
        limiteCredito: true,
        leadTimeDias: true,
      },
      orderBy: { name: 'asc' },
    });

    const ids = suppliers.map((s) => s.id);
    const apBase = {
      ...scope,
      deletedAt: null,
      isCancelled: false,
      type: 'ACCOUNTS_PAYABLE' as const,
      supplierId: { in: ids },
    };

    const [totales, abiertas, vencidas, delAnio, ordenes] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['supplierId'],
        where: apBase,
        _sum: { totalAmount: true, paidAmount: true },
        _count: { _all: true },
        _max: { issueDate: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['supplierId'],
        where: { ...apBase, status: { in: [...OPEN_INVOICE_STATUSES] } },
        _sum: { totalAmount: true, paidAmount: true },
        _count: { _all: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['supplierId'],
        where: {
          ...apBase,
          status: { in: [...OPEN_INVOICE_STATUSES] },
          dueDate: { lt: hoy },
        },
        _sum: { totalAmount: true, paidAmount: true },
        _count: { _all: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['supplierId'],
        where: { ...apBase, issueDate: { gte: yearStart } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['supplierId'],
        where: { ...scope, deletedAt: null, supplierId: { in: ids } },
        _sum: { totalAmount: true },
        _count: { _all: true },
        _max: { orderDate: true },
      }),
    ]);

    const byId = <T extends { supplierId: number | null }>(rows: T[]) =>
      new Map(rows.filter((r) => r.supplierId != null).map((r) => [Number(r.supplierId), r]));

    const mTotales = byId(totales);
    const mAbiertas = byId(abiertas);
    const mVencidas = byId(vencidas);
    const mAnio = byId(delAnio);
    const mOrdenes = byId(ordenes);

    const items = suppliers.map((s) => {
      const t = mTotales.get(s.id);
      const a = mAbiertas.get(s.id);
      const v = mVencidas.get(s.id);
      const y = mAnio.get(s.id);
      const o = mOrdenes.get(s.id);
      const saldo = money(
        toNumber(a?._sum.totalAmount) - toNumber(a?._sum.paidAmount),
      );
      const vencido = money(
        toNumber(v?._sum.totalAmount) - toNumber(v?._sum.paidAmount),
      );
      const limite = s.limiteCredito == null ? null : money(toNumber(s.limiteCredito));
      return {
        id: s.id,
        nombre: s.name,
        rfc: s.rfc,
        activo: s.isActive,
        esMayorista: s.esMayorista,
        creditoDias: s.creditoDias,
        limiteCredito: limite,
        leadTimeDias: s.leadTimeDias,
        saldoPorPagar: saldo,
        vencido,
        porVencer: money(saldo - vencido),
        totalAnio: money(toNumber(y?._sum.totalAmount)),
        facturas: t?._count._all ?? 0,
        facturasAbiertas: a?._count._all ?? 0,
        ultimaCompra: toIsoDate(t?._max.issueDate ?? null),
        ordenesCompra: o?._count._all ?? 0,
        montoOrdenes: money(toNumber(o?._sum.totalAmount)),
        ultimaOrden: toIsoDate(o?._max.orderDate ?? null),
        /** El saldo rebasó el tope pactado: la orden siguiente debería avisar. */
        excedeCredito: limite != null && limite > 0 ? saldo > limite : false,
      };
    });

    items.sort((a, b) => b.vencido - a.vencido || b.saldoPorPagar - a.saldoPorPagar);

    return {
      items,
      totales: {
        proveedores: items.length,
        saldoPorPagar: money(items.reduce((acc, i) => acc + i.saldoPorPagar, 0)),
        vencido: money(items.reduce((acc, i) => acc + i.vencido, 0)),
        totalAnio: money(items.reduce((acc, i) => acc + i.totalAnio, 0)),
        conSaldo: items.filter((i) => i.saldoPorPagar > 0).length,
      },
    };
  }

  /** Vista 360° de un proveedor. Solo lo que existe en base de datos. */
  async getVendorDetail(companyId: number | null | undefined, supplierId: number) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, ...scope },
      select: {
        id: true,
        name: true,
        rfc: true,
        description: true,
        isActive: true,
        esMayorista: true,
        creditoDias: true,
        limiteCredito: true,
        descuentoBase: true,
        leadTimeDias: true,
        pedidoMinimo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const hoy = hoyDelServidor();
    const [facturas, ordenes, pagos, evaluaciones, productos] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { ...scope, deletedAt: null, supplierId },
        select: {
          id: true,
          invoiceNumber: true,
          type: true,
          status: true,
          issueDate: true,
          dueDate: true,
          totalAmount: true,
          paidAmount: true,
          currency: true,
          cfdiUuid: true,
          isCancelled: true,
          activity: {
            select: {
              id: true,
              anNumber: true,
              titulo: true,
              projectId: true,
              project: { select: { id: true, title: true, status: true } },
            },
          },
        },
        orderBy: { issueDate: 'desc' },
        take: 200,
      }),
      this.prisma.purchaseOrder.findMany({
        where: { ...scope, deletedAt: null, supplierId },
        select: {
          id: true,
          poNumber: true,
          status: true,
          orderDate: true,
          expectedDate: true,
          totalAmount: true,
          currency: true,
          _count: { select: { items: true, invoices: true } },
        },
        orderBy: { orderDate: 'desc' },
        take: 100,
      }),
      this.prisma.payment.findMany({
        where: { ...scope, invoice: { supplierId, ...scope } },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          method: true,
          reference: true,
          invoiceId: true,
          invoice: { select: { invoiceNumber: true } },
        },
        orderBy: { paymentDate: 'desc' },
        take: 100,
      }),
      this.prisma.supplierEvaluation.findMany({
        where: { ...scope, supplierId },
        select: {
          id: true,
          evaluationDate: true,
          qualityScore: true,
          deliveryScore: true,
          priceScore: true,
          serviceScore: true,
          overallScore: true,
          notes: true,
        },
        orderBy: { evaluationDate: 'desc' },
        take: 24,
      }),
      // SupplierProduct no lleva companyId propio: se acota por el proveedor,
      // que ya quedó validado contra la empresa activa.
      this.prisma.supplierProduct.count({
        where: { supplierId, active: true, supplier: { ...scope } },
      }),
    ]);

    const vivas = facturas.filter(
      (f) => !f.isCancelled && (OPEN_INVOICE_STATUSES as readonly string[]).includes(String(f.status)),
    );

    // Antigüedad del saldo: por tramos, como lo pide la contadora.
    const buckets = [
      { key: 'porVencer', label: 'Por vencer', min: -Infinity, max: 0, monto: 0, conteo: 0 },
      { key: 'd1_30', label: '1 a 30 días', min: 0, max: 30, monto: 0, conteo: 0 },
      { key: 'd31_60', label: '31 a 60 días', min: 30, max: 60, monto: 0, conteo: 0 },
      { key: 'd61_90', label: '61 a 90 días', min: 60, max: 90, monto: 0, conteo: 0 },
      { key: 'd90', label: 'Más de 90 días', min: 90, max: Infinity, monto: 0, conteo: 0 },
    ];
    const porPagar = vivas.map((f) => {
      const saldo = money(toNumber(f.totalAmount) - toNumber(f.paidAmount));
      const dias = daysOverdue(f.dueDate, hoy);
      const bucket = buckets.find((b) => dias > b.min && dias <= b.max) ?? buckets[0];
      bucket.monto = money(bucket.monto + saldo);
      bucket.conteo += 1;
      return {
        id: f.id,
        folio: f.invoiceNumber,
        emision: toIsoDate(f.issueDate),
        vencimiento: toIsoDate(f.dueDate),
        total: money(toNumber(f.totalAmount)),
        pagado: money(toNumber(f.paidAmount)),
        saldo,
        diasVencido: dias > 0 ? dias : 0,
        estatus: String(f.status),
        tramo: bucket.key,
      };
    });

    // Proyectos donde participó: sale de la actividad ligada a la factura.
    const proyectos = new Map<
      number,
      { id: number; titulo: string; estatus: string; facturas: number; monto: number }
    >();
    for (const f of facturas) {
      const p = f.activity?.project;
      if (!p) continue;
      const row = proyectos.get(p.id) ?? {
        id: p.id,
        titulo: p.title,
        estatus: String(p.status),
        facturas: 0,
        monto: 0,
      };
      row.facturas += 1;
      row.monto = money(row.monto + toNumber(f.totalAmount));
      proyectos.set(p.id, row);
    }

    const saldoTotal = money(porPagar.reduce((acc, f) => acc + f.saldo, 0));
    const vencidoTotal = money(
      porPagar.filter((f) => f.diasVencido > 0).reduce((acc, f) => acc + f.saldo, 0),
    );
    const limite = supplier.limiteCredito == null ? null : money(toNumber(supplier.limiteCredito));

    // Historial: una sola línea de tiempo con lo que de verdad pasó.
    const historial = [
      ...facturas.slice(0, 60).map((f) => ({
        key: `inv-${f.id}`,
        tipo: 'factura' as const,
        fecha: toIsoDate(f.issueDate),
        titulo: `Factura ${f.invoiceNumber}`,
        detalle: f.type === 'ACCOUNTS_PAYABLE' ? 'Por pagar' : 'Por cobrar',
        monto: money(toNumber(f.totalAmount)),
        estatus: String(f.status),
      })),
      ...ordenes.slice(0, 60).map((o) => ({
        key: `po-${o.id}`,
        tipo: 'orden' as const,
        fecha: toIsoDate(o.orderDate),
        titulo: `Orden de compra ${o.poNumber}`,
        detalle: `${o._count.items} partida(s)`,
        monto: money(toNumber(o.totalAmount)),
        estatus: String(o.status),
      })),
      ...pagos.slice(0, 60).map((p) => ({
        key: `pay-${p.id}`,
        tipo: 'pago' as const,
        fecha: toIsoDate(p.paymentDate),
        titulo: `Pago a factura ${p.invoice?.invoiceNumber ?? p.invoiceId}`,
        detalle: p.reference ?? String(p.method),
        monto: money(toNumber(p.amount)),
        estatus: 'Aplicado',
      })),
      ...evaluaciones.slice(0, 24).map((e) => ({
        key: `eval-${e.id}`,
        tipo: 'evaluacion' as const,
        fecha: toIsoDate(e.evaluationDate),
        titulo: 'Evaluación de proveedor',
        detalle: e.notes ?? '',
        monto: 0,
        estatus: `${money(toNumber(e.overallScore))} / 100`,
      })),
    ].sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')));

    return {
      proveedor: {
        id: supplier.id,
        nombre: supplier.name,
        rfc: supplier.rfc,
        descripcion: supplier.description,
        activo: supplier.isActive,
        alta: toIsoDate(supplier.createdAt),
        actualizado: toIsoDate(supplier.updatedAt),
      },
      condiciones: {
        esMayorista: supplier.esMayorista,
        creditoDias: supplier.creditoDias,
        limiteCredito: limite,
        descuentoBase:
          supplier.descuentoBase == null ? null : money(toNumber(supplier.descuentoBase)),
        leadTimeDias: supplier.leadTimeDias,
        pedidoMinimo:
          supplier.pedidoMinimo == null ? null : money(toNumber(supplier.pedidoMinimo)),
        productosEnCatalogo: productos,
      },
      resumen: {
        saldoPorPagar: saldoTotal,
        vencido: vencidoTotal,
        porVencer: money(saldoTotal - vencidoTotal),
        facturas: facturas.length,
        facturasAbiertas: porPagar.length,
        comprado: money(
          facturas
            .filter((f) => f.type === 'ACCOUNTS_PAYABLE' && !f.isCancelled)
            .reduce((acc, f) => acc + toNumber(f.totalAmount), 0),
        ),
        pagado: money(pagos.reduce((acc, p) => acc + toNumber(p.amount), 0)),
        ordenesCompra: ordenes.length,
        excedeCredito: limite != null && limite > 0 ? saldoTotal > limite : false,
      },
      facturas: facturas.map((f) => ({
        id: f.id,
        folio: f.invoiceNumber,
        tipo: String(f.type),
        estatus: String(f.status),
        emision: toIsoDate(f.issueDate),
        vencimiento: toIsoDate(f.dueDate),
        total: money(toNumber(f.totalAmount)),
        pagado: money(toNumber(f.paidAmount)),
        saldo: money(toNumber(f.totalAmount) - toNumber(f.paidAmount)),
        moneda: f.currency,
        uuid: f.cfdiUuid,
        cancelada: f.isCancelled,
        proyecto: f.activity?.project
          ? { id: f.activity.project.id, titulo: f.activity.project.title }
          : null,
      })),
      ordenesCompra: ordenes.map((o) => ({
        id: o.id,
        folio: o.poNumber,
        estatus: String(o.status),
        fecha: toIsoDate(o.orderDate),
        esperada: toIsoDate(o.expectedDate),
        total: money(toNumber(o.totalAmount)),
        moneda: o.currency,
        partidas: o._count.items,
        facturas: o._count.invoices,
      })),
      cuentasPorPagar: {
        facturas: porPagar.sort((a, b) => b.diasVencido - a.diasVencido),
        antiguedad: buckets.map(({ key, label, monto, conteo }) => ({
          key,
          label,
          monto,
          conteo,
        })),
      },
      pagos: pagos.map((p) => ({
        id: p.id,
        fecha: toIsoDate(p.paymentDate),
        monto: money(toNumber(p.amount)),
        metodo: String(p.method),
        referencia: p.reference,
        facturaId: p.invoiceId,
        factura: p.invoice?.invoiceNumber ?? null,
      })),
      proyectos: Array.from(proyectos.values()).sort((a, b) => b.monto - a.monto),
      evaluaciones: evaluaciones.map((e) => ({
        id: e.id,
        fecha: toIsoDate(e.evaluationDate),
        calidad: e.qualityScore,
        entrega: e.deliveryScore,
        precio: e.priceScore,
        servicio: e.serviceScore,
        global: money(toNumber(e.overallScore)),
        notas: e.notes,
      })),
      historial: historial.slice(0, 120),
    };
  }

  // ══ PROYECTOS ════════════════════════════════════════════════════════════

  /**
   * Estado financiero por proyecto. Devuelve las dos familias que existen:
   * proyectos operativos (con facturación ligada) y obras (`WorkProject`,
   * con costos propios pero sin camino a facturas).
   */
  async listProjects(companyId: number | null | undefined, filters?: { q?: string }) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);
    const needle = filters?.q?.trim().toLowerCase() ?? '';

    const [proyectos, obras] = await Promise.all([
      this.prisma.operationalProject.findMany({
        where: { ...scope, deletedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          endDate: true,
          budgetAmount: true,
          currency: true,
          salesProjectId: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.workProject.findMany({
        where: { ...scope, deletedAt: null },
        select: {
          id: true,
          title: true,
          clientName: true,
          status: true,
          startDate: true,
          endDate: true,
          budgetTotal: true,
          progress: true,
        },
        orderBy: { startDate: 'desc' },
      }),
    ]);

    const projectIds = proyectos.map((p) => p.id);
    // Viáticos pueden colgar del proyecto comercial en vez de la actividad.
    const salesProjectIds = proyectos
      .map((p) => p.salesProjectId)
      .filter((id): id is number => id != null);
    const obraIds = obras.map((o) => o.id);

    const [actividades, facturas, gastos, viaticos, almacen, obraGastos, obraNomina] =
      await Promise.all([
        this.prisma.activity.findMany({
          where: { ...scope, projectId: { in: projectIds } },
          select: { id: true, projectId: true },
        }),
        // Una sola consulta cubre los dos caminos de factura → proyecto.
        this.prisma.invoice.findMany({
          where: {
            ...scope,
            deletedAt: null,
            isCancelled: false,
            OR: [
              { activity: { projectId: { in: projectIds } } },
              {
                salesProjectOrder: {
                  project: { operationalProject: { id: { in: projectIds } } },
                },
              },
            ],
          },
          select: {
            id: true,
            type: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            activityId: true,
            salesProjectOrder: {
              select: { project: { select: { operationalProject: { select: { id: true } } } } },
            },
          },
        }),
        this.prisma.expense.groupBy({
          by: ['actividadId', 'categoria'],
          where: {
            ...scope,
            deletedAt: null,
            estatusPago: { notIn: REJECTED_LABELS },
            actividad: { projectId: { in: projectIds } },
          },
          _sum: { montoSolicitado: true },
          _count: { _all: true },
        }),
        this.prisma.viatico.findMany({
          where: {
            ...scope,
            deletedAt: null,
            estatus: { notIn: REJECTED_LABELS },
            OR: [
              { Activity: { projectId: { in: projectIds } } },
              { projectId: { in: salesProjectIds } },
            ],
          },
          select: {
            id: true,
            actividadId: true,
            projectId: true,
            categoria: true,
            montoSolicitado: true,
            estatus: true,
          },
        }),
        this.prisma.stockMovement.groupBy({
          by: ['activityId'],
          where: {
            ...scope,
            type: 'DISPATCH',
            activity: { projectId: { in: projectIds } },
          },
          _sum: { totalCost: true },
          _count: { _all: true },
        }),
        this.prisma.workProjectExpense.groupBy({
          by: ['projectId', 'category'],
          where: { ...scope, projectId: { in: obraIds } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.workProjectPayroll.groupBy({
          by: ['projectId'],
          where: { ...scope, projectId: { in: obraIds } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
      ]);

    const actividadAProyecto = new Map<number, number>();
    for (const a of actividades) {
      if (a.projectId != null) actividadAProyecto.set(a.id, a.projectId);
    }
    const salesAProyecto = new Map<number, number>();
    for (const p of proyectos) {
      if (p.salesProjectId != null) salesAProyecto.set(p.salesProjectId, p.id);
    }

    type Bucket = { ingresos: number; cobrado: number; acc: CostAccumulator };
    const buckets = new Map<number, Bucket>();
    const bucket = (id: number): Bucket => {
      const found = buckets.get(id) ?? { ingresos: 0, cobrado: 0, acc: new CostAccumulator() };
      buckets.set(id, found);
      return found;
    };

    for (const f of facturas) {
      const viaActividad = f.activityId != null ? actividadAProyecto.get(f.activityId) : undefined;
      const viaVenta = f.salesProjectOrder?.project?.operationalProject?.id;
      const pid = viaActividad ?? viaVenta;
      if (pid == null) continue;
      const b = bucket(pid);
      if (f.type === 'ACCOUNTS_RECEIVABLE') {
        b.ingresos += toNumber(f.totalAmount);
        b.cobrado += toNumber(f.paidAmount);
      } else {
        b.acc.add({
          key: 'compras',
          label: 'Compras a proveedores',
          fuente: 'facturas',
          monto: toNumber(f.totalAmount),
          pagado: toNumber(f.paidAmount),
        });
      }
    }

    for (const g of gastos) {
      const pid = g.actividadId != null ? actividadAProyecto.get(g.actividadId) : undefined;
      if (pid == null) continue;
      const label = g.categoria?.trim() || 'Otro';
      bucket(pid).acc.add({
        key: `gasto:${label.toLowerCase()}`,
        label: `Gastos · ${label}`,
        fuente: 'gastos',
        monto: toNumber(g._sum.montoSolicitado),
        conteo: g._count._all,
      });
    }

    for (const v of viaticos) {
      const pid =
        (v.actividadId != null ? actividadAProyecto.get(v.actividadId) : undefined) ??
        (v.projectId != null ? salesAProyecto.get(v.projectId) : undefined);
      if (pid == null) continue;
      const monto = toNumber(v.montoSolicitado);
      bucket(pid).acc.add({
        key: `viatico:${String(v.categoria ?? 'otros').toLowerCase()}`,
        label: viaticoLabel(v.categoria),
        fuente: 'viaticos',
        monto,
        pagado: isPaidLabel(v.estatus) ? monto : 0,
      });
    }

    for (const m of almacen) {
      const pid = m.activityId != null ? actividadAProyecto.get(m.activityId) : undefined;
      if (pid == null) continue;
      bucket(pid).acc.add({
        key: 'almacen',
        label: 'Material surtido de almacén',
        fuente: 'almacen',
        monto: toNumber(m._sum.totalCost),
        pagado: toNumber(m._sum.totalCost),
        conteo: m._count._all,
      });
    }

    const operacionales = proyectos.map((p) => {
      const b = buckets.get(p.id);
      const ingresos = money(b?.ingresos ?? 0);
      const cobrado = money(b?.cobrado ?? 0);
      const resumen = summarizeCostCategories(b ? b.acc.list() : []);
      const { margen, margenPct } = computeMargin(ingresos, resumen.costoTotal);
      return {
        key: `operacional-${p.id}`,
        id: p.id,
        tipo: 'operacional' as ProjectKind,
        titulo: p.title,
        cliente: p.client?.name ?? null,
        estatus: String(p.status),
        inicio: toIsoDate(p.startDate),
        fin: toIsoDate(p.endDate),
        moneda: p.currency,
        presupuesto: p.budgetAmount == null ? null : money(toNumber(p.budgetAmount)),
        ingresos,
        cobrado,
        porCobrar: money(ingresos - cobrado),
        costoTotal: resumen.costoTotal,
        costoPagado: resumen.costoPagado,
        costoPendiente: resumen.costoPendiente,
        margen,
        margenPct,
        categorias: resumen.categorias.length,
      };
    });

    const obraBuckets = new Map<number, CostAccumulator>();
    const obraAcc = (id: number) => {
      const found = obraBuckets.get(id) ?? new CostAccumulator();
      obraBuckets.set(id, found);
      return found;
    };
    for (const g of obraGastos) {
      const label = g.category?.trim() || 'Otro';
      obraAcc(g.projectId).add({
        key: `obra:${label.toLowerCase()}`,
        label,
        fuente: 'gastos',
        monto: toNumber(g._sum.amount),
        conteo: g._count._all,
      });
    }
    for (const n of obraNomina) {
      const monto = toNumber(n._sum.amount);
      obraAcc(n.projectId).add({
        key: 'obra:nomina',
        label: 'Nómina de obra',
        fuente: 'nomina',
        monto,
        pagado: monto,
        conteo: n._count._all,
      });
    }

    const deObra = obras.map((o) => {
      const resumen = summarizeCostCategories(obraBuckets.get(o.id)?.list() ?? []);
      return {
        key: `obra-${o.id}`,
        id: o.id,
        tipo: 'obra' as ProjectKind,
        titulo: o.title,
        cliente: o.clientName,
        estatus: String(o.status),
        inicio: toIsoDate(o.startDate),
        fin: toIsoDate(o.endDate),
        moneda: 'MXN',
        presupuesto: o.budgetTotal == null ? null : money(toNumber(o.budgetTotal)),
        // La obra no tiene camino a facturas en el esquema: no se inventa ingreso.
        ingresos: 0,
        cobrado: 0,
        porCobrar: 0,
        costoTotal: resumen.costoTotal,
        costoPagado: resumen.costoPagado,
        costoPendiente: resumen.costoPendiente,
        margen: money(-resumen.costoTotal),
        margenPct: null as number | null,
        categorias: resumen.categorias.length,
        avance: o.progress ?? null,
      };
    });

    const items = [...operacionales, ...deObra].filter((p) =>
      needle
        ? p.titulo.toLowerCase().includes(needle) ||
          String(p.cliente ?? '').toLowerCase().includes(needle)
        : true,
    );
    items.sort((a, b) => b.ingresos - a.ingresos || b.costoTotal - a.costoTotal);

    return {
      items,
      totales: {
        proyectos: items.length,
        conFacturacion: items.filter((p) => p.ingresos > 0).length,
        ingresos: money(items.reduce((acc, p) => acc + p.ingresos, 0)),
        cobrado: money(items.reduce((acc, p) => acc + p.cobrado, 0)),
        costoTotal: money(items.reduce((acc, p) => acc + p.costoTotal, 0)),
        margen: money(items.reduce((acc, p) => acc + p.margen, 0)),
      },
    };
  }

  /** Desglose de un proyecto con drill-down hasta la transacción. */
  async getProjectDetail(
    companyId: number | null | undefined,
    projectId: number,
    tipo: ProjectKind = 'operacional',
  ) {
    return tipo === 'obra'
      ? this.getWorkProjectDetail(companyId, projectId)
      : this.getOperationalProjectDetail(companyId, projectId);
  }

  private async getOperationalProjectDetail(
    companyId: number | null | undefined,
    projectId: number,
  ) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);

    const proyecto = await this.prisma.operationalProject.findFirst({
      where: { id: projectId, deletedAt: null, ...scope },
      select: {
        id: true,
        title: true,
        status: true,
        objective: true,
        scopeSummary: true,
        startDate: true,
        endDate: true,
        actualStartDate: true,
        actualEndDate: true,
        budgetAmount: true,
        currency: true,
        salesProjectId: true,
        client: { select: { id: true, name: true } },
        responsable: { select: { id: true, nombre: true } },
      },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');

    const [facturas, gastos, viaticos, movimientos] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          ...scope,
          deletedAt: null,
          isCancelled: false,
          OR: [
            { activity: { projectId } },
            {
              salesProjectOrder: { project: { operationalProject: { id: projectId } } },
            },
          ],
        },
        select: {
          id: true,
          invoiceNumber: true,
          type: true,
          status: true,
          issueDate: true,
          totalAmount: true,
          paidAmount: true,
          supplier: { select: { id: true, name: true } },
          activity: { select: { id: true, anNumber: true, titulo: true } },
        },
        orderBy: { issueDate: 'desc' },
        take: 500,
      }),
      this.prisma.expense.findMany({
        where: {
          ...scope,
          deletedAt: null,
          estatusPago: { notIn: REJECTED_LABELS },
          actividad: { projectId },
        },
        select: {
          id: true,
          categoria: true,
          concepto: true,
          razonGasto: true,
          montoSolicitado: true,
          estatusPago: true,
          fechaGasto: true,
          fechaSolicitud: true,
          actividad: { select: { anNumber: true } },
        },
        orderBy: { fechaSolicitud: 'desc' },
        take: 500,
      }),
      this.prisma.viatico.findMany({
        where: {
          ...scope,
          deletedAt: null,
          estatus: { notIn: REJECTED_LABELS },
          OR: [
            { Activity: { projectId } },
            ...(proyecto.salesProjectId != null
              ? [{ projectId: proyecto.salesProjectId }]
              : []),
          ],
        },
        select: {
          id: true,
          categoria: true,
          motivo: true,
          montoSolicitado: true,
          estatus: true,
          fechaSolicitud: true,
          Activity: { select: { anNumber: true } },
        },
        orderBy: { fechaSolicitud: 'desc' },
        take: 500,
      }),
      this.prisma.stockMovement.findMany({
        where: { ...scope, type: 'DISPATCH', activity: { projectId } },
        select: {
          id: true,
          movementNumber: true,
          quantity: true,
          totalCost: true,
          createdAt: true,
          reference: true,
          product: { select: { id: true, name: true } },
          activity: { select: { anNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    const acc = new CostAccumulator();
    const transacciones: CostTransaction[] = [];

    let ingresos = 0;
    let cobrado = 0;
    for (const f of facturas) {
      const total = toNumber(f.totalAmount);
      const pagado = toNumber(f.paidAmount);
      if (f.type === 'ACCOUNTS_RECEIVABLE') {
        ingresos += total;
        cobrado += pagado;
        continue;
      }
      acc.add({
        key: 'compras',
        label: 'Compras a proveedores',
        fuente: 'facturas',
        monto: total,
        pagado,
      });
      transacciones.push({
        key: `factura-${f.id}`,
        tipo: 'factura',
        documento: f.invoiceNumber,
        fecha: toIsoDate(f.issueDate),
        concepto: f.supplier?.name ?? f.activity?.titulo ?? 'Factura de proveedor',
        monto: money(total),
        pagado: money(pagado),
        estatus: String(f.status),
        categoriaKey: 'compras',
        refId: f.id,
      });
    }

    for (const g of gastos) {
      const label = g.categoria?.trim() || 'Otro';
      const key = `gasto:${label.toLowerCase()}`;
      const monto = toNumber(g.montoSolicitado);
      const pagado = isPaidLabel(g.estatusPago) ? monto : 0;
      acc.add({ key, label: `Gastos · ${label}`, fuente: 'gastos', monto, pagado });
      transacciones.push({
        key: `gasto-${g.id}`,
        tipo: 'gasto',
        documento: g.actividad?.anNumber ?? `GASTO-${g.id}`,
        fecha: toIsoDate(g.fechaGasto ?? g.fechaSolicitud),
        concepto: g.concepto ?? g.razonGasto ?? 'Gasto',
        monto: money(monto),
        pagado: money(pagado),
        estatus: g.estatusPago,
        categoriaKey: key,
        refId: g.id,
      });
    }

    for (const v of viaticos) {
      const key = `viatico:${String(v.categoria ?? 'otros').toLowerCase()}`;
      const monto = toNumber(v.montoSolicitado);
      const pagado = isPaidLabel(v.estatus) ? monto : 0;
      acc.add({ key, label: viaticoLabel(v.categoria), fuente: 'viaticos', monto, pagado });
      transacciones.push({
        key: `viatico-${v.id}`,
        tipo: 'viatico',
        documento: v.Activity?.anNumber ?? `VIATICO-${v.id}`,
        fecha: toIsoDate(v.fechaSolicitud),
        concepto: v.motivo ?? viaticoLabel(v.categoria),
        monto: money(monto),
        pagado: money(pagado),
        estatus: v.estatus,
        categoriaKey: key,
        refId: v.id,
      });
    }

    for (const m of movimientos) {
      const monto = toNumber(m.totalCost);
      acc.add({
        key: 'almacen',
        label: 'Material surtido de almacén',
        fuente: 'almacen',
        monto,
        pagado: monto,
      });
      transacciones.push({
        key: `almacen-${m.id}`,
        tipo: 'almacen',
        documento: m.movementNumber,
        fecha: toIsoDate(m.createdAt),
        concepto: `${m.product?.name ?? 'Producto'} × ${toNumber(m.quantity)}`,
        monto: money(monto),
        pagado: money(monto),
        estatus: 'Surtido',
        categoriaKey: 'almacen',
        refId: m.id,
      });
    }

    const resumen = summarizeCostCategories(acc.list());
    const { margen, margenPct } = computeMargin(money(ingresos), resumen.costoTotal);
    const autorizado = proyecto.budgetAmount == null ? null : money(toNumber(proyecto.budgetAmount));

    return {
      proyecto: {
        key: `operacional-${proyecto.id}`,
        id: proyecto.id,
        tipo: 'operacional' as ProjectKind,
        titulo: proyecto.title,
        estatus: String(proyecto.status),
        objetivo: proyecto.objective,
        alcance: proyecto.scopeSummary,
        cliente: proyecto.client?.name ?? null,
        responsable: proyecto.responsable?.nombre ?? null,
        inicioPlaneado: toIsoDate(proyecto.startDate),
        finPlaneado: toIsoDate(proyecto.endDate),
        inicioReal: toIsoDate(proyecto.actualStartDate),
        finReal: toIsoDate(proyecto.actualEndDate),
        moneda: proyecto.currency,
      },
      resumen: {
        ingresos: money(ingresos),
        cobrado: money(cobrado),
        porCobrar: money(ingresos - cobrado),
        costoTotal: resumen.costoTotal,
        costoPagado: resumen.costoPagado,
        costoPendiente: resumen.costoPendiente,
        margen,
        margenPct,
      },
      presupuesto: {
        autorizado,
        comprometido: resumen.costoTotal,
        pagado: resumen.costoPagado,
        disponible: autorizado == null ? null : money(autorizado - resumen.costoTotal),
        /** El presupuesto sale del proyecto: `Budget` cuelga de centro de costos. */
        origen: 'OperationalProject.budgetAmount',
      },
      categorias: resumen.categorias,
      transacciones: transacciones.sort((a, b) =>
        String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')),
      ),
      ingresosDetalle: facturas
        .filter((f) => f.type === 'ACCOUNTS_RECEIVABLE')
        .map((f) => ({
          id: f.id,
          folio: f.invoiceNumber,
          fecha: toIsoDate(f.issueDate),
          total: money(toNumber(f.totalAmount)),
          cobrado: money(toNumber(f.paidAmount)),
          saldo: money(toNumber(f.totalAmount) - toNumber(f.paidAmount)),
          estatus: String(f.status),
        })),
    };
  }

  private async getWorkProjectDetail(
    companyId: number | null | undefined,
    projectId: number,
  ) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);

    const obra = await this.prisma.workProject.findFirst({
      where: { id: projectId, deletedAt: null, ...scope },
      select: {
        id: true,
        title: true,
        clientName: true,
        managerName: true,
        status: true,
        description: true,
        startDate: true,
        endDate: true,
        budgetTotal: true,
        budgetUsed: true,
        progress: true,
      },
    });
    if (!obra) throw new NotFoundException('Proyecto no encontrado');

    const [gastos, nomina, bitacora] = await Promise.all([
      this.prisma.workProjectExpense.findMany({
        where: { ...scope, projectId },
        select: { id: true, category: true, amount: true, incurredAt: true, note: true },
        orderBy: { incurredAt: 'desc' },
        take: 500,
      }),
      this.prisma.workProjectPayroll.findMany({
        where: { ...scope, projectId },
        select: { id: true, employee: true, amount: true, paidAt: true, note: true },
        orderBy: { paidAt: 'desc' },
        take: 500,
      }),
      this.prisma.workProjectLog.findMany({
        where: { ...scope, projectId },
        select: { id: true, label: true, progress: true, note: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const acc = new CostAccumulator();
    const transacciones: CostTransaction[] = [];

    for (const g of gastos) {
      const label = g.category?.trim() || 'Otro';
      const key = `obra:${label.toLowerCase()}`;
      const monto = toNumber(g.amount);
      acc.add({ key, label, fuente: 'gastos', monto });
      transacciones.push({
        key: `obra-gasto-${g.id}`,
        tipo: 'gasto',
        documento: `GASTO-${g.id}`,
        fecha: toIsoDate(g.incurredAt),
        concepto: g.note ?? label,
        monto: money(monto),
        pagado: 0,
        estatus: 'Registrado',
        categoriaKey: key,
        refId: g.id,
      });
    }

    for (const n of nomina) {
      const monto = toNumber(n.amount);
      acc.add({ key: 'obra:nomina', label: 'Nómina de obra', fuente: 'nomina', monto, pagado: monto });
      transacciones.push({
        key: `obra-nomina-${n.id}`,
        tipo: 'nomina',
        documento: `NOMINA-${n.id}`,
        fecha: toIsoDate(n.paidAt),
        concepto: n.note ? `${n.employee} · ${n.note}` : n.employee,
        monto: money(monto),
        pagado: money(monto),
        estatus: 'Pagado',
        categoriaKey: 'obra:nomina',
        refId: n.id,
      });
    }

    const resumen = summarizeCostCategories(acc.list());
    const autorizado = obra.budgetTotal == null ? null : money(toNumber(obra.budgetTotal));

    return {
      proyecto: {
        key: `obra-${obra.id}`,
        id: obra.id,
        tipo: 'obra' as ProjectKind,
        titulo: obra.title,
        estatus: String(obra.status),
        objetivo: obra.description,
        alcance: null as string | null,
        cliente: obra.clientName,
        responsable: obra.managerName,
        inicioPlaneado: toIsoDate(obra.startDate),
        finPlaneado: toIsoDate(obra.endDate),
        inicioReal: null as string | null,
        finReal: null as string | null,
        moneda: 'MXN',
        avance: obra.progress ?? null,
      },
      resumen: {
        // La obra no tiene facturación ligada en el esquema.
        ingresos: 0,
        cobrado: 0,
        porCobrar: 0,
        costoTotal: resumen.costoTotal,
        costoPagado: resumen.costoPagado,
        costoPendiente: resumen.costoPendiente,
        margen: money(-resumen.costoTotal),
        margenPct: null as number | null,
      },
      presupuesto: {
        autorizado,
        comprometido: resumen.costoTotal,
        pagado: obra.budgetUsed == null ? resumen.costoPagado : money(toNumber(obra.budgetUsed)),
        disponible: autorizado == null ? null : money(autorizado - resumen.costoTotal),
        origen: 'WorkProject.budgetTotal',
      },
      categorias: resumen.categorias,
      transacciones: transacciones.sort((a, b) =>
        String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')),
      ),
      ingresosDetalle: [] as {
        id: number;
        folio: string;
        fecha: string | null;
        total: number;
        cobrado: number;
        saldo: number;
        estatus: string;
      }[],
      bitacora: bitacora.map((b) => ({
        id: b.id,
        etiqueta: b.label,
        avance: b.progress,
        nota: b.note,
        fecha: toIsoDate(b.createdAt),
      })),
    };
  }
}
