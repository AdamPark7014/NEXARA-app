/**
 * Captura guiada de vehículos (5 pasos en vivo), firmas, bloque «Vehículo» de la actividad, daños que
 * propone la IA e incidencias. Solo datos y multipart: las pantallas viven aparte.
 *
 * La regla vive en la API (`apps/api/src/vehicles/captura-guiada.ts`); aquí se arma lo que pide y se
 * repiten las constantes para poder guiar sin red. Si la API cambia los pasos, manda `GET
 * vehicles/captura-guiada` y la pantalla usa lo que llega.
 */
import { apiRequest, parseResponseJson } from "@/lib/api-base";
import { erpFetch } from "@/lib/erp-api";
import type { MetaFoto, NivelCombustible } from "@/lib/vehiculos-api";

/* ── Pasos y slots (iguales a la API) ────────────────────────────────── */

export const VISTAS_VUELTA = [
  { slot: "vuelta-1", etiqueta: "Frente" },
  { slot: "vuelta-2", etiqueta: "Frente derecho" },
  { slot: "vuelta-3", etiqueta: "Lado derecho" },
  { slot: "vuelta-4", etiqueta: "Trasera derecha" },
  { slot: "vuelta-5", etiqueta: "Trasera" },
  { slot: "vuelta-6", etiqueta: "Trasera izquierda" },
  { slot: "vuelta-7", etiqueta: "Lado izquierdo" },
  { slot: "vuelta-8", etiqueta: "Frente izquierdo" },
] as const;

export const FOTOS_GUIADAS = [
  { slot: "asientos-traseros", etiqueta: "Asientos traseros" },
  { slot: "asientos-delanteros", etiqueta: "Asientos delanteros" },
  { slot: "tablero", etiqueta: "Tablero completo" },
  { slot: "km-gasolina", etiqueta: "Kilometraje y gasolina" },
] as const;

export type SlotVuelta = (typeof VISTAS_VUELTA)[number]["slot"];
export type SlotFotoGuiada = (typeof FOTOS_GUIADAS)[number]["slot"];
export type SlotGuiado = SlotVuelta | SlotFotoGuiada;

export const SLOTS_VUELTA: SlotVuelta[] = VISTAS_VUELTA.map((v) => v.slot);
export const SLOTS_GUIADA: SlotGuiado[] = [...SLOTS_VUELTA, ...FOTOS_GUIADAS.map((f) => f.slot)];
export const SLOT_KM_GASOLINA: SlotFotoGuiada = "km-gasolina";
export const CAMPO_VIDEO_VUELTA = "video-vuelta";
export const DURACION_VUELTA_SEG = { min: 10, max: 20 } as const;

export const ETIQUETA_SLOT_GUIADO: Record<SlotGuiado, string> = Object.fromEntries([
  ...VISTAS_VUELTA.map((v) => [v.slot, v.etiqueta]),
  ...FOTOS_GUIADAS.map((f) => [f.slot, f.etiqueta]),
]) as Record<SlotGuiado, string>;

export type PasoCaptura = { paso: number; id: string; etiqueta: string; instruccion: string };

/** Para guiar sin red; la API manda los suyos en `GET vehicles/captura-guiada`. */
export const PASOS_CAPTURA: PasoCaptura[] = [
  {
    paso: 1,
    id: "vuelta",
    etiqueta: "Vuelta completa",
    instruccion:
      "Camina una vuelta completa alrededor de la unidad, empezando por el frente y hacia tu derecha, sin detenerte. Entre 10 y 20 segundos.",
  },
  { paso: 2, id: "asientos-traseros", etiqueta: "Asientos traseros", instruccion: "Abre una puerta trasera y toma todo el asiento de atrás." },
  { paso: 3, id: "asientos-delanteros", etiqueta: "Asientos delanteros", instruccion: "Toma los dos asientos de adelante desde la puerta del conductor." },
  { paso: 4, id: "tablero", etiqueta: "Tablero completo", instruccion: "Con el motor encendido, toma el tablero completo: volante, pantalla y testigos." },
  {
    paso: 5,
    id: "km-gasolina",
    etiqueta: "Kilometraje y gasolina",
    instruccion: "Acércate al odómetro y a la aguja de gasolina. La IA los lee y tú confirmas.",
  },
];

/**
 * Segundo del video del que sale cada uno de los 8 cuadros: el centro de cada octavo de la vuelta.
 * Así el cuadro 1 cae al frente (donde empieza) y nunca en el primer o último instante, que suelen
 * salir movidos. Misma regla en Android e iOS.
 */
export function tiemposCuadrosVuelta(duracionSeg: number, cuadros = SLOTS_VUELTA.length): number[] {
  if (!Number.isFinite(duracionSeg) || duracionSeg <= 0 || cuadros <= 0) return [];
  return Array.from({ length: cuadros }, (_, i) => Math.round(((duracionSeg * (i + 0.5)) / cuadros) * 1000) / 1000);
}

/** ¿La vuelta dura lo que pide la API? (con un segundo de gracia por el redondeo del teléfono). */
export function duracionVueltaValida(duracionSeg: number): boolean {
  return Number.isFinite(duracionSeg) && duracionSeg >= DURACION_VUELTA_SEG.min - 1 && duracionSeg <= DURACION_VUELTA_SEG.max + 1;
}

/* ── Lo que manda la API ─────────────────────────────────────────────── */

export type CapturaGuiadaInfo = {
  /** Con el interruptor prendido, una salida solo entra con la captura guiada. */
  exigida: boolean;
  pasos: PasoCaptura[];
  vistasVuelta: { slot: string; etiqueta: string }[];
  fotos: { slot: string; etiqueta: string }[];
  campoVideo: string;
  duracionVueltaSeg: { min: number; max: number };
  ultimoRegistro: { km: number; en: string | null; origen: string } | null;
};

export async function obtenerCapturaGuiada(token: string, vehiculoId?: number | null): Promise<CapturaGuiadaInfo> {
  const q = vehiculoId ? `?vehiculo=${encodeURIComponent(String(vehiculoId))}` : "";
  const data = await erpFetch<Partial<CapturaGuiadaInfo>>(`vehicles/captura-guiada${q}`, token);
  return {
    exigida: Boolean(data?.exigida),
    pasos: data?.pasos?.length ? data.pasos : PASOS_CAPTURA,
    vistasVuelta: data?.vistasVuelta?.length ? data.vistasVuelta : [...VISTAS_VUELTA],
    fotos: data?.fotos?.length ? data.fotos : [...FOTOS_GUIADAS],
    campoVideo: data?.campoVideo || CAMPO_VIDEO_VUELTA,
    duracionVueltaSeg: data?.duracionVueltaSeg ?? { ...DURACION_VUELTA_SEG },
    ultimoRegistro: data?.ultimoRegistro ?? null,
  };
}

/* ── Multipart de la captura guiada ──────────────────────────────────── */

export type LecturaIa = { odometroKm: number | null; combustiblePct: number | null };

export type CapturaGuiadaPayload = {
  /** 8 cuadros de la vuelta + 4 fotos, por slot. */
  files: Partial<Record<SlotGuiado, Blob>>;
  meta: Partial<Record<SlotGuiado, MetaFoto>>;
  video: Blob;
  /** Hora en que empezó a grabarse la vuelta y cuánto duró. */
  videoMeta: { capturedAt: string; duracionSeg: number };
  /** Lo que la persona confirma. */
  odometroKm: number;
  combustible: NivelCombustible | string;
  /** Lo que leyó la IA antes de confirmar: si la persona lo cambió, Liz ve las dos lecturas. */
  lecturaIa?: LecturaIa | null;
  /** Solo cuenta si quien registra revisa vehículos (Liz): el km anterior estaba mal. */
  forzarKm?: boolean;
  /** Salida directa de inventario: a qué actividad va y quién responde. */
  actividadId?: number | null;
  encargadoId?: number | null;
};

const coordenada = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null);

const nombreArchivo = (slot: string, blob: Blob) => {
  if (blob instanceof File && blob.name) return blob.name;
  const tipo = blob.type || "";
  const ext = tipo.includes("png") ? "png" : tipo.includes("webm") ? "webm" : tipo.includes("quicktime") ? "mov" : tipo.startsWith("video/") ? "mp4" : "jpg";
  return `${slot}.${ext}`;
};

/**
 * Arma el multipart que espera `start-use`, `end-use`, `inventory/:id/checkout` y `/return` para la
 * captura guiada. Falla antes de mandar si falta algo, con el mismo texto que daría la API.
 */
export function construirCapturaGuiadaForm(payload: CapturaGuiadaPayload): FormData {
  const form = new FormData();
  const meta: Record<string, unknown> = {};

  if (!payload.video) throw new Error("Falta el video de la vuelta completa");
  if (!payload.videoMeta?.capturedAt) throw new Error("Graba la vuelta con la cámara en vivo, no de la galería");
  if (!duracionVueltaValida(payload.videoMeta.duracionSeg)) {
    throw new Error(`La vuelta debe durar entre ${DURACION_VUELTA_SEG.min} y ${DURACION_VUELTA_SEG.max} segundos`);
  }

  for (const slot of SLOTS_GUIADA) {
    const archivo = payload.files[slot];
    if (!archivo) throw new Error(`Falta la foto: ${ETIQUETA_SLOT_GUIADO[slot]}`);
    const info = payload.meta[slot];
    if (!info?.capturedAt) throw new Error(`Falta la hora de la foto: ${ETIQUETA_SLOT_GUIADO[slot]}`);
    form.append(slot, archivo, nombreArchivo(slot, archivo));
    meta[slot] = { capturedAt: info.capturedAt, lat: coordenada(info.lat), lng: coordenada(info.lng) };
  }
  form.append(CAMPO_VIDEO_VUELTA, payload.video, nombreArchivo(CAMPO_VIDEO_VUELTA, payload.video));
  meta[CAMPO_VIDEO_VUELTA] = {
    capturedAt: payload.videoMeta.capturedAt,
    duracionSeg: Math.round(payload.videoMeta.duracionSeg * 10) / 10,
  };

  if (!Number.isFinite(payload.odometroKm) || payload.odometroKm < 0) throw new Error("Confirma el kilometraje del tablero");
  if (!String(payload.combustible ?? "").trim()) throw new Error("Confirma el nivel de gasolina");

  form.append("capturaVersion", "2");
  form.append("meta", JSON.stringify(meta));
  form.append("odometroKm", String(Math.trunc(payload.odometroKm)));
  form.append("combustible", String(payload.combustible));
  if (payload.lecturaIa && (payload.lecturaIa.odometroKm != null || payload.lecturaIa.combustiblePct != null)) {
    form.append("lecturaIa", JSON.stringify(payload.lecturaIa));
  }
  if (payload.forzarKm) form.append("forzarKm", "true");
  if (payload.actividadId) form.append("actividadId", String(payload.actividadId));
  if (payload.encargadoId) form.append("encargadoId", String(payload.encargadoId));
  return form;
}

async function enviarForm<T>(token: string, ruta: string, form: FormData): Promise<T> {
  // Sin `Content-Type`: el navegador pone el boundary del multipart.
  const res = await apiRequest(ruta, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!res.ok) {
    const cuerpo = await parseResponseJson<{ message?: string | string[] }>(res).catch(() => null);
    const mensaje = Array.isArray(cuerpo?.message) ? cuerpo?.message[0] : cuerpo?.message;
    throw new Error(mensaje || `HTTP ${res.status}`);
  }
  return (await parseResponseJson<T>(res)) as T;
}

/** `path` sin barra inicial: `vehicles/12/start-use`, `vehicles/inventory/12/checkout`, … */
export function enviarCapturaGuiada(token: string, path: string, payload: CapturaGuiadaPayload): Promise<unknown> {
  return enviarForm<unknown>(token, path, construirCapturaGuiadaForm(payload));
}

/* ── Firmas ──────────────────────────────────────────────────────────── */

export type MomentoUso = "salida" | "devolucion";
export type RolFirma = "entrega" | "recibe";
export type Firma = { url: string; nombre: string; userId: number | null; firmadoEn: string; registradoPorId: number };
export type FirmasUso = Partial<Record<MomentoUso, Partial<Record<RolFirma, Firma>>>>;

export function registrarFirma(
  token: string,
  usoId: number,
  datos: { momento: MomentoUso; rol: RolFirma; nombre: string; userId?: number | null; firma: Blob },
): Promise<{ id: number; firmas: FirmasUso }> {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error("Escribe el nombre de quien firma");
  const form = new FormData();
  form.append("firma", datos.firma, "firma.png");
  form.append("momento", datos.momento);
  form.append("rol", datos.rol);
  form.append("nombre", nombre);
  if (datos.userId) form.append("userId", String(datos.userId));
  return enviarForm(token, `vehicles/${usoId}/firmas`, form);
}

/* ── Bloque «Vehículo» de la actividad ───────────────────────────────── */

export type TipoAlertaKm = "KM_SIN_REGISTRO" | "KM_DE_MAS" | "LECTURA_CORREGIDA" | "KM_MENOR";
export type AlertaKm = { tipo: TipoAlertaKm; km: number | null; mensaje: string; en: string };

export type MomentoRegistrado = {
  en: string | null;
  km: number | null;
  combustiblePct: number | null;
  fotos: { slot: string; url: string; capturedAt?: string; lat?: number | null; lng?: number | null }[];
  videoUrl: string | null;
};

export type UsoDeActividad = {
  id: number;
  estatus: string;
  aprobacion: string;
  capturaVersion: number;
  unidad: { id: number | null; nombre: string; placas: string | null };
  solicitante: { id: number; nombre: string } | null;
  encargado: { id: number; nombre: string } | null;
  regresoPrevisto: string | null;
  salida: MomentoRegistrado | null;
  devolucion: MomentoRegistrado | null;
  kmRecorridos: number | null;
  kmEsperados: number | null;
  alertasKm: AlertaKm[];
  firmas: FirmasUso | null;
  danos: { estatus: string | null; propuestos: number; confirmados: number };
  incidencias: { id: number; tipo: string; estatus: string; descripcion: string; quienPaga: string; costo?: number | null }[];
  /** `null` = no le toca ver montos. */
  costoIncidencias: number | null;
  /** Lo que el libro de costos cargó al viaje; solo dirección. */
  costoViaje: number | null;
};

export type VehiculosDeActividad = {
  actividad: { id: number; folio: string; titulo: string; estatus: string };
  usos: UsoDeActividad[];
};

export async function vehiculosDeActividad(token: string, actividadId: number | string): Promise<VehiculosDeActividad> {
  const data = await erpFetch<Partial<VehiculosDeActividad>>(`vehicles/por-actividad/${actividadId}`, token);
  return {
    actividad: data?.actividad ?? { id: Number(actividadId), folio: "", titulo: "", estatus: "" },
    usos: (data?.usos ?? []).map((u) => ({ ...u, alertasKm: u.alertasKm ?? [], incidencias: u.incidencias ?? [] })),
  };
}

/** ¿La unidad sigue fuera? Para el aviso «devuelve la unidad» al cerrar la actividad. */
export function unidadSigueFuera(uso: Pick<UsoDeActividad, "estatus" | "salida" | "devolucion">): boolean {
  return uso.estatus === "En uso" || (Boolean(uso.salida) && !uso.devolucion);
}

/* ── Daños que propone la IA ─────────────────────────────────────────── */

export type Severidad = "leve" | "media" | "grave";
export const ETIQUETA_SEVERIDAD: Record<Severidad, string> = {
  leve: "Leve (estético)",
  media: "Media (requiere taller)",
  grave: "Grave (seguridad o uso)",
};

export const MOTIVOS_DESCARTE = [
  { valor: "YA_ESTABA", etiqueta: "Ya estaba al salir" },
  { valor: "REFLEJO_O_SUCIEDAD", etiqueta: "Reflejo, sombra o suciedad" },
  { valor: "NO_ES_DANO", etiqueta: "No es un daño" },
  { valor: "OTRO", etiqueta: "Otro" },
] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number]["valor"];

export const QUIEN_PAGA = [
  { valor: "EMPRESA", etiqueta: "Empresa" },
  { valor: "RESPONSABLE", etiqueta: "Responsable (lo aprueba dirección)" },
  { valor: "SEGURO", etiqueta: "Seguro" },
] as const;
export type QuienPaga = (typeof QUIEN_PAGA)[number]["valor"];

export type EstatusHallazgo = "PROPUESTO" | "CONFIRMADO" | "DESCARTADO";

export type HallazgoDano = {
  id: number;
  controlId: number;
  zona: string;
  etiquetaZona: string;
  descripcion: string;
  severidad: Severidad;
  confianza: number;
  fotoSalidaUrl: string | null;
  fotoDevolucionUrl: string | null;
  estatus: EstatusHallazgo;
  motivoDescarte: MotivoDescarte | null;
  createdAt: string;
  control: {
    id: number;
    nombreVehiculo: string | null;
    placasVehiculo: string | null;
    fechaFin: string | null;
    odometroInicio: number | null;
    odometroFin: number | null;
    kmEsperados: number | null;
    vehiculo: { id: number; nombre: string; placas: string | null } | null;
    solicitante: { id: number; nombre: string } | null;
    encargado: { id: number; nombre: string } | null;
    actividad: { id: number; anNumber: string; titulo: string } | null;
  };
  incidencia: { id: number; estatus: string } | null;
};

export async function listarDanos(
  token: string,
  filtros: { estatus?: EstatusHallazgo; uso?: number } = {},
): Promise<HallazgoDano[]> {
  const q = new URLSearchParams();
  if (filtros.estatus) q.set("estatus", filtros.estatus);
  if (filtros.uso) q.set("uso", String(filtros.uso));
  const qs = q.toString();
  const data = await erpFetch<{ hallazgos?: HallazgoDano[] }>(`vehicles/danos${qs ? `?${qs}` : ""}`, token);
  return data?.hallazgos ?? [];
}

export type RevisionDano =
  | { accion: "confirmar"; responsableId?: number | null; costoEstimado?: number | null; quienPaga?: QuienPaga; nota?: string }
  | { accion: "descartar"; motivo: MotivoDescarte; nota?: string };

export function revisarDano(token: string, id: number, revision: RevisionDano) {
  return erpFetch<unknown>(`vehicles/danos/${id}`, token, { method: "PATCH", body: JSON.stringify(revision) });
}

export function analizarDanos(token: string, usoId: number) {
  return erpFetch<{ estatus: string; hallazgos: number }>(`vehicles/${usoId}/analizar-danos`, token, { method: "POST" });
}

/* ── Incidencias ─────────────────────────────────────────────────────── */

export const TIPOS_INCIDENCIA = [
  { valor: "DANO", etiqueta: "Daño" },
  { valor: "MULTA", etiqueta: "Multa" },
  { valor: "FALLA", etiqueta: "Falla mecánica" },
  { valor: "KM_SIN_REGISTRO", etiqueta: "Km sin registro" },
  { valor: "RETRASO", etiqueta: "Retraso en devolución" },
  { valor: "OTRO", etiqueta: "Otro" },
] as const;
export type TipoIncidencia = (typeof TIPOS_INCIDENCIA)[number]["valor"];
export type EstatusIncidencia = "ABIERTA" | "EN_REPARACION" | "CERRADA";

export type IncidenciaVehiculo = {
  id: number;
  tipo: TipoIncidencia;
  descripcion: string;
  estatus: EstatusIncidencia;
  quienPaga: QuienPaga;
  cobroEstatus: "PENDIENTE" | "APROBADO" | "RECHAZADO" | null;
  costoEstimado: number | null;
  costoReal: number | null;
  fotos: string[] | null;
  createdAt: string;
  vehiculo: { id: number; nombre: string; placas: string | null } | null;
  responsable: { id: number; nombre: string } | null;
  control: { id: number; actividad: { id: number; anNumber: string; titulo: string } | null } | null;
};

export async function listarIncidencias(
  token: string,
  filtros: { estatus?: EstatusIncidencia; vehiculo?: number; responsable?: number } = {},
): Promise<IncidenciaVehiculo[]> {
  const q = new URLSearchParams();
  if (filtros.estatus) q.set("estatus", filtros.estatus);
  if (filtros.vehiculo) q.set("vehiculo", String(filtros.vehiculo));
  if (filtros.responsable) q.set("responsable", String(filtros.responsable));
  const qs = q.toString();
  const data = await erpFetch<{ incidencias?: IncidenciaVehiculo[] }>(`vehicles/incidencias${qs ? `?${qs}` : ""}`, token);
  return data?.incidencias ?? [];
}

export function crearIncidencia(
  token: string,
  datos: {
    tipo: TipoIncidencia;
    descripcion: string;
    vehicleAssetId?: number | null;
    controlId?: number | null;
    responsableId?: number | null;
    costoEstimado?: number | null;
    quienPaga?: QuienPaga;
  },
) {
  if (datos.descripcion.trim().length < 5) throw new Error("Describe qué pasó");
  return erpFetch<IncidenciaVehiculo>("vehicles/incidencias", token, { method: "POST", body: JSON.stringify(datos) });
}

export function actualizarIncidencia(
  token: string,
  id: number,
  cambios: { estatus?: EstatusIncidencia; costoEstimado?: number | null; costoReal?: number | null; quienPaga?: QuienPaga; responsableId?: number | null },
) {
  return erpFetch<IncidenciaVehiculo>(`vehicles/incidencias/${id}`, token, { method: "PATCH", body: JSON.stringify(cambios) });
}

/** Cobrar el daño al responsable: solo dirección. */
export function revisarCobro(token: string, id: number, decision: "APROBADO" | "RECHAZADO") {
  return erpFetch<IncidenciaVehiculo>(`vehicles/incidencias/${id}/cobro`, token, {
    method: "PATCH",
    body: JSON.stringify({ decision }),
  });
}

/* ── Cuadros del video en el navegador ───────────────────────────────── */

/**
 * Saca los 8 cuadros de la vuelta de un video grabado en el navegador (Liz en persona, o la web en un
 * teléfono). Las apps lo hacen con MediaMetadataRetriever / AVAssetImageGenerator con los mismos tiempos.
 */
export async function extraerCuadrosVuelta(
  video: Blob,
  opciones: { anchoMax?: number; calidad?: number } = {},
): Promise<{ duracionSeg: number; cuadros: Blob[] }> {
  if (typeof document === "undefined") throw new Error("Solo en el navegador");
  const url = URL.createObjectURL(video);
  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.preload = "auto";
  el.src = url;
  try {
    await new Promise<void>((ok, mal) => {
      el.onloadedmetadata = () => ok();
      el.onerror = () => mal(new Error("No se pudo leer el video"));
    });
    const duracionSeg = el.duration;
    const ancho = Math.min(opciones.anchoMax ?? 1280, el.videoWidth || 1280);
    const alto = Math.round((ancho * (el.videoHeight || 720)) / (el.videoWidth || 1280));
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("El navegador no deja dibujar el video");
    const cuadros: Blob[] = [];
    for (const t of tiemposCuadrosVuelta(duracionSeg)) {
      await new Promise<void>((ok) => {
        el.onseeked = () => ok();
        el.currentTime = t;
      });
      ctx.drawImage(el, 0, 0, ancho, alto);
      const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", opciones.calidad ?? 0.85));
      if (!blob) throw new Error("No se pudo sacar un cuadro del video");
      cuadros.push(blob);
    }
    return { duracionSeg, cuadros };
  } finally {
    URL.revokeObjectURL(url);
  }
}
