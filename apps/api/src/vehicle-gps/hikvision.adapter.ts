/**
 * Adaptador Hikvision — Hik-Connect for Teams (HCT) OpenAPI, monitoreo a bordo.
 *
 * Todo lo de aquí sale de la documentación local
 * (`C:\dev\apps\HIKVISION-apps\docs\API-DOCS\HIKVISION\HikConnect-Team\`):
 * `llms-full.txt` §2.23, §2.25, §5.1–5.3 y `APENDICE-A.md` (tipos de mensaje).
 * No hay ni un endpoint ni un campo inventado.
 *
 * Cómo llega la posición de un vehículo en HCT: **no hay un «dame la última
 * posición»**. El equipo a bordo publica `Msg330001` (Reporte de datos GPS) en
 * la cola de mensajes crudos, y uno la sondea. Por eso el flujo es:
 *
 *   1. `POST /api/hccgw/platform/v1/token/get`        → token (7 días) + areaDomain
 *   2. `POST /api/hccgw/rawmsg/v1/mq/subscribe`       → suscribirse a Msg330001
 *   3. `POST /api/hccgw/rawmsg/v1/mq/messages`        → lote de eventos + batchId
 *   4. `POST /api/hccgw/rawmsg/v1/mq/messages/complete` → acusar el batchId
 *
 * Trampas documentadas que respetamos:
 *   - Webhook y sondeo son EXCLUYENTES. Aquí se sondea; si algún día se
 *     configura webhook en la cuenta, este adaptador deja de recibir.
 *   - Los mensajes se retienen 2 días y la suscripción se autocancela si nadie
 *     consume: por eso `puntosRecientes` vuelve a suscribirse en cada pasada.
 *   - Límite de 5 req/s en toda la cuenta.
 *   - El paquete gratuito de monitoreo a bordo son 10 vehículos.
 */

import { HikConnectTeamsClient } from '../hikvision-hct/index.js';
import { coordenadaValida, quitarRepetidos, type ProveedorGps, type PuntoGps } from './posiciones.js';

/** `Msg330001` = Reporte de datos GPS (APENDICE-A.md, tipos de mensaje). */
export const MSG_GPS = 'Msg330001';
/** `Msg330002` = alarma de botón de pánico; trae el mismo bloque `gpsInfo`. */
export const MSG_GPS_ALT = 'Msg330002';

/** El bloque `vehicleRelatedInfo.gpsInfo` tal cual lo documenta HCT §5.2. */
export type GpsInfoHik = {
  ew?: string;
  ns?: string;
  lat?: string;
  lng?: string;
  direction?: number;
  height?: number;
  speed?: number;
};

export type EventoMqHik = {
  basicInfo?: {
    occurrenceTime?: string;
    msgType?: string;
    resource?: { id?: string; name?: string };
    device?: { id?: string; name?: string; category?: string };
  };
  data?: {
    vehicleRelatedInfo?: {
      gpsInfo?: GpsInfoHik;
      vehicleInfo?: { id?: string; licensePlate?: string; driverName?: string };
    };
  };
};

/**
 * `speed` viene en cm/h (Developer Guide §A.3.100). 1 km/h = 100 000 cm/h.
 * Referencia: `demos/Hikauto/apps/backend/src/utils/gpsParser.ts`.
 */
export function velocidadKmhDesdeCmH(speedCmH: unknown): number | null {
  const n = Number(speedCmH);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round((n / 100_000) * 100) / 100;
}

/**
 * `direction` en grados desde el norte. Los ejemplos oficiales traen a veces
 * valores crudos > 360 (p. ej. 32759): se interpretan como centésimas de grado.
 */
export function rumboDesdeDireccion(direction: unknown): number | null {
  const n = Number(direction);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n <= 360) return Math.round(n * 100) / 100;
  return Math.round((n / 100) % 360);
}

/** El signo de la coordenada lo da el hemisferio (`ns` = N/S, `ew` = E/W). */
export function coordenadaConHemisferio(
  valor: unknown,
  hemisferio: unknown,
  negativo: 'S' | 'W',
): number | null {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const h = String(hemisferio ?? '').trim().toUpperCase();
  return h === negativo ? -Math.abs(n) : Math.abs(n);
}

/**
 * HCT entrega `occurrenceTime` como «2023-05-08 11:15:26», hora local del
 * área, sin zona. Se interpreta en la zona que se le indique (México, -6).
 */
export function instanteHik(occurrenceTime: unknown, offsetHoras = -6): Date | null {
  if (typeof occurrenceTime !== 'string') return null;
  const m = occurrenceTime.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mes, d, h, min, s] = m;
  const utc = Date.UTC(+y, +mes - 1, +d, +h, +min, +s) - offsetHoras * 3_600_000;
  const fecha = new Date(utc);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Traduce un evento de la cola a un punto nuestro. Devuelve `null` cuando el
 * evento no trae GPS utilizable — que es lo normal en la mayoría de alarmas.
 *
 * El id de equipo es `basicInfo.device.name`, que en los payloads de HCT es el
 * número de serie del equipo a bordo (así lo resuelve el demo oficial Hikauto).
 */
export function puntoDesdeEvento(evento: EventoMqHik, offsetHoras = -6): PuntoGps | null {
  const gps = evento?.data?.vehicleRelatedInfo?.gpsInfo;
  if (!gps) return null;

  const lat = coordenadaConHemisferio(gps.lat, gps.ns, 'S');
  const lng = coordenadaConHemisferio(gps.lng, gps.ew, 'W');
  if (lat == null || lng == null || !coordenadaValida(lat, lng)) return null;

  const at = instanteHik(evento?.basicInfo?.occurrenceTime, offsetHoras);
  if (!at) return null;

  const dispositivoId =
    evento?.basicInfo?.device?.name ||
    evento?.data?.vehicleRelatedInfo?.vehicleInfo?.id ||
    evento?.basicInfo?.resource?.id;
  if (!dispositivoId) return null;

  return {
    dispositivoId: String(dispositivoId),
    lat,
    lng,
    velocidadKmh: velocidadKmhDesdeCmH(gps.speed),
    rumbo: rumboDesdeDireccion(gps.direction),
    at,
  };
}

/** Todos los puntos de un lote de la cola, sin repetidos. */
export function puntosDesdeLote(eventos: EventoMqHik[] | undefined, offsetHoras = -6): PuntoGps[] {
  const puntos: PuntoGps[] = [];
  for (const ev of eventos ?? []) {
    const p = puntoDesdeEvento(ev, offsetHoras);
    if (p) puntos.push(p);
  }
  return quitarRepetidos(puntos);
}

export type OpcionesHikvision = {
  /** areaDomain inicial; México va a Norteamérica (`ius.hikcentralconnect.com`). */
  host: string;
  appKey: string;
  secretKey: string;
  offsetHoras?: number;
};

/**
 * Cliente de la cola. Se apoya en `HikConnectTeamsClient`, que ya resuelve
 * token/get, el `areaDomain` de la respuesta y el `errorCode !== '0'`.
 */
export class HikvisionGpsProvider implements ProveedorGps {
  readonly nombre = 'hikvision';
  readonly demo = false;
  readonly configurado: boolean;

  private readonly offsetHoras: number;
  private suscrito = false;

  constructor(
    opciones: OpcionesHikvision,
    private readonly cliente: Pick<HikConnectTeamsClient, 'configured'> & {
      rawmsgSubscribe(msgTypes: string[]): Promise<unknown>;
      rawmsgMessages(): Promise<{ batchId?: string; event?: EventoMqHik[] }>;
      rawmsgComplete(batchId: string): Promise<unknown>;
    } = crearClienteHct(opciones),
  ) {
    this.configurado = Boolean(opciones.host && opciones.appKey && opciones.secretKey);
    this.offsetHoras = opciones.offsetHoras ?? -6;
  }

  /**
   * Una pasada de sondeo: asegura la suscripción, baja un lote, lo acusa y
   * devuelve los puntos de los equipos que nos interesan.
   *
   * `desde` sirve para descartar lo que ya guardamos; la cola de HCT no filtra
   * por fecha, así que el filtro es nuestro.
   */
  async puntosRecientes(dispositivos: string[], desde: Date | null): Promise<PuntoGps[]> {
    if (!this.configurado || dispositivos.length === 0) return [];

    if (!this.suscrito) {
      // La suscripción se autocancela si nadie consume en 2 días, así que se
      // reintenta sin ruido en cada arranque.
      await this.cliente.rawmsgSubscribe([MSG_GPS, MSG_GPS_ALT]);
      this.suscrito = true;
    }

    const lote = await this.cliente.rawmsgMessages();
    const puntos = puntosDesdeLote(lote?.event, this.offsetHoras);

    // Acusar el lote es obligatorio: sin `complete` la cola lo vuelve a servir.
    if (lote?.batchId) {
      await this.cliente.rawmsgComplete(lote.batchId);
    }

    const interesan = new Set(dispositivos.map((d) => String(d)));
    return puntos.filter(
      (p) => interesan.has(p.dispositivoId) && (!desde || p.at.getTime() > desde.getTime()),
    );
  }
}

/**
 * Envoltorio sobre `HikConnectTeamsClient` con los tres endpoints de la cola.
 * Se deja aparte para poder inyectar un doble en las pruebas.
 */
export function crearClienteHct(opciones: OpcionesHikvision) {
  const base = new HikConnectTeamsClient({
    host: opciones.host,
    appKey: opciones.appKey,
    secretKey: opciones.secretKey,
    scope: 'vehicle-gps-hct',
  });
  // `post` es privado en el cliente; se usa por índice para no duplicar la
  // gestión de token/areaDomain/errorCode, que ya está probada.
  const post = (base as unknown as {
    post<T>(path: string, body: Record<string, unknown>): Promise<T>;
  }).post.bind(base);

  return {
    configured: base.configured,
    /** Documentado: HCT §5.1 */
    rawmsgSubscribe: (msgType: string[]) =>
      post<unknown>('/api/hccgw/rawmsg/v1/mq/subscribe', { subscribeType: 1, msgType }),
    /** Documentado: HCT §5.2 */
    rawmsgMessages: () =>
      post<{ batchId?: string; event?: EventoMqHik[] }>('/api/hccgw/rawmsg/v1/mq/messages', {}),
    /** Documentado: HCT §5.3 */
    rawmsgComplete: (batchId: string) =>
      post<unknown>('/api/hccgw/rawmsg/v1/mq/messages/complete', { batchId }),
  };
}
