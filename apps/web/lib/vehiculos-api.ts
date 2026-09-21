/**
 * Vehículos + GPS de Core (`/erp/vehiculos/**`).
 *
 * Un solo sitio para los tipos que devuelve la API de flotilla y para armar el
 * multipart del checklist de fotos. El checklist es la parte delicada: el
 * servidor rechaza una foto sin `capturedAt`, y así es como se rechaza una foto
 * sacada de la galería. Por eso el `meta` se arma aquí y no en cada pantalla.
 */
import { apiRequest, getApiAssetOrigin, parseResponseJson } from "@/lib/api-base";
import { erpFetch } from "@/lib/erp-api";

/* ── Checklist de fotos ──────────────────────────────────────────────── */

/** Los 7 ángulos obligatorios. El nombre es el campo del multipart. */
export const SLOTS_CHECKLIST = [
  "frontal",
  "trasera",
  "lateral-izq",
  "lateral-der",
  "interior-delantera",
  "interior-trasera",
  "tablero",
] as const;

export type SlotChecklist = (typeof SLOTS_CHECKLIST)[number];

export const ETIQUETA_SLOT: Record<SlotChecklist, string> = {
  frontal: "Frente",
  trasera: "Trasera",
  "lateral-izq": "Lateral izq.",
  "lateral-der": "Lateral der.",
  "interior-delantera": "Interior frente",
  "interior-trasera": "Interior atrás",
  tablero: "Tablero",
};

/** Vuelta al vehículo, en el orden en que se camina alrededor. */
export const SLOTS_EXTERIOR: SlotChecklist[] = ["frontal", "lateral-der", "trasera", "lateral-izq"];
export const SLOTS_INTERIOR: SlotChecklist[] = ["interior-delantera", "interior-trasera"];
export const SLOT_TABLERO: SlotChecklist = "tablero";

/** Fotos del paso 1: la vuelta de 360° (4 exteriores + 2 interiores). */
export const SLOTS_VUELTA: SlotChecklist[] = [...SLOTS_EXTERIOR, ...SLOTS_INTERIOR];

export const NIVELES_COMBUSTIBLE = [
  { nivel: "E", pct: 0 },
  { nivel: "1/4", pct: 25 },
  { nivel: "1/2", pct: 50 },
  { nivel: "3/4", pct: 75 },
  { nivel: "F", pct: 100 },
] as const;

export type NivelCombustible = (typeof NIVELES_COMBUSTIBLE)[number]["nivel"];

/** Momento y lugar de la foto. `capturedAt` es obligatorio: sin él la API la rechaza. */
export type MetaFoto = { capturedAt: string; lat: number | null; lng: number | null };

export type ChecklistPayload = {
  files: Record<string, File>;
  meta: Record<string, MetaFoto>;
  odometroKm: number;
  combustible: string;
};

/* ── Tipos de la API ─────────────────────────────────────────────────── */

export type VehiculoFlota = {
  id: number;
  nombre: string;
  placas: string | null;
  estatus: string;
  activo: boolean;
  disponible: boolean;
  conductor: { id: number; nombre: string } | null;
  desde: string | null;
  proximaDevolucion: string | null;
  odometroUltimo: number | null;
  combustibleUltimoPct: number | null;
  gpsProveedor: string | null;
  tieneRastreador: boolean;
};

export type FotoChecklist = {
  slot: string;
  url: string;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
};

export type AsignacionHistorial = {
  id: number;
  origen: "solicitud" | "inventario";
  conductor: { id: number; nombre: string } | null;
  actividad: string | null;
  inicio: string | null;
  fin: string | null;
  odometroInicio: number | null;
  odometroFin: number | null;
  kmRecorridos: number | null;
  combustibleInicioPct: number | null;
  combustibleFinPct: number | null;
  fotosSalida: FotoChecklist[];
  fotosDevolucion: FotoChecklist[];
  estatus: string;
};

export type AsignacionActiva = {
  id: number;
  origen: "solicitud" | "inventario";
  vehiculo: { id: number; nombre: string; placas: string | null };
  inicio: string | null;
  fin: string | null;
  odometroInicio: number | null;
  combustibleInicioPct: number | null;
  requiereSalida: boolean;
  requiereDevolucion: boolean;
};

export type SolicitudResumen = {
  id: number;
  nombreVehiculo: string | null;
  placasVehiculo: string | null;
  estatusAprobacion: string;
  entregaEstatus: string;
  fechaInicioSolicitada: string | null;
  fechaFinSolicitada: string | null;
};

export type MisVehiculos = {
  activa: AsignacionActiva | null;
  solicitudes: SolicitudResumen[];
  disponibles: VehiculoFlota[];
};

export type DetalleVehiculo = {
  vehiculo: VehiculoFlota;
  historial: AsignacionHistorial[];
};

export type PosicionVehiculo = {
  vehicleAssetId: number;
  nombre: string;
  placas: string | null;
  lat: number;
  lng: number;
  velocidadKmh: number | null;
  rumbo: number | null;
  at: string;
  conductor: { id: number; nombre: string } | null;
};

export type PosicionesGps = {
  demo: boolean;
  proveedor: string;
  posiciones: PosicionVehiculo[];
};

export type PuntoRecorrido = {
  lat: number;
  lng: number;
  velocidadKmh: number | null;
  rumbo: number | null;
  at: string;
};

export type RecorridoGps = {
  demo: boolean;
  vehiculo: { id: number; nombre: string; placas: string | null };
  conductor: { id: number; nombre: string } | null;
  puntos: PuntoRecorrido[];
  kmAprox: number;
};

export type EstadoGps = {
  proveedor: string;
  configurado: boolean;
  demo: boolean;
  vehiculosConRastreador: number;
};

export type SolicitudVehiculoBody = {
  actividadId: number;
  vehicleId: number;
  motivoUso: string;
  fechaInicioSolicitada: string;
  fechaFinSolicitada: string;
};

/* ── Lecturas ────────────────────────────────────────────────────────── */

export async function listarFlotilla(token: string): Promise<VehiculoFlota[]> {
  const data = await erpFetch<{ vehiculos?: VehiculoFlota[] }>("vehicles/flotilla", token);
  return data?.vehiculos ?? [];
}

export async function obtenerVehiculo(token: string, id: number | string): Promise<DetalleVehiculo> {
  const data = await erpFetch<Partial<DetalleVehiculo>>(`vehicles/flotilla/${id}`, token);
  if (!data?.vehiculo) throw new Error("Vehículo no encontrado");
  return { vehiculo: data.vehiculo, historial: data.historial ?? [] };
}

export async function misVehiculos(token: string): Promise<MisVehiculos> {
  const data = await erpFetch<Partial<MisVehiculos>>("vehicles/mis-vehiculos", token);
  return {
    activa: data?.activa ?? null,
    solicitudes: data?.solicitudes ?? [],
    disponibles: data?.disponibles ?? [],
  };
}

export async function posicionesGps(token: string): Promise<PosicionesGps> {
  const data = await erpFetch<Partial<PosicionesGps>>("vehicle-gps/posiciones", token);
  return {
    demo: Boolean(data?.demo),
    proveedor: data?.proveedor ?? "",
    posiciones: data?.posiciones ?? [],
  };
}

export async function recorridoGps(
  token: string,
  id: number | string,
  fecha: string,
): Promise<RecorridoGps> {
  const data = await erpFetch<Partial<RecorridoGps>>(
    `vehicle-gps/${id}/recorrido?fecha=${encodeURIComponent(fecha)}`,
    token,
  );
  return {
    demo: Boolean(data?.demo),
    vehiculo: data?.vehiculo ?? { id: Number(id), nombre: "", placas: null },
    conductor: data?.conductor ?? null,
    puntos: data?.puntos ?? [],
    kmAprox: Number(data?.kmAprox ?? 0),
  };
}

export async function estadoGps(token: string): Promise<EstadoGps> {
  const data = await erpFetch<Partial<EstadoGps>>("vehicle-gps/estado", token);
  return {
    proveedor: data?.proveedor ?? "",
    configurado: Boolean(data?.configurado),
    demo: Boolean(data?.demo),
    vehiculosConRastreador: Number(data?.vehiculosConRastreador ?? 0),
  };
}

export async function solicitarVehiculo(token: string, body: SolicitudVehiculoBody): Promise<void> {
  await erpFetch("vehicles", token, { method: "POST", body: JSON.stringify(body) });
}

export type AltaVehiculoBody = {
  nombre: string;
  placas?: string | null;
  notas?: string | null;
};

/** Alta de unidad en el inventario (`POST vehicles/inventory`). Requiere `vehicles.inventory`. */
export async function crearVehiculoInventario(
  token: string,
  body: AltaVehiculoBody,
): Promise<{ id: number; nombre: string; placas: string | null }> {
  const nombre = body.nombre.trim();
  if (!nombre) throw new Error("El nombre del vehículo es obligatorio");
  const data = await erpFetch<{ id?: number; nombre?: string; placas?: string | null }>(
    "vehicles/inventory",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        nombre,
        placas: body.placas?.trim() || null,
        notas: body.notas?.trim() || null,
        estatus: "Disponible",
        activo: true,
      }),
    },
  );
  return {
    id: Number(data?.id ?? 0),
    nombre: data?.nombre ?? nombre,
    placas: data?.placas ?? null,
  };
}

/* ── Escritura del checklist ─────────────────────────────────────────── */

/**
 * Multipart del checklist: un archivo por slot + `meta` con la hora (y el punto)
 * de cada foto. Se exporta aparte de {@link enviarChecklist} para poder probarlo
 * sin red.
 */
export function construirChecklistForm(payload: ChecklistPayload): FormData {
  const form = new FormData();
  const meta: Record<string, MetaFoto> = {};

  for (const slot of SLOTS_CHECKLIST) {
    const file = payload.files[slot];
    if (!file) throw new Error(`Falta la foto: ${ETIQUETA_SLOT[slot]}`);
    const info = payload.meta[slot];
    if (!info?.capturedAt) throw new Error(`Falta la hora de la foto: ${ETIQUETA_SLOT[slot]}`);
    form.append(slot, file);
    meta[slot] = {
      capturedAt: info.capturedAt,
      lat: typeof info.lat === "number" && Number.isFinite(info.lat) ? info.lat : null,
      lng: typeof info.lng === "number" && Number.isFinite(info.lng) ? info.lng : null,
    };
  }

  form.append("meta", JSON.stringify(meta));
  form.append("odometroKm", String(Math.trunc(payload.odometroKm)));
  form.append("combustible", payload.combustible);
  return form;
}

/**
 * `path` es la ruta sin barra inicial: `vehicles/12/start-use`,
 * `vehicles/inventory/12/checkout`, …
 */
export async function enviarChecklist(
  token: string,
  path: string,
  payload: ChecklistPayload,
): Promise<unknown> {
  const res = await apiRequest(path, {
    method: "POST",
    // Sin `Content-Type`: el navegador pone el boundary del multipart.
    headers: { Authorization: `Bearer ${token}` },
    body: construirChecklistForm(payload),
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(texto || `HTTP ${res.status}`);
  }
  return parseResponseJson<unknown>(res);
}

/* ── Formato ─────────────────────────────────────────────────────────── */

const FALTA = "—";

/** Fecha corta con hora, en español. `—` cuando no hay dato. */
export function formatoFecha(valor: string | null | undefined): string {
  if (!valor) return FALTA;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return FALTA;
  return fecha.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Solo la hora: para la tira de fotos y la lista del GPS. */
export function formatoHora(valor: string | null | undefined): string {
  if (!valor) return FALTA;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return FALTA;
  return fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/** `YYYY-MM-DD` de hoy en local — el valor inicial del selector de día del GPS. */
export function fechaHoyIso(base: Date = new Date()): string {
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type VarianteEstatus = "default" | "positive" | "warning" | "danger" | "accent" | "neutral";

/** Estatus del vehículo → texto corto + tono de la píldora. */
export function etiquetaEstatus(estatus: string | null | undefined): {
  texto: string;
  variante: VarianteEstatus;
} {
  const crudo = (estatus || "").trim();
  const clave = crudo.toLowerCase();
  if (!clave) return { texto: "Sin estatus", variante: "neutral" };
  if (clave.includes("disponible")) return { texto: crudo, variante: "positive" };
  if (clave.includes("uso") || clave.includes("asignad")) return { texto: crudo, variante: "accent" };
  if (clave.includes("manten") || clave.includes("taller") || clave.includes("servicio")) {
    return { texto: crudo, variante: "warning" };
  }
  if (clave.includes("baja") || clave.includes("inactiv") || clave.includes("siniestr")) {
    return { texto: crudo, variante: "danger" };
  }
  return { texto: crudo, variante: "default" };
}

/** Porcentaje a partir de `E`/`1/4`/…/`F` o de un número 0–100. `null` si no se entiende. */
export function pctDeCombustible(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const nivel = NIVELES_COMBUSTIBLE.find((n) => n.nivel === String(valor).trim());
  if (nivel) return nivel.pct;
  const num = Number(valor);
  if (!Number.isFinite(num) || num < 0 || num > 100) return null;
  return num;
}

/** Porcentaje al nivel más cercano del selector (`E`, `1/4`, `1/2`, `3/4`, `F`). */
export function nivelDeCombustible(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return FALTA;
  let mejor: { nivel: string; pct: number } = NIVELES_COMBUSTIBLE[0];
  for (const nivel of NIVELES_COMBUSTIBLE) {
    if (Math.abs(nivel.pct - pct) < Math.abs(mejor.pct - pct)) mejor = nivel;
  }
  return mejor.nivel;
}

/** Kilometraje con separador de miles. */
export function formatoKm(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return FALTA;
  return `${Math.round(valor).toLocaleString("es-MX")} km`;
}

/** URL absoluta de una foto del checklist (la API las devuelve relativas). */
export function urlFoto(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) return url;
  return `${getApiAssetOrigin()}${url.startsWith("/") ? "" : "/"}${url}`;
}
