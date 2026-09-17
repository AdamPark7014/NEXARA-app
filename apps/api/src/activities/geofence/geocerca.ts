/**
 * Geocerca de actividades: quien inicia una actividad (foto de entrada con GPS) debe
 * permanecer y registrar la salida dentro de este radio alrededor de ese punto.
 * Espejo en las apps: Android `ActivityGeofence.kt`, iOS `ActivityGeofence.swift`.
 */
export const RADIO_ACTIVIDAD_M = 100;

export type Punto = { lat: number; lng: number };

const RADIO_TIERRA_M = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia sobre la superficie (haversine), en metros enteros. */
export function distanciaM(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Punto real o `null` (el (0,0) exacto es un teléfono sin permiso, no una lectura). */
export function puntoReal(lat: unknown, lng: unknown): Punto | null {
  const la = lat == null ? NaN : Number(lat);
  const ln = lng == null ? NaN : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { lat: la, lng: ln };
}

export function fueraDeZona(origen: Punto, punto: Punto, radioM = RADIO_ACTIVIDAD_M): boolean {
  return distanciaM(origen, punto) > radioM;
}

/** Mensaje al bloquear la foto de salida. */
export function mensajeSalidaFueraDeZona(distancia: number, radioM = RADIO_ACTIVIDAD_M): string {
  return (
    `La salida se registra donde iniciaste la actividad: estás a ${distancia} m y el máximo es ${radioM} m. ` +
    'Regresa al punto de inicio para tomar la foto de salida.'
  );
}
