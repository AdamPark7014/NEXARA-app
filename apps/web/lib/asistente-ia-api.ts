/**
 * Asistente de actividades con IA (API `ai/asistente/*`).
 *
 * La IA solo propone: cada propuesta trae el cuerpo listo para `POST /activities`, que es
 * quien crea, notifica y revisa permisos como en el alta manual. La tarjeta deja corregir
 * cada campo con las mismas reglas del formulario «Asignar» (tipo y subtipo, día y hora, último
 * día si dura varios, tiempo estimado obligatorio, encargo según la persona, etapa del proyecto).
 */
import { buildApiUrl } from "@/lib/api-base";
import {
  ACTIVITY_KINDS,
  TAREA_TIPOS,
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

/**
 * Día (AAAA-MM-DD), hora (HH:MM) y último día, en hora de Ciudad de México. `compromiso` es
 * «Entregar a más tardar» (HH:MM del mismo día; sin periodo).
 */
export type Agenda = { dia: string | null; hora: string | null; hasta: string | null; horaDicha: boolean; compromiso?: string | null };

/** Un nombre que el API corrigió («talks» → Grupo Tox), para decirlo en su campo. */
export type Correccion = {
  campo: "responsable" | "cliente" | "sucursal" | "proyecto" | "lugar";
  de: string;
  a: string;
  como: "apodo" | "parecido";
};

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
  /** Opcional mientras conviven una web nueva y un API anterior. */
  correcciones?: Correccion[];
  payload: Record<string, unknown>;
};

export type ProyectoOpcion = Referencia & { clientId: number };

/** Sucursal registrada: el lugar de la tarjeta se elige de aquí o se escribe libre. */
export type SucursalOpcion = Referencia & {
  clientId: number;
  branchNumber: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
};

export type RespuestaAsistente = {
  propuestas: PropuestaActividad[];
  aclaracion: string | null;
  uso: { modelo: string; tokensEntrada: number; tokensSalida: number; usdAprox: number | null } | null;
  /** Clientes y proyectos activos, para cambiar el tipo en la tarjeta (no pasan por la IA). */
  opciones?: { clientes: Referencia[]; proyectos: ProyectoOpcion[]; sucursales?: SucursalOpcion[] };
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

/**
 * El servidor corta cada intento a los ~10 s con un reintento; aquí se espera a lo más 25 s
 * para que el botón nunca se quede girando.
 */
export const ESPERA_INTERPRETAR_MS = 25_000;

export async function interpretar(token: string, texto: string) {
  const senal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ESPERA_INTERPRETAR_MS) : undefined;
  try {
    return await pedir<RespuestaAsistente>(token, "ai/asistente/interpretar", {
      method: "POST",
      body: JSON.stringify({ texto }),
      signal: senal,
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error("La IA tardó demasiado en contestar.");
    }
    throw e;
  }
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
  tipo?: ActivityKind;
  /** Subtipo de tarea (etiqueta de `TAREA_TIPOS`) o tipo de servicio (`TIPOS_SERVICIO`). */
  subtipo?: string;
  /** Etapa del cronograma del proyecto (la que propone «Asignar»). */
  etapaId?: number | null;
  responsableId?: number;
  clientId?: number | null;
  projectId?: number | null;
  titulo?: string;
  indicaciones?: string;
  /** Lugar: el nombre de una sucursal del cliente o texto libre. `""` = sin lugar. */
  lugar?: string;
  dia?: string;
  hora?: string;
  hasta?: string;
  /** «Entregar a más tardar» (HH:MM). `""` = sin hora límite (fin del día). */
  compromiso?: string;
  duracionMin?: number | null;
  prioridad?: Prioridad;
  encargo?: Encargo | null;
};

export const TIPOS: ActivityKind[] = ["tarea", "servicio", "obra", "proyecto", "comercial"];
export const ETIQUETA_TIPO: Record<ActivityKind, string> = Object.fromEntries(
  TIPOS.map((t) => [t, ACTIVITY_KINDS[t].title]),
) as Record<ActivityKind, string>;

/** Tipos de servicio (mismos valores que `ticketType` del API). */
export const TIPOS_SERVICIO = [
  { id: "PREVENTIVO", label: "Preventivo" },
  { id: "CORRECTIVO", label: "Correctivo" },
  { id: "EMERGENCIA", label: "Emergencia" },
  { id: "INSTALACION", label: "Instalación" },
] as const;

/** Subtipos de tarea (los de «Asignar»: viajan en `ticketTypeCustom`). */
export const SUBTIPOS_TAREA = TAREA_TIPOS.map((t) => t.label);

export const conProyecto = (tipo: ActivityKind) => tipo === "obra" || tipo === "proyecto";

/** El tipo que va a quedar: el que eligió la persona o el que propuso la IA. */
export function tipoEfectivo(p: PropuestaActividad, aj: Ajustes): ActivityKind {
  return aj.tipo ?? p.tipo;
}

/** Subtipo vigente según el tipo: el elegido, el de la IA o el de omisión del API. */
export function subtipoEfectivo(p: PropuestaActividad, aj: Ajustes): string | null {
  const tipo = tipoEfectivo(p, aj);
  if (tipo === "tarea") {
    const ia = p.tipo === "tarea" ? String(p.payload.ticketTypeCustom ?? "") : "";
    const elegido = aj.subtipo && SUBTIPOS_TAREA.includes(aj.subtipo) ? aj.subtipo : null;
    return elegido ?? (SUBTIPOS_TAREA.includes(ia) ? ia : "Otro");
  }
  if (tipo === "servicio") {
    const validos: string[] = TIPOS_SERVICIO.map((t) => t.id);
    const ia = p.tipo === "servicio" ? String(p.payload.ticketType ?? "") : "";
    const elegido = aj.subtipo && validos.includes(aj.subtipo) ? aj.subtipo : null;
    return elegido ?? (validos.includes(ia) ? ia : "PREVENTIVO");
  }
  return null;
}

/** Proyecto vigente (solo obra y proyecto): el elegido o el que encontró la IA. */
export function proyectoEfectivo(p: PropuestaActividad, aj: Ajustes): number | null {
  if (!conProyecto(tipoEfectivo(p, aj))) return null;
  if (aj.projectId !== undefined) return aj.projectId || null;
  const ia = Number(p.payload.projectId ?? p.proyecto?.id ?? 0);
  return ia || null;
}

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
  // Como el formulario: con varios días no hay hora compromiso (vence al fin del último).
  const compromiso = aj.compromiso !== undefined ? aj.compromiso || null : base.compromiso ?? null;
  return {
    dia,
    hora: dia ? hora ?? "09:00" : null,
    hasta: dia ? hasta : null,
    horaDicha: aj.hora !== undefined || base.horaDicha,
    compromiso: dia && !(hasta && hasta > dia) ? compromiso : null,
  };
}

/** «Entregar a más tardar» vale solo después de la hora de inicio (como en el formulario). */
export function compromisoValido(ag: Agenda): boolean {
  return !ag.compromiso || (/^\d{2}:\d{2}$/.test(ag.compromiso) && ag.compromiso > (ag.hora || "09:00"));
}

/** La corrección de nombre de un campo («talks» → Grupo Tox), si la hubo. */
export function correccionDe(p: PropuestaActividad, campo: Correccion["campo"]): Correccion | null {
  return p.correcciones?.find((c) => c.campo === campo) ?? null;
}

/** Cómo se dice en la tarjeta: «Corregido de "talks"» o, con apodo, «Dijiste "Chava"». */
export function textoCorreccion(c: Correccion | null): string | undefined {
  if (!c) return undefined;
  return c.como === "apodo" ? `Dijiste «${c.de}»` : `Corregido de «${c.de}»`;
}

const CAMPOS_SUCURSAL = ["branchName", "branchNumber", "branchCity", "branchState", "branchAddress"] as const;

/** Lugar vigente (lo escrito en la tarjeta o el de la IA). */
export function lugarEfectivo(p: PropuestaActividad, aj: Ajustes): string {
  return aj.lugar !== undefined ? aj.lugar : typeof p.payload.branchName === "string" ? p.payload.branchName : "";
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
  ctx: { destinoEmail?: string | null; proyectos?: ProyectoOpcion[]; sucursales?: SucursalOpcion[] } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...p.payload };
  if (aj.responsableId) out.responsableId = aj.responsableId;
  // Tipo y subtipo con el mismo mapeo que el API (y que «Asignar»).
  const tipo = tipoEfectivo(p, aj);
  const subtipo = subtipoEfectivo(p, aj);
  out.coreKind = tipo;
  out.activityType = conProyecto(tipo) ? "CLIENT" : "INTERNAL";
  out.ticketType = tipo === "obra" ? "INSTALACION" : tipo === "tarea" || tipo === "comercial" ? "OTRO" : tipo === "servicio" ? subtipo : p.tipo === "proyecto" ? (p.payload.ticketType ?? "PREVENTIVO") : "PREVENTIVO";
  if (tipo === "comercial") out.ticketTypeCustom = "COMERCIAL";
  else if (tipo === "tarea") out.ticketTypeCustom = subtipo;
  else delete out.ticketTypeCustom;
  if (aj.clientId !== undefined) {
    if (aj.clientId) out.clientId = aj.clientId;
    else delete out.clientId;
    // La sucursal de la IA era de otro cliente: no se arrastra.
    if (p.sucursal && aj.clientId !== (p.cliente?.id ?? null) && aj.lugar === undefined) {
      for (const k of CAMPOS_SUCURSAL) delete out[k];
    }
  }
  if (aj.lugar !== undefined) {
    for (const k of CAMPOS_SUCURSAL) delete out[k];
    const lugar = aj.lugar.trim();
    const clienteId = Number(out.clientId) || null;
    // Si es una sucursal registrada (del cliente elegido), se llenan sus datos como en el formulario.
    const suc = lugar
      ? ctx.sucursales?.find((x) => (!clienteId || x.clientId === clienteId) && x.nombre.trim().toLowerCase() === lugar.toLowerCase())
      : undefined;
    if (suc) {
      out.branchName = suc.nombre.slice(0, 160);
      if (!out.clientId) out.clientId = suc.clientId;
      if (suc.branchNumber) out.branchNumber = suc.branchNumber.slice(0, 60);
      if (suc.city) out.branchCity = suc.city.slice(0, 120);
      if (suc.state) out.branchState = suc.state.slice(0, 120);
      if (suc.address) out.branchAddress = suc.address.slice(0, 220);
    } else if (lugar) {
      out.branchName = lugar.slice(0, 160);
    }
  }
  const proyecto = proyectoEfectivo(p, aj);
  if (proyecto) {
    out.projectId = proyecto;
    // Como el formulario: el cliente de una obra o proyecto es el del proyecto.
    const delProyecto = ctx.proyectos?.find((x) => x.id === proyecto)?.clientId;
    if (delProyecto && aj.clientId === undefined) out.clientId = delProyecto;
    if (aj.etapaId) out.projectMilestoneId = aj.etapaId;
    else delete out.projectMilestoneId;
  } else {
    delete out.projectId;
    delete out.projectMilestoneId;
  }
  // Lo escrito en la tarjeta manda; vacío no se crea («Escribe el título»).
  if (aj.titulo !== undefined) out.titulo = aj.titulo.trim().slice(0, 200);
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
  // Fechas como el formulario: inicio = entrega = máxima (a la hora compromiso si la hay); con
  // último día, el periodo (la API pone la máxima y la entrega al fin de ese día).
  if (aj.dia !== undefined || aj.hora !== undefined || aj.hasta !== undefined || aj.compromiso !== undefined) {
    const ag = agendaFinal(p, aj);
    for (const k of CAMPOS_FECHA) delete out[k];
    const iso = ag.dia ? aIso(ag.dia, ag.hora) : null;
    if (ag.dia && iso) {
      const limite = ag.compromiso && compromisoValido(ag) ? aIso(ag.dia, ag.compromiso) ?? iso : iso;
      out.fechaInicio = iso;
      out.fechaEntregaEsperada = limite;
      out.fechaMaxima = limite;
      if (ag.hasta && ag.hasta > ag.dia) {
        out.periodoInicio = ag.dia;
        out.periodoFin = ag.hasta;
      }
    }
  }
  const encargo = reglaEncargo(tipo, ctx.destinoEmail, encargoElegido(p, aj)).valor;
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
  const tipo = (payload.coreKind as ActivityKind | undefined) ?? p.tipo;
  if (!payload.responsableId) out.push("Elige a quién se le asigna.");
  if (tipo === "servicio" && !payload.clientId) out.push("Un servicio necesita un cliente registrado.");
  if (conProyecto(tipo) && !payload.projectId) out.push("Elige el proyecto.");
  if ((tipo === "servicio" || tipo === "obra") && !payload.fechaInicio) {
    out.push(tipo === "servicio" ? "Indica el día del servicio." : "Indica el día de la obra.");
  }
  if (!payload.tiempoEstimadoMin) out.push("Indica cuánto tiempo toma.");
  if (ctx.agenda?.dia && ctx.agenda.hasta && ctx.agenda.hasta < ctx.agenda.dia) {
    out.push("El último día no puede ser antes del primero.");
  }
  if (ctx.agenda && !compromisoValido(ctx.agenda)) {
    out.push("«Entregar a más tardar» tiene que ser después de la hora de inicio.");
  }
  if (!String(payload.titulo ?? "").trim()) out.push("Escribe el título.");
  if (payload.responsableId && ctx.destinoEmail !== undefined) {
    if (reglaEncargo(tipo, ctx.destinoEmail, null).ofrecer && !payload.assignmentCharge) {
      out.push("Elige si la hace en persona o la reparte a su equipo.");
    }
    const permitidos = kindsForAssignment({
      creatorEmail: ctx.creadorEmail,
      targetEmail: ctx.destinoEmail,
      v2Role: ctx.v2Role,
      isSuperAdmin: ctx.isSuperAdmin,
    });
    if (!permitidos.includes(tipo)) {
      out.push(`A esta persona no se le puede asignar ${ETIQUETA_TIPO[tipo].toLowerCase()}.`);
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
    ...(forcesDespachoOnly(destinoEmail, (payload.coreKind as ActivityKind | undefined) ?? p.tipo) ? { indicaciones: formatDispatchHeadcountNote(1) } : {}),
  };
}

export function sumarAlEquipo(token: string, activityId: number, paso: NonNullable<ReturnType<typeof pasoEquipo>>) {
  return pedir<unknown>(token, `activities/${activityId}/team`, {
    method: "POST",
    body: JSON.stringify(paso),
  });
}
