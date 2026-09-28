/**
 * «Solo el resumen y lo urgente»: modo opcional de cada persona (típicamente el CEO).
 *
 * Christian recibe cada evidencia enviada, cada asistencia y muchos avisos de «se creó tal cosa»: son
 * ciertos pero no requieren nada de él, y tapan lo que sí (aprobar, cobrar, atrasos). Con este modo
 * activado (`UserPreference` `notificaciones.solo_resumen` = `1`) esos avisos informativos no se
 * generan; llegan el resumen matutino («Tu día») y todo lo que pide una decisión o es urgente.
 *
 * Módulo puro (sin Nest ni Prisma).
 */
export const PREF_SOLO_RESUMEN = 'notificaciones.solo_resumen';

/** Avisos meramente informativos: nada que decidir ni atender. */
export const TIPOS_INFORMATIVOS: ReadonlySet<string> = new Set([
  // Asistencia y comidas del equipo
  'ATTENDANCE_CHECKIN',
  'ATTENDANCE_CHECKOUT',
  'ATTENDANCE_UPDATE',
  'LUNCH_CHECKIN',
  'LUNCH_CHECKOUT',
  // Avance de actividades y evidencias (el resumen cuenta lo atrasado y lo por validar)
  'EVIDENCE_SUBMITTED',
  'EVIDENCE_APPROVED',
  'ACTIVITY_STARTED',
  'ACTIVITY_COMPLETED',
  'ACTIVITY_ACCEPTED_BY_ASSIGNEE',
  'ACTIVITY_RESCHEDULED',
  // «Se creó / se registró»
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
  'QUOTE_SENT',
  'QUOTE_ASSIGNED',
  'USER_ACTION_CONFIRMED',
  // Personal
  'BIRTHDAY',
  'WORK_ANNIVERSARY',
]);

/** Categorías que nunca se filtran (el propio resumen, aunque su tipo se parezca a otro). */
const CATEGORIAS_SIEMPRE = new Set(['resumen-ceo']);

export type AvisoParaFiltro = { type: unknown; priority?: string | null; category?: string | null };

/**
 * ¿Este aviso se omite para quien tiene el modo «solo resumen»?
 * Lo urgente (prioridad alta) y todo lo que no está en la lista de informativos sigue llegando.
 */
export function omitirEnModoResumen(aviso: AvisoParaFiltro): boolean {
  if (aviso.priority === 'high') return false;
  if (aviso.category && CATEGORIAS_SIEMPRE.has(aviso.category)) return false;
  return TIPOS_INFORMATIVOS.has(String(aviso.type));
}

/** Valor guardado de la preferencia → ¿activa? */
export function modoResumenActivo(valor: string | null | undefined): boolean {
  const v = String(valor ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'si' || v === 'sí';
}
