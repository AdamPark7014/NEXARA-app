/**
 * Asistente de actividades con IA (API `ai/asistente/*`).
 *
 * La IA solo propone: cada propuesta trae el cuerpo listo para `POST /activities`, que es
 * quien crea, notifica y revisa permisos como en el alta manual.
 */
import { buildApiUrl } from "@/lib/api-base";
import { kindsForAssignment, type ActivityKind } from "@/lib/activity-kinds";
import type { RoleKey } from "@/lib/rbac/roles";

export type Referencia = { id: number; nombre: string };

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

/** Lo que la persona eligió en la tarjeta (responsable, cliente o proyecto distintos). */
export type Ajustes = { responsableId?: number; clientId?: number | null; projectId?: number | null };

/** Cuerpo final para `POST /activities` con los ajustes de la tarjeta. */
export function payloadFinal(p: PropuestaActividad, ajustes: Ajustes): Record<string, unknown> {
  const out: Record<string, unknown> = { ...p.payload };
  if (ajustes.responsableId) out.responsableId = ajustes.responsableId;
  if (ajustes.clientId !== undefined) {
    if (ajustes.clientId) out.clientId = ajustes.clientId;
    else delete out.clientId;
  }
  if (ajustes.projectId !== undefined) {
    if (ajustes.projectId) out.projectId = ajustes.projectId;
    else delete out.projectId;
  }
  return out;
}

/**
 * Qué impide crearla: falta responsable, el servicio sin cliente, la obra/proyecto sin
 * proyecto, o un tipo que esa persona no recibe (mismas reglas que «Asignar»).
 */
export function bloqueos(
  p: PropuestaActividad,
  payload: Record<string, unknown>,
  ctx: {
    creadorEmail?: string | null;
    destinoEmail?: string | null;
    v2Role?: RoleKey | null;
    isSuperAdmin?: boolean;
  },
): string[] {
  const out: string[] = [];
  if (!payload.responsableId) out.push("Elige a quién se le asigna.");
  if (p.tipo === "servicio" && !payload.clientId) out.push("Un servicio necesita un cliente registrado.");
  if ((p.tipo === "obra" || p.tipo === "proyecto") && !payload.projectId) out.push("Elige el proyecto.");
  if (payload.responsableId && ctx.destinoEmail !== undefined) {
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
