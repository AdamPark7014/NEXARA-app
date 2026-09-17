/**
 * URLs de mapa estático — siempre contra nuestra API, nunca contra Google.
 *
 * Antes cada `<img>` apuntaba a `maps.googleapis.com/.../staticmap?...&key=…`:
 * una petición facturada por vista, por usuario y por recarga, con la clave
 * pública a la vista en el HTML. Ahora apuntan a `/api/static-map`, que cachea
 * en disco por coordenada redondeada (ver `apps/api/src/common/maps`). La
 * segunda vista del mismo punto —de quien sea— ya no cuesta.
 *
 * Las coordenadas se redondean aquí también, para que el navegador reutilice su
 * propia caché y para que un punto GPS que se mueve 10 cm no genere una URL
 * distinta.
 */

import { buildApiUrl } from "@/lib/api-base";

/** Igual que en la API: 5 decimales ≈ 1.1 m. */
export const COORD_DECIMALS = 5;

export type StaticMapOptions = {
  zoom?: number;
  width?: number;
  height?: number;
  mapType?: "roadmap" | "hybrid" | "satellite" | "terrain";
};

export const roundCoord = (value: number): number => Number(value.toFixed(COORD_DECIMALS));

export const hasUsableCoords = (lat?: number | string | null, lng?: number | string | null): boolean => {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a) <= 90 && Math.abs(b) <= 180
    // 0,0 es lo que deja una checada sin permiso de ubicación.
    && !(a === 0 && b === 0);
};

/** Imagen de un punto. Cadena vacía si no hay coordenadas utilizables. */
export const staticMapUrl = (
  lat?: number | string | null,
  lng?: number | string | null,
  options: StaticMapOptions = {},
): string => {
  if (!hasUsableCoords(lat, lng)) return "";
  const params = new URLSearchParams({
    lat: String(roundCoord(Number(lat))),
    lng: String(roundCoord(Number(lng))),
    zoom: String(options.zoom ?? 16),
    w: String(options.width ?? 600),
    h: String(options.height ?? 400),
  });
  if (options.mapType && options.mapType !== "roadmap") params.set("type", options.mapType);
  return buildApiUrl(`static-map?${params.toString()}`);
};

/**
 * Imagen de un recorrido. Los puntos se muestrean y redondean para que dos
 * lecturas del mismo trayecto compartan URL —y por tanto caché— aunque el GPS
 * haya añadido puntos intermedios.
 */
export const staticRouteMapUrl = (
  points: Array<{ lat: number; lng: number }>,
  options: StaticMapOptions = {},
): string => {
  const usable = points.filter((point) => hasUsableCoords(point.lat, point.lng));
  if (usable.length === 0) return "";
  if (usable.length === 1) return staticMapUrl(usable[0]!.lat, usable[0]!.lng, options);

  const sampled = samplePoints(usable, 24);
  const center = sampled[Math.floor(sampled.length / 2)]!;
  const params = new URLSearchParams({
    lat: String(roundCoord(center.lat)),
    lng: String(roundCoord(center.lng)),
    w: String(options.width ?? 640),
    h: String(options.height ?? 280),
    path: sampled.map((point) => `${roundCoord(point.lat)},${roundCoord(point.lng)}`).join("|"),
  });
  return buildApiUrl(`static-map?${params.toString()}`);
};

/** Reduce a `max` puntos conservando inicio y fin. */
export const samplePoints = <T>(points: T[], max: number): T[] => {
  if (points.length <= max) return points;
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) out.push(points[Math.round(i * step)]!);
  return out;
};

/** Enlace a Google Maps: gratis, no pasa por la API facturada. */
export const googleMapsLink = (lat?: number | string | null, lng?: number | string | null): string => {
  if (!hasUsableCoords(lat, lng)) return "";
  return `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`;
};
