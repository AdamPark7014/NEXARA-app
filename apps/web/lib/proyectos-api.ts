/**
 * Proyectos en Core: el proyecto completo (plan, alcance, requerimientos, equipo y documentos).
 *
 * Espejo en la web de `apps/api/src/projects/proyectos-profesional.*`. El avance y la salud los
 * calcula el servidor al leer; aquí solo se pintan. Toda mutación devuelve el proyecto completo,
 * así que la pantalla reemplaza su estado con la respuesta y no hace una segunda lectura.
 *
 * Las etiquetas viven aquí para no repetir cadenas sueltas en cada pantalla. Las del estado y del
 * papel en el equipo copian `proyecto-estado.ts` de la API, que es la fuente.
 */
import { buildApiUrl } from "@/lib/api-base";
import type { PeriodoActividad } from "@/lib/actividad-periodo";

// ---------------------------------------------------------------------------
// Vocabulario
// ---------------------------------------------------------------------------

export const ESTADOS_PROYECTO = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];

export const ESTADO_PROYECTO_LABEL: Record<EstadoProyecto, string> = {
  PLANNED: "Planeado",
  ACTIVE: "En curso",
  ON_HOLD: "En pausa",
  COMPLETED: "Terminado",
  CANCELLED: "Cancelado",
};

export function etiquetaEstado(valor?: string | null): string {
  return valor && valor in ESTADO_PROYECTO_LABEL ? ESTADO_PROYECTO_LABEL[valor as EstadoProyecto] : "Sin estado";
}

export type SaludProyecto =
  | "SIN_PLAN"
  | "PLANEADO"
  | "EN_TIEMPO"
  | "EN_RIESGO"
  | "RETRASADO"
  | "TERMINADO"
  | "CANCELADO";

export type Tono = "neutral" | "info" | "ok" | "alerta" | "peligro";

export const SALUD_TONO: Record<SaludProyecto, Tono> = {
  SIN_PLAN: "neutral",
  PLANEADO: "info",
  EN_TIEMPO: "ok",
  EN_RIESGO: "alerta",
  RETRASADO: "peligro",
  TERMINADO: "ok",
  CANCELADO: "neutral",
};

export const ESTADO_TONO: Record<EstadoProyecto, Tono> = {
  PLANNED: "info",
  ACTIVE: "ok",
  ON_HOLD: "alerta",
  COMPLETED: "neutral",
  CANCELLED: "neutral",
};

export const ESTADOS_HITO = ["PENDIENTE", "EN_CURSO", "CUMPLIDO", "CANCELADO"] as const;
export type EstadoHito = (typeof ESTADOS_HITO)[number];
export const ESTADO_HITO_LABEL: Record<EstadoHito, string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  CUMPLIDO: "Cumplida",
  CANCELADO: "Cancelada",
};

/** Las tres caras del alcance, con el mismo vocabulario que la cotización. */
export const TIPOS_ALCANCE = ["ENTREGABLE", "EXCLUSION", "SUPUESTO"] as const;
export type TipoAlcance = (typeof TIPOS_ALCANCE)[number];
export const TIPO_ALCANCE_LABEL: Record<TipoAlcance, string> = {
  ENTREGABLE: "Qué entregamos",
  EXCLUSION: "Qué no incluye",
  SUPUESTO: "De qué partimos",
};
export const TIPO_ALCANCE_AYUDA: Record<TipoAlcance, string> = {
  ENTREGABLE: "Lo que el cliente recibe al final: equipos instalados, planos, memoria técnica…",
  EXCLUSION: "Lo que queda fuera para que no haya malentendidos: obra civil, licencias, energía…",
  SUPUESTO: "Lo que damos por hecho para poder cumplir: acceso al sitio, horario, canalización…",
};

export const ESTADOS_REQUERIMIENTO = ["PENDIENTE", "EN_PROCESO", "CUMPLIDO", "NO_APLICA"] as const;
export type EstadoRequerimiento = (typeof ESTADOS_REQUERIMIENTO)[number];
export const ESTADO_REQUERIMIENTO_LABEL: Record<EstadoRequerimiento, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  CUMPLIDO: "Listo",
  NO_APLICA: "No aplica",
};

export const ROLES_EQUIPO = [
  "RESPONSABLE",
  "COORDINADOR",
  "INGENIERO",
  "INSTALADOR",
  "ADMINISTRATIVO",
  "APOYO",
] as const;
export type RolEquipo = (typeof ROLES_EQUIPO)[number];
export const ROL_EQUIPO_LABEL: Record<RolEquipo, string> = {
  RESPONSABLE: "Responsable",
  COORDINADOR: "Coordinador",
  INGENIERO: "Ingeniero",
  INSTALADOR: "Instalador",
  ADMINISTRATIVO: "Administrativo",
  APOYO: "Apoyo",
};

export const TIPOS_DOCUMENTO = ["PLANO", "ACTA", "CONTRATO", "MINUTA", "REPORTE", "OTRO"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  PLANO: "Plano",
  ACTA: "Acta",
  CONTRATO: "Contrato",
  MINUTA: "Minuta",
  REPORTE: "Reporte",
  OTRO: "Otro",
};

/** Lo que acepta la API por subida: 10 archivos de hasta 25 MB. */
export const MAX_ARCHIVOS_POR_SUBIDA = 10;
export const MAX_BYTES_POR_ARCHIVO = 25 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Formas de respuesta
// ---------------------------------------------------------------------------

export type Persona = {
  id: number;
  nombre: string;
  email?: string | null;
  avatarUrl?: string | null;
  puesto?: string | null;
};

export type ResumenProyecto = {
  salud: SaludProyecto;
  etiqueta: string;
  enRiesgo: boolean;
  diasDeRetraso: number;
  diasRestantes: number | null;
  hitosVencidos: number;
  motivo: string;
  avance: {
    total: number;
    cerradas: number;
    finalizadas: number;
    abiertas: number;
    porcentaje: number | null;
    origen: "actividades" | "hitos" | "ninguno";
  };
  requerimientos: { total: number; cumplidos: number; pendientes: number; porcentaje: number | null };
  estadoEtiqueta: string;
};

/** Campos de cabecera que comparten la fila de la lista y el detalle. */
type CabeceraProyecto = {
  id: number;
  title: string;
  description?: string | null;
  objective?: string | null;
  scopeSummary?: string | null;
  projectType?: string | null;
  siteCount?: number | null;
  status: EstadoProyecto;
  vendorId: number;
  responsableId?: number | null;
  clientId: number;
  startDate: string;
  endDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  budgetAmount?: number | null;
  currency?: string | null;
  cotizacionId?: number | null;
  cancelReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  vendor?: Persona | null;
  responsable?: Persona | null;
  resumen: ResumenProyecto;
};

export type ProyectoFila = CabeceraProyecto & {
  client?: { id: number; name: string } | null;
  cotizacion?: { id: number; quoteNumber: string } | null;
  documentosCount: number;
  equipoCount: number;
  hitosCount: number;
  proximoHito?: { id: number; name: string; plannedDate?: string | null; status: string } | null;
};

export type HitoProyecto = {
  id: number;
  name: string;
  description?: string | null;
  orden: number;
  plannedDate?: string | null;
  actualDate?: string | null;
  responsableId?: number | null;
  responsable?: Persona | null;
  status: EstadoHito;
};

export type RenglonAlcance = {
  id: number;
  kind: TipoAlcance;
  titulo: string;
  detalle?: string | null;
  orden: number;
  origenClave?: string | null;
};

export type Requerimiento = {
  id: number;
  titulo: string;
  detalle?: string | null;
  orden: number;
  responsableId?: number | null;
  responsable?: Persona | null;
  status: EstadoRequerimiento;
  dueDate?: string | null;
  completedAt?: string | null;
};

export type MiembroEquipo = {
  id: number;
  userId: number;
  role: RolEquipo;
  rolEtiqueta?: string;
  notas?: string | null;
  assignedAt?: string;
  user: Persona;
};

export type DocumentoProyecto = {
  id: number;
  kind: TipoDocumento;
  nombre: string;
  fileUrl: string;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  createdAt: string;
  uploadedBy?: Persona | null;
};

export type ActividadDeProyecto = {
  id: number;
  anNumber?: string | null;
  titulo?: string | null;
  estatus?: string | null;
  prioridad?: string | null;
  branchName?: string | null;
  branchNumber?: string | null;
  fechaInicio?: string | null;
  fechaEntregaEsperada?: string | null;
  fechaFinalizacion?: string | null;
  responsable?: Persona | null;
  /** Periodo de ejecución y etapa que ejecuta (si se programó desde el proyecto). */
  periodoInicio?: string | null;
  periodoFin?: string | null;
  projectMilestoneId?: number | null;
  periodo?: PeriodoActividad | null;
};

// ---------------------------------------------------------------------------
// Programar actividades del proyecto
// ---------------------------------------------------------------------------

export type ActividadProgramada = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  sitio: string | null;
  responsableId: number;
  periodo: PeriodoActividad | null;
};

/** Una etapa del cronograma con el periodo que le toca (propuesta de la API). */
export type EtapaPropuesta = {
  hitoId: number;
  nombre: string;
  descripcion: string | null;
  estado: EstadoHito;
  responsableId: number | null;
  inicio: string;
  fin: string;
  dias: number;
  /** Su fecha planeada quedaba antes de que terminara la anterior: se recorrió. */
  ajustada: boolean;
  programadas: ActividadProgramada[];
  sugerida: boolean;
};

export type PropuestaProgramacion = {
  proyecto: {
    id: number;
    title: string;
    status: EstadoProyecto;
    inicio: string | null;
    fin: string | null;
    siteCount: number | null;
    responsableId: number | null;
  };
  etapas: EtapaPropuesta[];
};

export type EtapaAProgramar = {
  hitoId: number;
  inicio: string;
  fin: string;
  responsableId: number;
  apoyoIds?: number[];
  titulo?: string;
  indicaciones?: string;
};

export type ResultadoProgramacion = {
  creadas: Array<ActividadProgramada & { hitoId: number }>;
  omitidas: Array<{ hitoId: number; sitio: string | null; motivo: string; activityId: number }>;
  proyecto: ProyectoDetalle;
};

export type ProyectoDetalle = CabeceraProyecto & {
  client?: { id: number; name: string; contactEmail?: string | null; contactPhone?: string | null } | null;
  salesProject?: { id: number; name: string; status: string } | null;
  cotizacion?: {
    id: number;
    quoteNumber: string;
    status?: string | null;
    total?: number | null;
    currency?: string | null;
    folioEnviado?: string | null;
  } | null;
  milestones: HitoProyecto[];
  scopeItems: RenglonAlcance[];
  requirements: Requerimiento[];
  members: MiembroEquipo[];
  documents: DocumentoProyecto[];
  activities: ActividadDeProyecto[];
};

// ---------------------------------------------------------------------------
// Llamadas
// ---------------------------------------------------------------------------

/** Mensaje legible de un error de Nest: `{ message }` en español (p. ej. el 403 de alcance). */
function mensajeDeError(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "message" in (payload as Record<string, unknown>)) {
    const message = (payload as { message: unknown }).message;
    if (Array.isArray(message) && message.length) return message.map(String).join(", ");
    if (typeof message === "string" && message.trim()) {
      // Los guards de rol hablan en jerga («Tu rol (x) no puede acceder a POST /api/…»);
      // el 403 de alcance de equipo, en cambio, ya viene redactado para la persona.
      if (status === 403 && /^Tu rol \(|No user in request|^Forbidden/i.test(message)) {
        return "Tu puesto no tiene permiso para hacer esto en proyectos.";
      }
      return message;
    }
  }
  if (typeof payload === "string" && payload.trim() && !/<html|<!doctype/i.test(payload)) return payload;
  if (status === 403) return "Tu puesto no tiene permiso para hacer esto en proyectos.";
  if (status === 404) return "No encontramos el proyecto.";
  return `No se pudo completar la operación (error ${status}).`;
}

async function pedir<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const esFormulario = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body && !esFormulario ? { "Content-Type": "application/json" } : {}),
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
  });
  const texto = await res.text();
  let payload: unknown = null;
  if (texto) {
    try {
      payload = JSON.parse(texto);
    } catch {
      payload = texto;
    }
  }
  if (!res.ok) throw new Error(mensajeDeError(payload, res.status));
  return payload as T;
}

function json(method: string, body?: unknown): RequestInit {
  return body === undefined ? { method } : { method, body: JSON.stringify(body) };
}

export function listarProyectos(token: string, filtros?: { incluirCancelados?: boolean }) {
  const qs = filtros?.incluirCancelados ? "?incluirCancelados=1" : "";
  return pedir<ProyectoFila[]>(`proyectos${qs}`, token);
}

export function obtenerProyecto(token: string, id: number) {
  return pedir<ProyectoDetalle>(`proyectos/${id}`, token);
}

export type NuevoHito = {
  name: string;
  plannedDate?: string | null;
  responsableId?: number | null;
  description?: string;
  orden?: number;
};

export type NuevoRenglonAlcance = { kind: TipoAlcance; titulo: string; detalle?: string; orden?: number };

export type NuevoRequerimiento = {
  titulo: string;
  detalle?: string;
  responsableId?: number | null;
  dueDate?: string | null;
  orden?: number;
};

export type NuevoMiembro = { userId: number; role?: RolEquipo; notas?: string };

export type CrearProyecto = {
  title: string;
  clientId: number;
  responsableId?: number;
  projectType?: string;
  description?: string;
  objective?: string;
  scopeSummary?: string;
  siteCount?: number;
  startDate: string;
  endDate?: string;
  budgetAmount?: number;
  currency?: string;
  cotizacionId?: number;
  importarAlcanceDeCotizacion?: boolean;
  status?: EstadoProyecto;
  milestones?: NuevoHito[];
  scopeItems?: NuevoRenglonAlcance[];
  requirements?: NuevoRequerimiento[];
  members?: NuevoMiembro[];
};

/** Alta completa en una sola llamada: identidad, fechas, cronograma, alcance y equipo. */
export function crearProyecto(token: string, datos: CrearProyecto) {
  return pedir<ProyectoDetalle>("proyectos", token, json("POST", datos));
}

export type ActualizarProyecto = Partial<{
  title: string;
  description: string | null;
  objective: string | null;
  scopeSummary: string | null;
  projectType: string;
  siteCount: number | null;
  responsableId: number | null;
  startDate: string;
  endDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  budgetAmount: number | null;
  currency: string;
  cotizacionId: number | null;
}>;

export function actualizarProyecto(token: string, id: number, datos: ActualizarProyecto) {
  return pedir<ProyectoDetalle>(`proyectos/${id}`, token, json("PATCH", datos));
}

/** Cancelar exige motivo; terminar acepta la fecha real de entrega (si no, hoy). */
export function cambiarEstadoProyecto(
  token: string,
  id: number,
  datos: { status: EstadoProyecto; cancelReason?: string; actualEndDate?: string },
) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/estado`, token, json("PATCH", datos));
}

export function agregarHito(token: string, id: number, datos: NuevoHito) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/hitos`, token, json("POST", datos));
}

export function actualizarHito(
  token: string,
  id: number,
  hitoId: number,
  datos: Partial<{
    name: string;
    description: string | null;
    orden: number;
    plannedDate: string | null;
    actualDate: string | null;
    responsableId: number | null;
    status: EstadoHito;
  }>,
) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/hitos/${hitoId}`, token, json("PATCH", datos));
}

export function borrarHito(token: string, id: number, hitoId: number) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/hitos/${hitoId}`, token, json("DELETE"));
}

export function agregarAlcance(token: string, id: number, datos: NuevoRenglonAlcance) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/alcance`, token, json("POST", datos));
}

export function actualizarAlcance(
  token: string,
  id: number,
  itemId: number,
  datos: Partial<{ kind: TipoAlcance; titulo: string; detalle: string | null; orden: number }>,
) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/alcance/${itemId}`, token, json("PATCH", datos));
}

export function borrarAlcance(token: string, id: number, itemId: number) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/alcance/${itemId}`, token, json("DELETE"));
}

/** Idempotente: cada bloque de la cotización trae su clave y no se duplica. */
export function importarAlcanceDeCotizacion(token: string, id: number) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/alcance/importar-cotizacion`, token, json("POST"));
}

export function agregarRequerimiento(token: string, id: number, datos: NuevoRequerimiento) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/requerimientos`, token, json("POST", datos));
}

export function actualizarRequerimiento(
  token: string,
  id: number,
  reqId: number,
  datos: Partial<{
    titulo: string;
    detalle: string | null;
    orden: number;
    responsableId: number | null;
    status: EstadoRequerimiento;
    dueDate: string | null;
  }>,
) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/requerimientos/${reqId}`, token, json("PATCH", datos));
}

export function borrarRequerimiento(token: string, id: number, reqId: number) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/requerimientos/${reqId}`, token, json("DELETE"));
}

export function agregarMiembro(token: string, id: number, datos: NuevoMiembro) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/equipo`, token, json("POST", datos));
}

export function actualizarMiembro(
  token: string,
  id: number,
  userId: number,
  datos: Partial<{ role: RolEquipo; notas: string | null }>,
) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/equipo/${userId}`, token, json("PATCH", datos));
}

export function quitarMiembro(token: string, id: number, userId: number) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/equipo/${userId}`, token, json("DELETE"));
}

/** Sube hasta 10 archivos del mismo tipo. `nombre` solo aplica cuando va uno. */
export function subirDocumentos(
  token: string,
  id: number,
  archivos: File[],
  datos: { kind: TipoDocumento; nombre?: string },
) {
  const cuerpo = new FormData();
  for (const archivo of archivos) cuerpo.append("files", archivo);
  cuerpo.append("kind", datos.kind);
  if (archivos.length === 1 && datos.nombre?.trim()) cuerpo.append("nombre", datos.nombre.trim());
  return pedir<ProyectoDetalle>(`proyectos/${id}/documentos`, token, { method: "POST", body: cuerpo });
}

export function borrarDocumento(token: string, id: number, docId: number) {
  return pedir<ProyectoDetalle>(`proyectos/${id}/documentos/${docId}`, token, json("DELETE"));
}

/** Etapas con su periodo encadenado y lo que ya tienen programado. No crea nada. */
export function obtenerProgramacion(token: string, id: number) {
  return pedir<PropuestaProgramacion>(`proyectos/${id}/programacion`, token);
}

/** Crea de una vez una actividad por etapa (o por etapa × sitio), cada una con su periodo. */
export function programarActividades(
  token: string,
  id: number,
  datos: { porSitio?: boolean; etapas: EtapaAProgramar[] },
) {
  return pedir<ResultadoProgramacion>(`proyectos/${id}/programar-actividades`, token, json("POST", datos));
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export function formatoMoneda(valor: number | null | undefined, moneda = "MXN"): string {
  if (valor == null || Number.isNaN(Number(valor))) return "—";
  try {
    return Number(valor).toLocaleString("es-MX", { style: "currency", currency: moneda || "MXN" });
  } catch {
    return `${Number(valor).toLocaleString("es-MX")} ${moneda}`;
  }
}

/**
 * Fecha de calendario. Las fechas del proyecto viajan como medianoche UTC («2026-09-20»):
 * formatearlas en la zona de México las corre un día hacia atrás, así que se leen en UTC.
 */
export function formatoFecha(valor?: string | null, conAnio = true): string {
  if (!valor) return "—";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    ...(conAnio ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** Instante real (subida de un documento): este sí va en la hora local. */
export function formatoFechaHora(valor?: string | null): string {
  if (!valor) return "—";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatoTamano(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
