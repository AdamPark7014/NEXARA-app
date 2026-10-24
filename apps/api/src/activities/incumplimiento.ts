/**
 * Actividades no cumplidas.
 *
 * Regla de Adam (22-10-2026): «cualquier actividad que no se acabe después de la jornada laboral
 * se toma como incumplida», y un superior debe poder registrar que una actividad no se cumplió.
 *
 * - **Cierre de jornada.** Lo que siga sin entregarse pasa a «No cumplida» cuando la persona
 *   toma la foto de salida en asistencia, o a las 23:30 si nadie la tomó (el mismo respaldo con
 *   el que asistencia cierra la jornada olvidada). El reloj del horario (18:00, u otra
 *   `horaSalida`) no cambia el estatus: solo sirve para avisar una hora antes. Una salida sin
 *   foto tampoco cierra. Entregada = todos los que la ejecutan mandaron su evidencia antes de
 *   ese disparo; por eso «Por Validar» nunca se cierra.
 * - **Plazo explícito** posterior al horario (o la hora de gracia tras asignar) se respeta: la
 *   foto anterior a ese instante no incumple. Uno anterior al horario no adelanta el cierre.
 * - **Aviso previo** una hora antes del horario de quien la ejecuta, una sola vez.
 * - **Registro manual**: los mismos superiores que pueden cancelarla, con causa y observaciones.
 * - **Reprogramar** la reabre con fecha nueva; el incumplimiento no se borra (es lo que miden
 *   los KPI de «en tiempo y forma»).
 *
 * Funciones puras: el servicio (`activity-non-compliance.service.ts`) lee la base y aplica.
 */
import { workDateKey, workDayAtClock, workDayEnd } from '../common/time/workday.js';
import { ACTIVITY_STATUS, normalizeActivityStatus, type ActivityStatus } from './activity-status.js';
import { limiteDeEntrega } from './semaforo-actividad.js';
import type { Periodo } from './actividad-periodo.js';

/**
 * Desde cuándo aplica el cierre automático: 22-10-2026 00:00 en México. Lo que venció antes se
 * queda como estaba (atrasado): no se cierra en bloque ni se le avisa a nadie a deshoras.
 */
export const NO_CUMPLIDA_VIGENTE_DESDE = new Date('2026-10-22T06:00:00.000Z');

/** Salida de la jornada normal (la misma de `JORNADA_SALIDA_HM` en asistencia). */
export const SALIDA_POR_OMISION = '18:00';

/** Minutos antes del cierre en que se le avisa a quien la tiene. */
export const AVISO_PREVIO_MIN = 60;

/** Lo que se asigna sobre la hora tiene al menos esto para entregarse. */
export const MARGEN_TRAS_ASIGNAR_MIN = 60;

export type OrigenIncumplimiento = 'CIERRE_JORNADA' | 'MANUAL';

/** Catálogo de causas. La primera es la que pone el sistema al cierre. */
export const CAUSAS_INCUMPLIMIENTO = [
  { clave: 'SIN_ENTREGA', etiqueta: 'Sin entrega al cierre de la jornada' },
  { clave: 'MATERIAL', etiqueta: 'Falta de material, herramienta o equipo' },
  { clave: 'ACCESO', etiqueta: 'Sin acceso al sitio o cliente no disponible' },
  { clave: 'PERSONAL', etiqueta: 'Personal asignado no disponible' },
  { clave: 'PLANEACION', etiqueta: 'Alcance o tiempo mal planeado' },
  { clave: 'CALIDAD', etiqueta: 'La entrega no cumple lo solicitado' },
  { clave: 'OTRA', etiqueta: 'Otra causa' },
] as const;

export type CausaIncumplimiento = (typeof CAUSAS_INCUMPLIMIENTO)[number]['clave'];

export const CAUSA_CIERRE_JORNADA: CausaIncumplimiento = 'SIN_ENTREGA';

export function esCausaValida(valor: unknown): valor is CausaIncumplimiento {
  return CAUSAS_INCUMPLIMIENTO.some((c) => c.clave === valor);
}

export function etiquetaCausa(clave?: string | null): string {
  return CAUSAS_INCUMPLIMIENTO.find((c) => c.clave === clave)?.etiqueta ?? 'Otra causa';
}

/** Estados que el cierre de jornada puede dar por no cumplidos: lo que nadie ha entregado. */
const SIN_ENTREGAR: ActivityStatus[] = [
  ACTIVITY_STATUS.PENDIENTE,
  ACTIVITY_STATUS.ASIGNADA,
  ACTIVITY_STATUS.EN_PROCESO,
  ACTIVITY_STATUS.RECHAZADA,
];

export function esNoCumplida(estatus: unknown): boolean {
  return normalizeActivityStatus(estatus) === ACTIVITY_STATUS.NO_CUMPLIDA;
}

/** ¿El cierre de jornada la puede tocar? Solo lo abierto y sin entregar. */
export function esCandidataAlCierre(estatus: unknown): boolean {
  const s = normalizeActivityStatus(estatus);
  return s != null && SIN_ENTREGAR.includes(s);
}

/** ¿Un superior la puede registrar como no cumplida? Todo lo que siga abierto, entregado o no. */
export function admiteRegistroManual(estatus: unknown): boolean {
  const s = normalizeActivityStatus(estatus);
  return s != null && (SIN_ENTREGAR.includes(s) || s === ACTIVITY_STATUS.POR_VALIDAR);
}

/** `HH:MM` → minutos del día, o null si no es una hora válida. */
function minutosDeHora(hm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** La salida más tarde de quienes la ejecutan; sin horarios, la de la jornada normal. */
export function salidaMasTarde(horasSalida?: Array<string | null | undefined> | null): number {
  const validas = (horasSalida ?? []).map(minutosDeHora).filter((m): m is number => m != null);
  return validas.length ? Math.max(...validas) : (minutosDeHora(SALIDA_POR_OMISION) as number);
}

function aFecha(valor?: Date | string | null): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

const masTarde = (a: Date, b: Date) => (b.getTime() > a.getTime() ? b : a);

/**
 * Instante en que la actividad se da por no cumplida si no se entregó. `null` = no tiene fecha
 * con qué vencerse (sin fecha no hay incumplimiento automático).
 */
export function cierreDeJornada(p: {
  fechaInicio?: Date | string | null;
  fechaMaxima?: Date | string | null;
  fechaEntregaEsperada?: Date | string | null;
  periodoInicio?: Date | string | null;
  periodoFin?: Date | string | null;
  periodo?: Periodo | null;
  fechaAsignacion?: Date | string | null;
  /** `HH:MM` de salida de cada persona que la ejecuta (null = sin horario propio). */
  horasSalida?: Array<string | null | undefined> | null;
}): Date | null {
  const limite = limiteDeEntrega(p);
  if (!limite) return null;

  const salida = salidaMasTarde(p.horasSalida);
  const finJornada = workDayAtClock(limite, Math.floor(salida / 60), salida % 60);
  const finDelDia = workDayEnd(limite);

  // El límite que no es explícito llega como fin del día (hora citada del formulario o último día
  // del periodo): ahí manda la jornada. Uno explícito más tarde que la salida se respeta.
  const limiteEsFinDeDia = limite.getTime() >= finDelDia.getTime() - 60_000;
  let cierre = limiteEsFinDeDia ? finJornada : masTarde(limite, finJornada);

  // Citada después de la salida (trabajo fuera de horario): tiene hasta que acabe ese día.
  const inicio = aFecha(p.fechaInicio);
  if (inicio && workDateKey(inicio) === workDateKey(limite) && inicio.getTime() >= finJornada.getTime()) {
    cierre = masTarde(cierre, finDelDia);
  }

  // Nadie queda incumplido por algo que le asignaron sin tiempo para hacerlo.
  const asignada = aFecha(p.fechaAsignacion);
  if (asignada) cierre = masTarde(cierre, new Date(asignada.getTime() + MARGEN_TRAS_ASIGNAR_MIN * 60_000));

  return cierre;
}

export type EjecutorEntrega = { userId: number; entregadaAt: Date | null };

export type DecisionCierre =
  | { accion: 'cerrar'; pendientes: number[] }
  | { accion: 'avisar'; pendientes: number[] }
  | { accion: null; pendientes: number[] };

/** Salida de asistencia que puede cerrar la actividad: la foto, o el respaldo de las 23:30. */
export type SalidaAsistencia = {
  userId: number;
  at: Date;
  conFoto: boolean;
  cierreAutomatico: boolean;
};

/** La salida sin foto no dispara. El cierre automático de las 23:30 sí, aunque no traiga foto. */
export function salidaDisparaCierre(salida: Pick<SalidaAsistencia, 'conFoto' | 'cierreAutomatico'>): boolean {
  return salida.conFoto || salida.cierreAutomatico;
}

/**
 * Qué toca hacer ahora: cerrar, avisar, o nada.
 *
 * El estatus no cambia a la hora del horario. Cambia cuando cada quien sigue sin entregar
 * y ya tomó la foto de salida (o asistencia le puso el cierre automático de las 23:30).
 * Con varios ejecutores se espera al último. `pendientes` = quienes no entregaron antes de ese disparo.
 */
export function decidirCierreDeJornada(p: {
  estatus: string | null | undefined;
  /** Reloj del horario. Solo avisa una hora antes; no cierra. */
  avisoEn?: Date | null;
  /** Plazo explícito o gracia posterior al horario. La foto anterior no cierra. */
  noAntesDe?: Date | null;
  ahora: Date;
  avisadoAt?: Date | null;
  ejecutores: EjecutorEntrega[];
  salidas?: SalidaAsistencia[];
  /** 23:30 del día en que vencía. Sin foto, aquí se cierra. */
  respaldoAt?: Date | null;
  vigenteDesde?: Date;
}): DecisionCierre {
  const nada = (pendientes: number[] = []): DecisionCierre => ({ accion: null, pendientes });
  if (!esCandidataAlCierre(p.estatus)) return nada();
  const desde = p.vigenteDesde ?? NO_CUMPLIDA_VIGENTE_DESDE;
  const ancla = p.avisoEn ?? p.respaldoAt ?? null;
  if (!ancla || ancla.getTime() < desde.getTime()) return nada();

  const salidas = p.salidas ?? [];
  const disparoDe = (userId: number) => salidas.find((s) => s.userId === userId && salidaDisparaCierre(s)) ?? null;
  const respaldoLlego = Boolean(p.respaldoAt && p.ahora.getTime() >= p.respaldoAt.getTime());

  const pendientes = p.ejecutores
    .filter((e) => {
      const corte = disparoDe(e.userId)?.at ?? (respaldoLlego ? p.respaldoAt : null);
      if (!e.entregadaAt) return true;
      if (!corte) return false;
      return e.entregadaAt.getTime() > corte.getTime();
    })
    .map((e) => e.userId);
  if (p.ejecutores.length && !pendientes.length) return nada();

  const yaEsJusto = !p.noAntesDe || p.ahora.getTime() >= p.noAntesDe.getTime();
  const puedeCerrar = yaEsJusto && pendientes.length > 0 && (pendientes.every((id) => disparoDe(id)) || respaldoLlego);
  if (puedeCerrar) return { accion: 'cerrar', pendientes };

  if (!p.avisadoAt && p.avisoEn && p.ahora.getTime() >= p.avisoEn.getTime() - AVISO_PREVIO_MIN * 60_000) {
    return { accion: 'avisar', pendientes };
  }
  return nada(pendientes);
}

/** Estatus con que se reabre al reprogramar: en proceso si alguien ya la había empezado. */
export function estatusAlReprogramar(estatusPrevio: string | null | undefined, arrancada: boolean): ActivityStatus {
  if (arrancada) return ACTIVITY_STATUS.EN_PROCESO;
  return normalizeActivityStatus(estatusPrevio) === ACTIVITY_STATUS.ASIGNADA
    ? ACTIVITY_STATUS.ASIGNADA
    : ACTIVITY_STATUS.PENDIENTE;
}

/**
 * Hora de salida del horario en el día de `ancla` (18:00 si nadie tiene la suya).
 * Es el reloj del aviso, no el instante en que la actividad pasa a no cumplida.
 */
export function finDeHorario(ancla: Date, horasSalida?: Array<string | null | undefined> | null): Date {
  const salida = salidaMasTarde(horasSalida);
  return workDayAtClock(ancla, Math.floor(salida / 60), salida % 60);
}

/**
 * Instante que hay que esperar además de la foto: un plazo explícito posterior al horario,
 * o la hora de gracia tras asignar. `null` = la foto (o las 23:30) basta.
 */
export function esperaTrasHorario(programado: Date | null, finJornada: Date | null): Date | null {
  if (!programado || !finJornada) return null;
  return programado.getTime() > finJornada.getTime() + 1000 ? programado : null;
}

/** «18:00» en la zona de la jornada. */
export function horaDeCierre(cierre: Date): string {
  return cierre.toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
