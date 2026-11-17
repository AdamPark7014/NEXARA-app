/**
 * Avance y salud del proyecto: **se calculan, no se guardan**.
 *
 * Un porcentaje escrito a mano envejece mal —en la pizarra hay proyectos al «80 %»
 * desde hace meses— y una bandera de riesgo que alguien tiene que acordarse de
 * marcar nunca se marca. Así que el avance sale de las actividades ligadas al
 * proyecto y el retraso de comparar el fin planeado contra hoy. Si el dato es
 * incómodo, es porque es verdad.
 *
 * Módulo puro: sin Prisma, sin fechas implícitas (`hoy` siempre entra por parámetro),
 * para poder probarlo entero.
 */
import { isClosedStatus, isFinishedStatus } from '../activities/activity-status.js';
import { esEstadoCerrado, type ProyectoEstado } from './proyecto-estado.js';

export type SaludProyecto =
  | 'SIN_PLAN'
  | 'PLANEADO'
  | 'EN_TIEMPO'
  | 'EN_RIESGO'
  | 'RETRASADO'
  | 'TERMINADO'
  | 'CANCELADO'
  | 'INCOMPLETO';

export const ETIQUETAS_SALUD: Record<SaludProyecto, string> = {
  SIN_PLAN: 'Sin fecha de fin',
  PLANEADO: 'Planeado',
  EN_TIEMPO: 'En tiempo',
  EN_RIESGO: 'En riesgo',
  RETRASADO: 'Retrasado',
  TERMINADO: 'Terminado',
  CANCELADO: 'Cancelado',
  INCOMPLETO: 'Incompleto',
};

/** Días naturales que faltan (positivo) o que ya se pasaron (negativo). */
const MS_DIA = 24 * 60 * 60 * 1000;

function aFecha(valor: Date | string | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Diferencia en días entre dos instantes, truncada al día natural. */
export function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  return Math.round((b - a) / MS_DIA);
}

export type ActividadDeProyecto = { estatus?: string | null };

export type HitoDeProyecto = {
  plannedDate?: Date | string | null;
  actualDate?: Date | string | null;
  status?: string | null;
};

export type AvanceProyecto = {
  /** Actividades totales ligadas al proyecto. */
  total: number;
  /** Cerradas: finalizadas o canceladas (ya no consumen calendario). */
  cerradas: number;
  /** Finalizadas de verdad (las canceladas no son entrega). */
  finalizadas: number;
  abiertas: number;
  /** 0–100. `null` cuando no hay de dónde calcularlo: mejor eso que un cero que parece fracaso. */
  porcentaje: number | null;
  /** De dónde salió el porcentaje, para poder decirlo en pantalla. */
  origen: 'actividades' | 'hitos' | 'ninguno' | 'incompleto';
};

/** 100 % solo con proyecto COMPLETED; si el trabajo ya cerró pero el proyecto sigue abierto, máx 99. */
export function aplicarTopeAvance(
  avance: AvanceProyecto,
  status?: string | null,
): AvanceProyecto {
  if (avance.porcentaje == null) return avance;
  if (status === 'COMPLETED') return avance;
  if (avance.porcentaje >= 100) return { ...avance, porcentaje: 99 };
  return avance;
}

/**
 * Avance: con hitos y actividades, pondera por hitos (el plan aprobado).
 * Si solo hay uno de los dos, usa ese. Sin nada, desconocido (null), no cero.
 */
export function calcularAvance(
  actividades: ActividadDeProyecto[] = [],
  hitos: HitoDeProyecto[] = [],
): AvanceProyecto {
  const total = actividades.length;
  const cerradas = actividades.filter((a) => isClosedStatus(a?.estatus)).length;
  const finalizadas = actividades.filter((a) => isFinishedStatus(a?.estatus)).length;
  const abiertas = total - cerradas;
  const conteoActividades = { total, cerradas, finalizadas, abiertas };

  const hitosVivos = hitos.filter((h) => h?.status !== 'CANCELADO');
  if (hitosVivos.length > 0 && total > 0) {
    const cumplidos = hitosVivos.filter((h) => h?.status === 'CUMPLIDO').length;
    return {
      ...conteoActividades,
      porcentaje: Math.round((cumplidos / hitosVivos.length) * 100),
      origen: 'hitos',
    };
  }

  if (total > 0) {
    return {
      ...conteoActividades,
      porcentaje: Math.round((cerradas / total) * 100),
      origen: 'actividades',
    };
  }

  if (hitosVivos.length > 0) {
    const cumplidos = hitosVivos.filter((h) => h?.status === 'CUMPLIDO').length;
    return {
      total: 0,
      cerradas: 0,
      finalizadas: 0,
      abiertas: 0,
      porcentaje: Math.round((cumplidos / hitosVivos.length) * 100),
      origen: 'hitos',
    };
  }

  return { total: 0, cerradas: 0, finalizadas: 0, abiertas: 0, porcentaje: null, origen: 'ninguno' };
}

export type EntradaSalud = {
  status?: string | null;
  /** Fin **planeado**: contra esto se mide el retraso. */
  endDate?: Date | string | null;
  /** Fin **real**: si existe, el proyecto ya cerró calendario. */
  actualEndDate?: Date | string | null;
  actividades?: ActividadDeProyecto[];
  hitos?: HitoDeProyecto[];
  /** Ventana de aviso antes del fin planeado. Por defecto, una semana. */
  diasDeAviso?: number;
  /** Si la ficha mínima no está completa. Por omisión true (callers viejos). */
  fichaCompleta?: boolean;
  /** Cuántos datos de ficha faltan (para el motivo). */
  faltantesFicha?: number;
};

export type ResumenSalud = {
  salud: SaludProyecto;
  etiqueta: string;
  /** La bandera que pidió dirección: fin planeado pasado con trabajo abierto. */
  enRiesgo: boolean;
  /** Días de retraso sobre el fin planeado (0 si no va tarde). */
  diasDeRetraso: number;
  /** Días que faltan para el fin planeado (`null` si no hay fecha o ya pasó). */
  diasRestantes: number | null;
  /** Hitos con fecha planeada vencida y sin fecha real. */
  hitosVencidos: number;
  /** Por qué está así, en una frase que se pueda enseñar al cliente. */
  motivo: string;
  avance: AvanceProyecto;
};

/**
 * Salud del proyecto a una fecha dada.
 *
 * El criterio de riesgo es el que pidió dirección, literal: **el fin planeado ya pasó
 * y todavía hay actividades abiertas**. Se le suman dos matices que no cambian esa
 * regla, solo la hacen útil antes de que sea tarde: un hito vencido también enciende
 * el aviso, y la semana previa al cierre avisa en vez de esperar al día siguiente.
 */
export function calcularSalud(entrada: EntradaSalud, hoy: Date = new Date()): ResumenSalud {
  let avance = calcularAvance(entrada.actividades ?? [], entrada.hitos ?? []);
  const status = entrada.status as ProyectoEstado | null | undefined;
  const finPlaneado = aFecha(entrada.endDate);
  const finReal = aFecha(entrada.actualEndDate);
  const diasDeAviso = entrada.diasDeAviso ?? 7;
  const fichaCompleta = entrada.fichaCompleta !== false;

  // Sin ficha no hay porcentaje: el proyecto aún no cuenta.
  if (!fichaCompleta) {
    const n = Math.max(1, entrada.faltantesFicha ?? 1);
    return {
      enRiesgo: false,
      diasDeRetraso: 0,
      diasRestantes: null,
      hitosVencidos: 0,
      salud: 'INCOMPLETO',
      etiqueta: ETIQUETAS_SALUD.INCOMPLETO,
      motivo: `Incompleto: faltan ${n} dato${n === 1 ? '' : 's'}`,
      avance: { ...avance, porcentaje: null, origen: 'incompleto' },
    };
  }

  // Nunca % sin fechas de plan.
  if (!finPlaneado && !finReal && status !== 'COMPLETED' && status !== 'CANCELLED') {
    avance = { ...avance, porcentaje: null };
  }

  avance = aplicarTopeAvance(avance, status);

  const base = {
    enRiesgo: false,
    diasDeRetraso: 0,
    diasRestantes: null as number | null,
    hitosVencidos: 0,
    avance,
  };

  if (status === 'CANCELLED') {
    return { ...base, salud: 'CANCELADO', etiqueta: ETIQUETAS_SALUD.CANCELADO, motivo: 'El proyecto está cancelado.' };
  }

  if (status === 'COMPLETED') {
    const retrasoEnEntrega = finPlaneado && finReal ? Math.max(0, diasEntre(finPlaneado, finReal)) : 0;
    const avanceBase = calcularAvance(entrada.actividades ?? [], entrada.hitos ?? []);
    const avanceTerminado = aplicarTopeAvance(
      {
        ...avanceBase,
        porcentaje: status === 'COMPLETED' ? (avanceBase.porcentaje ?? 100) : avanceBase.porcentaje,
      },
      status === 'COMPLETED' ? 'COMPLETED' : status,
    );
    return {
      ...base,
      avance: avanceTerminado,
      salud: 'TERMINADO',
      etiqueta: ETIQUETAS_SALUD.TERMINADO,
      diasDeRetraso: retrasoEnEntrega,
      motivo: retrasoEnEntrega
        ? `Se entregó ${retrasoEnEntrega} día${retrasoEnEntrega === 1 ? '' : 's'} después de lo planeado.`
        : 'Se entregó dentro del plazo planeado.',
    };
  }

  const hitosVencidos = (entrada.hitos ?? []).filter((h) => {
    if (h?.status === 'CUMPLIDO' || h?.status === 'CANCELADO') return false;
    if (h?.actualDate) return false;
    const planeada = aFecha(h?.plannedDate);
    return Boolean(planeada && diasEntre(planeada, hoy) > 0);
  }).length;

  if (!finPlaneado) {
    return {
      ...base,
      avance: { ...avance, porcentaje: null },
      hitosVencidos,
      enRiesgo: hitosVencidos > 0,
      salud: hitosVencidos > 0 ? 'EN_RIESGO' : status === 'PLANNED' ? 'PLANEADO' : 'SIN_PLAN',
      etiqueta:
        hitosVencidos > 0
          ? ETIQUETAS_SALUD.EN_RIESGO
          : status === 'PLANNED'
            ? ETIQUETAS_SALUD.PLANEADO
            : ETIQUETAS_SALUD.SIN_PLAN,
      motivo:
        hitosVencidos > 0
          ? `${hitosVencidos} hito${hitosVencidos === 1 ? '' : 's'} del cronograma con la fecha vencida.`
          : 'No tiene fecha de fin planeada: no se puede saber si va a tiempo.',
    };
  }

  const diferencia = diasEntre(finPlaneado, hoy);
  const diasDeRetraso = Math.max(0, diferencia);
  const diasRestantes = diferencia < 0 ? -diferencia : null;
  const hitosAbiertos = (entrada.hitos ?? []).some((h) => h.status !== 'CUMPLIDO' && h.status !== 'CANCELADO');
  const trabajoAbierto = (avance.total > 0 ? avance.abiertas > 0 : true) || hitosAbiertos;

  if (diasDeRetraso > 0 && trabajoAbierto) {
    return {
      ...base,
      hitosVencidos,
      diasDeRetraso,
      enRiesgo: true,
      salud: 'RETRASADO',
      etiqueta: ETIQUETAS_SALUD.RETRASADO,
      motivo:
        avance.total > 0
          ? `El fin planeado pasó hace ${diasDeRetraso} día${diasDeRetraso === 1 ? '' : 's'} y quedan ${avance.abiertas} actividad${avance.abiertas === 1 ? '' : 'es'} abierta${avance.abiertas === 1 ? '' : 's'}.`
          : `El fin planeado pasó hace ${diasDeRetraso} día${diasDeRetraso === 1 ? '' : 's'} y el proyecto sigue sin cerrarse.`,
    };
  }

  if (diasDeRetraso > 0) {
    // Todo el trabajo está cerrado pero nadie marcó el proyecto como terminado.
    return {
      ...base,
      avance: aplicarTopeAvance(
        { ...avance, porcentaje: avance.porcentaje == null ? 99 : Math.min(avance.porcentaje, 99) },
        status,
      ),
      hitosVencidos,
      diasDeRetraso,
      enRiesgo: true,
      salud: 'EN_RIESGO',
      etiqueta: ETIQUETAS_SALUD.EN_RIESGO,
      motivo: 'Listo para cerrar: todas las actividades están cerradas pero el proyecto sigue abierto.',
    };
  }

  if (hitosVencidos > 0) {
    return {
      ...base,
      hitosVencidos,
      diasRestantes,
      enRiesgo: true,
      salud: 'EN_RIESGO',
      etiqueta: ETIQUETAS_SALUD.EN_RIESGO,
      motivo: `${hitosVencidos} hito${hitosVencidos === 1 ? '' : 's'} del cronograma con la fecha vencida.`,
    };
  }

  if (diasRestantes !== null && diasRestantes <= diasDeAviso && trabajoAbierto && status !== 'PLANNED') {
    return {
      ...base,
      hitosVencidos,
      diasRestantes,
      enRiesgo: true,
      salud: 'EN_RIESGO',
      etiqueta: ETIQUETAS_SALUD.EN_RIESGO,
      motivo: `Faltan ${diasRestantes} día${diasRestantes === 1 ? '' : 's'} para el fin planeado y aún hay trabajo abierto.`,
    };
  }

  // Trabajo cerrado y proyecto aún abierto (aunque el fin no haya pasado).
  if (avance.total > 0 && !trabajoAbierto) {
    return {
      ...base,
      avance: aplicarTopeAvance(avance, status),
      hitosVencidos,
      diasRestantes,
      enRiesgo: true,
      salud: 'EN_RIESGO',
      etiqueta: ETIQUETAS_SALUD.EN_RIESGO,
      motivo: 'Listo para cerrar: todas las actividades están cerradas pero el proyecto sigue abierto.',
    };
  }

  if (status === 'PLANNED') {
    return {
      ...base,
      hitosVencidos,
      diasRestantes,
      salud: 'PLANEADO',
      etiqueta: ETIQUETAS_SALUD.PLANEADO,
      motivo: 'Todavía no arranca.',
    };
  }

  return {
    ...base,
    hitosVencidos,
    diasRestantes,
    salud: status === 'ON_HOLD' ? 'EN_RIESGO' : 'EN_TIEMPO',
    etiqueta: status === 'ON_HOLD' ? ETIQUETAS_SALUD.EN_RIESGO : ETIQUETAS_SALUD.EN_TIEMPO,
    motivo:
      status === 'ON_HOLD'
        ? 'El proyecto está en pausa: el calendario sigue corriendo.'
        : diasRestantes !== null
          ? `Quedan ${diasRestantes} día${diasRestantes === 1 ? '' : 's'} para el fin planeado.`
          : 'Dentro del plazo planeado.',
  };
}

export type HitoConNombre = HitoDeProyecto & {
  id?: number;
  name?: string | null;
  orden?: number | null;
};

/**
 * La siguiente etapa por cumplir, para la fila de la lista: entre las que siguen
 * abiertas, la de fecha planeada más próxima. Las que no tienen fecha van al final,
 * en su orden del cronograma. `null` si ya no queda ninguna.
 */
export function siguienteHito<T extends HitoConNombre>(hitos: T[] = []): T | null {
  const abiertos = hitos.filter(
    (h) => h && h.status !== 'CUMPLIDO' && h.status !== 'CANCELADO' && !h.actualDate,
  );
  if (!abiertos.length) return null;
  const fecha = (h: T) => aFecha(h.plannedDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  return [...abiertos].sort((a, b) => {
    const fa = fecha(a);
    const fb = fecha(b);
    if (fa !== fb) return fa < fb ? -1 : 1;
    return (a.orden ?? 0) - (b.orden ?? 0);
  })[0];
}

/** ¿Cuántos requerimientos están cumplidos? Para la barra de la pestaña Alcance. */
export function resumirRequerimientos(
  requerimientos: Array<{ status?: string | null }> = [],
): { total: number; cumplidos: number; pendientes: number; porcentaje: number | null } {
  const aplican = requerimientos.filter((r) => r?.status !== 'NO_APLICA');
  const total = aplican.length;
  const cumplidos = aplican.filter((r) => r?.status === 'CUMPLIDO').length;
  return {
    total,
    cumplidos,
    pendientes: total - cumplidos,
    porcentaje: total > 0 ? Math.round((cumplidos / total) * 100) : null,
  };
}

export { esEstadoCerrado };
