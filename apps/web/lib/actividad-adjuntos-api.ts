/**
 * Archivos adjuntos de una actividad (evidencia comercial: Excel, Word, PDF, imágenes…).
 *
 * API (`apps/api/src/activities/attachments`), con la sesión de siempre:
 * - `GET    activities/:id/adjuntos`                          lista (lo más reciente primero)
 * - `POST   activities/:id/adjuntos`                          multipart, campo `files` (1–10, 25 MB c/u)
 * - `DELETE activities/:id/adjuntos/:adjuntoId`               lo quita
 * - `GET    activities/:id/adjuntos/:adjuntoId/archivo`       los bytes con su tipo y nombre original
 * - `GET    activities/:id/adjuntos/:adjuntoId/vista-previa`  HTML sin scripts (Excel, CSV, Word)
 *
 * El `url` del DTO (`/uploads/…`) no se usa para bajar: siempre `/archivo`, que revisa el permiso.
 */
import { apiRequest, buildApiUrl } from "@/lib/api-base";

export type TipoAdjunto = "pdf" | "imagen" | "excel" | "csv" | "word" | "otro";

export type AdjuntoActividad = {
  id: number;
  activityId: number;
  /** Nombre original con extensión y acentos («Propuesta Toks.xlsx»). */
  nombre: string;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
  tipo: TipoAdjunto;
  /** Hay HTML en `/vista-previa`. */
  vistaPrevia: boolean;
  createdAt: string;
  subidoPor: { id: number; nombre: string } | null;
  puedeQuitar: boolean;
};

/** Mismo tope que la API (`ADJUNTO_MAX_BYTES`). */
export const ADJUNTO_MAX_BYTES = 25 * 1024 * 1024;
/** Archivos por envío que acepta la API; si eligen más, se mandan en tandas. */
export const ADJUNTOS_MAX_POR_ENVIO = 10;

const EXTENSIONES = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "heic",
  "heif",
  "xlsx",
  "xlsm",
  "xls",
  "csv",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "txt",
] as const;
const EXTENSIONES_ACEPTADAS = new Set<string>(EXTENSIONES);

/** Para el `accept` del selector de archivos. */
export const ACEPTA_ADJUNTOS = EXTENSIONES.map((e) => `.${e}`).join(",");

/* ─────────────────────────── Lectura (funciones puras) ─────────────────────────── */

export function extensionDe(nombre: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(String(nombre ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

export type IconoAdjunto = "pdf" | "hoja" | "documento" | "imagen" | "archivo";

/** Icono y color por tipo: PDF rojo, Excel/CSV verde, Word azul, imagen morado, el resto gris. */
export function iconoYColor(tipo: TipoAdjunto | string | null | undefined): {
  icono: IconoAdjunto;
  color: string;
  etiqueta: string;
} {
  switch (tipo) {
    case "pdf":
      return { icono: "pdf", color: "#D93025", etiqueta: "PDF" };
    case "excel":
      return { icono: "hoja", color: "#1E7B45", etiqueta: "Excel" };
    case "csv":
      return { icono: "hoja", color: "#1E7B45", etiqueta: "CSV" };
    case "word":
      return { icono: "documento", color: "#2B5FD9", etiqueta: "Word" };
    case "imagen":
      return { icono: "imagen", color: "#7C3AED", etiqueta: "Imagen" };
    default:
      return { icono: "archivo", color: "#6B7280", etiqueta: "Archivo" };
  }
}

const unDecimal = (n: number) => n.toFixed(1).replace(/\.0$/, "");

/** «512 B», «340 KB», «2.3 MB», «1.2 GB». Vacío si no hay tamaño. */
export function tamanoLegible(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (bytes < KB) return `${Math.round(bytes)} B`;
  const kb = Math.round(bytes / KB);
  if (kb < 1024) return `${kb} KB`;
  const mb = bytes / MB;
  if (Number(unDecimal(mb)) < 1024) return `${unDecimal(mb)} MB`;
  return `${unDecimal(bytes / GB)} GB`;
}

const ZONA_MX = "America/Mexico_City";
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

let partesMx: Intl.DateTimeFormat | null = null;

/** Fecha y hora de pared en Ciudad de México (no depende de la zona del navegador). */
function enMexico(d: Date): { anio: number; mes: number; dia: number; hora: number; minuto: number } {
  partesMx ??= new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_MX,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const p: Record<string, number> = {};
  for (const parte of partesMx.formatToParts(d)) {
    if (parte.type !== "literal") p[parte.type] = Number(parte.value);
  }
  return { anio: p.year, mes: p.month, dia: p.day, hora: (p.hour ?? 0) % 24, minuto: p.minute ?? 0 };
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * Cuándo pasó, como se dice (igual que Android): «hoy 13:39», «ayer 18:11», «lun 5 oct 18:38» y,
 * si no es de este año, «lun 6 oct 2025 14:00». Hora de México, 24 h. Vacío si no hay fecha.
 */
export function cuandoMx(iso: string | null | undefined, ahora: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const f = enMexico(d);
  const h = enMexico(ahora);
  const hora = `${dosDigitos(f.hora)}:${dosDigitos(f.minuto)}`;
  const dias = Math.round((Date.UTC(h.anio, h.mes - 1, h.dia) - Date.UTC(f.anio, f.mes - 1, f.dia)) / 86_400_000);
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  const semana = DIAS[new Date(Date.UTC(f.anio, f.mes - 1, f.dia)).getUTCDay()];
  const anio = f.anio !== h.anio ? ` ${f.anio}` : "";
  return `${semana} ${f.dia} ${MESES[f.mes - 1]}${anio} ${hora}`;
}

/** La línea gris del renglón: «2.3 MB · Luis Joel · hoy 13:39». */
export function metaDeAdjunto(
  a: Pick<AdjuntoActividad, "sizeBytes" | "subidoPor" | "createdAt">,
  ahora: Date = new Date(),
): string {
  return [tamanoLegible(a.sizeBytes), a.subidoPor?.nombre?.trim() ?? "", cuandoMx(a.createdAt, ahora)]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Antes de subir: separa lo que la API va a aceptar de lo que no (tipo o más de 25 MB), con el aviso
 * para cada uno. Así no se manda un archivo de 80 MB para que lo rechace el servidor.
 */
export function revisarAntesDeSubir<T extends { name: string; size: number }>(
  archivos: readonly T[],
): { listos: T[]; avisos: string[] } {
  const listos: T[] = [];
  const avisos: string[] = [];
  for (const archivo of archivos) {
    if (!EXTENSIONES_ACEPTADAS.has(extensionDe(archivo.name))) {
      avisos.push(`No se puede adjuntar «${archivo.name}». Se aceptan PDF, Excel, Word, PowerPoint, imágenes y texto.`);
    } else if (archivo.size > ADJUNTO_MAX_BYTES) {
      avisos.push(`«${archivo.name}» pesa ${tamanoLegible(archivo.size)}: el límite es 25 MB por archivo.`);
    } else if (archivo.size === 0) {
      avisos.push(`«${archivo.name}» está vacío.`);
    } else {
      listos.push(archivo);
    }
  }
  return { listos, avisos };
}

/* ─────────────────────────────── Cliente HTTP ─────────────────────────────── */

const base = (activityId: number) => `activities/${activityId}/adjuntos`;

function conSesion(token: string | null | undefined, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return { ...init, credentials: "include", headers };
}

/** El mensaje legible de la API (`{ message }`) o uno nuestro; nunca HTML ni la ruta interna. */
async function mensajeDelApi(res: Response, porOmision: string): Promise<string> {
  if (res.status === 401) return "Tu sesión venció: vuelve a entrar.";
  if (res.status === 413) return "El archivo pesa más de 25 MB: el límite es 25 MB por archivo.";
  let texto = "";
  try {
    texto = await res.text();
  } catch {
    /* sin cuerpo */
  }
  try {
    const cuerpo = JSON.parse(texto) as { message?: unknown };
    const m = Array.isArray(cuerpo?.message)
      ? cuerpo.message.filter((x): x is string => typeof x === "string").join(", ")
      : cuerpo?.message;
    if (typeof m === "string" && m.trim()) return m.trim();
  } catch {
    /* no era JSON */
  }
  return `${porOmision} (HTTP ${res.status})`;
}

async function exigirOk(res: Response, porOmision: string): Promise<Response> {
  if (!res.ok) throw new Error(await mensajeDelApi(res, porOmision));
  return res;
}

export async function listarAdjuntos(
  token: string | null | undefined,
  activityId: number,
  signal?: AbortSignal,
): Promise<AdjuntoActividad[]> {
  const res = await exigirOk(
    await apiRequest(base(activityId), conSesion(token, { signal })),
    "No se pudieron cargar los archivos",
  );
  const lista = (await res.json()) as unknown;
  return Array.isArray(lista) ? (lista as AdjuntoActividad[]) : [];
}

/** Sube uno o varios (en tandas de 10). Devuelve los creados, en el orden en que la API los regresa. */
export async function subirAdjuntos(
  token: string | null | undefined,
  activityId: number,
  archivos: readonly File[],
): Promise<AdjuntoActividad[]> {
  const creados: AdjuntoActividad[] = [];
  for (let i = 0; i < archivos.length; i += ADJUNTOS_MAX_POR_ENVIO) {
    const cuerpo = new FormData();
    for (const archivo of archivos.slice(i, i + ADJUNTOS_MAX_POR_ENVIO)) cuerpo.append("files", archivo, archivo.name);
    const res = await exigirOk(
      await apiRequest(base(activityId), conSesion(token, { method: "POST", body: cuerpo })),
      "No se pudo subir el archivo",
    );
    const tanda = (await res.json()) as unknown;
    if (Array.isArray(tanda)) creados.push(...(tanda as AdjuntoActividad[]));
  }
  return creados;
}

export async function quitarAdjunto(token: string | null | undefined, activityId: number, adjuntoId: number): Promise<void> {
  await exigirOk(
    await apiRequest(`${base(activityId)}/${adjuntoId}`, conSesion(token, { method: "DELETE" })),
    "No se pudo quitar el archivo",
  );
}

/** URL del archivo en la API (para «Abrir fuera del visor»; viaja la cookie de sesión). */
export function urlArchivoAdjunto(activityId: number, adjuntoId: number): string {
  return buildApiUrl(`${base(activityId)}/${adjuntoId}/archivo`);
}

/** Los bytes del archivo, bajados con la sesión. */
export async function bajarArchivo(
  token: string | null | undefined,
  activityId: number,
  adjuntoId: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const res = await exigirOk(
    await apiRequest(`${base(activityId)}/${adjuntoId}/archivo`, conSesion(token, { signal })),
    "No se pudo bajar el archivo",
  );
  return res.blob();
}

/** HTML autocontenido y sin scripts de un Excel, CSV o Word (para `<iframe sandbox srcdoc>`). */
export async function vistaPrevia(
  token: string | null | undefined,
  activityId: number,
  adjuntoId: number,
  signal?: AbortSignal,
): Promise<string> {
  const res = await exigirOk(
    await apiRequest(`${base(activityId)}/${adjuntoId}/vista-previa`, conSesion(token, { signal })),
    "No se pudo armar la vista previa",
  );
  return res.text();
}
