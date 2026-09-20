/**
 * NEXARA · Conciliación bancaria — motor de sugerencias
 * ------------------------------------------------------
 * Dos capas separadas a propósito:
 *
 *  1. El MOTOR (`matchBankMovements`, `scoreCandidate`) es una función pura:
 *     entra un arreglo de movimientos del banco y otro de candidatos de
 *     NEXARA (facturas y pagos), sale una lista de emparejamientos con score
 *     0-100 y las razones en texto. No conoce Prisma ni Nest; se prueba sola.
 *
 *  2. El SERVICIO (`ReconciliationMatchService`) lee de la base con el
 *     aislamiento por empresa de siempre (`requireCompanyId` + `companyWhere`),
 *     traduce filas a la entrada del motor y, al aplicar un match, delega la
 *     escritura en `AccountingService.reconcileTransaction` — la lógica de
 *     escritura vive en un solo sitio.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountingService } from './accounting.service.js';
import {
  assertCompanyAccess,
  companyWhere,
  requireCompanyId,
} from '../common/tenant/tenant-scope.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del motor
// ─────────────────────────────────────────────────────────────────────────────

export type CandidateKind = 'INVOICE' | 'PAYMENT';

/** Sentido del dinero visto desde la empresa: IN = cobro, OUT = pago. */
export type MoneyDirection = 'IN' | 'OUT';

export type MovementState =
  | 'CONCILIADO'
  | 'SUGERENCIA_ALTA'
  | 'SUGERENCIA_MULTIPLE'
  | 'DISCREPANCIA'
  | 'PENDIENTE';

export interface BankMovementInput {
  id: number;
  /** Fecha del movimiento en formato YYYY-MM-DD. */
  date: string;
  /** Importe siempre positivo; el sentido lo marca `isDebit`. */
  amount: number;
  /** true = salió dinero de la cuenta. */
  isDebit: boolean;
  description?: string | null;
  reference?: string | null;
  speiTrackingKey?: string | null;
  concept?: string | null;
  beneficiaryRef?: string | null;
  counterpartyName?: string | null;
  counterpartyRfc?: string | null;
  /** Ya tiene registro de conciliación. */
  reconciled?: boolean;
}

export interface NexaraCandidateInput {
  id: number;
  kind: CandidateKind;
  /** Folio visible: número de factura o referencia del pago. */
  folio: string;
  /** Fecha principal (emisión de la factura o fecha del pago) YYYY-MM-DD. */
  date: string;
  /** Fecha alterna que también vale como referencia (vencimiento). */
  dueDate?: string | null;
  amount: number;
  direction: MoneyDirection;
  counterpartyName?: string | null;
  counterpartyRfc?: string | null;
  reference?: string | null;
  speiTrackingKey?: string | null;
  projectName?: string | null;
  /** Factura asociada cuando el candidato es un pago. */
  invoiceId?: number | null;
  invoiceNumber?: string | null;
}

export interface MatchConfig {
  /** Tolerancia absoluta en pesos. */
  amountToleranceAbs: number;
  /** Tolerancia proporcional al monto (0.005 = 0.5 %). */
  amountTolerancePct: number;
  /** Ventana de fecha ±N días. */
  dateWindowDays: number;
  /** Score mínimo para considerar una sugerencia "alta". */
  highConfidenceScore: number;
  /** Ventaja mínima del primero sobre el segundo para no ser "múltiple". */
  dominanceMargin: number;
  /** Máximo de candidatos devueltos por movimiento. */
  maxCandidates: number;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  amountToleranceAbs: 25,
  amountTolerancePct: 0.005,
  dateWindowDays: 5,
  highConfidenceScore: 80,
  dominanceMargin: 15,
  maxCandidates: 5,
};

/** Pesos del score. Explícitos para que la prueba los fije. */
export const MATCH_WEIGHTS = {
  montoExacto: 55,
  montoTolerancia: 28,
  mismoDia: 25,
  fechaCercana: 15,
  fechaEnVentana: 8,
  spei: 25,
  folio: 20,
  referencia: 12,
  rfc: 12,
  nombre: 8,
  sentidoOpuesto: -18,
} as const;

export interface ScoredCandidate {
  candidate: NexaraCandidateInput;
  score: number;
  reasons: string[];
  amountDelta: number;
  dayDelta: number;
  exactAmount: boolean;
}

export interface MovementMatch {
  movement: BankMovementInput;
  state: MovementState;
  candidates: ScoredCandidate[];
  best: ScoredCandidate | null;
}

export interface MatchSummary {
  total: number;
  conciliados: number;
  sugerenciaAlta: number;
  sugerenciaMultiple: number;
  discrepancias: number;
  pendientes: number;
  /** Conveniencia para la UI: alta + múltiple. */
  sugeridos: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de texto y fecha (puras)
// ─────────────────────────────────────────────────────────────────────────────

/** Mayúsculas, sin acentos, sin signos: "Pago Fact. F-182" → "PAGO FACT F 182". */
export function normalizeText(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Igual que `normalizeText` pero sin espacios: sirve para buscar folios. */
function compactText(value?: string | null): string {
  return normalizeText(value).replace(/ /g, '');
}

/** Día calendario como número entero, estable frente a zonas horarias. */
export function toDayNumber(value?: string | null): number | null {
  if (!value) return null;
  const iso = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) {
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return null;
    return Math.floor(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()) / 86_400_000,
    );
  }
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number): string {
  return `$${Math.abs(value).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Tolerancia efectiva: la mayor entre la absoluta y el porcentaje del monto. */
export function effectiveTolerance(amount: number, config: MatchConfig): number {
  return Math.max(config.amountToleranceAbs, Math.abs(amount) * config.amountTolerancePct);
}

/**
 * ¿El folio aparece en el texto del movimiento?
 * Acepta la forma compacta ("F182" dentro de "PAGOFACTF182ACME") y el bloque
 * numérico suelto ("182" como palabra completa).
 */
export function folioAppearsIn(folio: string | null | undefined, haystack: string): boolean {
  const compactFolio = compactText(folio);
  if (compactFolio.length >= 3 && compactText(haystack).includes(compactFolio)) return true;
  const digits = (folio ?? '').replace(/\D+/g, '');
  if (digits.length >= 3) {
    const tokens = normalizeText(haystack).split(' ');
    const bare = digits.replace(/^0+/, '');
    if (tokens.some((t) => /^\d+$/.test(t) && t.replace(/^0+/, '') === bare)) return true;
  }
  return false;
}

/** Contraparte parecida: comparte alguna palabra significativa (≥4 letras). */
export function counterpartyLooksAlike(a?: string | null, b?: string | null): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 6 && right.includes(left)) return true;
  if (right.length >= 6 && left.includes(right)) return true;
  const stop = new Set(['SA', 'DE', 'CV', 'SAPI', 'SC', 'SRL', 'DEL', 'LA', 'EL']);
  const tokens = (s: string) => s.split(' ').filter((t) => t.length >= 4 && !stop.has(t));
  const leftTokens = new Set(tokens(left));
  return tokens(right).some((t) => leftTokens.has(t));
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor puro
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Puntúa un candidato contra un movimiento del banco.
 * Devuelve `null` cuando el candidato queda descartado (monto fuera de
 * tolerancia o fecha fuera de la ventana): esas dos son reglas duras.
 */
export function scoreCandidate(
  movement: BankMovementInput,
  candidate: NexaraCandidateInput,
  config: MatchConfig = DEFAULT_MATCH_CONFIG,
): ScoredCandidate | null {
  const movementAmount = Math.abs(Number(movement.amount) || 0);
  const candidateAmount = Math.abs(Number(candidate.amount) || 0);
  const amountDelta = round2(Math.abs(movementAmount - candidateAmount));
  const tolerance = effectiveTolerance(movementAmount, config);

  const reasons: string[] = [];
  let score = 0;
  const exactAmount = amountDelta <= 0.01;

  if (exactAmount) {
    score += MATCH_WEIGHTS.montoExacto;
    reasons.push('monto exacto');
  } else if (amountDelta <= tolerance) {
    score += MATCH_WEIGHTS.montoTolerancia;
    reasons.push(`diferencia de ${formatMoney(amountDelta)} (dentro de la tolerancia)`);
  } else {
    return null;
  }

  // Fecha: se toma la más cercana entre emisión y vencimiento.
  const movementDay = toDayNumber(movement.date);
  const mainDay = toDayNumber(candidate.date);
  const dueDay = toDayNumber(candidate.dueDate);
  if (movementDay == null || (mainDay == null && dueDay == null)) return null;

  const mainDelta = mainDay == null ? Number.POSITIVE_INFINITY : Math.abs(movementDay - mainDay);
  const dueDelta = dueDay == null ? Number.POSITIVE_INFINITY : Math.abs(movementDay - dueDay);
  const usesDueDate = dueDelta < mainDelta;
  const dayDelta = Math.min(mainDelta, dueDelta);
  if (!Number.isFinite(dayDelta) || dayDelta > config.dateWindowDays) return null;

  const dateLabel = usesDueDate ? ' del vencimiento' : '';
  if (dayDelta === 0) {
    score += MATCH_WEIGHTS.mismoDia;
    reasons.push(usesDueDate ? 'vence el mismo día' : 'mismo día');
  } else if (dayDelta <= 2) {
    score += MATCH_WEIGHTS.fechaCercana;
    reasons.push(`${dayDelta} ${dayDelta === 1 ? 'día' : 'días'} de diferencia${dateLabel}`);
  } else {
    score += MATCH_WEIGHTS.fechaEnVentana;
    reasons.push(`${dayDelta} días de diferencia${dateLabel}`);
  }

  const haystack = [
    movement.description,
    movement.reference,
    movement.concept,
    movement.beneficiaryRef,
    movement.speiTrackingKey,
    movement.counterpartyName,
  ]
    .filter(Boolean)
    .join(' ');

  // Clave de rastreo SPEI: la señal más fuerte después del monto.
  const movementSpei = compactText(movement.speiTrackingKey);
  const candidateSpei = compactText(candidate.speiTrackingKey);
  if (movementSpei && candidateSpei && movementSpei === candidateSpei) {
    score += MATCH_WEIGHTS.spei;
    reasons.push(`clave de rastreo SPEI ${candidate.speiTrackingKey}`);
  }

  // Folio en la descripción / referencia.
  if (folioAppearsIn(candidate.folio, haystack)) {
    score += MATCH_WEIGHTS.folio;
    reasons.push(`folio ${candidate.folio} en la referencia`);
  } else if (
    candidate.invoiceNumber &&
    candidate.invoiceNumber !== candidate.folio &&
    folioAppearsIn(candidate.invoiceNumber, haystack)
  ) {
    score += MATCH_WEIGHTS.folio;
    reasons.push(`folio ${candidate.invoiceNumber} en la referencia`);
  }

  // Referencia bancaria idéntica.
  const movementRef = compactText(movement.reference);
  const candidateRef = compactText(candidate.reference);
  if (movementRef && candidateRef && movementRef === candidateRef) {
    score += MATCH_WEIGHTS.referencia;
    reasons.push(`referencia ${candidate.reference} coincide`);
  }

  // Contraparte.
  const movementRfc = compactText(movement.counterpartyRfc);
  const candidateRfc = compactText(candidate.counterpartyRfc);
  if (movementRfc && candidateRfc && movementRfc === candidateRfc) {
    score += MATCH_WEIGHTS.rfc;
    reasons.push(`mismo RFC (${candidate.counterpartyRfc})`);
  } else if (counterpartyLooksAlike(movement.counterpartyName, candidate.counterpartyName)) {
    score += MATCH_WEIGHTS.nombre;
    reasons.push(`contraparte ${candidate.counterpartyName}`);
  } else if (
    candidate.counterpartyName &&
    counterpartyLooksAlike(haystack, candidate.counterpartyName)
  ) {
    score += MATCH_WEIGHTS.nombre;
    reasons.push(`contraparte ${candidate.counterpartyName} en la descripción`);
  }

  // Sentido del dinero: un cargo no debería pagar una cuenta por cobrar.
  const expectedDebit = candidate.direction === 'OUT';
  if (movement.isDebit !== expectedDebit) {
    score += MATCH_WEIGHTS.sentidoOpuesto;
    reasons.push('el sentido del movimiento no coincide');
  }

  return {
    candidate,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    amountDelta,
    dayDelta,
    exactAmount,
  };
}

/** Clasifica un movimiento a partir de sus candidatos ya puntuados. */
export function classifyMovement(
  movement: BankMovementInput,
  candidates: ScoredCandidate[],
  config: MatchConfig = DEFAULT_MATCH_CONFIG,
): MovementState {
  if (movement.reconciled) return 'CONCILIADO';
  if (candidates.length === 0) return 'PENDIENTE';
  const [best, second] = candidates;
  if (!best.exactAmount) return 'DISCREPANCIA';
  const dominant = !second || best.score - second.score >= config.dominanceMargin;
  if (best.score >= config.highConfidenceScore && dominant) return 'SUGERENCIA_ALTA';
  return 'SUGERENCIA_MULTIPLE';
}

/**
 * Motor completo: para cada movimiento, candidatos ordenados por confianza.
 * Un movimiento ya conciliado no genera sugerencias.
 */
export function matchBankMovements(
  movements: BankMovementInput[],
  candidates: NexaraCandidateInput[],
  overrides: Partial<MatchConfig> = {},
): MovementMatch[] {
  const config: MatchConfig = { ...DEFAULT_MATCH_CONFIG, ...overrides };
  return movements.map((movement) => {
    if (movement.reconciled) {
      return { movement, state: 'CONCILIADO' as MovementState, candidates: [], best: null };
    }
    const scored = candidates
      .map((candidate) => scoreCandidate(movement, candidate, config))
      .filter((s): s is ScoredCandidate => s !== null)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.amountDelta - b.amountDelta ||
          a.dayDelta - b.dayDelta ||
          a.candidate.id - b.candidate.id,
      )
      .slice(0, config.maxCandidates);
    const state = classifyMovement(movement, scored, config);
    return { movement, state, candidates: scored, best: scored[0] ?? null };
  });
}

/** Contadores por estado para los filtros de la pantalla. */
export function summarizeMatches(matches: MovementMatch[]): MatchSummary {
  const summary: MatchSummary = {
    total: matches.length,
    conciliados: 0,
    sugerenciaAlta: 0,
    sugerenciaMultiple: 0,
    discrepancias: 0,
    pendientes: 0,
    sugeridos: 0,
  };
  for (const m of matches) {
    if (m.state === 'CONCILIADO') summary.conciliados += 1;
    else if (m.state === 'SUGERENCIA_ALTA') summary.sugerenciaAlta += 1;
    else if (m.state === 'SUGERENCIA_MULTIPLE') summary.sugerenciaMultiple += 1;
    else if (m.state === 'DISCREPANCIA') summary.discrepancias += 1;
    else summary.pendientes += 1;
  }
  summary.sugeridos = summary.sugerenciaAlta + summary.sugerenciaMultiple;
  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Servicio (Prisma + aislamiento por empresa)
// ─────────────────────────────────────────────────────────────────────────────

export interface SuggestionsParams {
  accountId?: number | null;
  from?: string;
  to?: string;
  tolerancia?: number;
  dias?: number;
  limite?: number;
}

export interface ApplyMatchParams {
  transactionId: number;
  candidateKind: CandidateKind;
  candidateId: number;
  score?: number;
  notes?: string;
}

const MAX_MOVEMENTS = 300;
const MAX_CANDIDATE_ROWS = 500;

function isoDay(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value as never);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class ReconciliationMatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  /**
   * Sugerencias de emparejamiento para una cuenta bancaria.
   * Todo lo que se lee pasa por `companyWhere(tenantId)`: sin empresa activa
   * no se devuelve ni una fila (hubo un incidente de datos cruzados).
   */
  async getSuggestions(params: SuggestionsParams, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);

    const cuentas = await this.prisma.bankAccount.findMany({
      where: { ...companyWhere(tenantId), isActive: true },
      select: { id: true, name: true, bankName: true, currency: true, currentBalance: true },
      orderBy: { name: 'asc' },
    });

    const config: MatchConfig = {
      ...DEFAULT_MATCH_CONFIG,
      ...(params.tolerancia != null && Number.isFinite(params.tolerancia)
        ? { amountToleranceAbs: Math.max(0, Number(params.tolerancia)) }
        : {}),
      ...(params.dias != null && Number.isFinite(params.dias)
        ? { dateWindowDays: Math.max(0, Math.trunc(Number(params.dias))) }
        : {}),
    };

    const parametros = {
      toleranciaMonto: config.amountToleranceAbs,
      toleranciaPorcentaje: config.amountTolerancePct,
      ventanaDias: config.dateWindowDays,
      scoreAlto: config.highConfidenceScore,
    };

    if (cuentas.length === 0) {
      return {
        cuentas: [],
        cuentaSeleccionada: null,
        rango: { from: params.from ?? null, to: params.to ?? null },
        parametros,
        resumen: summarizeMatches([]),
        movimientos: [],
      };
    }

    let cuentaId = params.accountId ?? null;
    if (cuentaId != null) {
      const account = await this.prisma.bankAccount.findFirst({
        where: { id: Number(cuentaId), ...companyWhere(tenantId) },
        select: { id: true, companyId: true },
      });
      assertCompanyAccess(account, tenantId, 'Cuenta bancaria');
      cuentaId = account.id;
    } else {
      cuentaId = cuentas[0].id;
    }

    const movementWhere: Prisma.BankTransactionWhereInput = {
      bankAccountId: cuentaId,
      ...companyWhere(tenantId),
    };
    const dateFilter: Prisma.DateTimeFilter = {};
    if (params.from) dateFilter.gte = new Date(params.from);
    if (params.to) dateFilter.lte = new Date(params.to);
    if (Object.keys(dateFilter).length > 0) movementWhere.transactionDate = dateFilter;

    const limite = Math.min(Math.max(1, Number(params.limite) || MAX_MOVEMENTS), MAX_MOVEMENTS);

    const transactions = await this.prisma.bankTransaction.findMany({
      where: movementWhere,
      include: {
        reconciliation: {
          select: {
            id: true,
            status: true,
            matchedAmount: true,
            notes: true,
            reconciledAt: true,
            reconciledBy: { select: { id: true, nombre: true } },
          },
        },
      },
      orderBy: { transactionDate: 'desc' },
      take: limite,
    });

    const days = transactions.map((t) => isoDay(t.transactionDate)).filter(Boolean).sort();
    const windowMs = config.dateWindowDays * 86_400_000;
    const desde = days.length > 0 ? new Date(new Date(days[0]).getTime() - windowMs) : null;
    const hasta =
      days.length > 0 ? new Date(new Date(days[days.length - 1]).getTime() + windowMs) : null;

    const invoiceDateWindow: Prisma.InvoiceWhereInput =
      desde && hasta
        ? {
            OR: [
              { issueDate: { gte: desde, lte: hasta } },
              { dueDate: { gte: desde, lte: hasta } },
            ],
          }
        : {};

    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          ...companyWhere(tenantId),
          deletedAt: null,
          isCancelled: false,
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          ...invoiceDateWindow,
        },
        select: {
          id: true,
          invoiceNumber: true,
          type: true,
          status: true,
          issueDate: true,
          dueDate: true,
          totalAmount: true,
          paidAmount: true,
          receptorName: true,
          receptorRfc: true,
          emisorName: true,
          emisorRfc: true,
          client: { select: { name: true, taxId: true } },
          supplier: { select: { name: true, rfc: true } },
          salesProjectOrder: {
            select: { orderId: true, project: { select: { name: true } } },
          },
        },
        orderBy: { issueDate: 'desc' },
        take: MAX_CANDIDATE_ROWS,
      }),
      this.prisma.payment.findMany({
        where: {
          ...companyWhere(tenantId),
          ...(desde && hasta ? { paymentDate: { gte: desde, lte: hasta } } : {}),
        },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          method: true,
          reference: true,
          speiTrackingKey: true,
          operationNumber: true,
          invoiceId: true,
          invoice: {
            select: {
              invoiceNumber: true,
              type: true,
              receptorName: true,
              receptorRfc: true,
              emisorName: true,
              emisorRfc: true,
              salesProjectOrder: {
                select: { orderId: true, project: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { paymentDate: 'desc' },
        take: MAX_CANDIDATE_ROWS,
      }),
    ]);

    const candidates: NexaraCandidateInput[] = [
      ...invoices.map((inv) => {
        const cobro = inv.type === 'ACCOUNTS_RECEIVABLE';
        return {
          id: inv.id,
          kind: 'INVOICE' as CandidateKind,
          folio: inv.invoiceNumber,
          date: isoDay(inv.issueDate),
          dueDate: isoDay(inv.dueDate) || null,
          amount: decimalToNumber(inv.totalAmount),
          direction: (cobro ? 'IN' : 'OUT') as MoneyDirection,
          counterpartyName: cobro
            ? inv.client?.name ?? inv.receptorName ?? null
            : inv.supplier?.name ?? inv.emisorName ?? null,
          counterpartyRfc: cobro ? inv.receptorRfc ?? null : inv.emisorRfc ?? null,
          reference: null,
          speiTrackingKey: null,
          projectName: inv.salesProjectOrder?.project?.name ?? null,
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
        };
      }),
      ...payments.map((pay) => {
        const cobro = pay.invoice?.type === 'ACCOUNTS_RECEIVABLE';
        return {
          id: pay.id,
          kind: 'PAYMENT' as CandidateKind,
          folio: pay.reference ?? pay.operationNumber ?? pay.invoice?.invoiceNumber ?? `PAGO-${pay.id}`,
          date: isoDay(pay.paymentDate),
          dueDate: null,
          amount: decimalToNumber(pay.amount),
          direction: (cobro ? 'IN' : 'OUT') as MoneyDirection,
          counterpartyName: cobro
            ? pay.invoice?.receptorName ?? null
            : pay.invoice?.emisorName ?? null,
          counterpartyRfc: cobro ? pay.invoice?.receptorRfc ?? null : pay.invoice?.emisorRfc ?? null,
          reference: pay.reference ?? pay.operationNumber ?? null,
          speiTrackingKey: pay.speiTrackingKey ?? null,
          projectName: pay.invoice?.salesProjectOrder?.project?.name ?? null,
          invoiceId: pay.invoiceId,
          invoiceNumber: pay.invoice?.invoiceNumber ?? null,
        };
      }),
    ];

    const movements: BankMovementInput[] = transactions.map((t) => ({
      id: t.id,
      date: isoDay(t.transactionDate),
      amount: decimalToNumber(t.amount),
      isDebit: t.isDebit,
      description: t.description,
      reference: t.externalRef,
      speiTrackingKey: t.speiTrackingKey,
      concept: t.concept,
      beneficiaryRef: t.beneficiaryRef,
      counterpartyName: t.counterpartyName,
      counterpartyRfc: t.counterpartyRfc,
      reconciled: Boolean(t.reconciliation),
    }));

    const matches = matchBankMovements(movements, candidates, config);
    const byId = new Map(transactions.map((t) => [t.id, t]));

    const cuentaActual = cuentas.find((c) => c.id === cuentaId) ?? null;

    return {
      cuentas: cuentas.map((c) => ({
        id: c.id,
        nombre: c.name,
        banco: c.bankName,
        moneda: c.currency,
        saldo: decimalToNumber(c.currentBalance),
      })),
      cuentaSeleccionada: cuentaId,
      cuenta: cuentaActual
        ? {
            id: cuentaActual.id,
            nombre: cuentaActual.name,
            banco: cuentaActual.bankName,
            moneda: cuentaActual.currency,
          }
        : null,
      rango: { from: params.from ?? null, to: params.to ?? null },
      parametros,
      resumen: summarizeMatches(matches),
      movimientos: matches.map((m) => {
        const row = byId.get(m.movement.id);
        const rec = row?.reconciliation ?? null;
        return {
          id: m.movement.id,
          fecha: m.movement.date,
          monto: m.movement.amount,
          esCargo: m.movement.isDebit,
          descripcion: m.movement.description ?? '',
          referencia: m.movement.reference ?? null,
          speiTrackingKey: m.movement.speiTrackingKey ?? null,
          concepto: m.movement.concept ?? null,
          contraparte: m.movement.counterpartyName ?? null,
          contraparteRfc: m.movement.counterpartyRfc ?? null,
          estado: m.state,
          conciliacion: rec
            ? {
                id: rec.id,
                estado: rec.status,
                montoConciliado: decimalToNumber(rec.matchedAmount),
                notas: rec.notes,
                conciliadoEn: rec.reconciledAt,
                conciliadoPor: rec.reconciledBy
                  ? { id: rec.reconciledBy.id, nombre: rec.reconciledBy.nombre }
                  : null,
              }
            : null,
          candidatos: m.candidates.map((c) => ({
            id: c.candidate.id,
            tipo: c.candidate.kind,
            folio: c.candidate.folio,
            fecha: c.candidate.date,
            vencimiento: c.candidate.dueDate ?? null,
            monto: c.candidate.amount,
            sentido: c.candidate.direction,
            contraparte: c.candidate.counterpartyName ?? null,
            contraparteRfc: c.candidate.counterpartyRfc ?? null,
            proyecto: c.candidate.projectName ?? null,
            facturaId: c.candidate.invoiceId ?? null,
            factura: c.candidate.invoiceNumber ?? null,
            score: c.score,
            razones: c.reasons,
            diferenciaMonto: c.amountDelta,
            diferenciaDias: c.dayDelta,
          })),
        };
      }),
    };
  }

  /**
   * Aplica un emparejamiento confirmado por la contadora.
   * La escritura la hace `AccountingService.reconcileTransaction`, que ya
   * registra quién concilió (`reconciledById`) y cuándo (`reconciledAt`).
   */
  async applyMatch(params: ApplyMatchParams, userId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);

    const tx = await this.prisma.bankTransaction.findFirst({
      where: { id: Number(params.transactionId), ...companyWhere(tenantId) },
      select: {
        id: true,
        amount: true,
        companyId: true,
        description: true,
        reconciliation: { select: { id: true } },
      },
    });
    assertCompanyAccess(tx, tenantId, 'Transacción bancaria');
    if (tx.reconciliation) {
      throw new BadRequestException('Esta transacción ya está conciliada');
    }

    const etiqueta = await this.describeCandidate(
      params.candidateKind,
      Number(params.candidateId),
      tenantId,
    );

    const partes = [etiqueta];
    if (params.score != null && Number.isFinite(params.score)) {
      partes.push(`score ${Math.round(Number(params.score))}`);
    }
    if (params.notes?.trim()) partes.push(params.notes.trim());
    const notes = partes.join(' · ').slice(0, 480);

    const reconciliation = await this.accounting.reconcileTransaction(
      tx.id,
      { matchedAmount: decimalToNumber(tx.amount), notes },
      userId,
      tenantId,
    );

    return {
      ok: true,
      transactionId: tx.id,
      reconciliationId: (reconciliation as { id?: number })?.id ?? null,
      notas: notes,
      conciliadoPor: userId,
      conciliadoEn: new Date().toISOString(),
    };
  }

  /** Valida que el candidato exista y sea de la misma empresa; devuelve su etiqueta. */
  private async describeCandidate(
    kind: CandidateKind,
    candidateId: number,
    tenantId: number,
  ): Promise<string> {
    if (!Number.isFinite(candidateId) || candidateId <= 0) {
      throw new BadRequestException('Candidato inválido');
    }
    if (kind === 'INVOICE') {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: candidateId, deletedAt: null, ...companyWhere(tenantId) },
        select: { id: true, companyId: true, invoiceNumber: true },
      });
      assertCompanyAccess(invoice, tenantId, 'Factura');
      return `Factura ${invoice.invoiceNumber}`;
    }
    if (kind === 'PAYMENT') {
      const payment = await this.prisma.payment.findFirst({
        where: { id: candidateId, ...companyWhere(tenantId) },
        select: {
          id: true,
          companyId: true,
          reference: true,
          invoice: { select: { invoiceNumber: true } },
        },
      });
      assertCompanyAccess(payment, tenantId, 'Pago');
      const ref = payment.reference ?? payment.invoice?.invoiceNumber ?? `#${payment.id}`;
      return `Pago ${ref}`;
    }
    throw new NotFoundException('Tipo de candidato no soportado');
  }
}
