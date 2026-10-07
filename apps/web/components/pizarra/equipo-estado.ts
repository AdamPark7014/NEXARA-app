/**
 * Actividades · «Mi equipo»: el estado de una persona reducido a lo que se lee
 * de lejos.
 *
 * El lenguaje visual que aprobó Adam tiene TRES aros de color, no cinco estados:
 * verde trabajando, ámbar con retraso o sin actividad, azul libre. Aquí vive esa
 * reducción, el resumen de arriba, el panel de quién pide atención (atrasados,
 * sin nada asignado, sin entrada) y los renglones de texto de la tarjeta, para
 * que la pantalla, el centro operativo y las pruebas digan lo mismo.
 */
import {
  CLAUDIA_TESTER_EMAIL,
  PLATFORM_OWNER_EMAIL,
  normalizePlatformEmail,
} from "@/lib/platform-accounts";
import {
  STATUS_LABELS,
  fechaMx,
  formatMinutes,
  type BoardLateReason,
  type BoardUserStatus,
  type TeamBoardUser,
  type WorkflowPipeline,
} from "@/lib/team-board-api";
import { chargeLabel } from "@/lib/activity-labels";

/** El aro de la foto. Es el estado: se reconoce sin leer una sola palabra. */
export type EstadoAro = "trabajando" | "retraso" | "libre";

/**
 * Cinco estados de la API → tres aros. «Sin actividad» comparte el ámbar con
 * «atrasado» porque las dos cosas piden lo mismo del encargado: ir a ver.
 * El renglón de texto de la tarjeta sigue diciendo cuál de las dos es.
 */
export const ARO_DE_ESTADO: Record<BoardUserStatus, EstadoAro> = {
  activo: "trabajando",
  atrasado: "retraso",
  sin_actividad: "retraso",
  inactivo: "retraso",
  libre: "libre",
};

export const ARO_LABEL: Record<EstadoAro, string> = {
  trabajando: "Trabajando",
  retraso: "Con retraso",
  libre: "Libres",
};

export type ResumenEquipo = {
  trabajando: number;
  retraso: number;
  libres: number;
  total: number;
  /** Desglose del ámbar, para el hint y el `title` de la celda. */
  atrasados: number;
  /** Checó hoy, sigue en jornada y no tiene nada abierto. */
  sinNada: number;
  /** Hoy no ha checado entrada. */
  sinEntrada: number;
  /** Ya checó su salida y no tiene nada abierto. */
  yaSalieron: number;
  /** `sinNada + sinEntrada + yaSalieron`: se queda por compatibilidad. */
  sinActividad: number;
};

/** Por qué alguien no tiene nada abierto: está en jornada, no ha llegado o ya se fue. */
export type MotivoSinActividad = "sinNada" | "sinEntrada" | "yaSalio";

/**
 * Separa a quien no tiene nada abierto (status «sin_actividad» / «inactivo») por su
 * jornada de hoy; `null` para los demás estados. Con la API vieja no viene
 * `entradaHoyAt` y no hay cómo separarlos: todo cuenta como «sin nada», como antes.
 */
export function motivoSinActividad(u: TeamBoardUser): MotivoSinActividad | null {
  if (u.status !== "sin_actividad" && u.status !== "inactivo") return null;
  if (u.entradaHoyAt === undefined) return "sinNada";
  if (!u.entradaHoyAt) return "sinEntrada";
  if (u.salidaHoyAt) return "yaSalio";
  return "sinNada";
}

export function resumenEquipo(users: readonly TeamBoardUser[]): ResumenEquipo {
  const r: ResumenEquipo = {
    trabajando: 0,
    retraso: 0,
    libres: 0,
    total: users.length,
    atrasados: 0,
    sinNada: 0,
    sinEntrada: 0,
    yaSalieron: 0,
    sinActividad: 0,
  };
  for (const u of users) {
    const aro = ARO_DE_ESTADO[u.status] ?? "retraso";
    if (aro === "trabajando") r.trabajando += 1;
    else if (aro === "libre") r.libres += 1;
    else r.retraso += 1;
    if (u.status === "atrasado") r.atrasados += 1;
    const motivo = motivoSinActividad(u);
    if (motivo) r.sinActividad += 1;
    if (motivo === "sinNada") r.sinNada += 1;
    else if (motivo === "sinEntrada") r.sinEntrada += 1;
    else if (motivo === "yaSalio") r.yaSalieron += 1;
  }
  return r;
}

/**
 * Desglose del ámbar en una línea: «2 atrasados · 9 sin nada asignado · 3 sin entrada».
 * Los ceros no se dicen; si todo es cero, lo dice en positivo.
 */
export function desgloseRetraso(r: ResumenEquipo): string {
  const partes: string[] = [];
  if (r.atrasados > 0) partes.push(`${r.atrasados} ${r.atrasados === 1 ? "atrasado" : "atrasados"}`);
  if (r.sinNada > 0) partes.push(`${r.sinNada} sin nada asignado`);
  if (r.sinEntrada > 0) partes.push(`${r.sinEntrada} sin entrada`);
  if (r.yaSalieron > 0) partes.push(`${r.yaSalieron} ${r.yaSalieron === 1 ? "ya salió" : "ya salieron"}`);
  return partes.length > 0 ? partes.join(" · ") : "nadie atrasado ni sin nada asignado";
}

/* ─── Horas y fechas en hora de México ─────────────────────────────────── */

const ZONA_MX = "America/Mexico_City";

function fecha(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «13:39»: hora de México, 24 h. */
function hora(valor: string | Date): string {
  const d = typeof valor === "string" ? fecha(valor) : valor;
  if (!d) return "";
  return d.toLocaleTimeString("es-MX", {
    timeZone: ZONA_MX,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** Minutos enteros de `iso` a `ahora` (nunca negativos); `null` sin fecha válida. */
function minutosDesde(iso: string | null | undefined, ahora: number): number | null {
  const d = fecha(iso);
  if (!d) return null;
  return Math.max(0, Math.floor((ahora - d.getTime()) / 60_000));
}

/** Días de calendario (en México) entre dos instantes: hoy 0, ayer 1… */
function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((Date.parse(fechaMx(hasta)) - Date.parse(fechaMx(desde))) / 86_400_000);
}

const FECHA_CORTA = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_MX,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Cuándo pasó algo, como se dice: «hoy 13:39», «ayer 18:11» o «lun 5 oct 18:11»
 * (con el año solo si no es el de hoy). Hora de México, 24 h.
 */
export function cuandoMx(iso: string | null | undefined, ahora: number = Date.now()): string {
  const d = fecha(iso);
  if (!d) return "";
  const dias = diasEntre(d, new Date(ahora));
  const h = hora(d);
  if (dias === 0) return `hoy ${h}`;
  if (dias === 1) return `ayer ${h}`;
  const partes = FECHA_CORTA.formatToParts(d);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    (partes.find((p) => p.type === tipo)?.value ?? "").replace(/\./g, "");
  const anio = valor("year");
  const otroAnio = anio !== fechaMx(new Date(ahora)).slice(0, 4);
  return `${valor("weekday")} ${valor("day")} ${valor("month")}${otroAnio ? ` ${anio}` : ""} ${h}`;
}

/** «hace 2 h 15 min»; con menos de un minuto, «hace un momento». */
function hace(minutos: number): string {
  return minutos < 1 ? "hace un momento" : `hace ${formatMinutes(minutos)}`;
}

/** Días de calendario desde `iso`: «hoy», «hace 1 día», «hace 3 días». */
function haceDias(iso: string | null | undefined, ahora: number): string | null {
  const d = fecha(iso);
  if (!d) return null;
  const dias = diasEntre(d, new Date(ahora));
  if (dias <= 0) return "hoy";
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

function recortar(texto: string, max = 40): string {
  const t = (texto || "").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/* ─── Última actividad terminada ───────────────────────────────────────── */

/** Sin límite cuenta a tiempo (lo mismo que los KPI de entregas). */
function comoEntrego(lateMinutes: number | null | undefined): string {
  return lateMinutes && lateMinutes > 0 ? `con ${formatMinutes(lateMinutes)} de atraso` : "a tiempo";
}

/**
 * «Última: AN-0091 · Depurar base… · terminó ayer 18:11, a tiempo» (o «con 40 min de
 * atraso»). Sin nada terminado: «Sin actividades terminadas».
 */
export function ultimaActividad(u: TeamBoardUser, ahora: number = Date.now()): string {
  const f = u.lastFinished;
  if (!f) return "Sin actividades terminadas";
  const que = [f.anNumber, recortar(f.titulo)].filter(Boolean).join(" · ");
  const cuando = cuandoMx(f.finishedAt, ahora);
  return `Última: ${que} · terminó ${cuando ? `${cuando}, ` : ""}${comoEntrego(f.lateMinutes)}`;
}

/** Versión corta para la tarjeta: «Última: AN-0091 · ayer 18:11». `null` sin nada terminado. */
export function ultimaActividadCorta(u: TeamBoardUser, ahora: number = Date.now()): string | null {
  const f = u.lastFinished;
  if (!f) return null;
  const que = f.anNumber || recortar(f.titulo, 24);
  return [`Última: ${que}`, cuandoMx(f.finishedAt, ahora)].filter(Boolean).join(" · ");
}

/* ─── Panel «para atender»: atrasados, sin nada asignado y sin entrada ─── */

/** El motivo del atraso, en palabras. */
export const MOTIVO_ATRASO: Record<BoardLateReason, string> = {
  inicio: "no la ha iniciado",
  tope: "pasó su hora límite",
  plan: "pasó su tiempo planeado",
};

export type AtrasadoEnAtencion = {
  persona: TeamBoardUser;
  folio: string | null;
  titulo: string | null;
  minutosAtraso: number | null;
  /** «no la ha iniciado», «pasó su hora límite»… `null` si la API no dice por qué. */
  motivo: string | null;
  /** «Atrasada · 2 h 15 min · no la ha iniciado». */
  detalle: string;
};

export type SinNadaEnAtencion = {
  persona: TeamBoardUser;
  /** Minutos sin nada abierto; `null` si la API no dice desde cuándo (API vieja). */
  minutosSinNada: number | null;
  /** Lo dejaron sin nada desde que llegó (`idleSinceAt === entradaHoyAt`). */
  desdeQueEntro: boolean;
  /** «Entró 10:05»; `null` sin entrada conocida. */
  entrada: string | null;
  /** «sin nada desde hace 2 h 15 min» o «sin nada desde que entró (hace 2 h 15 min)». */
  sinNadaDesde: string | null;
  /** Ver `ultimaActividad`. */
  ultima: string;
};

export type SinEntradaEnAtencion = {
  persona: TeamBoardUser;
  /** Ver `ultimaActividad`. */
  ultima: string;
  /** Desde su última actividad terminada: «hace 3 días». `null` si nunca terminó nada. */
  haceCuanto: string | null;
};

export type AtencionDelEquipo = {
  /** Más atraso primero. */
  atrasados: AtrasadoEnAtencion[];
  /** Más tiempo sin nada primero. */
  sinNada: SinNadaEnAtencion[];
  /** Lo último que terminaron, de lo más viejo a lo más reciente; sin nada terminado al final. */
  sinEntrada: SinEntradaEnAtencion[];
};

/** Mayor primero; sin dato, al final. */
function mayorPrimero(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

const porNombre = (a: { persona: TeamBoardUser }, b: { persona: TeamBoardUser }) =>
  a.persona.nombre.localeCompare(b.persona.nombre, "es");

/**
 * La actividad por la que va tarde. La API manda la que está haciendo en
 * `currentActivity` (y su atraso en `currentLateMinutes`); si solo vienen las
 * abiertas, la más atrasada de ellas.
 */
function atrasadoEnAtencion(u: TeamBoardUser): AtrasadoEnAtencion {
  const abiertas = u.openActivities ?? [];
  let folio: string | null = null;
  let titulo: string | null = null;
  let minutos: number | null = u.currentLateMinutes ?? null;
  if (u.currentActivity) {
    folio = u.currentActivity.anNumber || null;
    titulo = u.currentActivity.titulo || null;
    const misma = abiertas.find((a) => a.id === u.currentActivity?.id);
    if (minutos == null) minutos = misma?.minutosAtraso ?? null;
  } else {
    const tarde =
      [...abiertas]
        .filter((a) => a.atrasada)
        .sort((a, b) => mayorPrimero(a.minutosAtraso ?? null, b.minutosAtraso ?? null))[0] ?? abiertas[0];
    if (tarde) {
      folio = tarde.anNumber || null;
      titulo = tarde.titulo || null;
      if (minutos == null) minutos = tarde.minutosAtraso ?? null;
    }
  }
  const motivo = u.currentLateReason ? (MOTIVO_ATRASO[u.currentLateReason] ?? null) : null;
  const detalle = [minutos != null && minutos > 0 ? `Atrasada · ${formatMinutes(minutos)}` : "Atrasada", motivo]
    .filter(Boolean)
    .join(" · ");
  return { persona: u, folio, titulo, minutosAtraso: minutos, motivo, detalle };
}

function sinNadaEnAtencion(u: TeamBoardUser, ahora: number): SinNadaEnAtencion {
  const entrada = fecha(u.entradaHoyAt);
  const idle = fecha(u.idleSinceAt);
  const minutosSinNada = minutosDesde(u.idleSinceAt, ahora);
  const desdeQueEntro = Boolean(idle && entrada && idle.getTime() === entrada.getTime());
  let sinNadaDesde: string | null = null;
  if (minutosSinNada != null) {
    sinNadaDesde = desdeQueEntro
      ? `sin nada desde que entró (${hace(minutosSinNada)})`
      : `sin nada desde ${hace(minutosSinNada)}`;
  }
  return {
    persona: u,
    minutosSinNada,
    desdeQueEntro,
    entrada: entrada ? `Entró ${hora(entrada)}` : null,
    sinNadaDesde,
    ultima: ultimaActividad(u, ahora),
  };
}

/**
 * Lo que el encargado tiene que ir a ver, en tres listas: quién va tarde y con
 * qué, a quién dejaron sin nada (y desde cuándo, y qué fue lo último que hizo) y
 * quién no ha checado. Quien ya salió y los libres no piden nada.
 */
export function atencionEquipo(users: readonly TeamBoardUser[], ahora: number = Date.now()): AtencionDelEquipo {
  const atrasados: AtrasadoEnAtencion[] = [];
  const sinNada: SinNadaEnAtencion[] = [];
  const sinEntrada: SinEntradaEnAtencion[] = [];
  for (const u of users) {
    if (u.status === "atrasado") {
      atrasados.push(atrasadoEnAtencion(u));
      continue;
    }
    const motivo = motivoSinActividad(u);
    if (motivo === "sinNada") sinNada.push(sinNadaEnAtencion(u, ahora));
    else if (motivo === "sinEntrada") {
      sinEntrada.push({
        persona: u,
        ultima: ultimaActividad(u, ahora),
        haceCuanto: haceDias(u.lastFinished?.finishedAt, ahora),
      });
    }
  }
  atrasados.sort((a, b) => mayorPrimero(a.minutosAtraso, b.minutosAtraso) || porNombre(a, b));
  sinNada.sort((a, b) => mayorPrimero(a.minutosSinNada, b.minutosSinNada) || porNombre(a, b));
  const terminoHace = (s: SinEntradaEnAtencion) => {
    const d = fecha(s.persona.lastFinished?.finishedAt);
    return d ? ahora - d.getTime() : null;
  };
  sinEntrada.sort((a, b) => mayorPrimero(terminoHace(a), terminoHace(b)) || porNombre(a, b));
  return { atrasados, sinNada, sinEntrada };
}

/**
 * Centro operativo: la pizarra se queda puesta en una pantalla de la oficina, y
 * ahí solo debe verse a quien ejecuta trabajo. Christian (dueño de la
 * plataforma) y Claudia (tester) no son operación.
 *
 * Se excluyen POR CORREO y nunca por puesto ni por rol: el día que a cualquiera
 * de los dos le cambien el cargo en RH —o le den permisos de encargado para
 * probar algo— volverían a aparecer en la pantalla de la pared. El correo no
 * cambia.
 */
export const CENTRO_OPERATIVO_EMAILS_EXCLUIDOS: readonly string[] = [
  PLATFORM_OWNER_EMAIL, // gerencia@nexara.com.mx — Christian, dueño/CEO
  CLAUDIA_TESTER_EMAIL, // claudia.bernal@nexara.com.mx — tester, no es empleada
];

const FUERA_DEL_CENTRO = new Set(CENTRO_OPERATIVO_EMAILS_EXCLUIDOS.map(normalizePlatformEmail));

export function esExcluidoDelCentroOperativo(email?: string | null): boolean {
  return FUERA_DEL_CENTRO.has(normalizePlatformEmail(email));
}

export function filtrarCentroOperativo<T extends { email?: string | null }>(
  users: readonly T[],
): T[] {
  return users.filter((u) => !esExcluidoDelCentroOperativo(u.email));
}

export type LineaActividadTarjeta = {
  id: number;
  /** Sin iniciar, En curso, Atrasada… */
  estado: string;
  folio: string;
  titulo: string;
};

/** Estado de UNA actividad en la tarjeta, no el aro de la persona. */
export function estadoDeActividad(a: {
  estatus?: string | null;
  inicioRealAt?: string | null;
  atrasada?: boolean | null;
  minutosAtraso?: number | null;
  semaforo?: "rojo" | "amarillo" | "verde" | null;
  periodo?: { etiqueta?: string | null } | null;
  /** Sesiones de trabajo: ya la inició y su reloj está detenido. */
  enPausa?: boolean | null;
}): string {
  const est = (a.estatus || "").toLowerCase();
  if (/cancel/.test(est)) return "Cancelada";
  if (/finaliz|complet|aprob/.test(est)) return "Terminada";
  if (a.atrasada || a.semaforo === "rojo" || /atraso/i.test(a.periodo?.etiqueta || "")) {
    const t = formatMinutes(a.minutosAtraso);
    return t && t !== "—" ? `Atrasada · ${t}` : "Atrasada";
  }
  if (a.semaforo === "amarillo") return "Por vencer";
  if (a.enPausa) return "En pausa";
  if (a.inicioRealAt || /proceso|validar/.test(est)) return "En curso";
  return "Sin iniciar";
}

/**
 * Lo que se lee en la tarjeta de Mi equipo: cada actividad asignada, con folio.
 * Vacío solo cuando de verdad no hay nada abierto (ahí la tarjeta puede decir
 * «Sin actividad asignada»).
 */
export function actividadesDeTarjeta(u: TeamBoardUser): LineaActividadTarjeta[] {
  const abiertas = u.openActivities ?? [];
  if (abiertas.length > 0) {
    return abiertas.map((a) => ({
      id: a.id,
      estado: estadoDeActividad(a),
      folio: a.anNumber,
      titulo: a.titulo,
    }));
  }
  if (u.currentActivity) {
    return [
      {
        id: u.currentActivity.id,
        estado: u.status === "atrasado" ? "Atrasada" : estadoDeActividad(u.currentActivity),
        folio: u.currentActivity.anNumber,
        titulo: u.currentActivity.titulo,
      },
    ];
  }
  return [];
}

/**
 * Renglón 1: qué está haciendo, completo (la tarjeta lo parte en dos líneas). Sin
 * nada abierto, lo último que terminó, dicho como tal: «Última: …».
 */
export function queHace(u: TeamBoardUser): string {
  const abierta = u.openActivities?.[0];
  if (abierta) return abierta.titulo;
  if (u.currentActivity) return u.currentActivity.titulo;
  if (u.lastFinished) return `Última: ${u.lastFinished.titulo}`;
  return "Sin actividad asignada";
}

/**
 * Sin nada abierto, su jornada de hoy: «Entró 10:05 · sin nada hace 2 h 15 min»,
 * «Salió 18:02» o «Sin entrada hoy».
 */
function jornadaSinNada(u: TeamBoardUser, ahora: number): string {
  const entrada = fecha(u.entradaHoyAt);
  if (!entrada) return "Sin entrada hoy";
  const salida = fecha(u.salidaHoyAt);
  if (salida) return `Salió ${hora(salida)}`;
  const min = minutosDesde(u.idleSinceAt, ahora);
  return min != null && min >= 1
    ? `Entró ${hora(entrada)} · sin nada hace ${formatMinutes(min)}`
    : `Entró ${hora(entrada)}`;
}

/**
 * Renglón 2: el contexto de esa actividad — folio, encargo y desde cuándo.
 *
 * El tablero (`me/board`) no manda sede ni cliente, así que el «dónde» del
 * boceto se resuelve con lo que sí existe: número de actividad, el encargo y la
 * hora real de arranque o el atraso acumulado.
 */
export function contextoActividad(u: TeamBoardUser, ahora: number = Date.now()): string {
  const partes: string[] = [];
  const abierta = u.openActivities?.[0];
  const folio = abierta?.anNumber || u.currentActivity?.anNumber;
  if (folio) partes.push(folio);
  if (abierta) {
    const encargo = chargeLabel(abierta.assignmentCharge);
    if (encargo) partes.push(encargo);
    if (abierta.periodo?.multiDia && abierta.periodo.etiqueta) partes.push(abierta.periodo.etiqueta);
  }

  if (u.status === "atrasado" && u.currentLateMinutes) {
    partes.push(`Atrasada · ${formatMinutes(u.currentLateMinutes)}`);
  } else if (u.status === "libre" && u.lastFinished) {
    const h = hora(u.lastFinished.finishedAt);
    const tarde = u.lastFinished.lateMinutes;
    partes.push(
      tarde && tarde > 0 ? `Terminó ${h} con ${formatMinutes(tarde)} de atraso` : `Terminó ${h}, a tiempo`,
    );
  } else if (u.status === "libre" && u.idleSinceAt) {
    const min = Math.max(0, Math.floor((ahora - new Date(u.idleSinceAt).getTime()) / 60_000));
    partes.push(min < 1 ? "Sin nada abierto" : `Sin nada abierto desde hace ${formatMinutes(min)}`);
  } else if (u.status === "activo" && u.activityStartedAt) {
    partes.push(`Desde las ${hora(u.activityStartedAt)}`);
  } else if ((u.status === "sin_actividad" || u.status === "inactivo") && u.entradaHoyAt !== undefined) {
    // API vieja (sin `entradaHoyAt`): se queda el rótulo del estado, como antes.
    partes.push(jornadaSinNada(u, ahora));
  } else {
    partes.push(STATUS_LABELS[u.status] ?? "");
  }

  return partes.filter(Boolean).join(" · ");
}

/**
 * Regla 7: seis celdas en cero no informan. El flujo del periodo solo se pinta
 * si hay al menos un movimiento real en el pipeline.
 */
export function hayFlujo(workflow?: WorkflowPipeline | null): boolean {
  if (!workflow) return false;
  return (
    workflow.assigned > 0 ||
    workflow.started > 0 ||
    workflow.evidence > 0 ||
    workflow.closed > 0 ||
    workflow.peerRejected > 0 ||
    workflow.slaOnTime > 0 ||
    workflow.slaLate > 0
  );
}

/**
 * Tinta de identidad para quien no tiene foto: un número estable por nombre.
 * Solo se usan hues que NO son de estado (marca, azul de información, violeta y
 * un neutro), para que el relleno del disco nunca se confunda con el aro.
 */
export const TINTAS_PERSONA = 4;

export function tintaPersona(nombre: string): number {
  let h = 0;
  for (let i = 0; i < nombre.length; i += 1) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return h % TINTAS_PERSONA;
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}
