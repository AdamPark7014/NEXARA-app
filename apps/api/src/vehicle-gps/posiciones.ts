/**
 * Reglas puras del GPS de la flotilla: normalizar un punto venga de donde
 * venga, quitar los repetidos y medir el recorrido de un día.
 *
 * Esto NO sabe de Hikvision ni de Prisma. Cada proveedor traduce su formato a
 * `PuntoGps` en su adaptador; de aquí para abajo todos los puntos son iguales.
 */

/** Un punto ya normalizado, listo para guardarse en `VehiclePosition`. */
export type PuntoGps = {
  /** Id del equipo en el proveedor (`VehicleAsset.gpsDispositivoId`). */
  dispositivoId: string;
  lat: number;
  lng: number;
  velocidadKmh: number | null;
  /** Grados 0–359 desde el norte. */
  rumbo: number | null;
  /** Hora del punto según el GPS, no la de llegada al servidor. */
  at: Date;
};

/** Lo que cualquier proveedor de rastreo tiene que saber hacer. */
export interface ProveedorGps {
  /** Nombre corto que se guarda en `VehicleAsset.gpsProveedor`. */
  readonly nombre: string;
  /** `true` cuando los puntos son inventados y hay que decirlo en pantalla. */
  readonly demo: boolean;
  /** `false` si faltan credenciales: la pantalla lo dice en vez de fallar. */
  readonly configurado: boolean;
  /**
   * Trae los puntos nuevos desde la última sincronización.
   * @param dispositivos ids de equipo de los vehículos que nos interesan.
   */
  puntosRecientes(dispositivos: string[], desde: Date | null): Promise<PuntoGps[]>;
}

const LAT_MAX = 90;
const LNG_MAX = 180;

/** Una coordenada utilizable. 0,0 es el Golfo de Guinea: es «sin señal». */
export function coordenadaValida(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (Math.abs(la) > LAT_MAX || Math.abs(lo) > LNG_MAX) return false;
  return !(la === 0 && lo === 0);
}

/**
 * La llave natural de un punto: un mismo equipo no puede estar en dos sitios
 * en el mismo segundo. Con esto una reentrega del proveedor no duplica nada.
 */
export function llavePunto(dispositivoId: string, at: Date): string {
  return `${dispositivoId}|${at.toISOString()}`;
}

/** Quita repetidos dentro de un mismo lote, quedándose con el primero. */
export function quitarRepetidos(puntos: PuntoGps[]): PuntoGps[] {
  const vistos = new Set<string>();
  const limpios: PuntoGps[] = [];
  for (const p of puntos) {
    const llave = llavePunto(p.dispositivoId, p.at);
    if (vistos.has(llave)) continue;
    vistos.add(llave);
    limpios.push(p);
  }
  return limpios;
}

const RADIO_TIERRA_M = 6_371_000;

/** Haversine. Metros entre dos puntos. */
export function distanciaM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Salto imposible entre dos puntos seguidos. Un rastreador que reporta mal
 * manda de vez en cuando una coordenada a medio océano; no queremos que el
 * recorrido del día diga 4 000 km.
 */
export const SALTO_MAX_M = 20_000;

/** Kilómetros del recorrido, ignorando saltos imposibles. */
export function kmRecorrido(puntos: Array<{ lat: number; lng: number }>): number {
  let metros = 0;
  for (let i = 1; i < puntos.length; i++) {
    const tramo = distanciaM(puntos[i - 1], puntos[i]);
    if (tramo <= SALTO_MAX_M) metros += tramo;
  }
  return Math.round((metros / 1000) * 10) / 10;
}

/** El día `YYYY-MM-DD` en hora de México, como rango [inicio, fin). */
export function rangoDelDia(fecha: string, offsetHoras = -6): { desde: Date; hasta: Date } {
  const [y, m, d] = fecha.split('-').map(Number);
  if (!y || !m || !d) throw new Error('Fecha inválida, se espera YYYY-MM-DD');
  const desde = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetHoras * 3_600_000);
  return { desde, hasta: new Date(desde.getTime() + 24 * 3_600_000) };
}
