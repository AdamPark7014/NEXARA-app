/**
 * Cotizaciones en Core (contrato del viernes, sección D).
 *
 * Espejo en la web de `apps/api/src/cotizaciones`: el folio, el estado y los términos los decide el
 * servidor; aquí solo se leen y se pintan. Las etiquetas viven aquí para no repetir cadenas sueltas
 * en cada pantalla.
 */
import { buildApiUrl } from "@/lib/api-base";

export const SEGMENTOS = ["COMERCIAL", "OBRA", "LICITACION", "SERVICIO"] as const;
export type Segmento = (typeof SEGMENTOS)[number];

export const SEGMENTO_LABEL: Record<Segmento, string> = {
  COMERCIAL: "Comercial",
  OBRA: "Obra",
  LICITACION: "Licitación",
  SERVICIO: "Servicio",
};

export const ESTADOS = ["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA", "VENCIDA"] as const;
export type EstadoCotizacion = (typeof ESTADOS)[number];

export const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  VENCIDA: "Vencida",
};

export const ESTADO_TONO: Record<EstadoCotizacion, "neutral" | "info" | "ok" | "alerta"> = {
  BORRADOR: "neutral",
  ENVIADA: "info",
  APROBADA: "ok",
  RECHAZADA: "alerta",
  VENCIDA: "alerta",
};

export const GRUPOS_PARTIDA = ["EQUIPOS", "MATERIALES", "MANO_DE_OBRA"] as const;
export type GrupoPartida = (typeof GRUPOS_PARTIDA)[number];

export const GRUPO_LABEL: Record<GrupoPartida, string> = {
  EQUIPOS: "Equipos",
  MATERIALES: "Materiales",
  MANO_DE_OBRA: "Mano de obra",
};

export type ParticipanteCotizacion = {
  userId: number;
  nombre: string;
  puesto?: string | null;
  avatarUrl?: string | null;
  clave: string;
  siglas: string;
  rol: "ELABORO" | "LEVANTAMIENTO" | "REVISO" | "APROBO" | "ENVIO";
  rolEtiqueta: string;
  at: string;
};

export type VersionCotizacion = {
  version: number;
  note?: string | null;
  at: string;
  por?: { id: number; nombre: string } | null;
  folio?: string | null;
  total: number;
};

export type PartidaCotizacion = {
  id?: number;
  grupo?: GrupoPartida | null;
  category?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  qty: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
  laborHours?: number;
  laborRate?: number;
  lineTotal?: number;
  paqueteClave?: string | null;
  paqueteCantidad?: number | null;
};

export type BloqueAlcance = {
  clave: string;
  titulo: string;
  texto?: string | null;
  parametros?: Record<string, string | number | null>;
};

export type PlanoCotizacion = {
  url: string;
  nombre?: string | null;
  tipo?: string | null;
  origen?: string | null;
  activityId?: number | null;
};

export type CotizacionRow = {
  id: number;
  folio: string;
  clienteNombre?: string | null;
  clienteEmpresa?: string | null;
  segmento: Segmento;
  segmentoEtiqueta: string;
  estado: EstadoCotizacion;
  estadoEtiqueta: string;
  total: number;
  currency?: string | null;
  issueDate?: string | null;
  validUntil?: string | null;
  sentAt?: string | null;
  revision?: number;
  elaboro?: { id: number; nombre: string } | null;
  intervinieron: Array<{ userId: number; nombre: string; siglas: string; rol: string }>;
  actividades?: Array<{ id: number; anNumber?: string | null }>;
};

export type CotizacionDetalle = {
  id: number;
  folio: string;
  quoteNumber: string;
  estado: EstadoCotizacion;
  estadoEtiqueta: string;
  bloqueada: boolean;
  segmento: Segmento;
  segmentoEtiqueta: string;
  revision: number;
  issueDate?: string | null;
  validUntil?: string | null;
  sentAt?: string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  salesClientId?: number | null;
  projectName?: string | null;
  objetivo?: string | null;
  alcanceBloques?: BloqueAlcance[] | null;
  planos?: PlanoCotizacion[] | null;
  note?: string | null;
  depositPercent?: number;
  currency?: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  rejectedReason?: string | null;
  rejectedByName?: string | null;
  incluyeInstalacion: boolean;
  terminos: { modalidad: string; titulo: string; lineas: string[] };
  grupos: Array<{ grupo: GrupoPartida; etiqueta: string; subtotal: number; partidas: PartidaCotizacion[] }>;
  totalesPorGrupo: Record<GrupoPartida, number>;
  items: PartidaCotizacion[];
  participantes: ParticipanteCotizacion[];
  actividades: Array<{ id: number; anNumber?: string | null; titulo?: string | null; estatus?: string | null }>;
};

async function cotFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const texto = await res.text();
  const payload = texto ? (() => { try { return JSON.parse(texto); } catch { return texto; } })() : null;
  if (!res.ok) {
    const mensaje =
      payload && typeof payload === "object" && "message" in (payload as Record<string, unknown>)
        ? String(
            Array.isArray((payload as { message: unknown }).message)
              ? ((payload as { message: string[] }).message).join(", ")
              : (payload as { message: string }).message,
          )
        : `No se pudo completar la operación (HTTP ${res.status})`;
    throw new Error(mensaje);
  }
  return payload as T;
}

export function listarCotizaciones(token: string, busqueda?: string) {
  const qs = busqueda?.trim() ? `?search=${encodeURIComponent(busqueda.trim())}` : "";
  return cotFetch<CotizacionRow[]>(`cotizaciones/core${qs}`, token);
}

export function obtenerCotizacion(token: string, id: number) {
  return cotFetch<CotizacionDetalle>(`cotizaciones/core/${id}`, token);
}

export type GuardarCotizacion = {
  segmento?: Segmento;
  salesClientId?: number | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  clientCompany?: string | null;
  projectName?: string | null;
  objetivo?: string | null;
  alcanceBloques?: BloqueAlcance[];
  planos?: PlanoCotizacion[];
  issueDate?: string;
  validUntil?: string;
  depositPercent?: number;
  note?: string | null;
  activityId?: number;
  items: PartidaCotizacion[];
};

export function crearCotizacion(token: string, payload: GuardarCotizacion) {
  return cotFetch<{ id: number; quoteNumber: string }>("cotizaciones", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function actualizarCotizacion(token: string, id: number, payload: Partial<GuardarCotizacion>) {
  return cotFetch<{ id: number; quoteNumber: string }>(`cotizaciones/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function enviarCotizacion(token: string, id: number, datos: { email: string; message?: string }) {
  return cotFetch<{ id: number; quoteNumber: string }>(`cotizaciones/${id}/send`, token, {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function aprobarCotizacion(token: string, id: number) {
  return cotFetch<CotizacionDetalle>(`cotizaciones/${id}/aprobar`, token, { method: "POST" });
}

export function rechazarCotizacion(token: string, id: number, motivo: string) {
  return cotFetch<CotizacionDetalle>(`cotizaciones/${id}/rechazar`, token, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

export function marcarRevisada(token: string, id: number) {
  return cotFetch<CotizacionDetalle>(`cotizaciones/${id}/revisar`, token, { method: "POST" });
}

export function participantesDeCotizacion(token: string, id: number) {
  return cotFetch<ParticipanteCotizacion[]>(`cotizaciones/${id}/participantes`, token);
}

export function versionesDeCotizacion(token: string, id: number) {
  return cotFetch<VersionCotizacion[]>(`cotizaciones/${id}/versiones`, token);
}

export function ligarActividadACotizacion(token: string, id: number, activityId: number) {
  return cotFetch<{ activityId: number; cotizacionId: number }>(`cotizaciones/${id}/actividad`, token, {
    method: "POST",
    body: JSON.stringify({ activityId }),
  });
}

export type PaqueteCotizacion = {
  clave: string;
  titulo: string;
  descripcion: string;
  bloqueAlcance?: string | null;
  partidas: Array<{
    grupo: GrupoPartida;
    name: string;
    unit: string;
    qtyPorPaquete: number;
    unitPrice: number;
    description?: string | null;
  }>;
};

export function listarPaquetes(token: string) {
  return cotFetch<PaqueteCotizacion[]>("cotizaciones/paquetes", token);
}

/** Genera las partidas de N paquetes (el servidor cuadra cantidades y alcance). */
export function aplicarPaquete(
  token: string,
  id: number,
  datos: { clave: string; cantidad: number },
) {
  return cotFetch<CotizacionDetalle>(`cotizaciones/${id}/paquetes`, token, {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

/** URL del PDF «Propuesta técnica» (requiere sesión). */
export function urlPdfCotizacion(id: number) {
  return buildApiUrl(`cotizaciones/${id}/pdf`);
}

export function formatoMoneda(valor: number | null | undefined, moneda = "MXN") {
  const n = Number(valor ?? 0);
  return n.toLocaleString("es-MX", { style: "currency", currency: moneda || "MXN" });
}

export function formatoFecha(valor?: string | null) {
  if (!valor) return "—";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}
