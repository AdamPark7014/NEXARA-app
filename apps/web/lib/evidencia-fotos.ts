import { formatApiError } from "@/lib/erp-api";

export type GeoDeFoto = { latitude: number; longitude: number; capturedAt: string | null };

/**
 * Ubicación de cada foto libre ya guardada (`evidencePhotosGeo` del GET), alineada con
 * `evidencePhotos`: siempre `count` posiciones, `null` donde no hay ubicación válida.
 */
export function geoDeFotosGuardadas(raw: unknown, count: number): Array<GeoDeFoto | null> {
  const lista = Array.isArray(raw) ? raw : [];
  const out: Array<GeoDeFoto | null> = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    const g = lista[i] as { latitude?: unknown; longitude?: unknown; capturedAt?: unknown } | null | undefined;
    const lat = Number(g?.latitude);
    const lng = Number(g?.longitude);
    const valida =
      g != null &&
      g.latitude != null &&
      g.longitude != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0);
    out.push(
      valida
        ? { latitude: lat, longitude: lng, capturedAt: typeof g?.capturedAt === "string" ? g.capturedAt : null }
        : null,
    );
  }
  return out;
}

/** `fetch` rechaza con `TypeError` cuando no hay red (el servidor nunca respondió). */
export function esErrorDeRed(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof TypeError;
}

/** Texto cuando agregar o quitar una foto no llegó al servidor: sin red se dice claro qué pasó. */
export function mensajeFotoNoGuardada(
  err: unknown,
  fallback: string,
  accion: "guardar" | "quitar" = "guardar",
): string {
  if (esErrorDeRed(err)) {
    return accion === "quitar"
      ? "Sin conexión: la foto NO se quitó. Intenta de nuevo cuando tengas señal."
      : "Sin conexión: la foto NO se guardó. Sigue aquí en la vista previa; cuando tengas señal toca enviar otra vez.";
  }
  return formatApiError(err, fallback);
}
