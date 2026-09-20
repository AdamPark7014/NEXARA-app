import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

/**
 * NEXARA · Libro de movimientos del workspace de Contabilidad
 * -----------------------------------------------------------
 * La página `/erp/contabilidad/movimientos` listaba sólo facturas: eso es un
 * listado de documentos, no un libro. Aquí se unifica en una sola línea de
 * tiempo todo lo que mueve (o compromete) dinero de la empresa:
 *
 *   payments · expenses · work_project_expenses · bank_transactions sin
 *   conciliar · employee_payments · invoices (documento origen)
 *
 * Reglas de diseño
 * ----------------
 * 1. **Aislamiento de empresa**: cada consulta filtra por `companyId` propio de
 *    la fila (`companyWhere`) y, cuando el filtro toca una relación, también se
 *    exige la empresa en la relación. Sin empresa activa → `requireCompanyId`
 *    lanza 403. Nunca se construye un `where` vacío.
 * 2. **Naturaleza por tipo de documento, no por estatus**: EFECTIVO son los
 *    movimientos que ya pasaron por caja o banco (pagos y líneas bancarias);
 *    DEVENGADO son obligaciones registradas (facturas, gastos, nómina). Así la
 *    contadora puede leer flujo real y devengado sin sumar dos veces el mismo
 *    peso. El estatus de cada fila se muestra aparte, en su columna.
 * 3. **Traspasos entre cuentas propias** (la contraparte SPEI coincide con una
 *    CLABE/cuenta de la empresa) se marcan TRANSFERENCIA y **no** suman ni a
 *    ingresos ni a egresos: mover dinero de una cuenta propia a otra no es
 *    ingreso.
 * 4. **Facturas canceladas o con nota de crédito** se marcan AJUSTE y tampoco
 *    suman: el documento existe y hay que verlo, pero ya no vale.
 * 5. **Totales exactos**: se calculan con `aggregate` sobre el filtro completo,
 *    no sobre la página. La página se arma con el merge de los primeros
 *    `offset + pageSize` de cada fuente (cada una ya ordenada por fecha desc),
 *    que es exacto para el top-K global.
 */

export type LedgerTipo = 'INGRESO' | 'EGRESO' | 'TRANSFERENCIA' | 'AJUSTE';

/** EFECTIVO = ya pasó por caja/banco. DEVENGADO = obligación registrada. */
export type LedgerNaturaleza = 'EFECTIVO' | 'DEVENGADO';

export type LedgerTabla =
  | 'payments'
  | 'expenses'
  | 'work_project_expenses'
  | 'bank_transactions'
  | 'employee_payments'
  | 'invoices';

export type LedgerParte = {
  tipo: 'cliente' | 'proveedor' | 'empleado' | 'banco';
  id: number | null;
  nombre: string;
};

export type LedgerProyecto = {
  /** `op` = proyecto operativo (vía actividad) · `obra` = WorkProject. */
  tipo: 'op' | 'obra';
  id: number;
  nombre: string;
};

export interface LedgerRow {
  /** `<tabla>:<id>` — estable, sirve de key en la tabla y de ancla de detalle. */
  id: string;
  fecha: string;
  tipo: LedgerTipo;
  naturaleza: LedgerNaturaleza;
  concepto: string;
  categoria: string;
  cuenta: { id: number; nombre: string } | null;
  contraparte: LedgerParte | null;
  proyecto: LedgerProyecto | null;
  referencia: string | null;
  ingreso: number;
  egreso: number;
  /** Importe absoluto del documento (incluye traspasos y ajustes, que no suman). */
  monto: number;
  estado: string;
  metodoPago: string | null;
  registradoPor: string | null;
  origen: { tabla: LedgerTabla; id: number; href: string | null };
  comprobanteUrl: string | null;
}

export interface LedgerTotalsBlock {
  ingresos: number;
  egresos: number;
  neto: number;
  conteo: number;
}

export interface LedgerTotals extends LedgerTotalsBlock {
  efectivo: LedgerTotalsBlock;
  devengado: LedgerTotalsBlock;
  /** Traspasos entre cuentas propias — informativos, no suman al neto. */
  transferencias: { monto: number; conteo: number };
  /** Facturas canceladas / con nota de crédito — informativas, no suman. */
  ajustes: { monto: number; conteo: number };
}

export interface LedgerQuery {
  from?: string;
  to?: string;
  tipo?: string;
  categoria?: string;
  cuentaId?: string | number;
  proyectoId?: string;
  proveedorId?: string | number;
  clienteId?: string | number;
  estado?: string;
  metodoPago?: string;
  q?: string;
  page?: string | number;
  pageSize?: string | number;
}

export interface LedgerResult {
  period: { from: string; to: string };
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: LedgerRow[];
  totals: LedgerTotals;
  filters: Record<string, unknown>;
}

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
/** Tope de filas que se recorren por fuente para armar una página. */
const MAX_MERGE_SCAN = 2000;
/** Tope de filas de la exportación CSV. */
const MAX_EXPORT_ROWS = 5000;

const INVOICE_STATUSES = new Set([
  'DRAFT',
  'STAMPING',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'CREDITED',
]);

const PAYMENT_METHODS = new Set([
  'CASH',
  'BANK_TRANSFER',
  'CHECK',
  'CREDIT_CARD',
  'SPEI',
  'DOMICILIACION',
  'CARD_DEBIT',
  'DIGITAL_WALLET',
  'COMPENSATION',
  'OTHER',
]);

/** Etiquetas en español para la columna «Método» y el CSV. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CHECK: 'Cheque',
  CREDIT_CARD: 'Tarjeta de crédito',
  SPEI: 'SPEI',
  DOMICILIACION: 'Domiciliación',
  CARD_DEBIT: 'Tarjeta de débito',
  DIGITAL_WALLET: 'Monedero digital',
  COMPENSATION: 'Compensación',
  OTHER: 'Otro',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  STAMPING: 'Timbrando',
  SENT: 'Enviada',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
  CREDITED: 'Nota de crédito',
};

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Columnas `@db.Date` (paymentDate, issueDate, transactionDate, periodTo…):
 * Prisma las devuelve como medianoche **UTC**, así que el día correcto sale de
 * las partes UTC. Con `toISOString()` en UTC-6 el 1 de septiembre se leía 31 de
 * agosto.
 */
const isoDateCol = (value: Date | string | null | undefined): string => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/**
 * Columnas `DateTime` con hora real (fechaSolicitud, incurredAt, paidAt…): el
 * día que importa es el local de la empresa, no el UTC.
 */
const isoLocalDay = (value: Date | string | null | undefined): string => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const clean = (value: unknown): string | null => {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
};

const toPositiveInt = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
};

type NormalizedFilters = {
  /** Límites en hora local — para columnas `DateTime` con hora real. */
  fromDate: Date;
  toDate: Date;
  /** Límites en UTC — para columnas `@db.Date`, que Prisma guarda a medianoche UTC. */
  fromDay: Date;
  toDay: Date;
  from: string;
  to: string;
  tipo: LedgerTipo | null;
  categoria: string | null;
  cuentaId: number | null;
  proyecto: { tipo: 'op' | 'obra'; id: number } | null;
  proveedorId: number | null;
  clienteId: number | null;
  estado: string | null;
  metodoPago: string | null;
  q: string | null;
  page: number;
  pageSize: number;
};

/**
 * Descriptor de una fuente homogénea del libro: mismo `tipo` y misma
 * `naturaleza` para todas sus filas, de modo que un solo `aggregate` da su
 * total exacto sin recorrer las filas.
 */
type Bucket = {
  key: string;
  tabla: LedgerTabla;
  tipo: LedgerTipo;
  naturaleza: LedgerNaturaleza;
  enabled: boolean;
  fetch: (take: number) => Promise<LedgerRow[]>;
  totals: () => Promise<{ monto: number; conteo: number }>;
};

const emptyBlock = (): LedgerTotalsBlock => ({ ingresos: 0, egresos: 0, neto: 0, conteo: 0 });

@Injectable()
export class AccountingWorkspaceLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────── filtros ─────────────────────────

  private normalize(query: LedgerQuery): NormalizedFilters {
    const now = new Date();
    const rawFrom = clean(query.from);
    const rawTo = clean(query.to);

    const fromDate = rawFrom
      ? new Date(`${rawFrom}T00:00:00`)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = rawTo
      ? new Date(`${rawTo}T23:59:59.999`)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (fromDate > toDate) {
      throw new BadRequestException('La fecha inicial es posterior a la final');
    }

    const from = isoLocalDay(fromDate);
    const to = isoLocalDay(toDate);
    const fromDay = new Date(`${from}T00:00:00.000Z`);
    const toDay = new Date(`${to}T23:59:59.999Z`);

    const tipoRaw = clean(query.tipo)?.toUpperCase() ?? null;
    if (tipoRaw && !['INGRESO', 'EGRESO', 'TRANSFERENCIA', 'AJUSTE'].includes(tipoRaw)) {
      throw new BadRequestException(`Tipo de movimiento inválido: ${query.tipo}`);
    }

    const metodoRaw = clean(query.metodoPago)?.toUpperCase() ?? null;
    if (metodoRaw && !PAYMENT_METHODS.has(metodoRaw)) {
      throw new BadRequestException(`Método de pago inválido: ${query.metodoPago}`);
    }

    // `obra:12` → WorkProject · `op:5` o `5` → proyecto operativo.
    let proyecto: { tipo: 'op' | 'obra'; id: number } | null = null;
    const proyectoRaw = clean(query.proyectoId);
    if (proyectoRaw) {
      const [head, tail] = proyectoRaw.includes(':')
        ? proyectoRaw.split(':', 2)
        : ['op', proyectoRaw];
      const id = toPositiveInt(tail);
      const tipo = head.toLowerCase() === 'obra' ? 'obra' : 'op';
      if (!id) throw new BadRequestException(`Proyecto inválido: ${query.proyectoId}`);
      proyecto = { tipo, id };
    }

    const pageSize = Math.min(
      Math.max(toPositiveInt(query.pageSize) ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE,
    );
    const page = Math.max(toPositiveInt(query.page) ?? 1, 1);

    return {
      fromDate,
      toDate,
      fromDay,
      toDay,
      from,
      to,
      tipo: tipoRaw as LedgerTipo | null,
      categoria: clean(query.categoria),
      cuentaId: toPositiveInt(query.cuentaId),
      proyecto,
      proveedorId: toPositiveInt(query.proveedorId),
      clienteId: toPositiveInt(query.clienteId),
      estado: clean(query.estado),
      metodoPago: metodoRaw,
      q: clean(query.q),
      page,
      pageSize,
    };
  }

  /** ¿La categoría fija de un bucket pasa el filtro de categoría? */
  private matchesFixedCategory(f: NormalizedFilters, categoria: string): boolean {
    if (!f.categoria) return true;
    return categoria.toLowerCase() === f.categoria.toLowerCase();
  }

  /** ¿El estatus fijo de un bucket pasa el filtro de estado? */
  private matchesFixedEstado(f: NormalizedFilters, estado: string): boolean {
    if (!f.estado) return true;
    return estado.toLowerCase() === f.estado.toLowerCase();
  }

  // ───────────────────────── consulta principal ─────────────────────────

  async listMovements(companyId: number | null | undefined, query: LedgerQuery): Promise<LedgerResult> {
    const tenantId = requireCompanyId(companyId);
    const f = this.normalize(query);

    const offset = (f.page - 1) * f.pageSize;
    if (offset + f.pageSize > MAX_MERGE_SCAN) {
      throw new BadRequestException(
        `El libro sólo pagina hasta ${MAX_MERGE_SCAN} movimientos por filtro. Acota el rango de fechas o usa la exportación.`,
      );
    }

    const buckets = await this.buildBuckets(tenantId, f);
    const active = buckets.filter((b) => b.enabled);

    const take = offset + f.pageSize;
    const [rowGroups, totalGroups] = await Promise.all([
      Promise.all(active.map((b) => b.fetch(take))),
      Promise.all(active.map((b) => b.totals())),
    ]);

    const totals = this.reduceTotals(active, totalGroups);

    const merged = rowGroups
      .flat()
      .sort((a, b) => (a.fecha === b.fecha ? a.id.localeCompare(b.id) : b.fecha.localeCompare(a.fecha)));

    const items = merged.slice(offset, offset + f.pageSize);

    return {
      period: { from: f.from, to: f.to },
      page: f.page,
      pageSize: f.pageSize,
      total: totals.conteo,
      totalPages: Math.max(1, Math.ceil(totals.conteo / f.pageSize)),
      items,
      totals,
      filters: {
        from: f.from,
        to: f.to,
        tipo: f.tipo,
        categoria: f.categoria,
        cuentaId: f.cuentaId,
        proyectoId: f.proyecto ? `${f.proyecto.tipo}:${f.proyecto.id}` : null,
        proveedorId: f.proveedorId,
        clienteId: f.clienteId,
        estado: f.estado,
        metodoPago: f.metodoPago,
        q: f.q,
      },
    };
  }

  /** Mismas reglas de filtro que `listMovements`, sin paginar, para el CSV. */
  async exportMovements(
    companyId: number | null | undefined,
    query: LedgerQuery,
  ): Promise<{ csv: string; filename: string; rows: number; truncated: boolean }> {
    const tenantId = requireCompanyId(companyId);
    const f = this.normalize({ ...query, page: 1, pageSize: 1 });

    const buckets = (await this.buildBuckets(tenantId, f)).filter((b) => b.enabled);
    const rowGroups = await Promise.all(buckets.map((b) => b.fetch(MAX_EXPORT_ROWS)));

    const merged = rowGroups
      .flat()
      .sort((a, b) => (a.fecha === b.fecha ? a.id.localeCompare(b.id) : b.fecha.localeCompare(a.fecha)));

    const truncated = merged.length > MAX_EXPORT_ROWS;
    const rows = truncated ? merged.slice(0, MAX_EXPORT_ROWS) : merged;

    return {
      csv: buildLedgerCsv(rows),
      filename: `movimientos-${f.from}-a-${f.to}.csv`,
      rows: rows.length,
      truncated,
    };
  }

  private reduceTotals(
    buckets: Bucket[],
    results: { monto: number; conteo: number }[],
  ): LedgerTotals {
    const totals: LedgerTotals = {
      ...emptyBlock(),
      efectivo: emptyBlock(),
      devengado: emptyBlock(),
      transferencias: { monto: 0, conteo: 0 },
      ajustes: { monto: 0, conteo: 0 },
    };

    buckets.forEach((bucket, i) => {
      const { monto, conteo } = results[i];
      totals.conteo += conteo;

      if (bucket.tipo === 'TRANSFERENCIA') {
        totals.transferencias.monto += monto;
        totals.transferencias.conteo += conteo;
        return;
      }
      if (bucket.tipo === 'AJUSTE') {
        totals.ajustes.monto += monto;
        totals.ajustes.conteo += conteo;
        return;
      }

      const block = bucket.naturaleza === 'EFECTIVO' ? totals.efectivo : totals.devengado;
      if (bucket.tipo === 'INGRESO') {
        totals.ingresos += monto;
        block.ingresos += monto;
      } else {
        totals.egresos += monto;
        block.egresos += monto;
      }
      block.conteo += conteo;
    });

    totals.neto = round2(totals.ingresos - totals.egresos);
    totals.ingresos = round2(totals.ingresos);
    totals.egresos = round2(totals.egresos);
    for (const block of [totals.efectivo, totals.devengado]) {
      block.neto = round2(block.ingresos - block.egresos);
      block.ingresos = round2(block.ingresos);
      block.egresos = round2(block.egresos);
    }
    totals.transferencias.monto = round2(totals.transferencias.monto);
    totals.ajustes.monto = round2(totals.ajustes.monto);
    return totals;
  }

  // ───────────────────────── fuentes ─────────────────────────

  private async buildBuckets(tenantId: number, f: NormalizedFilters): Promise<Bucket[]> {
    // Cuentas propias: sirven para nombrar la cuenta y para detectar traspasos
    // entre cuentas de la misma empresa (que no son ingreso ni egreso).
    const accounts = await this.prisma.bankAccount.findMany({
      where: { ...companyWhere(tenantId) },
      select: { id: true, name: true, bankName: true, clabe: true, accountNumber: true },
    });
    const ownKeys = accounts
      .flatMap((a) => [a.clabe, a.accountNumber])
      .map((v) => clean(v))
      .filter((v): v is string => v != null);

    return [
      ...this.paymentBuckets(tenantId, f),
      this.expenseBucket(tenantId, f),
      this.workProjectExpenseBucket(tenantId, f),
      ...this.bankBuckets(tenantId, f, ownKeys),
      this.employeePaymentBucket(tenantId, f),
      ...this.invoiceBuckets(tenantId, f),
    ];
  }

  // ── pagos (cobros y pagos a proveedor) ─────────────────────

  private paymentBuckets(tenantId: number, f: NormalizedFilters): Bucket[] {
    const ESTADO = 'Registrado';

    const make = (
      key: string,
      tipo: Extract<LedgerTipo, 'INGRESO' | 'EGRESO'>,
      invoiceType: 'ACCOUNTS_RECEIVABLE' | 'ACCOUNTS_PAYABLE',
      categoria: string,
    ): Bucket => {
      const and: any[] = [
        { ...companyWhere(tenantId) },
        { paymentDate: { gte: f.fromDay, lte: f.toDay } },
        // La empresa se exige también en la factura: la relación no puede
        // servir de puente a otro tenant.
        { invoice: { is: { ...companyWhere(tenantId), type: invoiceType, deletedAt: null } } },
      ];

      if (f.cuentaId) and.push({ bankAccountId: f.cuentaId });
      if (f.metodoPago) and.push({ method: f.metodoPago });
      if (f.proveedorId) and.push({ invoice: { is: { supplierId: f.proveedorId } } });
      if (f.clienteId) and.push({ invoice: { is: { clientId: f.clienteId } } });
      if (f.proyecto?.tipo === 'op') {
        and.push({ invoice: { is: { activity: { is: { projectId: f.proyecto.id } } } } });
      }
      if (f.q) {
        const q = f.q;
        and.push({
          OR: [
            { reference: { contains: q, mode: 'insensitive' } },
            { notes: { contains: q, mode: 'insensitive' } },
            { operationNumber: { contains: q, mode: 'insensitive' } },
            { speiTrackingKey: { contains: q, mode: 'insensitive' } },
            { invoice: { is: { invoiceNumber: { contains: q, mode: 'insensitive' } } } },
            { invoice: { is: { client: { is: { name: { contains: q, mode: 'insensitive' } } } } } },
            { invoice: { is: { supplier: { is: { name: { contains: q, mode: 'insensitive' } } } } } },
          ],
        });
      }

      const where: any = { AND: and };

      const enabled =
        (f.tipo == null || f.tipo === tipo) &&
        this.matchesFixedCategory(f, categoria) &&
        this.matchesFixedEstado(f, ESTADO) &&
        // Un pago no tiene proyecto de obra ni contraparte «empleado».
        f.proyecto?.tipo !== 'obra';

      return {
        key,
        tabla: 'payments',
        tipo,
        naturaleza: 'EFECTIVO',
        enabled,
        totals: async () => {
          const agg = await this.prisma.payment.aggregate({
            where,
            _sum: { amount: true },
            _count: { _all: true },
          });
          return { monto: num(agg._sum.amount), conteo: agg._count._all };
        },
        fetch: async (take) => {
          const rows = await this.prisma.payment.findMany({
            where,
            orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
            take,
            select: {
              id: true,
              amount: true,
              paymentDate: true,
              method: true,
              reference: true,
              speiTrackingKey: true,
              operationNumber: true,
              notes: true,
              bankAccountId: true,
              bankAccount: { select: { id: true, name: true, bankName: true } },
              createdBy: { select: { nombre: true } },
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  pdfUrl: true,
                  clientId: true,
                  supplierId: true,
                  client: { select: { id: true, name: true } },
                  supplier: { select: { id: true, name: true } },
                  receptorName: true,
                  emisorName: true,
                  activity: {
                    select: { id: true, projectId: true, project: { select: { id: true, title: true } } },
                  },
                },
              },
            },
          });

          return rows.map((r): LedgerRow => {
            const monto = round2(num(r.amount));
            const esIngreso = tipo === 'INGRESO';
            const parte: LedgerParte | null = esIngreso
              ? r.invoice?.client
                ? { tipo: 'cliente', id: r.invoice.client.id, nombre: r.invoice.client.name }
                : clean(r.invoice?.receptorName)
                  ? { tipo: 'cliente', id: null, nombre: String(r.invoice?.receptorName) }
                  : null
              : r.invoice?.supplier
                ? { tipo: 'proveedor', id: r.invoice.supplier.id, nombre: r.invoice.supplier.name }
                : clean(r.invoice?.emisorName)
                  ? { tipo: 'proveedor', id: null, nombre: String(r.invoice?.emisorName) }
                  : null;

            return {
              id: `payments:${r.id}`,
              fecha: isoDateCol(r.paymentDate),
              tipo,
              naturaleza: 'EFECTIVO',
              concepto:
                clean(r.notes) ??
                `${esIngreso ? 'Cobro' : 'Pago'} de factura ${r.invoice?.invoiceNumber ?? ''}`.trim(),
              categoria,
              cuenta: r.bankAccount
                ? { id: r.bankAccount.id, nombre: `${r.bankAccount.name} · ${r.bankAccount.bankName}` }
                : null,
              contraparte: parte,
              proyecto: r.invoice?.activity?.project
                ? { tipo: 'op', id: r.invoice.activity.project.id, nombre: r.invoice.activity.project.title }
                : null,
              referencia:
                clean(r.reference) ?? clean(r.speiTrackingKey) ?? clean(r.operationNumber) ?? null,
              ingreso: esIngreso ? monto : 0,
              egreso: esIngreso ? 0 : monto,
              monto,
              estado: ESTADO,
              metodoPago: r.method ? String(r.method) : null,
              registradoPor: clean(r.createdBy?.nombre),
              origen: { tabla: 'payments', id: r.id, href: '/erp/contabilidad/facturas' },
              comprobanteUrl: clean(r.invoice?.pdfUrl),
            };
          });
        },
      };
    };

    return [
      make('cobro', 'INGRESO', 'ACCOUNTS_RECEIVABLE', 'Cobro'),
      make('pago', 'EGRESO', 'ACCOUNTS_PAYABLE', 'Pago a proveedor'),
    ];
  }

  // ── gastos (Expense) ───────────────────────────────────────

  private expenseBucket(tenantId: number, f: NormalizedFilters): Bucket {
    const and: any[] = [
      { ...companyWhere(tenantId) },
      { deletedAt: null },
      // Fecha del libro = fechaGasto cuando existe; si no, la de solicitud.
      {
        OR: [
          { fechaGasto: { gte: f.fromDate, lte: f.toDate } },
          { AND: [{ fechaGasto: null }, { fechaSolicitud: { gte: f.fromDate, lte: f.toDate } }] },
        ],
      },
    ];

    if (f.categoria) and.push({ categoria: { equals: f.categoria, mode: 'insensitive' } });
    if (f.estado) and.push({ estatusPago: { equals: f.estado, mode: 'insensitive' } });
    if (f.proyecto?.tipo === 'op') {
      and.push({ actividad: { is: { ...companyWhere(tenantId), projectId: f.proyecto.id } } });
    }
    if (f.q) {
      const q = f.q;
      and.push({
        OR: [
          { concepto: { contains: q, mode: 'insensitive' } },
          { razonGasto: { contains: q, mode: 'insensitive' } },
          { categoria: { contains: q, mode: 'insensitive' } },
          { contabilidadRef: { contains: q, mode: 'insensitive' } },
          { actividad: { is: { anNumber: { contains: q, mode: 'insensitive' } } } },
          { actividad: { is: { titulo: { contains: q, mode: 'insensitive' } } } },
          { usuario: { is: { nombre: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }

    const where: any = { AND: and };

    // Un gasto no tiene cuenta bancaria, método de pago, cliente de ventas,
    // proveedor ni proyecto de obra: si se filtra por eso, esta fuente no aplica.
    const enabled =
      (f.tipo == null || f.tipo === 'EGRESO') &&
      f.cuentaId == null &&
      f.metodoPago == null &&
      f.proveedorId == null &&
      f.clienteId == null &&
      f.proyecto?.tipo !== 'obra';

    return {
      key: 'gasto',
      tabla: 'expenses',
      tipo: 'EGRESO',
      naturaleza: 'DEVENGADO',
      enabled,
      totals: async () => {
        const agg = await this.prisma.expense.aggregate({
          where,
          _sum: { montoSolicitado: true },
          _count: { _all: true },
        });
        return { monto: num(agg._sum.montoSolicitado), conteo: agg._count._all };
      },
      fetch: async (take) => {
        const rows = await this.prisma.expense.findMany({
          where,
          orderBy: [{ fechaGasto: 'desc' }, { fechaSolicitud: 'desc' }, { id: 'desc' }],
          take,
          select: {
            id: true,
            montoSolicitado: true,
            concepto: true,
            razonGasto: true,
            categoria: true,
            isAdministrative: true,
            fechaGasto: true,
            fechaSolicitud: true,
            estatusPago: true,
            contabilidadRef: true,
            ticketEvidenciaUrl: true,
            usuario: { select: { id: true, nombre: true } },
            createdBy: { select: { nombre: true } },
            actividad: {
              select: {
                id: true,
                anNumber: true,
                titulo: true,
                project: { select: { id: true, title: true } },
              },
            },
          },
        });

        return rows.map((r): LedgerRow => {
          const monto = round2(num(r.montoSolicitado));
          return {
            id: `expenses:${r.id}`,
            fecha: isoLocalDay(r.fechaGasto ?? r.fechaSolicitud),
            tipo: 'EGRESO',
            naturaleza: 'DEVENGADO',
            concepto: clean(r.concepto) ?? clean(r.razonGasto) ?? 'Gasto',
            categoria:
              clean(r.categoria) ?? (r.isAdministrative ? 'Gasto administrativo' : 'Gasto de actividad'),
            cuenta: null,
            contraparte: r.usuario
              ? { tipo: 'empleado', id: r.usuario.id, nombre: r.usuario.nombre }
              : null,
            proyecto: r.actividad?.project
              ? { tipo: 'op', id: r.actividad.project.id, nombre: r.actividad.project.title }
              : null,
            referencia: clean(r.contabilidadRef) ?? clean(r.actividad?.anNumber),
            ingreso: 0,
            egreso: monto,
            monto,
            estado: clean(r.estatusPago) ?? 'Pendiente',
            metodoPago: null,
            registradoPor: clean(r.createdBy?.nombre) ?? clean(r.usuario?.nombre),
            origen: { tabla: 'expenses', id: r.id, href: '/erp/contabilidad/reportes' },
            comprobanteUrl: clean(r.ticketEvidenciaUrl),
          };
        });
      },
    };
  }

  // ── gastos de obra (WorkProjectExpense) ────────────────────

  private workProjectExpenseBucket(tenantId: number, f: NormalizedFilters): Bucket {
    const and: any[] = [
      { ...companyWhere(tenantId) },
      { incurredAt: { gte: f.fromDate, lte: f.toDate } },
    ];

    if (f.categoria) and.push({ category: { equals: f.categoria, mode: 'insensitive' } });
    if (f.proyecto?.tipo === 'obra') {
      and.push({ project: { is: { ...companyWhere(tenantId), id: f.proyecto.id } } });
    }
    if (f.q) {
      const q = f.q;
      and.push({
        OR: [
          { category: { contains: q, mode: 'insensitive' } },
          { note: { contains: q, mode: 'insensitive' } },
          { project: { is: { title: { contains: q, mode: 'insensitive' } } } },
          { project: { is: { clientName: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }

    const where: any = { AND: and };

    const enabled =
      (f.tipo == null || f.tipo === 'EGRESO') &&
      this.matchesFixedEstado(f, 'Registrado') &&
      f.cuentaId == null &&
      f.metodoPago == null &&
      f.proveedorId == null &&
      f.clienteId == null &&
      f.proyecto?.tipo !== 'op';

    return {
      key: 'gasto-obra',
      tabla: 'work_project_expenses',
      tipo: 'EGRESO',
      naturaleza: 'DEVENGADO',
      enabled,
      totals: async () => {
        const agg = await this.prisma.workProjectExpense.aggregate({
          where,
          _sum: { amount: true },
          _count: { _all: true },
        });
        return { monto: num(agg._sum.amount), conteo: agg._count._all };
      },
      fetch: async (take) => {
        const rows = await this.prisma.workProjectExpense.findMany({
          where,
          orderBy: [{ incurredAt: 'desc' }, { id: 'desc' }],
          take,
          select: {
            id: true,
            amount: true,
            category: true,
            incurredAt: true,
            note: true,
            project: { select: { id: true, title: true, clientName: true } },
          },
        });

        return rows.map((r): LedgerRow => {
          const monto = round2(num(r.amount));
          return {
            id: `work_project_expenses:${r.id}`,
            fecha: isoLocalDay(r.incurredAt),
            tipo: 'EGRESO',
            naturaleza: 'DEVENGADO',
            concepto: clean(r.note) ?? clean(r.category) ?? 'Gasto de obra',
            categoria: clean(r.category) ?? 'Gasto de obra',
            cuenta: null,
            contraparte: clean(r.project?.clientName)
              ? { tipo: 'cliente', id: null, nombre: String(r.project?.clientName) }
              : null,
            proyecto: r.project ? { tipo: 'obra', id: r.project.id, nombre: r.project.title } : null,
            referencia: null,
            ingreso: 0,
            egreso: monto,
            monto,
            estado: 'Registrado',
            metodoPago: null,
            registradoPor: null,
            origen: {
              tabla: 'work_project_expenses',
              id: r.id,
              href: '/erp/contabilidad/proyectos',
            },
            comprobanteUrl: null,
          };
        });
      },
    };
  }

  // ── banco (BankTransaction sin conciliar) ──────────────────

  private bankBuckets(tenantId: number, f: NormalizedFilters, ownKeys: string[]): Bucket[] {
    /** Sin conciliar = sin registro de conciliación, o con una aún abierta. */
    const sinConciliar = {
      OR: [
        { reconciliation: { is: null } },
        { reconciliation: { is: { status: { in: ['PENDING', 'UNMATCHED'] } } } },
      ],
    };

    const make = (
      key: string,
      tipo: LedgerTipo,
      isDebit: boolean,
      esTraspaso: boolean,
      categoria: string,
    ): Bucket => {
      const and: any[] = [
        { ...companyWhere(tenantId) },
        { transactionDate: { gte: f.fromDay, lte: f.toDay } },
        { isDebit },
        sinConciliar,
        { bankAccount: { is: { ...companyWhere(tenantId) } } },
      ];

      if (esTraspaso) {
        and.push({ counterpartyClabe: { in: ownKeys } });
      } else if (ownKeys.length) {
        and.push({
          OR: [{ counterpartyClabe: null }, { counterpartyClabe: { notIn: ownKeys } }],
        });
      }

      if (f.cuentaId) and.push({ bankAccountId: f.cuentaId });
      if (f.q) {
        const q = f.q;
        and.push({
          OR: [
            { description: { contains: q, mode: 'insensitive' } },
            { concept: { contains: q, mode: 'insensitive' } },
            { counterpartyName: { contains: q, mode: 'insensitive' } },
            { externalRef: { contains: q, mode: 'insensitive' } },
            { speiTrackingKey: { contains: q, mode: 'insensitive' } },
          ],
        });
      }

      const where: any = { AND: and };

      const enabled =
        (f.tipo == null || f.tipo === tipo) &&
        this.matchesFixedCategory(f, categoria) &&
        this.matchesFixedEstado(f, 'Sin conciliar') &&
        f.metodoPago == null &&
        f.proveedorId == null &&
        f.clienteId == null &&
        f.proyecto == null &&
        // Sin CLABEs propias registradas no puede haber traspaso detectable.
        (!esTraspaso || ownKeys.length > 0);

      return {
        key,
        tabla: 'bank_transactions',
        tipo,
        naturaleza: 'EFECTIVO',
        enabled,
        totals: async () => {
          const agg = await this.prisma.bankTransaction.aggregate({
            where,
            _sum: { amount: true },
            _count: { _all: true },
          });
          return { monto: num(agg._sum.amount), conteo: agg._count._all };
        },
        fetch: async (take) => {
          const rows = await this.prisma.bankTransaction.findMany({
            where,
            orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
            take,
            select: {
              id: true,
              amount: true,
              transactionDate: true,
              description: true,
              concept: true,
              counterpartyName: true,
              externalRef: true,
              speiTrackingKey: true,
              bankAccount: { select: { id: true, name: true, bankName: true } },
            },
          });

          return rows.map((r): LedgerRow => {
            const monto = round2(Math.abs(num(r.amount)));
            return {
              id: `bank_transactions:${r.id}`,
              fecha: isoDateCol(r.transactionDate),
              tipo,
              naturaleza: 'EFECTIVO',
              concepto: clean(r.concept) ?? clean(r.description) ?? 'Movimiento bancario',
              categoria,
              cuenta: r.bankAccount
                ? { id: r.bankAccount.id, nombre: `${r.bankAccount.name} · ${r.bankAccount.bankName}` }
                : null,
              contraparte: clean(r.counterpartyName)
                ? { tipo: 'banco', id: null, nombre: String(r.counterpartyName) }
                : null,
              proyecto: null,
              referencia: clean(r.externalRef) ?? clean(r.speiTrackingKey),
              ingreso: tipo === 'INGRESO' ? monto : 0,
              egreso: tipo === 'EGRESO' ? monto : 0,
              monto,
              estado: 'Sin conciliar',
              metodoPago: null,
              registradoPor: null,
              origen: { tabla: 'bank_transactions', id: r.id, href: '/erp/contabilidad/conciliacion' },
              comprobanteUrl: null,
            };
          });
        },
      };
    };

    return [
      make('banco-ingreso', 'INGRESO', false, false, 'Banco'),
      make('banco-egreso', 'EGRESO', true, false, 'Banco'),
      make('traspaso-entrada', 'TRANSFERENCIA', false, true, 'Traspaso'),
      make('traspaso-salida', 'TRANSFERENCIA', true, true, 'Traspaso'),
    ];
  }

  // ── nómina (EmployeePayment) ───────────────────────────────

  private employeePaymentBucket(tenantId: number, f: NormalizedFilters): Bucket {
    const and: any[] = [
      { ...companyWhere(tenantId) },
      { deletedAt: null },
      // Fecha del libro = fecha de pago cuando existe; si no, el fin del periodo.
      {
        OR: [
          { paidAt: { gte: f.fromDate, lte: f.toDate } },
          { AND: [{ paidAt: null }, { periodTo: { gte: f.fromDay, lte: f.toDay } }] },
        ],
      },
    ];

    if (f.estado) and.push({ status: { equals: f.estado, mode: 'insensitive' } });
    if (f.q) {
      const q = f.q;
      and.push({
        OR: [
          { concepto: { contains: q, mode: 'insensitive' } },
          { note: { contains: q, mode: 'insensitive' } },
          { contabilidadRef: { contains: q, mode: 'insensitive' } },
          { user: { is: { nombre: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }

    const where: any = { AND: and };

    const enabled =
      (f.tipo == null || f.tipo === 'EGRESO') &&
      this.matchesFixedCategory(f, 'Nómina') &&
      f.cuentaId == null &&
      f.metodoPago == null &&
      f.proveedorId == null &&
      f.clienteId == null &&
      f.proyecto == null;

    return {
      key: 'nomina',
      tabla: 'employee_payments',
      tipo: 'EGRESO',
      naturaleza: 'DEVENGADO',
      enabled,
      totals: async () => {
        const agg = await this.prisma.employeePayment.aggregate({
          where,
          _sum: { amount: true },
          _count: { _all: true },
        });
        return { monto: num(agg._sum.amount), conteo: agg._count._all };
      },
      fetch: async (take) => {
        const rows = await this.prisma.employeePayment.findMany({
          where,
          orderBy: [{ paidAt: 'desc' }, { periodTo: 'desc' }, { id: 'desc' }],
          take,
          select: {
            id: true,
            amount: true,
            concepto: true,
            note: true,
            status: true,
            paidAt: true,
            periodFrom: true,
            periodTo: true,
            contabilidadRef: true,
            evidenceUrls: true,
            user: { select: { id: true, nombre: true } },
            createdBy: { select: { nombre: true } },
          },
        });

        return rows.map((r): LedgerRow => {
          const monto = round2(num(r.amount));
          return {
            id: `employee_payments:${r.id}`,
            fecha: r.paidAt ? isoLocalDay(r.paidAt) : isoDateCol(r.periodTo),
            tipo: 'EGRESO',
            naturaleza: 'DEVENGADO',
            concepto:
              clean(r.concepto) ??
              `Nómina ${isoDateCol(r.periodFrom)} a ${isoDateCol(r.periodTo)}`,
            categoria: 'Nómina',
            cuenta: null,
            contraparte: r.user ? { tipo: 'empleado', id: r.user.id, nombre: r.user.nombre } : null,
            proyecto: null,
            referencia: clean(r.contabilidadRef),
            ingreso: 0,
            egreso: monto,
            monto,
            estado: clean(r.status) ?? 'Pagado',
            metodoPago: null,
            registradoPor: clean(r.createdBy?.nombre),
            origen: { tabla: 'employee_payments', id: r.id, href: '/erp/contabilidad/pre-nomina' },
            comprobanteUrl: clean(r.evidenceUrls?.[0]),
          };
        });
      },
    };
  }

  // ── facturas (documento origen) ────────────────────────────

  private invoiceBuckets(tenantId: number, f: NormalizedFilters): Bucket[] {
    const ajusteWhere = {
      OR: [{ isCancelled: true }, { status: { in: ['CANCELLED', 'CREDITED'] } }],
    };
    const vigenteWhere = {
      AND: [{ isCancelled: false }, { status: { notIn: ['CANCELLED', 'CREDITED'] } }],
    };

    const make = (
      key: string,
      tipo: LedgerTipo,
      invoiceType: 'ACCOUNTS_RECEIVABLE' | 'ACCOUNTS_PAYABLE' | null,
      categoria: string,
      esAjuste: boolean,
    ): Bucket => {
      const and: any[] = [
        { ...companyWhere(tenantId) },
        { deletedAt: null },
        { issueDate: { gte: f.fromDay, lte: f.toDay } },
        esAjuste ? ajusteWhere : vigenteWhere,
      ];
      if (invoiceType) and.push({ type: invoiceType });

      if (f.proveedorId) and.push({ supplierId: f.proveedorId });
      if (f.clienteId) and.push({ clientId: f.clienteId });
      if (f.proyecto?.tipo === 'op') {
        and.push({ activity: { is: { ...companyWhere(tenantId), projectId: f.proyecto.id } } });
      }
      if (f.estado) {
        const estado = f.estado.toUpperCase();
        // Sólo se puede filtrar por un estatus real del catálogo de facturas.
        if (!INVOICE_STATUSES.has(estado)) return disabledBucket(key, 'invoices', tipo, 'DEVENGADO');
        and.push({ status: estado });
      }
      if (f.q) {
        const q = f.q;
        and.push({
          OR: [
            { invoiceNumber: { contains: q, mode: 'insensitive' } },
            { cfdiUuid: { contains: q, mode: 'insensitive' } },
            { receptorName: { contains: q, mode: 'insensitive' } },
            { emisorName: { contains: q, mode: 'insensitive' } },
            { notes: { contains: q, mode: 'insensitive' } },
            { client: { is: { name: { contains: q, mode: 'insensitive' } } } },
            { supplier: { is: { name: { contains: q, mode: 'insensitive' } } } },
          ],
        });
      }

      const where: any = { AND: and };

      const enabled =
        (f.tipo == null || f.tipo === tipo) &&
        this.matchesFixedCategory(f, categoria) &&
        f.cuentaId == null &&
        f.metodoPago == null &&
        f.proyecto?.tipo !== 'obra' &&
        // Una factura AR no tiene proveedor; una AP no tiene cliente.
        !(invoiceType === 'ACCOUNTS_RECEIVABLE' && f.proveedorId != null) &&
        !(invoiceType === 'ACCOUNTS_PAYABLE' && f.clienteId != null);

      return {
        key,
        tabla: 'invoices',
        tipo,
        naturaleza: 'DEVENGADO',
        enabled,
        totals: async () => {
          const agg = await this.prisma.invoice.aggregate({
            where,
            _sum: { totalAmount: true },
            _count: { _all: true },
          });
          return { monto: num(agg._sum.totalAmount), conteo: agg._count._all };
        },
        fetch: async (take) => {
          const rows = await this.prisma.invoice.findMany({
            where,
            orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
            take,
            select: {
              id: true,
              invoiceNumber: true,
              type: true,
              status: true,
              issueDate: true,
              totalAmount: true,
              cfdiUuid: true,
              pdfUrl: true,
              notes: true,
              isCancelled: true,
              receptorName: true,
              emisorName: true,
              client: { select: { id: true, name: true } },
              supplier: { select: { id: true, name: true } },
              createdBy: { select: { nombre: true } },
              activity: { select: { id: true, project: { select: { id: true, title: true } } } },
            },
          });

          return rows.map((r): LedgerRow => {
            const monto = round2(num(r.totalAmount));
            const esAR = r.type === 'ACCOUNTS_RECEIVABLE';
            const rowTipo: LedgerTipo = esAjuste ? 'AJUSTE' : esAR ? 'INGRESO' : 'EGRESO';
            const parte: LedgerParte | null = esAR
              ? r.client
                ? { tipo: 'cliente', id: r.client.id, nombre: r.client.name }
                : clean(r.receptorName)
                  ? { tipo: 'cliente', id: null, nombre: String(r.receptorName) }
                  : null
              : r.supplier
                ? { tipo: 'proveedor', id: r.supplier.id, nombre: r.supplier.name }
                : clean(r.emisorName)
                  ? { tipo: 'proveedor', id: null, nombre: String(r.emisorName) }
                  : null;

            return {
              id: `invoices:${r.id}`,
              fecha: isoDateCol(r.issueDate),
              tipo: rowTipo,
              naturaleza: 'DEVENGADO',
              concepto: clean(r.notes) ?? `Factura ${r.invoiceNumber}`,
              categoria: esAjuste
                ? 'Ajuste de factura'
                : esAR
                  ? 'Factura emitida'
                  : 'Factura recibida',
              cuenta: null,
              contraparte: parte,
              proyecto: r.activity?.project
                ? { tipo: 'op', id: r.activity.project.id, nombre: r.activity.project.title }
                : null,
              referencia: clean(r.invoiceNumber) ?? clean(r.cfdiUuid),
              // Un ajuste (cancelada / nota de crédito) no suma en el libro.
              ingreso: rowTipo === 'INGRESO' ? monto : 0,
              egreso: rowTipo === 'EGRESO' ? monto : 0,
              monto,
              estado: INVOICE_STATUS_LABELS[String(r.status)] ?? String(r.status),
              metodoPago: null,
              registradoPor: clean(r.createdBy?.nombre),
              origen: { tabla: 'invoices', id: r.id, href: '/erp/contabilidad/facturas' },
              comprobanteUrl: clean(r.pdfUrl),
            };
          });
        },
      };
    };

    return [
      make('factura-emitida', 'INGRESO', 'ACCOUNTS_RECEIVABLE', 'Factura emitida', false),
      make('factura-recibida', 'EGRESO', 'ACCOUNTS_PAYABLE', 'Factura recibida', false),
      make('factura-ajuste', 'AJUSTE', null, 'Ajuste de factura', true),
    ];
  }
}

function disabledBucket(
  key: string,
  tabla: LedgerTabla,
  tipo: LedgerTipo,
  naturaleza: LedgerNaturaleza,
): Bucket {
  return {
    key,
    tabla,
    tipo,
    naturaleza,
    enabled: false,
    fetch: async () => [],
    totals: async () => ({ monto: 0, conteo: 0 }),
  };
}

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const CSV_HEADERS = [
  'Fecha',
  'Tipo',
  'Naturaleza',
  'Concepto',
  'Categoría',
  'Cuenta',
  'Contraparte',
  'Proyecto',
  'Referencia',
  'Ingreso',
  'Egreso',
  'Estado',
  'Método',
  'Registró',
  'Origen',
  'Origen ID',
];

/** Escapa una celda CSV (comillas, comas y saltos de línea). */
export function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\r\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildLedgerCsv(rows: LedgerRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.fecha,
        r.tipo,
        r.naturaleza,
        r.concepto,
        r.categoria,
        r.cuenta?.nombre ?? '',
        r.contraparte?.nombre ?? '',
        r.proyecto?.nombre ?? '',
        r.referencia ?? '',
        r.ingreso ? r.ingreso.toFixed(2) : '',
        r.egreso ? r.egreso.toFixed(2) : '',
        r.estado,
        r.metodoPago ? (PAYMENT_METHOD_LABELS[r.metodoPago] ?? r.metodoPago) : '',
        r.registradoPor ?? '',
        r.origen.tabla,
        r.origen.id,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}
