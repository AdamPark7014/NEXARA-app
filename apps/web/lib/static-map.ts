/**
 * Utilidades de coordenadas y enlaces a Google Maps.
 *
 * Aquí vivían también los constructores de URL de mapa estático (`/api/static-map`, que a su vez
 * pedía la imagen a Google Static Maps). Desde el 23-10-2026 Google contesta 403 «You must enable
 * Billing» (el proyecto de Google Cloud no tiene facturación) y esas imágenes salían rotas. Los
 * mapas del panel se dibujan ahora en el navegador con MapLibre + OpenFreeMap:
 * `components/mapas/MapaUbicacion.tsx` (fijar un punto), `components/mapas/MapaVistaPrevia.tsx`
 * (vistas previas) y `components/asistencias/RecorridoMapa.tsx` (recorrido del día).
 *
 * Los enlaces de abajo abren Google Maps en una pestaña: son gratis, no pasan por ninguna API.
 */

export const hasUsableCoords = (lat?: number | string | null, lng?: number | string | null): boolean => {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  if (lat === "" || lng === "") return false;
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a) <= 90 && Math.abs(b) <= 180
    // 0,0 es lo que deja una checada sin permiso de ubicación.
    && !(a === 0 && b === 0);
};

/** Enlace a Google Maps: gratis, no pasa por la API facturada. */
export const googleMapsLink = (lat?: number | string | null, lng?: number | string | null): string => {
  if (!hasUsableCoords(lat, lng)) return "";
  return `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`;
};
