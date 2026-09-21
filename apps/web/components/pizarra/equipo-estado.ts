/**
 * Actividades · «Mi equipo»: el estado de una persona reducido a lo que se lee
 * de lejos.
 *
 * El lenguaje visual que aprobó Adam tiene TRES aros de color, no cinco estados:
 * verde trabajando, ámbar con retraso o sin actividad, azul libre. Aquí vive esa
 * reducción, el resumen de arriba y los dos renglones de texto de la tarjeta,
 * para que la pantalla, el centro operativo y las pruebas digan lo mismo.
 */
import {
  CLAUDIA_TESTER_EMAIL,
  PLATFORM_OWNER_EMAIL,
  normalizePlatformEmail,
} from "@/lib/platform-accounts";
import {
  STATUS_LABELS,
  formatMinutes,
  type BoardUserStatus,
  type TeamBoardUser,
  type WorkflowPipeline,
} from "@/lib/team-board-api";

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
  /** Desglose del ámbar, para el `title` de la celda. */
  atrasados: number;
  sinActividad: number;
};

export function resumenEquipo(users: readonly TeamBoardUser[]): ResumenEquipo {
  const r: ResumenEquipo = {
    trabajando: 0,
    retraso: 0,
    libres: 0,
    total: users.length,
    atrasados: 0,
    sinActividad: 0,
  };
  for (const u of users) {
    const aro = ARO_DE_ESTADO[u.status] ?? "retraso";
    if (aro === "trabajando") r.trabajando += 1;
    else if (aro === "libre") r.libres += 1;
    else r.retraso += 1;
    if (u.status === "atrasado") r.atrasados += 1;
    if (u.status === "sin_actividad" || u.status === "inactivo") r.sinActividad += 1;
  }
  return r;
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

/** Renglón 1: qué está haciendo, completo (la tarjeta lo parte en dos líneas). */
export function queHace(u: TeamBoardUser): string {
  const abierta = u.openActivities?.[0];
  if (abierta) return abierta.titulo;
  if (u.currentActivity) return u.currentActivity.titulo;
  if (u.lastFinished) return u.lastFinished.titulo;
  return "Sin actividad asignada";
}

function hora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
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
  if (abierta) {
    partes.push(abierta.anNumber);
    if (abierta.assignmentCharge) partes.push(abierta.assignmentCharge);
    if (abierta.periodo?.multiDia && abierta.periodo.etiqueta) partes.push(abierta.periodo.etiqueta);
  }

  if (u.status === "atrasado" && u.currentLateMinutes) {
    partes.push(`Atrasado ${formatMinutes(u.currentLateMinutes)}`);
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
