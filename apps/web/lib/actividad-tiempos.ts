/**
 * Prioridad, semáforo y tiempos de una actividad en la web.
 * Espejo de `apps/api/src/activities/actividad-tiempos.ts` (contrato del 18-09).
 */

export type Prioridad = "ALTA" | "MEDIA" | "BAJA";
export type Semaforo = "rojo" | "amarillo" | "verde";
export type Aceptacion = "PENDIENTE" | "ACEPTADA" | "RECHAZADA";

const ALTA = new Set(["alta", "urgente", "critica", "crítica", "p0", "p1", "high", "urgent"]);
const BAJA = new Set(["baja", "low", "p3", "p4"]);

/** Acepta los textos viejos («Alta», «urgente», «P1»); lo desconocido queda en MEDIA. */
export function normalizarPrioridad(valor?: string | null): Prioridad {
  const v = String(valor ?? "").trim().toLowerCase();
  if (ALTA.has(v)) return "ALTA";
  if (BAJA.has(v)) return "BAJA";
  return "MEDIA";
}

export const PRIORIDAD_UI: Record<Prioridad, { label: string; color: string; hint: string }> = {
  ALTA: { label: "Alta", color: "#dc2626", hint: "Urgente" },
  MEDIA: { label: "Media", color: "#d97706", hint: "Esta semana" },
  BAJA: { label: "Baja", color: "#16a34a", hint: "Puede esperar" },
};

/**
 * Umbrales del semáforo (espejo de `apps/api/src/activities/semaforo-actividad.ts`).
 * Naranja solo cuando faltan estos minutos o menos para el inicio o el tope.
 * Rojo cuando ese instante ya pasó y la actividad sigue sin iniciar o sin terminar.
 */
export const UMBRAL_POR_VENCER_MIN = 30;

export const SEMAFORO_UI: Record<Semaforo, { label: string; color: string }> = {
  rojo: { label: "Atrasada", color: "#dc2626" },
  amarillo: { label: "Por vencer", color: "#d97706" },
  verde: { label: "En tiempo", color: "#16a34a" },
};

export type MotivoSemaforo = "inicio" | "tope";

export type SemaforoTiempo = {
  semaforo: Semaforo;
  minutosAtraso: number | null;
  minutosParaVencer: number | null;
  motivo: MotivoSemaforo | null;
};

const EN_TIEMPO: SemaforoTiempo = {
  semaforo: "verde",
  minutosAtraso: null,
  minutosParaVencer: null,
  motivo: null,
};

/**
 * El mismo reloj que la API, para listados que traen fechas y no el semáforo ya calculado.
 * Con periodo, `programada` no se pinta tarde y `vencida` es el tope pasado.
 */
export function evaluarSemaforoActividad(params: {
  fechaInicio?: string | null;
  fechaMaxima?: string | null;
  fechaEntregaEsperada?: string | null;
  inicioRealAt?: string | null;
  finRealAt?: string | null;
  estatus?: string | null;
  cerrada?: boolean;
  /** `programada` | `en_curso` | `vencida` | `cerrada`, si la API ya lo mandó. */
  periodoEstado?: string | null;
  ahora?: Date;
}): SemaforoTiempo {
  const ahora = params.ahora ?? new Date();
  const cerrada =
    Boolean(params.cerrada) ||
    Boolean(aFecha(params.finRealAt)) ||
    /finalizada|completada|cancelada|aprobada/i.test(params.estatus ?? "");
  if (cerrada || params.periodoEstado === "programada" || params.periodoEstado === "cerrada") return EN_TIEMPO;

  const iniciada = Boolean(aFecha(params.inicioRealAt)) || /proceso|validar/i.test(params.estatus ?? "");
  const inicio = aFecha(params.fechaInicio);
  const topeExplicito = masTemprana(aFecha(params.fechaMaxima), aFecha(params.fechaEntregaEsperada));
  const tope = params.periodoEstado === "en_curso" && topeExplicito && topeExplicito.getTime() < ahora.getTime()
    ? null
    : topeExplicito;
  const topeVencido = params.periodoEstado === "vencida" ? (topeExplicito ?? ahora) : tope;

  const atrasos: Array<{ motivo: MotivoSemaforo; minutos: number }> = [];
  if (!iniciada && inicio && inicio.getTime() < ahora.getTime()) {
    atrasos.push({ motivo: "inicio", minutos: minutosEntre(inicio, ahora) });
  }
  if (topeVencido && topeVencido.getTime() < ahora.getTime()) {
    atrasos.push({ motivo: "tope", minutos: minutosEntre(topeVencido, ahora) });
  }
  if (atrasos.length) {
    const peor = atrasos.reduce((a, b) => (b.minutos > a.minutos ? b : a));
    return { semaforo: "rojo", minutosAtraso: peor.minutos, minutosParaVencer: null, motivo: peor.motivo };
  }

  const porVencer: Array<{ motivo: MotivoSemaforo; minutos: number }> = [];
  if (!iniciada && inicio && inicio.getTime() >= ahora.getTime()) {
    const falta = minutosEntre(ahora, inicio);
    if (falta <= UMBRAL_POR_VENCER_MIN) porVencer.push({ motivo: "inicio", minutos: falta });
  }
  if (tope && tope.getTime() >= ahora.getTime()) {
    const falta = minutosEntre(ahora, tope);
    if (falta <= UMBRAL_POR_VENCER_MIN) porVencer.push({ motivo: "tope", minutos: falta });
  }
  if (porVencer.length) {
    const pronto = porVencer.reduce((a, b) => (b.minutos < a.minutos ? b : a));
    return { semaforo: "amarillo", minutosAtraso: null, minutosParaVencer: pronto.minutos, motivo: pronto.motivo };
  }
  return EN_TIEMPO;
}

/** Chip: «Atrasada · 2 h», «Por vencer · 12 min», «Atención · 8 min», «En tiempo». */
export function textoChipSemaforo(
  semaforo: Semaforo,
  minutosAtraso?: number | null,
  minutosParaVencer?: number | null,
  motivo?: MotivoSemaforo | null,
): string {
  if (semaforo === "rojo") {
    const t = formatoMinutos(minutosAtraso);
    return t ? `Atrasada · ${t}` : "Atrasada";
  }
  if (semaforo === "amarillo") {
    const t = formatoMinutos(minutosParaVencer);
    const base = motivo === "inicio" ? "Atención" : "Por vencer";
    return t ? `${base} · ${t}` : base;
  }
  return "En tiempo";
}

/**
 * Borde izquierdo del recuadro. Rojo atrasada, naranja por vencer.
 * En tiempo y ya iniciada: verde. En tiempo y sin iniciar: azul.
 */
export function colorBordeActividad(semaforo?: Semaforo | null, iniciada = true): string {
  if (semaforo === "rojo") return "#dc2626";
  if (semaforo === "amarillo") return "#d97706";
  if (!iniciada) return "#2563eb";
  return "#16a34a";
}

function aFecha(valor?: string | null): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function masTemprana(a: Date | null, b: Date | null): Date | null {
  if (a && b) return a.getTime() <= b.getTime() ? a : b;
  return a ?? b;
}

function minutosEntre(desde: Date, hasta: Date): number {
  return Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 60_000));
}

/** «2 h 35 min», «45 min»; null cuando no hay nada que mostrar. */
export function formatoMinutos(min?: number | null): string | null {
  if (min == null || !Number.isFinite(min) || min < 0) return null;
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** «Plan 2 h · real 2 h 35 min» para la tarjeta y el detalle. */
export function textoPlanVsReal(minutosPlan?: number | null, minutosReales?: number | null): string | null {
  const plan = formatoMinutos(minutosPlan);
  const real = formatoMinutos(minutosReales);
  if (!plan && !real) return null;
  if (plan && real) return `Plan ${plan} · real ${real}`;
  if (plan) return `Plan ${plan}`;
  return `Real ${real}`;
}

/** La única acción de quien recibe una actividad (regla del dueño, 18-09). */
export const ACCION_INICIAR = "Iniciar actividad";

/**
 * ¿Se pinta «Iniciar actividad»? Quien recibe una actividad no la acepta ni la
 * rechaza, únicamente la inicia: se ofrece mientras no tenga hora real de inicio.
 * No a quien solo reparte un despacho (no la ejecuta) ni a lo ya cerrado. Sin
 * `aceptacion` la API es anterior al contrato y no se pinta nada.
 */
export function puedeIniciar(a: {
  aceptacion?: Aceptacion | null;
  inicioRealAt?: string | null;
  despachador?: boolean | null;
  estatus?: string | null;
}): boolean {
  if (!a.aceptacion) return false;
  if (a.despachador) return false;
  if (/finalizada|completada|cancelada|aprobada/i.test(a.estatus ?? "")) return false;
  return !a.inicioRealAt;
}
