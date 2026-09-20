/**
 * Evidencia por campos (web).
 *
 * Quien asigna define **qué** hay que fotografiar —«Cámara 1», «Rack», «Canalización»— y
 * por cada cosa en qué momentos se pide foto: antes, en progreso, después, en cualquier
 * combinación. Quien ejecuta llena esos huecos desde las apps.
 *
 * Espejo de `apps/api/src/activities/evidence/evidence-fields.helpers.ts`: mismos momentos,
 * mismos límites y la misma regla para saber si dos nombres son «el mismo campo».
 */
import { buildApiUrl } from "@/lib/api-base";
import { erpFetch } from "@/lib/erp-api";
import { triggerBlobDownload } from "@/lib/file-download";

export const MOMENTOS = ["ANTES", "EN_PROGRESO", "DESPUES"] as const;
export type Momento = (typeof MOMENTOS)[number];

/** Límites de la API: más de esto se recorta o se descarta allá. */
export const MAX_CAMPOS = 40;
export const MAX_LARGO_NOMBRE = 120;
export const MAX_LARGO_NOTAS = 500;

export const MOMENTO_LABEL: Record<Momento, string> = {
  ANTES: "Antes",
  EN_PROGRESO: "En progreso",
  DESPUES: "Después",
};

export type FotoDeCampo = {
  id: number;
  momento: Momento;
  photoUrl: string;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string | null;
  por: { id: number; nombre: string } | null;
};

/** `CampoDto` de la API (`GET /activities/:id/evidencia-campos`). */
export type CampoEvidencia = {
  id: number;
  nombre: string;
  momentos: Momento[];
  notas: string | null;
  orden: number;
  fotos: Partial<Record<Momento, FotoDeCampo | null>>;
  pendientes: Momento[];
  completo: boolean;
};

/** Una fila del editor: lo que se escribe antes de mandarlo a la API. */
export type CampoBorrador = {
  /** Llave local para React (no viaja a la API). */
  key: string;
  /** Id del campo cuando ya existe: así conserva sus fotos aunque lo renombren. */
  id?: number | null;
  nombre: string;
  momentos: Momento[];
  notas: string;
};

export type CamposPayload = {
  campos: Array<{ id?: number; nombre: string; momentos: Momento[]; notas?: string }>;
};

/** Atajos para no escribir lo de siempre. `numerar`: «Cámara 1», «Cámara 2»… */
export const PRESETS_CAMPOS: ReadonlyArray<{ nombre: string; momentos: Momento[]; numerar: boolean }> = [
  { nombre: "Cámara", momentos: ["ANTES", "DESPUES"], numerar: true },
  { nombre: "Rack", momentos: ["ANTES", "DESPUES"], numerar: false },
  { nombre: "NVR", momentos: ["DESPUES"], numerar: false },
  { nombre: "Canalización", momentos: ["EN_PROGRESO", "DESPUES"], numerar: false },
  { nombre: "Switch", momentos: ["DESPUES"], numerar: false },
];

/** Quita acentos y deja algo comparable («Cámara 1» y «camara  1» son el mismo campo). */
export function claveDeNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Los momentos sin repetidos y en el orden natural del trabajo. */
export function ordenarMomentos(momentos: readonly Momento[]): Momento[] {
  const set = new Set(momentos);
  return MOMENTOS.filter((m) => set.has(m));
}

let secuencia = 0;
function nuevaLlave(): string {
  secuencia += 1;
  return `campo-${Date.now().toString(36)}-${secuencia}`;
}

export function campoVacio(nombre = "", momentos: Momento[] = ["ANTES", "DESPUES"]): CampoBorrador {
  return { key: nuevaLlave(), id: null, nombre, momentos: ordenarMomentos(momentos), notas: "" };
}

/** Lo que devolvió la API, listo para editar. */
export function borradoresDesdeCampos(campos: readonly CampoEvidencia[]): CampoBorrador[] {
  return [...campos]
    .sort((a, b) => a.orden - b.orden || a.id - b.id)
    .map((c) => ({
      key: `campo-${c.id}`,
      id: c.id,
      nombre: c.nombre,
      momentos: ordenarMomentos(c.momentos),
      notas: c.notas ?? "",
    }));
}

/**
 * Un nombre que todavía no esté en la lista: «Cámara 1», «Cámara 2»… o «Rack», «Rack 2»…
 * Dos campos con el mismo nombre serían dos carpetas iguales en el ZIP (la API descarta el segundo).
 */
export function nombreLibre(base: string, existentes: readonly string[], numerar: boolean): string {
  const usados = new Set(existentes.map(claveDeNombre));
  if (!numerar && !usados.has(claveDeNombre(base))) return base;
  let n = numerar ? 1 : 2;
  while (usados.has(claveDeNombre(`${base} ${n}`))) n += 1;
  return `${base} ${n}`;
}

export type ErroresCampos = {
  /** Mensaje por fila (llave = `CampoBorrador.key`). */
  porFila: Record<string, string>;
  /** Problema de la lista completa (p. ej. demasiados campos). */
  general: string | null;
};

export function validarCampos(filas: readonly CampoBorrador[]): ErroresCampos {
  const porFila: Record<string, string> = {};
  const vistos = new Map<string, string>();

  for (const fila of filas) {
    const nombre = fila.nombre.trim();
    if (!nombre) {
      porFila[fila.key] = "Escribe qué hay que fotografiar o quita esta fila.";
      continue;
    }
    if (nombre.length > MAX_LARGO_NOMBRE) {
      porFila[fila.key] = `El nombre puede tener hasta ${MAX_LARGO_NOMBRE} caracteres.`;
      continue;
    }
    const clave = claveDeNombre(nombre);
    if (vistos.has(clave)) {
      porFila[fila.key] = `Ya hay otro punto llamado «${vistos.get(clave)}». Usa otro nombre (p. ej. «${nombre} 2»).`;
      continue;
    }
    vistos.set(clave, nombre);
    if (fila.momentos.length === 0) {
      porFila[fila.key] = "Elige al menos un momento: antes, en progreso o después.";
      continue;
    }
    if (fila.notas.trim().length > MAX_LARGO_NOTAS) {
      porFila[fila.key] = `La nota puede tener hasta ${MAX_LARGO_NOTAS} caracteres.`;
    }
  }

  const general =
    filas.length > MAX_CAMPOS ? `Caben hasta ${MAX_CAMPOS} puntos por actividad; quita ${filas.length - MAX_CAMPOS}.` : null;
  return { porFila, general };
}

export function hayErrores(errores: ErroresCampos): boolean {
  return Boolean(errores.general) || Object.keys(errores.porFila).length > 0;
}

/** Cuerpo del `PUT /activities/:id/evidencia-campos`: la lista completa, en orden. */
export function payloadDeCampos(filas: readonly CampoBorrador[]): CamposPayload {
  return {
    campos: filas.map((fila) => {
      const notas = fila.notas.trim();
      return {
        ...(fila.id != null && fila.id > 0 ? { id: fila.id } : {}),
        nombre: fila.nombre.trim(),
        momentos: ordenarMomentos(fila.momentos),
        ...(notas ? { notas } : {}),
      };
    }),
  };
}

export function fotosDeCampo(campo: CampoEvidencia): FotoDeCampo[] {
  return MOMENTOS.map((m) => campo.fotos?.[m] ?? null).filter((f): f is FotoDeCampo => Boolean(f));
}

/** Avance sobre los huecos pedidos (campo × momento), como `progresoDeCampos` de la API. */
export function progresoDeCampos(campos: readonly CampoEvidencia[]): { requeridas: number; cumplidas: number } {
  let requeridas = 0;
  let cumplidas = 0;
  for (const campo of campos) {
    for (const momento of campo.momentos) {
      requeridas += 1;
      if (campo.fotos?.[momento]) cumplidas += 1;
    }
  }
  return { requeridas, cumplidas };
}

/**
 * Qué campos se borran al guardar la lista. La API conserva un campo si viene su id y,
 * si no, si viene uno con el mismo nombre; el resto se borra **con sus fotos**.
 */
export function camposQueSeBorran(
  originales: readonly CampoEvidencia[],
  filas: readonly CampoBorrador[],
): CampoEvidencia[] {
  const porId = new Map(originales.map((c) => [c.id, c]));
  const porNombre = new Map(originales.map((c) => [c.nombre.trim().toLowerCase(), c]));
  const conservados = new Set<number>();
  for (const fila of filas) {
    const nombre = fila.nombre.trim();
    if (!nombre) continue;
    const previo = (fila.id != null ? porId.get(fila.id) : undefined) ?? porNombre.get(nombre.toLowerCase());
    if (previo) conservados.add(previo.id);
  }
  return originales.filter((c) => !conservados.has(c.id));
}

/**
 * Nombre del archivo que manda la API en `Content-Disposition`. Prefiere `filename*`
 * (UTF-8, conserva acentos: «AN-0001 Cámara.zip») sobre `filename` (solo ASCII).
 */
export function nombreDeContentDisposition(header: string | null | undefined, porOmision: string): string {
  if (!header) return porOmision;

  const extendido = /(?:^|;)\s*filename\*\s*=\s*([^;]+)/i.exec(header);
  if (extendido) {
    const valor = extendido[1].trim().replace(/^"(.*)"$/, "$1");
    // charset'idioma'valor-codificado (RFC 5987)
    const partes = /^[^']*'[^']*'(.*)$/.exec(valor);
    try {
      const decodificado = limpiarNombre(decodeURIComponent(partes ? partes[1] : valor));
      if (decodificado) return decodificado;
    } catch {
      /* codificación rota: se intenta con `filename` */
    }
  }

  const simple = /(?:^|;)\s*filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]*))/i.exec(header);
  if (simple) {
    const crudo = simple[1] != null ? simple[1].replace(/\\(.)/g, "$1") : (simple[2] ?? "");
    const limpio = limpiarNombre(crudo);
    if (limpio) return limpio;
  }
  return porOmision;
}

function limpiarNombre(nombre: string): string {
  return nombre
    .replace(/[ -]/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
}

/** Nombre de respaldo si la API no dice cómo se llama el ZIP. */
export function nombreZipPorOmision(anNumber?: string | null, titulo?: string | null, activityId?: number): string {
  const base = `${anNumber ?? ""} ${titulo ?? ""}`
    .replace(/[<>:"/\\|?* -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80);
  return `${base || `evidencia-actividad-${activityId ?? ""}`.replace(/-$/, "")}.zip`;
}

/** ¿La API respondió 403? (el error de `erpFetch` trae el JSON de Nest en el mensaje). */
export function esErrorDePermiso(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  try {
    const parsed = JSON.parse(e.message) as { statusCode?: number };
    return parsed?.statusCode === 403;
  } catch {
    return false;
  }
}

// ── API ─────────────────────────────────────────────────────────────────────────

export async function obtenerCamposEvidencia(token: string, activityId: number): Promise<CampoEvidencia[]> {
  const data = await erpFetch<CampoEvidencia[] | null>(`activities/${activityId}/evidencia-campos`, token);
  return Array.isArray(data) ? data : [];
}

/** Reemplaza la lista completa. Mandar `[]` deja la actividad sin campos (vuelve a fotos libres). */
export async function definirCamposEvidencia(
  token: string,
  activityId: number,
  filas: readonly CampoBorrador[],
): Promise<CampoEvidencia[]> {
  const data = await erpFetch<CampoEvidencia[] | null>(`activities/${activityId}/evidencia-campos`, token, {
    method: "PUT",
    body: JSON.stringify(payloadDeCampos(filas)),
  });
  return Array.isArray(data) ? data : [];
}

/**
 * `POST activity-evidence/:id/campos/:fieldId/foto` — mismo cuerpo que entrada/salida:
 * `photoUrl` puede ser data URL; la API la guarda en disco. Responde la lista completa.
 */
export async function guardarFotoDeCampo(
  token: string,
  activityId: number,
  fieldId: number,
  body: {
    momento: Momento;
    photoUrl: string;
    latitude?: number | null;
    longitude?: number | null;
    capturedAt?: string | null;
  },
): Promise<CampoEvidencia[]> {
  const data = await erpFetch<CampoEvidencia[] | null>(
    `activity-evidence/${activityId}/campos/${fieldId}/foto`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        momento: body.momento,
        photoUrl: body.photoUrl,
        ...(body.latitude != null ? { latitude: body.latitude } : {}),
        ...(body.longitude != null ? { longitude: body.longitude } : {}),
        ...(body.capturedAt != null ? { capturedAt: body.capturedAt } : {}),
      }),
    },
  );
  return Array.isArray(data) ? data : [];
}

/** Quita la foto de un hueco (campo × momento); el hueco vuelve a pendiente. */
export async function quitarFotoDeCampo(
  token: string,
  activityId: number,
  fieldId: number,
  momento: Momento,
): Promise<CampoEvidencia[]> {
  const data = await erpFetch<CampoEvidencia[] | null>(
    `activity-evidence/${activityId}/campos/${fieldId}/foto/quitar`,
    token,
    { method: "POST", body: JSON.stringify({ momento }) },
  );
  return Array.isArray(data) ? data : [];
}

/** Huecos pendientes en toda la actividad (campo × momento). */
export function faltanFotosDeCampos(campos: readonly CampoEvidencia[]): number {
  const { requeridas, cumplidas } = progresoDeCampos(campos);
  return Math.max(0, requeridas - cumplidas);
}

/**
 * «Descargar evidencia»: el ZIP con la carpeta de la actividad. Va con la sesión (cookie +
 * Bearer) como las demás descargas; un `<a href>` suelto no la manda y la API responde 401.
 */
export async function descargarEvidenciaZip(
  token: string,
  activityId: number,
  nombreSugerido?: string,
): Promise<string> {
  const res = await fetch(buildApiUrl(`activity-evidence/${activityId}/evidencia.zip`), {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const nombre = nombreDeContentDisposition(
    res.headers.get("Content-Disposition"),
    nombreSugerido || nombreZipPorOmision(null, null, activityId),
  );
  await triggerBlobDownload(blob, nombre, { mimeType: "application/zip" });
  return nombre;
}
