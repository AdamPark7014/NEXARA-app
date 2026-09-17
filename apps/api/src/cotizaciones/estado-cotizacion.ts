/**
 * Estados de una cotización de Core (contrato 17-09, sección D).
 *
 *   BORRADOR | ENVIADA | APROBADA | RECHAZADA | VENCIDA
 *
 * En la base el enum `CotizacionStatus` se llama en inglés desde la primera versión (DRAFT/SENT/
 * APPROVED) y hay cotizaciones vivas con esos valores; la migración solo **agrega** REJECTED y
 * EXPIRED. Este módulo traduce en los dos sentidos para que la API y las apps hablen en español sin
 * romper lo que ya está guardado.
 *
 * Reglas del contrato:
 * - Enviada = bloqueada. Editar una enviada no la modifica: crea una versión nueva.
 * - No se firma una vencida ni una rechazada.
 * - El cliente puede rechazar con motivo desde el enlace.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */

export const ESTADO = {
  BORRADOR: 'BORRADOR',
  ENVIADA: 'ENVIADA',
  APROBADA: 'APROBADA',
  RECHAZADA: 'RECHAZADA',
  VENCIDA: 'VENCIDA',
} as const;

export type EstadoCotizacion = (typeof ESTADO)[keyof typeof ESTADO];

/** Valores del enum `CotizacionStatus` en Postgres. */
export type EstadoDb = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

const DB_POR_ESTADO: Record<EstadoCotizacion, EstadoDb> = {
  BORRADOR: 'DRAFT',
  ENVIADA: 'SENT',
  APROBADA: 'APPROVED',
  RECHAZADA: 'REJECTED',
  VENCIDA: 'EXPIRED',
};

const ESTADO_POR_DB: Record<EstadoDb, EstadoCotizacion> = {
  DRAFT: 'BORRADOR',
  SENT: 'ENVIADA',
  APPROVED: 'APROBADA',
  REJECTED: 'RECHAZADA',
  EXPIRED: 'VENCIDA',
};

export const ETIQUETA_ESTADO: Record<EstadoCotizacion, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  VENCIDA: 'Vencida',
};

/** Estado en español a partir de lo guardado (acepta ya el español, para payloads de las apps). */
export function estadoDesdeDb(valor: unknown): EstadoCotizacion {
  const raw = String(valor ?? '').trim().toUpperCase();
  if (raw in ESTADO_POR_DB) return ESTADO_POR_DB[raw as EstadoDb];
  if (raw in DB_POR_ESTADO) return raw as EstadoCotizacion;
  return ESTADO.BORRADOR;
}

/** Valor del enum de la base para un estado en español (o inglés, si viene así). */
export function estadoADb(estado: unknown): EstadoDb {
  return DB_POR_ESTADO[estadoDesdeDb(estado)];
}

/** Estados desde los que ya no se edita el contenido: editar crea versión nueva. */
export function estaBloqueada(estado: unknown): boolean {
  return estadoDesdeDb(estado) !== ESTADO.BORRADOR;
}

/** Una aprobada no se reabre: es el compromiso firmado con el cliente. */
export function esFinal(estado: unknown): boolean {
  return estadoDesdeDb(estado) === ESTADO.APROBADA;
}

const TRANSICIONES: Record<EstadoCotizacion, EstadoCotizacion[]> = {
  // Se envía, o se cancela marcándola rechazada internamente.
  BORRADOR: [ESTADO.ENVIADA, ESTADO.RECHAZADA],
  // El cliente aprueba o rechaza; la tarea diaria la vence; un reenvío la deja enviada otra vez.
  ENVIADA: [ESTADO.APROBADA, ESTADO.RECHAZADA, ESTADO.VENCIDA, ESTADO.ENVIADA, ESTADO.BORRADOR],
  // Aprobada = firmada. No hay vuelta atrás.
  APROBADA: [],
  // Rechazada o vencida se retoman como borrador (versión nueva) y se vuelven a enviar.
  RECHAZADA: [ESTADO.BORRADOR],
  VENCIDA: [ESTADO.BORRADOR],
};

export function transicionPermitida(desde: unknown, hacia: unknown): boolean {
  const origen = estadoDesdeDb(desde);
  const destino = estadoDesdeDb(hacia);
  if (origen === destino && origen !== ESTADO.ENVIADA) return true;
  return TRANSICIONES[origen].includes(destino);
}

/** Motivo en español de por qué no se puede pasar de un estado a otro. */
export function motivoTransicionInvalida(desde: unknown, hacia: unknown): string {
  const origen = estadoDesdeDb(desde);
  const destino = estadoDesdeDb(hacia);
  if (origen === ESTADO.APROBADA) {
    return 'La cotización ya fue aprobada por el cliente: no se puede cambiar.';
  }
  return `No se puede pasar de ${ETIQUETA_ESTADO[origen]} a ${ETIQUETA_ESTADO[destino]}.`;
}

/**
 * ¿Sigue firmable desde el enlace público?
 *
 * Solo una enviada y dentro de vigencia. Antes se firmaba cualquier cotización con token —incluidas
 * las vencidas y las que el cliente ya había rechazado—; ese hueco es lo que cierra esta función.
 */
export function puedeFirmarse(input: {
  estado: unknown;
  validUntil?: Date | string | null;
  hoy?: Date;
}): { ok: boolean; motivo?: string } {
  const estado = estadoDesdeDb(input.estado);
  if (estado === ESTADO.APROBADA) return { ok: false, motivo: 'Esta cotización ya está aprobada.' };
  if (estado === ESTADO.RECHAZADA) {
    return { ok: false, motivo: 'Esta cotización fue rechazada. Pide una nueva a tu asesor.' };
  }
  if (estado === ESTADO.VENCIDA) {
    return { ok: false, motivo: 'Esta cotización ya venció. Pide una actualización a tu asesor.' };
  }
  if (estado !== ESTADO.ENVIADA) {
    return { ok: false, motivo: 'Esta cotización todavía no se ha enviado.' };
  }

  const vence = input.validUntil ? new Date(input.validUntil) : null;
  if (vence && !Number.isNaN(vence.getTime())) {
    const hoy = input.hoy ?? new Date();
    if (vence.getTime() < hoy.getTime()) {
      return { ok: false, motivo: 'Esta cotización ya venció. Pide una actualización a tu asesor.' };
    }
  }
  return { ok: true };
}

/** ¿Debe marcarla la tarea diaria como vencida? */
export function debeVencer(input: { estado: unknown; validUntil?: Date | string | null; hoy?: Date }): boolean {
  if (estadoDesdeDb(input.estado) !== ESTADO.ENVIADA) return false;
  if (!input.validUntil) return false;
  const vence = new Date(input.validUntil);
  if (Number.isNaN(vence.getTime())) return false;
  return vence.getTime() < (input.hoy ?? new Date()).getTime();
}

/** Estado de la actividad comercial ligada, según el estado de su cotización. */
export function avanceActividadPorEstado(estado: unknown): 'Por Validar' | 'Finalizada' | null {
  switch (estadoDesdeDb(estado)) {
    case ESTADO.ENVIADA:
      return 'Por Validar';
    case ESTADO.APROBADA:
      return 'Finalizada';
    default:
      // Rechazada o vencida: la deja un superior, que cierra o reprograma.
      return null;
  }
}
