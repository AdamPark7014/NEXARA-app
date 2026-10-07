/**
 * Cuentas de la pizarra: prioridad, semáforo, minutos reales y KPI por persona.
 *
 * Archivo puro a propósito: nada de Prisma ni de Nest. La pizarra mezcla tres
 * relojes (lo planeado, lo que marcan las evidencias y la jornada de asistencia)
 * y cada uno tiene su trampa; aquí se pueden probar sin base de datos.
 *
 * Contrato del viernes, sección C (y la prioridad/semáforo de la B).
 */
import { esMultiDia, type Periodo } from '../activities/actividad-periodo.js';
import { evaluarSemaforo, limiteDeEntrega, type MotivoSemaforo } from '../activities/semaforo-actividad.js';
import {
  cruzarTramos,
  minutosDeTramosMs,
  minutosTrabajados,
  tramosTrabajados,
  unirTramos,
  type SesionTrabajo,
  type TramoMs,
} from '../activities/sessions/sesiones-trabajo.js';

export type Prioridad = 'ALTA' | 'MEDIA' | 'BAJA';
export type Semaforo = 'rojo' | 'amarillo' | 'verde';

export const PRIORIDAD_ETIQUETA: Record<Prioridad, string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};

/** Jornada más larga que se da por buena cuando falta la salida (igual que el cierre automático). */
export const MINUTOS_MAX_JORNADA = 9 * 60;
/** Comida sin regreso registrado: se descuenta una hora. */
export const MINUTOS_COMIDA_POR_OMISION = 60;
/**
 * Ya no pinta el semáforo (eso lo decide el reloj). Sigue exportado por el
 * contrato anterior: el aviso de tiempo excedido no usa este porcentaje.
 */
export const PCT_ALERTA_PLAN = 80;

function sinAcentos(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * `Activity.prioridad` es texto libre: hay «Alta», «alta», «Urgente», «P1», vacío…
 * Para leer siempre se normaliza a ALTA | MEDIA | BAJA; sin valor = MEDIA.
 */
export function normalizaPrioridad(valor?: string | null): Prioridad {
  const t = sinAcentos(valor ?? '');
  if (!t) return 'MEDIA';
  if (/^(alta|urgente|urgencia|inmediata|emergencia|critica|high|p0|p1)$/.test(t)) return 'ALTA';
  if (/^(baja|low|p3|p4)$/.test(t)) return 'BAJA';
  if (/^(media|normal|moderada|medium|p2)$/.test(t)) return 'MEDIA';
  // Texto libre: «prioridad alta», «muy urgente», «baja prioridad».
  if (/(alta|urgen|critic|emergenc)/.test(t)) return 'ALTA';
  if (/(baja|low)/.test(t)) return 'BAJA';
  return 'MEDIA';
}

/** ¿El estatus dice que ya arrancó aunque no haya foto de entrada? */
export function estatusArrancado(estatus?: string | null): boolean {
  return /proceso|validar/i.test(estatus ?? '');
}

/** ¿El estatus dice que ya se cerró? */
export function estatusCerrado(estatus?: string | null): boolean {
  const s = sinAcentos(estatus ?? '');
  return (
    s.includes('finalizada') ||
    s.includes('completada') ||
    s.includes('cancelada') ||
    s.includes('aprobada')
  );
}

export type FuentesDeTiempo = {
  /** Sección B (`ActivityAssignee.inicioRealAt`), si ya existe la columna. */
  inicioRealAt?: Date | null;
  finRealAt?: Date | null;
  /** Lo que ya existe hoy: las fotos de evidencia. */
  entryPhotoUploadedAt?: Date | null;
  exitPhotoUploadedAt?: Date | null;
  evidenciaCompletedAt?: Date | null;
  /** Último recurso, solo si la actividad está cerrada. */
  fechaFinalizacion?: Date | null;
  cerrada?: boolean;
};

export type TiemposReales = { inicio: Date | null; fin: Date | null };

/**
 * Hora real de inicio y fin de una persona en una actividad.
 *
 * La programada (`fechaInicio`) no sirve: es la hora a la que la citaron, no a la
 * que llegó. Mientras la sección B no aterrice, la verdad es la foto de entrada.
 */
export function tiemposReales(f: FuentesDeTiempo): TiemposReales {
  const inicio = f.inicioRealAt ?? f.entryPhotoUploadedAt ?? null;
  const finBruto =
    f.finRealAt ??
    f.exitPhotoUploadedAt ??
    f.evidenciaCompletedAt ??
    (f.cerrada ? (f.fechaFinalizacion ?? null) : null);
  // Un fin anterior al inicio es basura de datos viejos: se ignora.
  const fin = inicio && finBruto && finBruto.getTime() < inicio.getTime() ? null : finBruto;
  return { inicio, fin };
}

/** `horasPlan` (decimal) → minutos enteros. */
export function minutosPlanDeHoras(horasPlan?: number | null): number | null {
  if (horasPlan == null || !Number.isFinite(horasPlan) || horasPlan <= 0) return null;
  return Math.round(horasPlan * 60);
}

/** Minutos entre dos instantes; si sigue abierta, hasta `ahora`. Sin inicio, null. */
export function minutosEntre(inicio: Date | null, fin: Date | null, ahora: Date): number | null {
  if (!inicio) return null;
  const hasta = fin ?? ahora;
  return Math.max(0, Math.floor((hasta.getTime() - inicio.getTime()) / 60_000));
}

export type ActividadPizarra = {
  prioridad?: string | null;
  estatus?: string | null;
  fechaMaxima?: Date | null;
  /** Ya entregó (evidencia completa) o la actividad se cerró. */
  terminada?: boolean;
  cancelada?: boolean;
  /** Sección B: la rechazó con motivo. */
  rechazadaAt?: Date | null;
  /** Salió del equipo (`retiradoAt`): cuenta en el historial, no en los KPI. */
  retirado?: boolean;
  minutosPlan?: number | null;
  inicio?: Date | null;
  fin?: Date | null;
  /** Hora a la que la citaron. No es el inicio real. */
  fechaInicio?: Date | null;
  fechaEntregaEsperada?: Date | null;
  /**
   * Periodo de varios días (`actividad-periodo.ts`): vence al terminar su último día,
   * no a la hora citada; antes de empezar no se le exige nada, y el tiempo estimado
   * (que es de una jornada) no la marca excedida mientras corre.
   */
  periodo?: Periodo | null;
  /**
   * Sesiones de trabajo de esta persona en la actividad. Con ellas el tiempo real es su
   * suma (cada una con tope de 12 h y sin pasar de su día); sin ellas se mide el intervalo
   * de antes, también con tope: ninguna actividad dura más de 12 horas.
   */
  sesiones?: SesionTrabajo[] | null;
};

export type ActividadCalculada = {
  prioridad: Prioridad;
  semaforo: Semaforo;
  minutosPlan: number | null;
  minutosReales: number | null;
  excedida: boolean;
  vencida: boolean;
  /** Minutos de atraso cuando el semáforo es rojo. */
  minutosAtraso: number | null;
  /** Rojo: por qué (no la ha iniciado, pasó su límite o pasó su tiempo planeado). */
  motivoAtraso: MotivoSemaforo | null;
  minutosParaVencer: number | null;
  iniciada: boolean;
  terminada: boolean;
  cancelada: boolean;
  rechazada: boolean;
  retirado: boolean;
  /** Solo cuando terminó: ¿cerró dentro de su fecha máxima? Sin fecha máxima cuenta a tiempo. */
  aTiempo: boolean | null;
  /** Tramos en que de verdad corrió su reloj (para cruzarlos con la jornada). */
  tramos?: TramoMs[];
};

/**
 * Semáforo por el reloj (`semaforo-actividad.ts`): rojo solo si ya se atrasó,
 * naranja si faltan pocos minutos, verde si va en tiempo. «Vencida» (para el
 * KPI de a tiempo) se mide contra el fin real cuando ya terminó, no contra ahora.
 */
export function calculaActividad(act: ActividadPizarra, ahora: Date): ActividadCalculada {
  const prioridad = normalizaPrioridad(act.prioridad);
  const inicio = act.inicio ?? null;
  const fin = act.fin ?? null;
  const terminada = Boolean(act.terminada);
  const cancelada = Boolean(act.cancelada);
  const minutosPlan = act.minutosPlan ?? null;
  // Antes era `fin − inicio` de corrido: una actividad de varios días sumaba noches enteras.
  const fuente = { inicio, fin, sesiones: act.sesiones ?? null, ahora };
  const minutosReales = minutosTrabajados(fuente);
  const iniciada = inicio != null || estatusArrancado(act.estatus) || terminada;
  const referencia = terminada ? (fin ?? ahora) : ahora;
  const periodo = act.periodo ?? null;
  // El mismo límite que pinta el semáforo. Con la fecha máxima cruda, lo que el formulario
  // guardó igual a la hora de inicio salía «vencido» aunque se entregara ese mismo día.
  const limite = limiteDeEntrega({
    fechaInicio: act.fechaInicio ?? null,
    fechaMaxima: act.fechaMaxima ?? null,
    fechaEntregaEsperada: act.fechaEntregaEsperada ?? null,
    periodo,
  });
  const vencida = limite != null && referencia.getTime() > limite.getTime();
  const variosDias = esMultiDia(periodo);
  const excedida =
    !variosDias && minutosPlan != null && minutosReales != null && minutosReales > minutosPlan;
  const luz = evaluarSemaforo({
    fechaInicio: act.fechaInicio ?? null,
    fechaMaxima: act.fechaMaxima ?? null,
    fechaEntregaEsperada: act.fechaEntregaEsperada ?? null,
    inicioRealAt: inicio,
    finRealAt: fin,
    estatus: act.estatus,
    cerrada: terminada,
    cancelada,
    periodo,
    minutosPlan,
    minutosReales,
    ahora,
  });

  return {
    prioridad,
    semaforo: luz.semaforo,
    minutosAtraso: luz.minutosAtraso,
    motivoAtraso: luz.semaforo === 'rojo' ? luz.motivo : null,
    minutosParaVencer: luz.minutosParaVencer,
    minutosPlan,
    minutosReales,
    excedida,
    vencida,
    iniciada,
    terminada,
    cancelada,
    rechazada: act.rechazadaAt != null,
    retirado: Boolean(act.retirado),
    aTiempo: terminada ? !vencida : null,
    tramos: tramosTrabajados(fuente),
  };
}

export type Jornada = { entrada: Date; salida: Date | null };
export type Comida = { inicio: Date; fin: Date | null };

/**
 * Minutos asistidos: entrada → salida **real**, descontando la comida.
 *
 * El bug viejo contaba de la entrada hasta ahora aunque la persona ya se hubiera
 * ido: a las 22:00 todo el mundo llevaba «13 h». Sin salida se topa en 9 h, que es
 * lo mismo que hace el cierre automático de la sección A.
 */
export function minutosAsistidos(
  jornadas: Jornada[],
  comidas: Comida[],
  ahora: Date,
): number | null {
  if (!jornadas.length) return null;
  let total = 0;
  for (const j of jornadas) {
    if (!j.entrada) continue;
    const tope = Math.min(ahora.getTime(), j.entrada.getTime() + MINUTOS_MAX_JORNADA * 60_000);
    const finMs = j.salida ? j.salida.getTime() : tope;
    if (finMs <= j.entrada.getTime()) continue;
    const brutos = Math.floor((finMs - j.entrada.getTime()) / 60_000);
    let comido = 0;
    for (const c of comidas) {
      if (!c.inicio) continue;
      const cFin = (c.fin ?? new Date(c.inicio.getTime() + MINUTOS_COMIDA_POR_OMISION * 60_000))
        .getTime();
      const desde = Math.max(c.inicio.getTime(), j.entrada.getTime());
      const hasta = Math.min(Math.min(cFin, ahora.getTime()), finMs);
      if (hasta > desde) comido += Math.floor((hasta - desde) / 60_000);
    }
    total += Math.max(0, brutos - comido);
  }
  return total;
}

/**
 * Horas laboradas como tramos: cada jornada (entrada → salida real, o el tope de 9 h si
 * no checó salida) menos su comida. Mismas reglas que `minutosAsistidos`; sirve para
 * saber qué parte del tiempo en actividades cayó dentro de la jornada.
 */
export function ventanasLaboradas(jornadas: Jornada[], comidas: Comida[], ahora: Date): TramoMs[] {
  const out: TramoMs[] = [];
  for (const j of jornadas) {
    if (!j.entrada) continue;
    const inicio = j.entrada.getTime();
    const tope = Math.min(ahora.getTime(), inicio + MINUTOS_MAX_JORNADA * 60_000);
    const fin = j.salida ? j.salida.getTime() : tope;
    if (fin <= inicio) continue;
    let cursor = inicio;
    const cortes = unirTramos(
      comidas
        .filter((c) => c.inicio)
        .map((c) => ({
          inicio: Math.max(c.inicio.getTime(), inicio),
          fin: Math.min(
            (c.fin ?? new Date(c.inicio.getTime() + MINUTOS_COMIDA_POR_OMISION * 60_000)).getTime(),
            ahora.getTime(),
            fin,
          ),
        })),
    );
    for (const c of cortes) {
      if (c.inicio > cursor) out.push({ inicio: cursor, fin: c.inicio });
      cursor = Math.max(cursor, c.fin);
    }
    if (cursor < fin) out.push({ inicio: cursor, fin });
  }
  return unirTramos(out);
}

export type KpisPersona = {
  asignadas: number;
  cerradas: number;
  aTiempo: number;
  aTiempoPct: number | null;
  minutosPlan: number;
  minutosReales: number;
  eficienciaPct: number | null;
  minutosAsistidos: number | null;
  minutosEnActividad: number;
  productividadPct: number | null;
  rechazadas: number;
};

function pct(numerador: number, denominador: number): number | null {
  if (!denominador) return null;
  return Math.round((numerador / denominador) * 100);
}

/**
 * KPI de una persona en el rango pedido.
 *
 * Las canceladas y aquellas de las que la retiraron no se le cuentan (salen en su
 * historial, no en su calificación); un rechazo sí, porque el contrato lo pide aparte.
 */
export function kpisDePersona(
  actividades: ActividadCalculada[],
  minutos: number | null,
  /**
   * Horas laboradas del rango (`ventanasLaboradas`). Con ellas, las horas productivas son
   * solo el tiempo en actividades que cayó **dentro** de la jornada (entre su entrada y
   * su salida), y dos actividades a la vez no cuentan doble. Sin ellas se suma el tiempo
   * de cada actividad, como antes.
   */
  ventanas?: TramoMs[] | null,
): KpisPersona {
  const propias = actividades.filter((a) => !a.cancelada && !a.retirado);
  const cerradas = propias.filter((a) => a.terminada);
  const aTiempo = cerradas.filter((a) => a.aTiempo === true).length;
  const conPlan = cerradas.filter(
    (a) => a.minutosPlan != null && a.minutosReales != null && a.minutosReales > 0,
  );
  const planCerradas = conPlan.reduce((s, a) => s + (a.minutosPlan ?? 0), 0);
  const realCerradas = conPlan.reduce((s, a) => s + (a.minutosReales ?? 0), 0);
  const minutosPlan = propias.reduce((s, a) => s + (a.minutosPlan ?? 0), 0);
  const minutosReales = propias.reduce((s, a) => s + (a.minutosReales ?? 0), 0);
  const dentroDeJornada = ventanas
    ? minutosDeTramosMs(cruzarTramos(propias.flatMap((a) => a.tramos ?? []), ventanas))
    : minutosReales;
  // Las dos cuentas redondean por separado: lo productivo nunca rebasa lo asistido.
  const minutosEnActividad =
    ventanas && minutos != null ? Math.min(dentroDeJornada, minutos) : dentroDeJornada;
  return {
    asignadas: propias.length,
    cerradas: cerradas.length,
    aTiempo,
    aTiempoPct: pct(aTiempo, cerradas.length),
    minutosPlan,
    minutosReales,
    eficienciaPct: realCerradas > 0 ? pct(planCerradas, realCerradas) : null,
    minutosAsistidos: minutos,
    minutosEnActividad,
    productividadPct: minutos && minutos > 0 ? pct(minutosEnActividad, minutos) : null,
    rechazadas: actividades.filter((a) => a.rechazada && !a.cancelada).length,
  };
}

/** ¿Alguna de estas fechas cae dentro del rango? (rango inclusivo en ambos extremos) */
export function enRango(
  fechas: Array<Date | null | undefined>,
  desde: Date,
  hasta: Date,
): boolean {
  return fechas.some(
    (f) => f != null && f.getTime() >= desde.getTime() && f.getTime() <= hasta.getTime(),
  );
}
