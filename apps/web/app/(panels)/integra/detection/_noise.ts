/**
 * Cuánto ruido produce esta cámara.
 *
 * Ajustar la sensibilidad sin ver el efecto es adivinar. Aquí no hay endpoint
 * nuevo: se cuenta con `GET integra/push/events`, que ya existe, filtrando por
 * `deviceIp` y por ventana de tiempo.
 *
 * **El tope importa y se dice en pantalla.** El endpoint devuelve como máximo
 * 300 filas por consulta, así que una cámara desbocada no da «4 812», da
 * «300+». Es una cota inferior honesta; inventar un total que el servidor no
 * ha contado sería peor que no enseñar nada.
 */

import { integraApi } from "../_lib";
import type { PushEvent } from "../_DetectionOverlay";

/** Tope duro del endpoint (`Math.min(limit, 300)` en el controlador). */
export const NOISE_PAGE_LIMIT = 300;

export type NoiseWindow = {
  /** Cuántas filas devolvió el servidor. */
  count: number;
  /** El tope se alcanzó: hay al menos `count`, probablemente más. */
  capped: boolean;
  /** Desglose por tipo de aviso, de más a menos frecuente. */
  byType: Array<{ type: string; count: number }>;
};

export type CameraNoise = {
  hour: NoiseWindow;
  day: NoiseWindow;
  /** Momento en que se midió, para que el operador sepa si está viendo lo viejo. */
  at: number;
};

type EventsPage = { items?: PushEvent[]; total?: number; hasMore?: boolean };

export function summarize(page: EventsPage): NoiseWindow {
  const items = page.items ?? [];
  const tally = new Map<string, number>();
  for (const ev of items) {
    const key = ev.eventType || "sin tipo";
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const byType = [...tally.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  return {
    count: items.length,
    capped: page.hasMore === true || items.length >= NOISE_PAGE_LIMIT,
    byType,
  };
}

async function windowCount(deviceIp: string, hours: number): Promise<NoiseWindow> {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 3600_000);
  const qs = new URLSearchParams({
    deviceIp,
    from: from.toISOString(),
    to: to.toISOString(),
    limit: String(NOISE_PAGE_LIMIT),
  });
  const page = await integraApi<EventsPage>(`integra/push/events?${qs.toString()}`);
  return summarize(page);
}

/**
 * Las dos ventanas que sirven para decidir: la última hora dice si el cambio
 * que acabas de guardar sirvió de algo; las 24 h dan la línea base contra la
 * que compararlo.
 *
 * Se piden en paralelo — son dos consultas independientes al mismo endpoint.
 */
export async function fetchCameraNoise(deviceIp: string): Promise<CameraNoise> {
  const [hour, day] = await Promise.all([windowCount(deviceIp, 1), windowCount(deviceIp, 24)]);
  return { hour, day, at: Date.now() };
}

/**
 * Traducción de los `eventType` que de verdad llegan hoy (los cinco de
 * `isapi.discovery.ts`). Lo que no esté en la tabla se enseña crudo: es
 * preferible un identificador feo a una etiqueta inventada.
 */
const TYPE_ES: Record<string, string> = {
  fielddetection: "Intrusión en zona",
  linedetection: "Cruce de línea",
  facedetection: "Rostro detectado",
  VMD: "Movimiento (VMD)",
  videoloss: "Pérdida de video",
  AccessControllerEvent: "Acceso (terminal)",
};

export function typeLabel(type: string): string {
  return TYPE_ES[type] ?? type;
}

/** Cifra con la marca del tope: «300+» cuando el servidor se quedó corto. */
export function countLabel(w: NoiseWindow): string {
  return w.capped ? `${w.count}+` : String(w.count);
}
