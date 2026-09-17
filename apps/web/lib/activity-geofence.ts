import { erpFetch } from "@/lib/erp-api";

/**
 * Geocerca de actividades (espejo web de apps/api/src/activities/geofence/geocerca.ts):
 * quien inicia una actividad (foto de entrada con GPS) debe permanecer y registrar la
 * salida dentro de este radio alrededor de ese punto.
 */
export const RADIO_ACTIVIDAD_M = 100;

export type PuntoGeo = { latitude: number; longitude: number };

/** Lectura GPS del recorrido medida contra el punto de inicio. */
export type GeocercaPunto = PuntoGeo & { at: string; distanciaM: number | null };

/** Salida de la zona (GET …/geocerca y `alertasZona` de las evidencias del equipo). */
export type GeocercaAlerta = {
  id: number;
  detectedAt: string;
  /** Cuándo volvió a entrar al radio; `null` si sigue fuera. */
  returnedAt: string | null;
  /** Distancia al detectar la salida. */
  distanciaM: number;
  /** La mayor distancia registrada mientras estuvo fuera. */
  maxDistanciaM: number;
  radioM: number;
  status: "ABIERTA" | "JUSTIFICADA";
  /** Sigue fuera (returnedAt es null). */
  abierta: boolean;
  justificacion: string | null;
  fotoUrl: string | null;
  justificadaAt: string | null;
  latitude: number;
  longitude: number;
};

export type GeocercaEstado = {
  activityId: number;
  radioM: number;
  origen: (PuntoGeo & { at: string | null }) | null;
  seguimientoActivo: boolean;
  dentro: boolean | null;
  ultimo: GeocercaPunto | null;
  /** Más reciente primero (hasta 40). */
  puntos: GeocercaPunto[];
  alertas: GeocercaAlerta[];
};

const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia sobre la superficie (haversine), en metros enteros. */
export function distanciaM(a: PuntoGeo, b: PuntoGeo): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Punto real o `null` (el (0,0) exacto es un teléfono sin permiso, no una lectura). */
export function puntoReal(lat: unknown, lng: unknown): PuntoGeo | null {
  const la = lat == null || lat === "" ? NaN : Number(lat);
  const ln = lng == null || lng === "" ? NaN : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { latitude: la, longitude: ln };
}

/** Mismo texto con el que la API rechaza la foto de salida fuera del radio. */
export function mensajeSalidaFueraDeZona(distancia: number, radioM = RADIO_ACTIVIDAD_M): string {
  return (
    `La salida se registra donde iniciaste la actividad: estás a ${distancia} m y el máximo es ${radioM} m. ` +
    "Regresa al punto de inicio para tomar la foto de salida."
  );
}

/** «35 m» o «1.2 km». */
export function formatoDistancia(metros: number | null | undefined): string {
  if (metros == null || !Number.isFinite(metros)) return "—";
  if (metros >= 1000) return `${(metros / 1000).toFixed(1)} km`;
  return `${Math.round(metros)} m`;
}

export function fetchGeocerca(token: string, activityId: number): Promise<GeocercaEstado> {
  return erpFetch<GeocercaEstado>(`activity-evidence/${activityId}/geocerca`, token);
}

export function justificarSalidaDeZona(
  token: string,
  activityId: number,
  alertId: number,
  input: { motivo: string; fotoBase64?: string },
): Promise<GeocercaAlerta> {
  return erpFetch<GeocercaAlerta>(`activity-evidence/${activityId}/geocerca/alertas/${alertId}/justificacion`, token, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Foto elegida o tomada → data URL JPEG reducida (lado mayor ≤ 1280 px) para no mandar megas por JSON. */
export function imagenADataUrl(file: File, ladoMax = 1280, calidad = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer la foto"));
    lector.onload = () => {
      const original = typeof lector.result === "string" ? lector.result : "";
      if (!original) {
        reject(new Error("No se pudo leer la foto"));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("El archivo no es una imagen válida"));
      img.onload = () => {
        const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(original);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.src = original;
    };
    lector.readAsDataURL(file);
  });
}
