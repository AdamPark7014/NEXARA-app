/**
 * Avisos que se repiten cuando una unidad no vuelve a tiempo.
 *
 * Antes solo se avisaba dos veces al día (8 y 16 h) de los usos que vencían en las próximas 24 h, y
 * nada después de vencer. Ahora, cada hora dentro del horario de trabajo, mientras la unidad siga
 * fuera y ya pasó su hora de regreso, o su actividad ya cerró:
 *
 *   - el encargado (o el solicitante, si no hay encargado) recibe aviso cada hora;
 *   - Liz, en el aviso 2 y luego cada 3 (2, 5, 8…);
 *   - el jefe del encargado, en el aviso 4 y luego cada 4 (4, 8, 12…).
 *
 * Reglas puras; el servicio lee la base, manda y anota `avisosRetraso` / `ultimoAvisoRetrasoEn`.
 */

/** Horas (México) en las que se avisa: de 8:00 a 20:59. De noche no se despierta a nadie. */
export const HORARIO_AVISOS = { desde: 8, hasta: 21 } as const;

/** Entre dos avisos del mismo uso, al menos esto (el cron corre cada hora; esto evita dobles). */
export const MINUTOS_ENTRE_AVISOS = 55;

export type UsoParaAviso = {
  solicitanteId: number;
  encargadoId: number | null;
  fechaFinAprobada: Date | null;
  fechaFinSolicitada: Date | null;
  /** La actividad a la que se cargó el viaje ya está cerrada. */
  actividadCerrada: boolean;
  avisosRetraso: number;
  ultimoAvisoRetrasoEn: Date | null;
};

export type Retraso = { motivo: 'VENCIDO' | 'ACTIVIDAD_CERRADA'; desde: Date | null; minutos: number };

/** Hora (0–23) en la Ciudad de México. */
export function horaMexico(ahora: Date, zona = 'America/Mexico_City'): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: zona, hour: 'numeric', hourCycle: 'h23' }).format(ahora);
  return Number(h) % 24;
}

export function dentroDeHorario(ahora: Date): boolean {
  const h = horaMexico(ahora);
  return h >= HORARIO_AVISOS.desde && h < HORARIO_AVISOS.hasta;
}

/** ¿Por qué esta unidad ya debería estar de vuelta? `null` = todavía no. */
export function motivoRetraso(uso: UsoParaAviso, ahora: Date): Retraso | null {
  const fin = uso.fechaFinAprobada ?? uso.fechaFinSolicitada;
  if (fin && fin.getTime() < ahora.getTime()) {
    return { motivo: 'VENCIDO', desde: fin, minutos: Math.floor((ahora.getTime() - fin.getTime()) / 60_000) };
  }
  if (uso.actividadCerrada) return { motivo: 'ACTIVIDAD_CERRADA', desde: null, minutos: 0 };
  return null;
}

export function tocaAviso(uso: UsoParaAviso, ahora: Date): boolean {
  if (!dentroDeHorario(ahora)) return false;
  if (!uso.ultimoAvisoRetrasoEn) return true;
  return ahora.getTime() - uso.ultimoAvisoRetrasoEn.getTime() >= MINUTOS_ENTRE_AVISOS * 60_000;
}

/** A quién va el aviso número `avisosRetraso + 1`. */
export function destinatariosAviso(uso: UsoParaAviso): { personaId: number; liz: boolean; jefe: boolean; numero: number } {
  const numero = (uso.avisosRetraso ?? 0) + 1;
  return {
    personaId: uso.encargadoId ?? uso.solicitanteId,
    liz: numero >= 2 && (numero - 2) % 3 === 0,
    jefe: numero >= 4 && (numero - 4) % 4 === 0,
    numero,
  };
}

const fmtHora = (d: Date) =>
  d.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit' });

function duracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Título y mensaje del aviso, para la persona y para Liz/jefe. */
export function textoAviso(
  unidad: string,
  retraso: Retraso,
  persona: string,
): { titulo: string; paraPersona: string; paraSupervision: string } {
  if (retraso.motivo === 'ACTIVIDAD_CERRADA') {
    return {
      titulo: 'Devuelve la unidad',
      paraPersona: `Tu actividad ya cerró y ${unidad} sigue fuera. Registra la devolución con los 5 pasos.`,
      paraSupervision: `${persona}: su actividad ya cerró y ${unidad} sigue fuera.`,
    };
  }
  const tarde = duracion(retraso.minutos);
  const hora = retraso.desde ? fmtHora(retraso.desde) : '';
  return {
    titulo: 'Unidad sin devolver',
    paraPersona: `${unidad} debía volver a las ${hora} (${tarde} tarde). Registra la devolución con los 5 pasos.`,
    paraSupervision: `${persona} no ha devuelto ${unidad}: debía volver a las ${hora} (${tarde} tarde).`,
  };
}
