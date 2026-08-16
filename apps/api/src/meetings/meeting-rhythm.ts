/**
 * El ritmo de trabajo que describe el organigrama, en código.
 *
 *   10:00  reunión diaria — agenda, prioridades, servicios y materiales
 *   Lunes  planeación semanal
 *   Miérc. revisión de avances
 *   Viernes junta de cierre — resultados, problemas y lecciones aprendidas
 *
 * Nada de esto existía en el sistema, así que los acuerdos y las lecciones no
 * quedaban ligados a las actividades de las que se hablaba. Aquí sólo va lo
 * que se puede decidir sin base de datos.
 */

export const MEETING_TYPES = [
  'DIARIA',
  'PLANEACION_SEMANAL',
  'REVISION_AVANCES',
  'CIERRE_SEMANAL',
  'EXTRAORDINARIA',
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_STATUSES = ['PROGRAMADA', 'REALIZADA', 'CANCELADA'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const AGREEMENT_KINDS = ['ACUERDO', 'LECCION', 'RIESGO'] as const;
export type AgreementKind = (typeof AGREEMENT_KINDS)[number];

export const AGREEMENT_STATUSES = ['PENDIENTE', 'EN_PROCESO', 'CUMPLIDO', 'CANCELADO'] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

/** Estados en los que un acuerdo todavía espera algo de alguien. */
export const OPEN_AGREEMENT_STATUSES: AgreementStatus[] = ['PENDIENTE', 'EN_PROCESO'];

/** Título y hora por defecto de cada ritmo, para no escribirlos cada vez. */
export const MEETING_DEFAULTS: Record<MeetingType, { titulo: string; horaInicio: string }> = {
  DIARIA: { titulo: 'Reunión diaria', horaInicio: '10:00' },
  PLANEACION_SEMANAL: { titulo: 'Planeación semanal', horaInicio: '09:00' },
  REVISION_AVANCES: { titulo: 'Revisión de avances', horaInicio: '10:00' },
  CIERRE_SEMANAL: { titulo: 'Junta de cierre', horaInicio: '16:00' },
  EXTRAORDINARIA: { titulo: 'Reunión extraordinaria', horaInicio: '10:00' },
};

/**
 * Puntos de agenda sugeridos.
 *
 * No es decorado: la junta del viernes que no pregunta explícitamente por
 * lecciones aprendidas termina siendo un repaso de pendientes, y era justo lo
 * que el organigrama pedía y el sistema no recogía.
 */
export const MEETING_AGENDA: Record<MeetingType, string[]> = {
  DIARIA: [
    'Prioridades del día',
    'Servicios programados',
    'Materiales y herramienta requeridos',
    'Bloqueos e incidencias abiertas',
  ],
  PLANEACION_SEMANAL: [
    'Metas de la semana',
    'Asignación de actividades por técnico',
    'Compras y materiales a gestionar',
    'Riesgos previstos',
  ],
  REVISION_AVANCES: [
    'Avance contra el plan del lunes',
    'Actividades en riesgo de SLA',
    'Ajustes de asignación',
  ],
  CIERRE_SEMANAL: [
    'Resultados de la semana',
    'Problemas encontrados',
    'Lecciones aprendidas',
    'Acuerdos para la semana entrante',
  ],
  EXTRAORDINARIA: ['Motivo de la convocatoria', 'Acuerdos'],
};

/**
 * Un acuerdo está vencido si sigue abierto y su fecha compromiso ya pasó.
 *
 * Se **calcula**, no se guarda: una bandera almacenada exige un cron que la
 * refresque y queda mintiendo el día que ese cron falla.
 */
export function isOverdue(
  agreement: { estado: string; fechaCompromiso?: Date | null },
  at: Date = new Date(),
): boolean {
  if (!OPEN_AGREEMENT_STATUSES.includes(agreement.estado as AgreementStatus)) return false;
  if (!agreement.fechaCompromiso) return false;
  return calendarDayUtc(agreement.fechaCompromiso) < calendarDayLocal(at);
}

/** Días de retraso; 0 si aún está en fecha o no tiene fecha. */
export function daysOverdue(
  agreement: { estado: string; fechaCompromiso?: Date | null },
  at: Date = new Date(),
): number {
  if (!isOverdue(agreement, at)) return 0;
  const compromiso = Date.UTC(
    agreement.fechaCompromiso!.getUTCFullYear(),
    agreement.fechaCompromiso!.getUTCMonth(),
    agreement.fechaCompromiso!.getUTCDate(),
  );
  const hoy = Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
  return Math.round((hoy - compromiso) / 86_400_000);
}

/**
 * Sólo el acuerdo necesita responsable.
 *
 * Una lección aprendida y un riesgo son conocimiento: no tienen dueño ni fecha.
 * Un acuerdo sin responsable, en cambio, es un deseo — y es exactamente lo que
 * vuelve inútil la junta de los viernes.
 */
export function agreementRequiresOwner(tipo: AgreementKind): boolean {
  return tipo === 'ACUERDO';
}

/** Fecha del guardado (`@db.Date`, medianoche UTC) como AAAAMMDD. */
function calendarDayUtc(d: Date): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** "Hoy" para quien mira el tablero. */
function calendarDayLocal(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
