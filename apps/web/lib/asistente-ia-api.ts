/**
 * Asistente de actividades con IA (API `ai/asistente/*`).
 *
 * La IA solo propone: cada propuesta trae el cuerpo listo para `POST /activities`, que es
 * quien crea, notifica y revisa permisos como en el alta manual. La tarjeta deja corregir
 * cada campo con las mismas reglas del formulario «Asignar» (día y hora, último día si dura
 * varios, tiempo estimado obligatorio, encargo según la persona).
 */
import { buildApiUrl } from "@/lib/api-base";
import {
  canOfferAssignmentCharge,
  forcesDespachoOnly,
  forcesEjecucionOnly,
  formatDispatchHeadcountNote,
  kindsForAssignment,
  type ActivityKind,
} from "@/lib/activity-kinds";
import type { RoleKey } from "@/lib/rbac/roles";

export type Referencia = { id: number; nombre: string };
export type Encargo = "ejecucion" | "despacho";
export type Prioridad = "Alta" | "Media" | "Baja";

/** Día (AAAA-MM-DD), hora (HH:MM) y último día, en hora de Ciudad de México. */
export type Agenda = { dia: string | null; hora: string | null; hasta: string | null; horaDicha: boolean };

export type PropuestaActividad = {
  tipo: ActivityKind;
  tipoEtiqueta: string;
  razonTipo: string;
  resumen: string;
  titulo: string;
  textoResponsable: string | null;
  responsable: Referencia | null;
  responsableCandidatos: Referencia[];
  textoCliente: string | null;
  cliente: Referencia | null;
  clienteCandidatos: Referencia[];
  sucursal: Referencia | null;
  proyecto: Referencia | null;
  proyectoCandidatos: Referencia[];
  fechaInicio: string | null;
  /** Opcionales solo mientras conviven una web nueva y un API anterior al despliegue. */
  agenda?: Agenda;
  duracionMin?: number | null;
  prioridad?: Prioridad;
  encargo?: Encargo | null;
  indicaciones?: string | null;
  /** Lo que no se dijo: responsable, cliente, proyecto, fecha, duración. */
  faltantes: string[];
  avisos: string[];
  payload: Record<string, unknown>;
};

export type RespuestaAsistente = {
  propuestas: PropuestaActividad[];
  aclaracion: string | null;
  uso: { modelo: string; tokensEntrada: number; tokensSalida: number; usdAprox: number | null };
};

export type PersonaAsignable = { id: number; nombre: string; email?: string | null };

async function pedir<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function estadoAsistente(token: string) {
  return pedir<{ disponible: boolean; modelo: string }>(token, "ai/asistente/estado");
}

export function interpretar(token: string, texto: string) {
  return pedir<RespuestaAsistente>(token, "ai/asistente/interpretar", {
    method: "POST",
    body: JSON.stringify({ texto }),
  });
}

export function personasAsignables(token: string) {
  return pedir<PersonaAsignable[]>(token, "users/assignable");
}

export function crearActividad(token: string, payload: Record<string, unknown>) {
  return pedir<{ id: number; anNumber?: string }>(token, "activities", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Lo que la persona cambió en la tarjeta. `""` en día/último día = quitarlo. */
export type Ajustes = {
  responsableId?: number;
  clientId?: number | null;
  projectId?: number | null;
  titulo?: string;
  indicaciones?: string;
  dia?: string;
  hora?: string;
  hasta?: string;
  duracionMin?: number | null;
  prioridad?: Prioridad;
  encargo?: Encargo | null;
};

/** Tiempos de la lista de la tarjeta (el formulario va de 5 en 5 minutos hasta 12 h). */
export const DURACIONES_MIN = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720];

const DESFASE_CDMX = "-06:00";

function aIso(dia: string, hora: string | null): string | null {
  const h = hora && /^\d{2}:\d{2}$/.test(hora) ? hora : "09:00";
  const d = new Date(`${dia}T${h}:00${DESFASE_CDMX}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** La agenda vigente: lo que entendió la IA con lo que se cambió en la tarjeta. */
export function agendaFinal(p: PropuestaActividad, aj: Ajustes): Agenda {
  const base = p.agenda ?? { dia: null, hora: null, hasta: null, horaDicha: false };
  const dia = aj.dia !== undefined ? aj.dia || null : base.dia;
  const hora = aj.hora !== undefined ? aj.hora || null : base.hora;
  const hasta = aj.hasta !== undefined ? aj.hasta || null : base.hasta;
  return { dia, hora: dia ? hora ?? "09:00" : null, hasta: dia ? hasta : null, horaDicha: aj.hora !== undefined || base.horaDicha };
}

/**
 * Encargo con las reglas de «Asignar»: Luis o Antonio + servicio = despacho; Luis + tarea,
 * proyecto o comercial = ejecución; David, Luis, Antonio y Josué eligen; a los demás no se
 * les pone. `destinoEmail` undefined = aún no se sabe quién es: se respeta lo elegido.
 */
export function reglaEncargo(
  tipo: ActivityKind,
  destinoEmail: string | null | undefined,
  elegido: Encargo | null,
): { valor: Encargo | null; fijo: boolean; ofrecer: boolean } {
  if (destinoEmail === undefined) return { valor: elegido, fijo: false, ofrecer: false };
  if (forcesDespachoOnly(destinoEmail, tipo)) return { valor: "despacho", fijo: true, ofrecer: false };
  if (forcesEjecucionOnly(destinoEmail, tipo)) return { valor: "ejecucion", fijo: true, ofrecer: false };
  if (canOfferAssignmentCharge(destinoEmail)) return { valor: elegido, fijo: false, ofrecer: true };
  return { valor: null, fijo: false, ofrecer: false };
}

/** Encargo que propuso la IA (o el que se eligió en la tarjeta). */
export function encargoElegido(p: PropuestaActividad, aj: Ajustes): Encargo | null {
  if (aj.encargo !== undefined) return aj.encargo;
  const ia = p.encargo ?? p.payload.assignmentCharge;
  return ia === "ejecucion" || ia === "despacho" ? ia : null;
}

const CAMPOS_FECHA = ["fechaInicio", "fechaEntregaEsperada", "fechaMaxima", "periodoInicio", "periodoFin"] as const;

/** Cuerpo final para `POST /activities` con los ajustes de la tarjeta. */
export function payloadFinal(
  p: PropuestaActividad,
  aj: Ajustes,
  ctx: { destinoEmail?: string | null } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...p.payload };
  if (aj.responsableId) out.responsableId = aj.responsableId;
  if (aj.clientId !== undefined) {
    if (aj.clientId) out.clientId = aj.clientId;
    else delete out.clientId;
  }
  if (aj.projectId !== undefined) {
    if (aj.projectId) out.projectId = aj.projectId;
    else delete out.projectId;
  }
  if (aj.titulo !== undefined && aj.titulo.trim()) out.titulo = aj.titulo.trim().slice(0, 200);
  if (aj.indicaciones !== undefined) {
    const t = aj.indicaciones.trim();
    if (t) out.indicaciones = t.slice(0, 4000);
    else delete out.indicaciones;
  }
  if (aj.prioridad) out.prioridad = aj.prioridad;
  if (aj.duracionMin !== undefined) {
    if (aj.duracionMin && aj.duracionMin > 0) out.tiempoEstimadoMin = Math.min(720, Math.round(aj.duracionMin));
    else delete out.tiempoEstimadoMin;
  }
  // Fechas como el formulario: inicio = entrega = máxima; con último día, el periodo (la API
  // pone la máxima y la entrega al fin de ese día).
  if (aj.dia !== undefined || aj.hora !== undefined || aj.hasta !== undefined) {
    const ag = agendaFinal(p, aj);
    for (const k of CAMPOS_FECHA) delete out[k];
    const iso = ag.dia ? aIso(ag.dia, ag.hora) : null;
    if (ag.dia && iso) {
      out.fechaInicio = iso;
      out.fechaEntregaEsperada = iso;
      out.fechaMaxima = iso;
      if (ag.hasta && ag.hasta > ag.dia) {
        out.periodoInicio = ag.dia;
        out.periodoFin = ag.hasta;
      }
    }
  }
  const encargo = reglaEncargo(p.tipo, ctx.destinoEmail, encargoElegido(p, aj)).valor;
  if (encargo) out.assignmentCharge = encargo;
  else delete out.assignmentCharge;
  return out;
}

/**
 * Qué impide crearla, con las reglas de «Asignar»: responsable, cliente del servicio,
 * proyecto de la obra, día del servicio u obra, tiempo estimado, encargo de quien reparte,
 * periodo al revés y tipos que esa persona no recibe.
 */
export function bloqueos(
  p: PropuestaActividad,
  payload: Record<string, unknown>,
  ctx: {
    creadorEmail?: string | null;
    destinoEmail?: string | null;
    v2Role?: RoleKey | null;
    isSuperAdmin?: boolean;
    agenda?: Agenda;
  },
): string[] {
  const out: string[] = [];
  if (!payload.responsableId) out.push("Elige a quién se le asigna.");
  if (p.tipo === "servicio" && !payload.clientId) out.push("Un servicio necesita un cliente registrado.");
  if ((p.tipo === "obra" || p.tipo === "proyecto") && !payload.projectId) out.push("Elige el proyecto.");
  if ((p.tipo === "servicio" || p.tipo === "obra") && !payload.fechaInicio) {
    out.push(p.tipo === "servicio" ? "Indica el día del servicio." : "Indica el día de la obra.");
  }
  if (!payload.tiempoEstimadoMin) out.push("Indica cuánto tiempo toma.");
  if (ctx.agenda?.dia && ctx.agenda.hasta && ctx.agenda.hasta < ctx.agenda.dia) {
    out.push("El último día no puede ser antes del primero.");
  }
  if (payload.responsableId && ctx.destinoEmail !== undefined) {
    if (reglaEncargo(p.tipo, ctx.destinoEmail, null).ofrecer && !payload.assignmentCharge) {
      out.push("Elige si la hace en persona o la reparte a su equipo.");
    }
    const permitidos = kindsForAssignment({
      creatorEmail: ctx.creadorEmail,
      targetEmail: ctx.destinoEmail,
      v2Role: ctx.v2Role,
      isSuperAdmin: ctx.isSuperAdmin,
    });
    if (!permitidos.includes(p.tipo)) {
      out.push(`A esta persona no se le puede asignar ${p.tipoEtiqueta.toLowerCase()}.`);
    }
  }
  return out;
}

/**
 * Lo que «Asignar» hace después de crear: el responsable queda como LEAD con su tiempo
 * estimado (`horasPlan`, con el que se avisa si se excede), y en el despacho de servicio a
 * Luis o Antonio, el cupo. null si no hay nada que mandar.
 */
export function pasoEquipo(
  p: PropuestaActividad,
  payload: Record<string, unknown>,
  destinoEmail?: string | null,
): { userId: number; rol: "LEAD"; horasPlan: number; indicaciones?: string } | null {
  const userId = Number(payload.responsableId);
  const minutos = Number(payload.tiempoEstimadoMin);
  if (!userId || !minutos) return null;
  const horasPlan = Math.round((minutos / 60) * 100) / 100;
  return {
    userId,
    rol: "LEAD",
    horasPlan,
    ...(forcesDespachoOnly(destinoEmail, p.tipo) ? { indicaciones: formatDispatchHeadcountNote(1) } : {}),
  };
}

export function sumarAlEquipo(token: string, activityId: number, paso: NonNullable<ReturnType<typeof pasoEquipo>>) {
  return pedir<unknown>(token, `activities/${activityId}/team`, {
    method: "POST",
    body: JSON.stringify(paso),
  });
}
