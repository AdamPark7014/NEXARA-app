/**
 * Ida y vuelta de la oficina a un destino, para el tiempo estándar de las salidas (recolección,
 * entrega, compra, trámite, servicio en sitio).
 *
 * En orden:
 * 1. Google Routes con tráfico (auto o transporte). Pide la API de rutas habilitada y facturación
 *    en `GOOGLE_MAPS_API_KEY`. Al 28-10 está bloqueada (403), así que se salta sola.
 * 2. OSRM (OpenStreetMap), solo auto y sin tráfico: `router.project-osrm.org`, o `OSRM_URL` si hay
 *    uno propio. Para transporte se estima a partir del auto.
 * 3. Aproximado en línea recta × 1.4 a 25 km/h (Puebla urbano), marcado como aproximado.
 */
export type Punto = { lat: number; lng: number };
export type ModoTraslado = 'AUTO' | 'TRANSPORTE';
export type FuenteRuta = 'google' | 'osrm' | 'aproximado';

export type Ruta = {
  idaMin: number;
  vueltaMin: number;
  km: number;
  fuente: FuenteRuta;
  modo: ModoTraslado;
  /** El transporte sin Google sale del auto: se dice. */
  estimado: boolean;
};

const VELOCIDAD_URBANA_KMH = 25;
const FACTOR_CALLES = 1.4;
/** Transporte público contra auto, con espera y transbordos (aproximación sin Google). */
const FACTOR_TRANSPORTE = 2.2;
const ESPERA_TRANSPORTE_MIN = 10;

export function puntoValido(p: Partial<Punto> | null | undefined): p is Punto {
  return (
    p != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(Number(p.lat)) <= 90 &&
    Math.abs(Number(p.lng)) <= 180
  );
}

/** Kilómetros en línea recta (haversine). */
export function kmEnLineaRecta(a: Punto, b: Punto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function rutaAproximada(origen: Punto, destino: Punto, modo: ModoTraslado): Ruta {
  const km = kmEnLineaRecta(origen, destino) * FACTOR_CALLES;
  const auto = Math.max(3, Math.round((km / VELOCIDAD_URBANA_KMH) * 60));
  const tramo = modo === 'TRANSPORTE' ? deAutoATransporte(auto) : auto;
  return { idaMin: tramo, vueltaMin: tramo, km: Math.round(km * 10) / 10, fuente: 'aproximado', modo, estimado: true };
}

export function deAutoATransporte(minAuto: number): number {
  return Math.round(minAuto * FACTOR_TRANSPORTE + ESPERA_TRANSPORTE_MIN);
}

type Pedir = typeof fetch;

async function conTiempo<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fn(c.signal);
  } finally {
    clearTimeout(t);
  }
}

/** Un tramo con Google Routes; null si la llave no sirve o no hay ruta. */
async function tramoGoogle(pedir: Pedir, key: string, de: Punto, a: Punto, modo: ModoTraslado, salida: Date | null) {
  const r = await conTiempo(5_000, (signal) =>
    pedir('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: de.lat, longitude: de.lng } } },
        destination: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
        travelMode: modo === 'TRANSPORTE' ? 'TRANSIT' : 'DRIVE',
        ...(modo === 'AUTO' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
        ...(salida && salida.getTime() > Date.now() ? { departureTime: salida.toISOString() } : {}),
      }),
    }),
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { routes?: Array<{ duration?: string; distanceMeters?: number }> };
  const ruta = j.routes?.[0];
  const seg = Number(String(ruta?.duration ?? '').replace(/s$/, ''));
  if (!ruta || !Number.isFinite(seg)) return null;
  return { min: Math.max(1, Math.round(seg / 60)), km: (ruta.distanceMeters ?? 0) / 1000 };
}

/** Ida y vuelta en una sola consulta a OSRM (origen → destino → origen). */
async function idaYVueltaOsrm(pedir: Pedir, base: string, de: Punto, a: Punto) {
  const url = `${base.replace(/\/$/, '')}/route/v1/driving/${de.lng},${de.lat};${a.lng},${a.lat};${de.lng},${de.lat}?overview=false`;
  const r = await conTiempo(5_000, (signal) =>
    pedir(url, { signal, headers: { 'User-Agent': 'NEXARA-Core/1.0 (tiempo estandar)' } }),
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { code?: string; routes?: Array<{ legs?: Array<{ duration: number; distance: number }> }> };
  const legs = j.routes?.[0]?.legs;
  if (j.code !== 'Ok' || !legs || legs.length < 2) return null;
  return {
    idaMin: Math.max(1, Math.round(legs[0].duration / 60)),
    vueltaMin: Math.max(1, Math.round(legs[1].duration / 60)),
    km: legs[0].distance / 1000,
  };
}

export async function calcularRuta(
  origen: Punto,
  destino: Punto,
  modo: ModoTraslado,
  opciones: { googleKey?: string | null; osrmUrl?: string | null; salida?: Date | null; pedir?: Pedir } = {},
): Promise<Ruta> {
  const pedir = opciones.pedir ?? fetch;
  const key = (opciones.googleKey ?? '').trim();
  if (key) {
    try {
      const ida = await tramoGoogle(pedir, key, origen, destino, modo, opciones.salida ?? null);
      if (ida) {
        const vuelta = (await tramoGoogle(pedir, key, destino, origen, modo, null)) ?? ida;
        return { idaMin: ida.min, vueltaMin: vuelta.min, km: Math.round(ida.km * 10) / 10, fuente: 'google', modo, estimado: false };
      }
    } catch {
      // Sin Google: sigue con OSRM.
    }
  }
  try {
    const o = await idaYVueltaOsrm(pedir, opciones.osrmUrl?.trim() || 'https://router.project-osrm.org', origen, destino);
    if (o) {
      const transporte = modo === 'TRANSPORTE';
      return {
        idaMin: transporte ? deAutoATransporte(o.idaMin) : o.idaMin,
        vueltaMin: transporte ? deAutoATransporte(o.vueltaMin) : o.vueltaMin,
        km: Math.round(o.km * 10) / 10,
        fuente: 'osrm',
        modo,
        estimado: transporte,
      };
    }
  } catch {
    // Sin OSRM: línea recta.
  }
  return rutaAproximada(origen, destino, modo);
}
