import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

/**
 * Cuentas por cobrar / por pagar del workspace de la contadora.
 *
 * `ContabilidadInvoicesView` servía la misma lista genérica para las dos
 * páginas: sin antigüedad, sin días vencidos y sin detalle. Aquí vive lo que
 * la contadora necesita para trabajar — antigüedad por tramos, días vencido,
 * calendario de obligaciones y el detalle con pagos aplicados.
 *
 * Aislamiento: todas las consultas pasan por `requireCompanyId` +
 * `companyWhere`. Nunca se construye un `where` sin empresa (hubo un
 * incidente de datos cruzados entre usuarios).
 */

export type ArApKind = 'cxc' | 'cxp';

/** Tramos de antigüedad tal y como los pide la vista. */
export type AgingBucket =
  | 'vencido'
  | 'hoy'
  | 'proximos7'
  | 'proximos30'
  | 'mas30'
  | 'sinFecha';

export const AGING_BUCKETS: readonly AgingBucket[] = [
  'vencido',
  'hoy',
  'proximos7',
  'proximos30',
  'mas30',
  'sinFecha',
] as const;

export const AGING_LABELS: Record<AgingBucket, string> = {
  vencido: 'Vencido',
  hoy: 'Vence hoy',
  proximos7: 'Próximos 7 días',
  proximos30: 'Próximos 30 días',
  mas30: 'Más de 30 días',
  sinFecha: 'Sin vencimiento',
};

/** Filtro de estado que la vista expone como selector. */
export type EstadoFiltro = 'abiertas' | 'vencidas' | 'pagadas' | 'canceladas' | 'todas';

const ESTADOS_FILTRO: readonly EstadoFiltro[] = [
  'abiertas',
  'vencidas',
  'pagadas',
  'canceladas',
  'todas',
];

/** Estados con saldo vivo. DRAFT y STAMPING todavía no son cuenta por cobrar/pagar. */
const ESTADOS_ABIERTOS = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;

const DIA_MS = 86_400_000;

export type EstadoTono = 'ok' | 'warn' | 'bad' | 'mute';

export type EstadoCalculado = {
  clave: string;
  etiqueta: string;
  tono: EstadoTono;
};

type FilaCruda = {
  totalAmount: unknown;
  paidAmount: unknown;
  dueDate: Date | string | null;
  status?: string | null;
  isCancelled?: boolean | null;
};

// ── Fechas: día calendario, no instante ───────────────────────────────────
//
// Las columnas `@db.Date` llegan de Prisma como medianoche **UTC**. Leerlas
// con `getDate()` en un servidor en UTC-6 devuelve el día anterior, y los
// "días vencido" salen corridos uno. Por eso todo se compara como índice de
// día calendario: el vencimiento se lee en UTC y "hoy" en la zona del
// servidor, que es el día que la contadora ve en su reloj.

/** Día calendario de un vencimiento, como días desde epoch. */
export function indiceDeDia(valor: Date | string | null | undefined): number | null {
  if (!valor) return null;
  if (typeof valor === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
    if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DIA_MS;
    const parsed = new Date(valor);
    if (Number.isNaN(parsed.getTime())) return null;
    return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()) / DIA_MS;
  }
  if (Number.isNaN(valor.getTime())) return null;
  return Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()) / DIA_MS;
}

/** Hoy según el calendario del servidor. */
export function indiceDeHoy(hoy: Date = new Date()): number {
  return Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) / DIA_MS;
}

/** Medianoche UTC del índice — sirve para el `where` de Prisma. */
export function fechaDeIndice(indice: number): Date {
  return new Date(indice * DIA_MS);
}

/** `YYYY-MM-DD` del índice. */
export function isoDeIndice(indice: number | null): string | null {
  if (indice === null) return null;
  return fechaDeIndice(indice).toISOString().slice(0, 10);
}

// ── Cálculo puro (exportado para las pruebas) ─────────────────────────────

/**
 * Días vencido. Positivo = ya venció; 0 = vence hoy; negativo = faltan días.
 * Sin fecha de vencimiento → null (no se inventa un cero que parezca "hoy").
 */
export function diasVencido(
  dueDate: Date | string | null | undefined,
  hoy: Date = new Date(),
): number | null {
  const vence = indiceDeDia(dueDate);
  if (vence === null) return null;
  return indiceDeHoy(hoy) - vence;
}

/** Saldo pendiente. Nunca negativo: un sobrepago no es saldo a favor aquí. */
export function pendienteDe(total: unknown, pagado: unknown): number {
  const saldo = Number(total || 0) - Number(pagado || 0);
  return saldo > 0 ? Number(saldo.toFixed(2)) : 0;
}

/** Tramo de antigüedad del documento según su vencimiento. */
export function bucketDeAging(
  dueDate: Date | string | null | undefined,
  hoy: Date = new Date(),
): AgingBucket {
  const dias = diasVencido(dueDate, hoy);
  if (dias === null) return 'sinFecha';
  if (dias > 0) return 'vencido';
  if (dias === 0) return 'hoy';
  const faltan = -dias;
  if (faltan <= 7) return 'proximos7';
  if (faltan <= 30) return 'proximos30';
  return 'mas30';
}

/** Estado en palabras — la contadora nunca debe leer un enum crudo. */
export function estadoDe(fila: FilaCruda, hoy: Date = new Date()): EstadoCalculado {
  const status = String(fila.status || '').toUpperCase();
  if (fila.isCancelled || status === 'CANCELLED') {
    return { clave: 'cancelada', etiqueta: 'Cancelada', tono: 'mute' };
  }
  if (status === 'DRAFT') return { clave: 'borrador', etiqueta: 'Borrador', tono: 'mute' };
  if (status === 'STAMPING') return { clave: 'timbrando', etiqueta: 'Timbrando', tono: 'mute' };
  if (status === 'CREDITED') {
    return { clave: 'acreditada', etiqueta: 'Con nota de crédito', tono: 'mute' };
  }

  const pendiente = pendienteDe(fila.totalAmount, fila.paidAmount);
  if (pendiente <= 0.009 || status === 'PAID') {
    return { clave: 'pagada', etiqueta: 'Pagada', tono: 'ok' };
  }
  const dias = diasVencido(fila.dueDate, hoy);
  if (dias !== null && dias > 0) {
    return {
      clave: 'vencida',
      etiqueta: dias === 1 ? 'Vencida · 1 día' : `Vencida · ${dias} días`,
      tono: 'bad',
    };
  }
  if (Number(fila.paidAmount || 0) > 0) {
    return { clave: 'parcial', etiqueta: 'Pago parcial', tono: 'warn' };
  }
  if (dias === 0) return { clave: 'hoy', etiqueta: 'Vence hoy', tono: 'warn' };
  if (dias === null) return { clave: 'pendiente', etiqueta: 'Sin vencimiento', tono: 'mute' };
  return { clave: 'pendiente', etiqueta: 'Pendiente', tono: 'mute' };
}

export type ResumenAging = Record<AgingBucket, { monto: number; documentos: number }>;

function agingVacio(): ResumenAging {
  return AGING_BUCKETS.reduce((acc, b) => {
    acc[b] = { monto: 0, documentos: 0 };
    return acc;
  }, {} as ResumenAging);
}

/**
 * Antigüedad de saldos. Solo cuenta lo que tiene saldo vivo: una factura
 * cancelada o ya pagada no es cartera por más que su fecha haya pasado.
 */
export function calcularAging(filas: FilaCruda[], hoy: Date = new Date()): ResumenAging {
  const resultado = agingVacio();
  for (const fila of filas) {
    if (fila.isCancelled || String(fila.status || '').toUpperCase() === 'CANCELLED') continue;
    const pendiente = pendienteDe(fila.totalAmount, fila.paidAmount);
    if (pendiente <= 0.009) continue;
    const bucket = bucketDeAging(fila.dueDate, hoy);
    resultado[bucket].monto = Number((resultado[bucket].monto + pendiente).toFixed(2));
    resultado[bucket].documentos += 1;
  }
  return resultado;
}

export type TotalesArAp = {
  documentos: number;
  total: number;
  pagado: number;
  pendiente: number;
  vencido: number;
};

export function calcularTotales(filas: FilaCruda[], hoy: Date = new Date()): TotalesArAp {
  let total = 0;
  let pagado = 0;
  let pendiente = 0;
  let vencido = 0;
  for (const fila of filas) {
    const cancelada = fila.isCancelled || String(fila.status || '').toUpperCase() === 'CANCELLED';
    total += Number(fila.totalAmount || 0);
    pagado += Number(fila.paidAmount || 0);
    if (cancelada) continue;
    const saldo = pendienteDe(fila.totalAmount, fila.paidAmount);
    pendiente += saldo;
    const dias = diasVencido(fila.dueDate, hoy);
    if (saldo > 0.009 && dias !== null && dias > 0) vencido += saldo;
  }
  return {
    documentos: filas.length,
    total: Number(total.toFixed(2)),
    pagado: Number(pagado.toFixed(2)),
    pendiente: Number(pendiente.toFixed(2)),
    vencido: Number(vencido.toFixed(2)),
  };
}

// ── Servicio ──────────────────────────────────────────────────────────────

export type ListarArApParams = {
  from?: string;
  to?: string;
  estado?: string;
  aging?: string;
  contraparte?: string | number;
  proyecto?: string | number;
  q?: string;
  page?: string | number;
  limit?: string | number;
};

const LIMITE_POR_DEFECTO = 100;
const LIMITE_MAXIMO = 500;
/** Tope duro del barrido para totales — evita traer una cartera sin fin a memoria. */
const TOPE_AGREGADO = 20_000;

const invoiceListInclude = {
  client: { select: { id: true, name: true, taxId: true } },
  supplier: { select: { id: true, name: true, rfc: true } },
  salesProjectOrder: {
    select: {
      id: true,
      orderId: true,
      project: { select: { id: true, name: true } },
    },
  },
  activity: { select: { id: true, anNumber: true, titulo: true } },
  purchaseOrder: { select: { id: true, poNumber: true } },
} as const;

type InvoiceConRelaciones = {
  id: number;
  invoiceNumber: string;
  type: string;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: unknown;
  paidAmount: unknown;
  currency: string;
  cfdiUuid: string | null;
  cfdiXml: string | null;
  pdfUrl: string | null;
  isCancelled: boolean;
  notes: string | null;
  client?: { id: number; name: string; taxId: string | null } | null;
  supplier?: { id: number; name: string; rfc: string | null } | null;
  receptorName?: string | null;
  receptorRfc?: string | null;
  emisorName?: string | null;
  emisorRfc?: string | null;
  salesProjectOrder?: {
    id: number;
    orderId: string;
    project?: { id: number; name: string } | null;
  } | null;
  activity?: { id: number; anNumber: string; titulo: string } | null;
  purchaseOrder?: { id: number; poNumber: string } | null;
};

@Injectable()
export class WorkspaceArApService {
  constructor(private readonly prisma: PrismaService) {}

  private tipoDe(kind: ArApKind): 'ACCOUNTS_RECEIVABLE' | 'ACCOUNTS_PAYABLE' {
    return kind === 'cxc' ? 'ACCOUNTS_RECEIVABLE' : 'ACCOUNTS_PAYABLE';
  }

  private normalizarKind(kind: string): ArApKind {
    const k = String(kind || '').toLowerCase();
    if (k !== 'cxc' && k !== 'cxp') {
      throw new BadRequestException('Cartera inválida (usa cxc o cxp)');
    }
    return k;
  }

  private entero(valor: unknown): number | null {
    if (valor === undefined || valor === null || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }

  /**
   * Límite del rango sobre `issueDate`, que es columna `@db.Date`: Prisma la
   * guarda a medianoche **UTC**. Construirlo con `new Date("2026-09-01T00:00:00")`
   * daba las 06:00 UTC en un servidor UTC−6, así que la factura emitida ese
   * mismo día quedaba fuera del mes — y el `lte` de las 23:59:59 locales se
   * comía el día 1 del mes siguiente. El día se arma siempre en UTC.
   */
  private fecha(valor: string | undefined, finDelDia: boolean): Date | null {
    if (!valor) return null;
    const indice = indiceDeDia(valor);
    if (indice === null) throw new BadRequestException('Rango de fechas inválido');
    const inicio = fechaDeIndice(indice);
    return finDelDia ? new Date(inicio.getTime() + DIA_MS - 1) : inicio;
  }

  /** Contraparte visible de la fila: cliente en CxC, proveedor en CxP. */
  private contraparteDe(inv: InvoiceConRelaciones, kind: ArApKind) {
    if (kind === 'cxc') {
      return {
        tipo: 'cliente' as const,
        id: inv.client?.id ?? null,
        nombre: inv.client?.name || inv.receptorName || 'Cliente sin registrar',
        rfc: inv.client?.taxId || inv.receptorRfc || null,
      };
    }
    return {
      tipo: 'proveedor' as const,
      id: inv.supplier?.id ?? null,
      nombre: inv.supplier?.name || inv.emisorName || 'Proveedor sin registrar',
      rfc: inv.supplier?.rfc || inv.emisorRfc || null,
    };
  }

  /**
   * Proyecto asociado. La factura no tiene columna de proyecto: cuelga de la
   * orden de proyecto de ventas, de la actividad facturada o de la orden de
   * compra. Se resuelve en ese orden y se dice de dónde salió.
   */
  private proyectoDe(inv: InvoiceConRelaciones) {
    const proyectoVentas = inv.salesProjectOrder?.project;
    if (proyectoVentas) {
      return {
        id: proyectoVentas.id,
        clave: `proyecto-${proyectoVentas.id}`,
        nombre: proyectoVentas.name,
        origen: 'proyecto' as const,
      };
    }
    if (inv.activity) {
      return {
        id: null,
        clave: `actividad-${inv.activity.id}`,
        nombre: `${inv.activity.anNumber} · ${inv.activity.titulo}`,
        origen: 'actividad' as const,
      };
    }
    if (inv.purchaseOrder) {
      return {
        id: null,
        clave: `oc-${inv.purchaseOrder.id}`,
        nombre: `OC ${inv.purchaseOrder.poNumber}`,
        origen: 'orden-compra' as const,
      };
    }
    return null;
  }

  private mapearFila(inv: InvoiceConRelaciones, kind: ArApKind, hoy: Date) {
    const estado = estadoDe(inv as FilaCruda, hoy);
    return {
      id: inv.id,
      folio: inv.invoiceNumber,
      uuid: inv.cfdiUuid,
      contraparte: this.contraparteDe(inv, kind),
      proyecto: this.proyectoDe(inv),
      emision: isoDeIndice(indiceDeDia(inv.issueDate)),
      vencimiento: isoDeIndice(indiceDeDia(inv.dueDate)),
      diasVencido: diasVencido(inv.dueDate, hoy),
      aging: bucketDeAging(inv.dueDate, hoy),
      monto: Number(inv.totalAmount || 0),
      pagado: Number(inv.paidAmount || 0),
      pendiente: pendienteDe(inv.totalAmount, inv.paidAmount),
      moneda: inv.currency || 'MXN',
      estado: estado.clave,
      estadoEtiqueta: estado.etiqueta,
      estadoTono: estado.tono,
      cancelada: !!inv.isCancelled,
      tieneXml: !!inv.cfdiXml,
      tienePdf: !!inv.pdfUrl,
    };
  }

  /** `where` Prisma con la empresa siempre dentro. */
  private construirWhere(
    kind: ArApKind,
    tenantId: number,
    params: ListarArApParams,
  ): Record<string, unknown> {
    const estado = String(params.estado || 'abiertas').toLowerCase() as EstadoFiltro;
    if (!ESTADOS_FILTRO.includes(estado)) {
      throw new BadRequestException('Estado inválido');
    }

    const where: Record<string, unknown> = {
      deletedAt: null,
      type: this.tipoDe(kind),
      ...companyWhere(tenantId),
    };

    const desde = this.fecha(params.from, false);
    const hasta = this.fecha(params.to, true);
    if (desde || hasta) {
      where.issueDate = {
        ...(desde ? { gte: desde } : {}),
        ...(hasta ? { lte: hasta } : {}),
      };
    }

    if (estado === 'abiertas' || estado === 'vencidas') {
      where.status = { in: [...ESTADOS_ABIERTOS] };
      where.isCancelled = false;
      if (estado === 'vencidas') {
        where.dueDate = { lt: fechaDeIndice(indiceDeHoy()) };
      }
    } else if (estado === 'pagadas') {
      where.status = 'PAID';
      where.isCancelled = false;
    } else if (estado === 'canceladas') {
      where.isCancelled = true;
    }

    const contraparte = this.entero(params.contraparte);
    if (contraparte) {
      where[kind === 'cxc' ? 'clientId' : 'supplierId'] = contraparte;
    }

    const proyecto = this.entero(params.proyecto);
    if (proyecto) {
      where.salesProjectOrder = { is: { projectId: proyecto } };
    }

    const q = String(params.q || '').trim();
    if (q) {
      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { cfdiUuid: { contains: q, mode: 'insensitive' } },
        { receptorName: { contains: q, mode: 'insensitive' } },
        { receptorRfc: { contains: q, mode: 'insensitive' } },
        { emisorName: { contains: q, mode: 'insensitive' } },
        { emisorRfc: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        kind === 'cxc'
          ? { client: { is: { name: { contains: q, mode: 'insensitive' } } } }
          : { supplier: { is: { name: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    return where;
  }

  /**
   * Lista de cartera con totales y antigüedad.
   * Los totales se calculan sobre TODO el filtro, no sobre la página visible:
   * una tabla paginada que suma solo lo que se ve miente.
   */
  async listar(kindRaw: string, companyIdRaw: number | null | undefined, params: ListarArApParams) {
    const kind = this.normalizarKind(kindRaw);
    const tenantId = requireCompanyId(companyIdRaw);
    const hoy = new Date();

    const where = this.construirWhere(kind, tenantId, params);

    const limitPedido = this.entero(params.limit) ?? LIMITE_POR_DEFECTO;
    const limit = Math.min(limitPedido, LIMITE_MAXIMO);
    const page = this.entero(params.page) ?? 1;

    const agingParam = String(params.aging || '').trim();
    const agingFiltro = AGING_BUCKETS.includes(agingParam as AgingBucket)
      ? (agingParam as AgingBucket)
      : null;
    if (agingParam && !agingFiltro) {
      throw new BadRequestException('Tramo de antigüedad inválido');
    }

    const [crudas, filas] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        select: {
          totalAmount: true,
          paidAmount: true,
          dueDate: true,
          status: true,
          isCancelled: true,
        },
        take: TOPE_AGREGADO,
      }),
      this.prisma.invoice.findMany({
        where,
        include: invoiceListInclude,
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        take: agingFiltro ? TOPE_AGREGADO : limit * page,
      }),
    ]);

    const totales = calcularTotales(crudas as FilaCruda[], hoy);
    const aging = calcularAging(crudas as FilaCruda[], hoy);

    let mapeadas = (filas as unknown as InvoiceConRelaciones[]).map((f) =>
      this.mapearFila(f, kind, hoy),
    );
    if (agingFiltro) {
      mapeadas = mapeadas.filter((f) => f.aging === agingFiltro && f.pendiente > 0.009);
    }

    const totalFilas = agingFiltro ? mapeadas.length : totales.documentos;
    const inicio = (page - 1) * limit;
    const pagina = mapeadas.slice(inicio, inicio + limit);

    const contrapartes = new Map<number, string>();
    const proyectos = new Map<number, string>();
    for (const fila of mapeadas) {
      if (fila.contraparte.id != null) {
        contrapartes.set(fila.contraparte.id, fila.contraparte.nombre);
      }
      if (fila.proyecto?.id != null) proyectos.set(fila.proyecto.id, fila.proyecto.nombre);
    }

    return {
      kind,
      periodo: { from: params.from || null, to: params.to || null },
      filtros: {
        estado: String(params.estado || 'abiertas').toLowerCase(),
        aging: agingFiltro,
        contraparte: this.entero(params.contraparte),
        proyecto: this.entero(params.proyecto),
        q: String(params.q || '').trim() || null,
        contrapartes: Array.from(contrapartes, ([id, nombre]) => ({ id, nombre })).sort((a, b) =>
          a.nombre.localeCompare(b.nombre, 'es'),
        ),
        proyectos: Array.from(proyectos, ([id, nombre]) => ({ id, nombre })).sort((a, b) =>
          a.nombre.localeCompare(b.nombre, 'es'),
        ),
      },
      totales,
      aging,
      agingEtiquetas: AGING_LABELS,
      rows: pagina,
      meta: {
        total: totalFilas,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(totalFilas / limit)),
        truncado: crudas.length >= TOPE_AGREGADO,
      },
    };
  }

  /**
   * Calendario de obligaciones (CxP). Agrupa lo pendiente por día y por
   * semana, con el desglose por proveedor: "qué sale esta semana y a quién".
   */
  async calendario(
    kindRaw: string,
    companyIdRaw: number | null | undefined,
    params: { dias?: string | number },
  ) {
    const kind = this.normalizarKind(kindRaw);
    const tenantId = requireCompanyId(companyIdRaw);
    const hoyIdx = indiceDeHoy();

    const diasPedidos = this.entero(params.dias) ?? 30;
    const ventana = Math.min(Math.max(diasPedidos, 7), 120);
    const hastaIdx = hoyIdx + ventana;

    const filas = (await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        type: this.tipoDe(kind),
        status: { in: [...ESTADOS_ABIERTOS] },
        isCancelled: false,
        ...companyWhere(tenantId),
      },
      include: invoiceListInclude,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: TOPE_AGREGADO,
    })) as unknown as InvoiceConRelaciones[];

    type Agrupado = {
      monto: number;
      documentos: number;
      contrapartes: Map<string, { nombre: string; monto: number; documentos: number }>;
    };
    const nuevo = (): Agrupado => ({ monto: 0, documentos: 0, contrapartes: new Map() });
    const sumar = (grupo: Agrupado, nombre: string, monto: number) => {
      grupo.monto = Number((grupo.monto + monto).toFixed(2));
      grupo.documentos += 1;
      const actual = grupo.contrapartes.get(nombre) ?? { nombre, monto: 0, documentos: 0 };
      actual.monto = Number((actual.monto + monto).toFixed(2));
      actual.documentos += 1;
      grupo.contrapartes.set(nombre, actual);
    };
    const exportar = (grupo: Agrupado) => ({
      monto: grupo.monto,
      documentos: grupo.documentos,
      contrapartes: Array.from(grupo.contrapartes.values()).sort((a, b) => b.monto - a.monto),
    });

    const vencido = nuevo();
    const porDia = new Map<number, Agrupado>();
    const porSemana = new Map<number, Agrupado>();
    let fueraDeVentana = 0;
    let sinFecha = 0;

    for (const inv of filas) {
      const pendiente = pendienteDe(inv.totalAmount, inv.paidAmount);
      if (pendiente <= 0.009) continue;
      const nombre = this.contraparteDe(inv, kind).nombre;
      const venceIdx = indiceDeDia(inv.dueDate);

      if (venceIdx === null) {
        sinFecha = Number((sinFecha + pendiente).toFixed(2));
        continue;
      }
      if (venceIdx < hoyIdx) {
        sumar(vencido, nombre, pendiente);
        continue;
      }
      if (venceIdx > hastaIdx) {
        fueraDeVentana = Number((fueraDeVentana + pendiente).toFixed(2));
        continue;
      }

      const grupoDia = porDia.get(venceIdx) ?? nuevo();
      sumar(grupoDia, nombre, pendiente);
      porDia.set(venceIdx, grupoDia);

      // Semana = bloque de 7 días contados desde hoy. Lo que importa es "esta
      // semana de trabajo", no la semana natural del calendario.
      const semana = Math.floor((venceIdx - hoyIdx) / 7);
      const grupoSemana = porSemana.get(semana) ?? nuevo();
      sumar(grupoSemana, nombre, pendiente);
      porSemana.set(semana, grupoSemana);
    }

    const etiquetaSemana = (semana: number) => {
      if (semana === 0) return 'Esta semana';
      if (semana === 1) return 'Próxima semana';
      return `En ${semana + 1} semanas`;
    };

    const dias = Array.from(porDia, ([idx, grupo]) => ({
      fecha: isoDeIndice(idx) as string,
      enDias: idx - hoyIdx,
      ...exportar(grupo),
    })).sort((a, b) => a.enDias - b.enDias);

    const semanas = Array.from(porSemana, ([semana, grupo]) => ({
      semana,
      etiqueta: etiquetaSemana(semana),
      inicio: isoDeIndice(hoyIdx + semana * 7) as string,
      fin: isoDeIndice(hoyIdx + semana * 7 + 6) as string,
      ...exportar(grupo),
    })).sort((a, b) => a.semana - b.semana);

    const montoEnRango = (desdeDias: number, hastaDias: number) =>
      Number(
        dias
          .filter((d) => d.enDias >= desdeDias && d.enDias <= hastaDias)
          .reduce((s, d) => s + d.monto, 0)
          .toFixed(2),
      );

    return {
      kind,
      desde: isoDeIndice(hoyIdx) as string,
      hasta: isoDeIndice(hastaIdx) as string,
      ventanaDias: ventana,
      vencido: exportar(vencido),
      resumen: {
        vencido: vencido.monto,
        hoy: montoEnRango(0, 0),
        proximos7: montoEnRango(0, 7),
        proximos30: montoEnRango(0, 30),
        enVentana: Number(dias.reduce((s, d) => s + d.monto, 0).toFixed(2)),
        fueraDeVentana,
        sinFecha,
      },
      dias,
      semanas,
    };
  }

  /** Detalle: la factura, sus pagos aplicados, el saldo, documentos e historial. */
  async detalle(kindRaw: string, id: number, companyIdRaw: number | null | undefined) {
    const kind = this.normalizarKind(kindRaw);
    const tenantId = requireCompanyId(companyIdRaw);
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException('Factura inválida');
    const hoy = new Date();

    const invoice = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null, type: this.tipoDe(kind), ...companyWhere(tenantId) },
      include: {
        ...invoiceListInclude,
        items: true,
        payments: {
          orderBy: { paymentDate: 'asc' },
          include: {
            createdBy: { select: { id: true, nombre: true } },
            bankAccount: { select: { id: true, name: true, bankName: true } },
          },
        },
        createdBy: { select: { id: true, nombre: true } },
        matchedBy: { select: { id: true, nombre: true } },
      },
    });
    assertCompanyAccess(invoice, tenantId, 'Factura');

    const inv = invoice as unknown as InvoiceConRelaciones & Record<string, any>;
    const estado = estadoDe(inv as FilaCruda, hoy);
    const total = Number(inv.totalAmount || 0);
    const pagado = Number(inv.paidAmount || 0);
    const pendiente = pendienteDe(inv.totalAmount, inv.paidAmount);

    const pagos = ((inv.payments as any[]) ?? []).map((p) => ({
      id: p.id,
      fecha: isoDeIndice(indiceDeDia(p.paymentDate)),
      monto: Number(p.amount || 0),
      metodo: p.method,
      referencia: p.reference || null,
      claveRastreo: p.speiTrackingKey || null,
      banco: p.bankAccount ? `${p.bankAccount.bankName} · ${p.bankAccount.name}` : null,
      notas: p.notes || null,
      complementoUuid: p.cfdiPaymentUuid || null,
      registradoPor: p.createdBy?.nombre || null,
    }));

    const documentos = [
      {
        tipo: 'xml' as const,
        nombre: `${inv.invoiceNumber}.xml`,
        disponible: !!inv.cfdiXml,
        url: inv.cfdiXml ? `accounting/workspace/${kind}/${inv.id}/xml` : null,
        nota: inv.cfdiXml ? null : 'La factura aún no tiene XML timbrado.',
      },
      {
        tipo: 'pdf' as const,
        nombre: `${inv.invoiceNumber}.pdf`,
        disponible: !!inv.pdfUrl,
        url: inv.pdfUrl || null,
        nota: inv.pdfUrl ? null : 'El PAC no generó representación impresa.',
      },
    ];

    // Historial reconstruido del propio documento: no hay bitácora por
    // factura, pero las fechas del ciclo de vida sí están y son verificables.
    const historial: Array<{
      fecha: string | null;
      tipo: string;
      titulo: string;
      detalle: string | null;
      usuario: string | null;
    }> = [];
    const isoFecha = (v: any) => (v ? new Date(v).toISOString() : null);

    historial.push({
      fecha: isoFecha(inv.createdAt),
      tipo: 'alta',
      titulo: kind === 'cxc' ? 'Factura emitida' : 'Factura recibida',
      detalle: `Folio ${inv.invoiceNumber} por ${total.toFixed(2)} ${inv.currency || 'MXN'}`,
      usuario: inv.createdBy?.nombre || null,
    });
    if (inv.cfdiStampDate) {
      historial.push({
        fecha: isoFecha(inv.cfdiStampDate),
        tipo: 'timbrado',
        titulo: 'CFDI timbrado',
        detalle: inv.cfdiUuid || null,
        usuario: null,
      });
    }
    if (inv.matchedAt) {
      historial.push({
        fecha: isoFecha(inv.matchedAt),
        tipo: 'match',
        titulo: `Conciliación 3-way: ${inv.matchStatus}`,
        detalle: inv.matchNotes || null,
        usuario: inv.matchedBy?.nombre || null,
      });
    }
    for (const p of pagos) {
      historial.push({
        fecha: p.fecha ? `${p.fecha}T12:00:00.000Z` : null,
        tipo: 'pago',
        titulo: `Pago de ${p.monto.toFixed(2)} ${inv.currency || 'MXN'}`,
        detalle: [p.metodo, p.referencia, p.banco].filter(Boolean).join(' · ') || null,
        usuario: p.registradoPor,
      });
    }
    if (inv.isCancelled) {
      historial.push({
        fecha: isoFecha(inv.cancelledAt),
        tipo: 'cancelacion',
        titulo: 'Factura cancelada',
        detalle: inv.cancelReason ? `Motivo SAT ${inv.cancelReason}` : null,
        usuario: null,
      });
    }
    historial.sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));

    return {
      kind,
      factura: {
        id: inv.id,
        folio: inv.invoiceNumber,
        uuid: inv.cfdiUuid,
        emision: isoDeIndice(indiceDeDia(inv.issueDate)),
        vencimiento: isoDeIndice(indiceDeDia(inv.dueDate)),
        diasVencido: diasVencido(inv.dueDate, hoy),
        aging: bucketDeAging(inv.dueDate, hoy),
        moneda: inv.currency || 'MXN',
        subtotal: Number(inv.subtotal || 0),
        impuestos: Number(inv.taxAmount || 0),
        estado: estado.clave,
        estadoEtiqueta: estado.etiqueta,
        estadoTono: estado.tono,
        cancelada: !!inv.isCancelled,
        canceladaEn: isoFecha(inv.cancelledAt),
        motivoCancelacion: inv.cancelReason || null,
        formaPago: inv.satPaymentForm || null,
        metodoPago: inv.satPaymentMethod || null,
        usoCfdi: inv.cfdiUsage || null,
        notas: inv.notes || null,
        match: inv.matchStatus || null,
      },
      contraparte: this.contraparteDe(inv, kind),
      proyecto: this.proyectoDe(inv),
      conceptos: ((inv.items as any[]) ?? []).map((it) => ({
        id: it.id,
        descripcion: it.description,
        cantidad: Number(it.quantity || 0),
        precioUnitario: Number(it.unitPrice || 0),
        total: Number(it.total || 0),
        unidad: it.unitName || null,
      })),
      pagos,
      saldo: {
        total,
        pagado,
        pendiente,
        porcentajePagado: total > 0 ? Math.min(100, Math.round((pagado / total) * 100)) : 0,
      },
      documentos,
      historial,
    };
  }

  /** XML del CFDI, con la empresa dentro del `where`. */
  async xml(kindRaw: string, id: number, companyIdRaw: number | null | undefined) {
    const kind = this.normalizarKind(kindRaw);
    const tenantId = requireCompanyId(companyIdRaw);
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException('Factura inválida');
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null, type: this.tipoDe(kind), ...companyWhere(tenantId) },
      select: { id: true, companyId: true, invoiceNumber: true, cfdiXml: true },
    });
    assertCompanyAccess(invoice, tenantId, 'Factura');
    const doc = invoice!;
    if (!doc.cfdiXml) throw new BadRequestException('La factura no tiene XML CFDI timbrado');
    return {
      filename: `${doc.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.xml`,
      contentType: 'application/xml',
      body: doc.cfdiXml,
    };
  }
}
