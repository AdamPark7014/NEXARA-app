/**
 * Presupuesto de avisos (Adam, 01-11-2026, Programa Velocidad Core).
 *
 * Medido el 30-10: 1,269 avisos para 24 personas, mediana 41 por persona y hasta 200, y una sola
 * actividad vencida llegó a mandar 241. Lo que más se manda deja de leerse, así que aquí se decide
 * cómo se entrega cada uno, en un solo lugar y sin tocar a los más de 70 que los emiten:
 *
 * - `siempre`: te toca a ti actuar (te asignaron, te devolvieron, chat, seguridad). No cuenta para el tope.
 * - `push`: lo normal. Cuenta para el tope de 15 al día.
 * - `recordatorio`: insistencia sobre tu propio estado («sin actividad», «se te vence»). Llega al
 *   teléfono y no ensucia la bandeja. Quien lo manda pone su propio espaciado.
 * - `resumen`: no suena. Espera a la tarjeta de «Resumen» y queda en la pestaña «Agrupados».
 * - `resumida`: ya entró en un resumen.
 *
 * Módulo puro (sin Nest ni Prisma).
 */
import { workClock } from '../common/time/workday.js';

export const TOPE_DIARIO_AVISOS = 15;

export type Entrega = 'push' | 'siempre' | 'recordatorio' | 'resumen' | 'resumida';

/** Lo que se ve en la bandeja y cuenta como sin leer. */
export const ENTREGAS_VISIBLES: Entrega[] = ['push', 'siempre'];
/** Lo que se ve en la pestaña «Agrupados». */
export const ENTREGAS_AGRUPADAS: Entrega[] = ['resumen', 'resumida'];

/** Le toca actuar a quien lo recibe, o es sobre sus propias cosas: nunca espera. */
const TIPOS_SIEMPRE: ReadonlySet<string> = new Set([
  'ACTIVITY_ASSIGNED',
  'ACTIVITY_APPROVED',
  'ACTIVITY_REJECTED',
  'ACTIVITY_RESUBMIT_REQUESTED',
  'ACTIVITY_VALIDATION_REJECTED',
  'ACTIVITY_CANCELLED',
  'ACTIVITY_RESCHEDULED',
  'EVIDENCE_REJECTED',
  'EVIDENCE_RESUBMIT_REQUESTED',
  'VIATICO_ASSIGNED',
  'VIATICO_APPROVED',
  'VIATICO_REJECTED',
  'VIATICO_PAID',
  'TOOL_APPROVED',
  'TOOL_REJECTED',
  'TOOL_DELIVERED',
  'TOOL_RENEWAL_APPROVED',
  'TOOL_RENEWAL_REJECTED',
  'TOOL_EXPIRATION_WARNING',
  'TOOL_EXPIRATION_DUE',
  'FINE_CREATED',
  'PROFILE_DOCUMENT_REJECTED',
  'VEHICLE_DELIVERY_APPROVED',
  'VEHICLE_DELIVERY_REJECTED',
  'VEHICLE_RENEWAL_APPROVED',
  'VEHICLE_RENEWAL_REJECTED',
  'VEHICLE_USAGE_EXPIRING',
  'QUOTE_EXPIRING',
  'QUOTE_EXPIRED',
  'QUOTE_SIGNED',
  'QUOTE_REJECTED',
  'QUOTE_ASSIGNED',
  'QUOTE_DISCOUNT_APPROVED',
  'QUOTE_DISCOUNT_REJECTED',
  'WORKFLOW_PENDING',
  'WORKFLOW_ESCALATION',
  'WORKFLOW_APPROVED',
  'WORKFLOW_REJECTED',
  'CHAT_MENTION',
]);

const CATEGORIAS_SIEMPRE: ReadonlySet<string> = new Set([
  'chat',
  'security',
  'resumen-ceo',
  'resumen-avisos',
  'lunch_break',
]);

/** «Fulano hizo tal cosa»: es bueno saberlo, pero no pide nada a quien lo recibe. */
const TIPOS_SOLO_RESUMEN: ReadonlySet<string> = new Set([
  'ATTENDANCE_CHECKIN',
  'ATTENDANCE_CHECKOUT',
  'ATTENDANCE_UPDATE',
  'LUNCH_CHECKIN',
  'LUNCH_CHECKOUT',
  'ACTIVITY_STARTED',
  'ACTIVITY_COMPLETED',
  'ACTIVITY_ACCEPTED_BY_ASSIGNEE',
  'SALES_CLIENT_CREATED',
  'SALES_LEAD_CREATED',
  'SALES_OPPORTUNITY_CREATED',
  'SALES_OPPORTUNITY_STAGE_CHANGED',
  'ORDER_CREATED',
  'PURCHASE_REQUISITION_CREATED',
  'PURCHASE_ORDER_CREATED',
  'GOODS_RECEIPT_POSTED',
  'STOCK_MOVEMENT_POSTED',
  'JOURNAL_ENTRY_POSTED',
  'INVOICE_CREATED',
  'PAYMENT_REGISTERED',
  'MAINTENANCE_WORK_ORDER_CREATED',
  'PRODUCTION_ORDER_CREATED',
  'PRODUCTION_ORDER_STATUS_CHANGED',
  'PRODUCTION_LOG_RECORDED',
  'BIRTHDAY',
  'WORK_ANNIVERSARY',
  'QUOTE_SENT',
]);

/** «Tal actividad está vencida»: a cada quien, una vez por actividad al día. */
const TIPOS_VENCIDA: ReadonlySet<string> = new Set(['SLA_BREACH', 'ACTIVITY_OVERDUE']);

export type AvisoParaPresupuesto = {
  type: unknown;
  category?: string | null;
  priority?: string | null;
  triggerUserId?: number | null;
  entrega?: Entrega;
};

export type ClaseDeAviso = 'siempre' | 'recordatorio' | 'resumen' | 'normal';

export function claseDeAviso(aviso: AvisoParaPresupuesto): ClaseDeAviso {
  if (aviso.entrega === 'siempre' || aviso.entrega === 'recordatorio' || aviso.entrega === 'resumen') {
    return aviso.entrega;
  }
  const tipo = String(aviso.type);
  if (aviso.category && CATEGORIAS_SIEMPRE.has(aviso.category)) return 'siempre';
  if (TIPOS_SIEMPRE.has(tipo)) return 'siempre';
  // Un retardo o una comida a destiempo por revisar vienen en `high`: sí piden algo a su jefe.
  if (TIPOS_SOLO_RESUMEN.has(tipo) && aviso.priority !== 'high') return 'resumen';
  // La vencida de otra persona le llega a su jefe en el resumen; el dueño sí la recibe.
  if (TIPOS_VENCIDA.has(tipo) && aviso.triggerUserId != null) return 'resumen';
  return 'normal';
}

/** ¿Se limita a uno por actividad al día? */
export function esVencidaDeActividad(aviso: { type: unknown; entityType?: string | null; entrega?: Entrega }): boolean {
  return aviso.entrega !== 'recordatorio' && aviso.entityType === 'Activity' && TIPOS_VENCIDA.has(String(aviso.type));
}

/** De lunes a sábado, de 7:00 a 20:00 de México: fuera de eso lo normal espera al resumen. */
export function dentroDeHorarioDeAvisos(ahora: Date): boolean {
  const { weekday, hour } = workClock(ahora);
  return weekday !== 0 && hour >= 7 && hour < 20;
}

/** Cómo se entrega un aviso normal, según la hora y cuántos lleva hoy esa persona. */
export function entregaDeAvisoNormal(p: { ahora: Date; enviadosHoy: number }): Entrega {
  if (!dentroDeHorarioDeAvisos(p.ahora)) return 'resumen';
  return p.enviadosHoy >= TOPE_DIARIO_AVISOS ? 'resumen' : 'push';
}

const ETIQUETA_CATEGORIA: Record<string, string> = {
  'sla-breach': 'vencidas',
  'sla-alert': 'por vencer',
  activities: 'de actividades',
  evidences: 'de evidencias',
  attendance: 'de asistencia',
  lunch_breaks: 'de comidas',
  sales: 'de ventas',
  quotes: 'de cotizaciones',
  'margin-alert': 'de margen',
};

/** El texto de la tarjeta: lo de más volumen primero y sin renglones sueltos sin nombre. */
export function textoResumenAvisos(categorias: Array<string | null | undefined>): { title: string; message: string } {
  const cuenta = new Map<string, number>();
  for (const c of categorias) {
    const etiqueta = (c && ETIQUETA_CATEGORIA[c]) || 'otros';
    cuenta.set(etiqueta, (cuenta.get(etiqueta) ?? 0) + 1);
  }
  const partes = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([etiqueta, n]) => `${n} ${etiqueta}`);
  const total = categorias.length;
  return {
    title: total === 1 ? 'Resumen: 1 aviso agrupado' : `Resumen: ${total} avisos agrupados`,
    message: partes.join(' · '),
  };
}
