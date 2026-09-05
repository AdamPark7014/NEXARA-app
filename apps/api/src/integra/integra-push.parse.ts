import type { NormalizedEvent } from './integra-push.service';
import { ACS_MAJOR_DEVICE, acsCodeLabel } from './integra-acs-codes';
import { cameraFaultLabel } from './integra-acs-alarms.policy';
import { isCameraHealthEventType } from '../hikvision-isapi/isapi.detection';

/**
 * Traduce lo que manda un equipo Hikvision a un evento nuestro.
 *
 * Dos dialectos, verificados contra el `alertStream` de los propios equipos:
 * el terminal DS-K1T habla JSON (`AccessControllerEvent`) y la cámara habla
 * XML (`EventNotificationAlert`). Los dos comparten la envoltura —`ipAddress`,
 * `dateTime`, `eventType`— y difieren en lo de dentro.
 */

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/**
 * Estado durativo del aviso. **Documentado** por el fabricante en el Apéndice
 * A.49 del `API_Developer Guide_V1.8.0` (`JSON_EventNotificationAlert_
 * fielddetection`), campo requerido:
 *
 * > «Durative alarm/event status: "active"-valid, "inactive"-invalid, e.g.,
 * > when a moving target is detected, the alarm/event information will be
 * > uploaded continuously until the status is set to "inactive"».
 *
 * O sea: **el equipo avisa cuándo el objetivo se va**. No hace falta adivinarlo
 * con un TTL en el overlay. Cualquier valor que no sea uno de los dos se
 * descarta a `null`: mejor sin dato que con una etiqueta inventada.
 */
export function parseEventState(v: unknown): 'active' | 'inactive' | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'inactive') return 'inactive';
  return null;
}

/**
 * Cuántas veces se ha repetido la MISMA alarma. **Documentado** en el mismo
 * apéndice («Number of times that the same alarm has been triggered», int
 * requerido). Sirve para agrupar duplicados sin heurística: el primer aviso de
 * una racha trae 1 y los siguientes suben.
 *
 * Se aceptan enteros ≥ 0 y se topa a `INT` de Postgres; un firmware que mande
 * basura no debe reventar el INSERT del evento.
 */
export function parseActivePostCount(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 0) return null;
  return Math.min(i, 2_147_483_647);
}

/**
 * Fecha del equipo. Viene con su offset (`2026-08-20T18:38:55-06:00`), así que
 * `Date` la interpreta bien. Si el equipo tiene la hora perdida, se prefiere la
 * de recepción antes que guardar un evento en 1970.
 */
function when(v: unknown): Date {
  const d = new Date(String(v ?? ''));
  const t = d.getTime();
  if (!Number.isFinite(t) || t < 946_684_800_000) return new Date();
  return d;
}

/**
 * Etiqueta legible de un evento de control de acceso.
 *
 * Esta función era la CUARTA copia del mapa de códigos, y estaba mal como las
 * otras tres: llamaba «Acceso concedido (salida)» al `76` —que es un fallo de
 * reconocimiento facial— y «Acceso denegado» a los `21/22/23/24`, que son la
 * puerta abriéndose y el botón de salida. Esa etiqueta es la que se persiste
 * en `label` y la que lee el operador en la consola.
 *
 * Ahora delega en `integra-acs-codes.ts`, que es la única fuente. Aquí solo
 * quedan los `major` que ese catálogo todavía no cubre.
 */
export function acsLabel(major: number | null, minor: number | null): string {
  if (major === ACS_MAJOR_DEVICE) return acsCodeLabel(major, minor);
  if (major === 1) return `Alarma ${minor}`;
  if (major === 2) return `Puerta ${minor}`;
  if (major === 3) return `Excepción ${minor}`;
  return `Evento ${major}.${minor}`;
}

/**
 * Etiqueta de un evento de cámara.
 *
 * Las tres de salud —tapada, desenfocada, movida— salen de
 * `cameraFaultLabel`, que es la misma que se pinta en el título de la alarma
 * SOC. Un evento y su alarma no pueden llamarse distinto en dos pantallas.
 */
function camLabel(eventType: string): string {
  if (isCameraHealthEventType(eventType)) return cameraFaultLabel(eventType);
  switch (eventType) {
    case 'linedetection':
      return 'Cruce de línea';
    case 'fielddetection':
      return 'Intrusión en zona';
    case 'facedetection':
      return 'Rostro detectado';
    case 'VMD':
      return 'Movimiento';
    case 'tamper':
      return 'Cámara manipulada';
    case 'videoloss':
      return 'Pérdida de video';
    default:
      return eventType;
  }
}

function asList<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Recuadro de lo detectado, normalizado a 0..1.
 *
 * Cuidado con no confundir las dos cajas que trae el aviso:
 *
 * - `TargetRect` es **la persona**, ya en 0..1 sobre el encuadre.
 * - `RegionCoordinatesList` es **la zona vigilada** que se configuró, en la
 *   rejilla propia del equipo (`normalizedScreenSize`, 1000×1000 aquí).
 *
 * Se leía la segunda, y como la zona es el cuadro entero todos los recuadros
 * salían `0,0,1,1`: una caja del tamaño de la pantalla en vez de una alrededor
 * de la persona. Se usa `TargetRect` y la zona solo queda de recurso por si un
 * firmware no la manda.
 */
function targetsFrom(alert: Record<string, any>): NormalizedEvent['targets'] {
  const gridW = Number(alert?.normalizedScreenSize?.normalizedScreenWidth) || 1000;
  const gridH = Number(alert?.normalizedScreenSize?.normalizedScreenHeight) || 1000;
  const out: NonNullable<NormalizedEvent['targets']> = [];

  const pushRect = (type: string, t: any) => {
    if (!t || typeof t !== 'object') return;
    // Firmware mezcla X/Y mayúsculas y x/y minúsculas; width/height iguales.
    const tx = Number(t.X ?? t.x);
    const ty = Number(t.Y ?? t.y);
    const tw = Number(t.width ?? t.Width);
    const th = Number(t.height ?? t.Height);
    if (![tx, ty, tw, th].every(Number.isFinite) || tw <= 0 || th <= 0) return;
    // Evitar duplicar la misma caja si el XML trae el mismo TargetRect dos veces.
    const dup = out.some(
      (o) =>
        Math.abs(o.x - tx) < 0.01 &&
        Math.abs(o.y - ty) < 0.01 &&
        Math.abs(o.w - tw) < 0.01 &&
        Math.abs(o.h - th) < 0.01,
    );
    if (!dup) out.push({ type, x: tx, y: ty, w: tw, h: th });
  };

  // Rutas verificadas en alertStream AcuSense: DetectionRegionEntry (+ TargetRect).
  const entries = [
    ...asList(alert?.DetectionRegionList?.DetectionRegionEntry),
    ...asList(alert?.detectionRegionList?.DetectionRegionEntry),
  ];
  for (const e of entries) {
    const type = str(e?.detectionTarget) || str(e?.targetType) || 'unknown';
    // Algunos firmwares mandan TargetRectList con N personas en un solo aviso.
    const multi = asList(e?.TargetRectList?.TargetRect).concat(asList(e?.TargetRectList?.targetRect));
    if (multi.length) {
      for (const t of multi) pushRect(type, t);
      continue;
    }
    if (e?.TargetRect || e?.targetRect) {
      pushRect(type, e.TargetRect ?? e.targetRect);
      continue;
    }

    const pts = asList(e?.RegionCoordinatesList?.RegionCoordinates)
      .map((c: any) => ({ x: Number(c?.positionX), y: Number(c?.positionY) }))
      .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
    if (pts.length === 0) continue;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs) / gridW;
    const y0 = Math.min(...ys) / gridH;
    const x1 = Math.max(...xs) / gridW;
    const y1 = Math.max(...ys) / gridH;
    // Una caja que ocupa el encuadre entero es la zona, no un objetivo.
    if (x1 - x0 > 0.98 && y1 - y0 > 0.98) continue;
    out.push({ type, x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) });
  }

  // Fallback: TargetRect suelto en la raíz del alert (dialectos raros).
  if (!out.length && (alert?.TargetRect || alert?.targetRect)) {
    pushRect(str(alert?.detectionTarget) || 'human', alert.TargetRect ?? alert.targetRect);
  }

  return out.length ? out : null;
}

/** El terminal manda el recuadro de la cara ya en 0..1. */
function faceRectTargets(e: Record<string, any>): NormalizedEvent['targets'] {
  const r = e?.FaceRect;
  if (!r) return null;
  const x = Number(r.x);
  const y = Number(r.y);
  const w = Number(r.width);
  const h = Number(r.height);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return [{ type: 'face', x, y, w, h }];
}

/**
 * Normaliza el cuerpo del aviso, ya decodificado a objeto.
 *
 * `fallbackIp` es la IP de quien abrió la conexión: si el equipo no se
 * identifica en el cuerpo, esa es la única verdad que hay.
 */
export function normalizeAlert(body: Record<string, any>, fallbackIp: string): NormalizedEvent | null {
  const alert = (body?.EventNotificationAlert ?? body) as Record<string, any>;
  const eventType = str(alert?.eventType);
  if (!eventType) return null;

  const deviceIp = str(alert?.ipAddress) || fallbackIp;
  const occurredAt = when(alert?.dateTime);
  // Envoltura común a los dos dialectos: van al mismo nivel que `eventType`.
  const eventState = parseEventState(alert?.eventState);
  const activePostCount = parseActivePostCount(alert?.activePostCount);

  const acs = alert?.AccessControllerEvent;
  if (acs) {
    const major = num(acs.majorEventType);
    const minor = num(acs.subEventType);
    return {
      deviceIp,
      deviceName: str(acs.deviceName),
      eventType,
      major,
      minor,
      label: acsLabel(major, minor),
      occurredAt,
      personId: str(acs.employeeNoString),
      personName: str(acs.name),
      doorNo: num(acs.doorNo),
      verifyMode: str(acs.currentVerifyMode),
      eventState,
      activePostCount,
      targets: faceRectTargets(acs),
      raw: alert,
    };
  }

  return {
    deviceIp,
    deviceName: str(alert?.channelName) || null,
    eventType,
    major: null,
    minor: null,
    label: camLabel(eventType),
    occurredAt,
    personId: null,
    personName: null,
    doorNo: null,
    verifyMode: null,
    eventState,
    activePostCount,
    // FaceDetect AcuSense manda FaceRect en la raíz (no AccessControllerEvent).
    targets:
      eventType === 'facedetection'
        ? faceRectTargets(alert) || targetsFrom(alert)
        : targetsFrom(alert),
    raw: alert,
  };
}

/** Una parte de un cuerpo multipart, con sus cabeceras ya separadas. */
export type MultipartPart = { contentType: string; body: Buffer };

/**
 * Trocea un `multipart/form-data`.
 *
 * Se hace a mano en vez de con multer porque el cuerpo del equipo no es un
 * formulario: son partes sueltas —el XML del evento y, si lo trae, el JPEG—
 * sin nombre de campo. Multer las descartaría por no tener `name`.
 */
export function splitMultipart(body: Buffer, boundary: string): MultipartPart[] {
  const sep = Buffer.from(`--${boundary}`);
  const parts: MultipartPart[] = [];
  let from = body.indexOf(sep);
  if (from < 0) return parts;

  while (from >= 0) {
    const start = from + sep.length;
    const next = body.indexOf(sep, start);
    const chunk = body.subarray(start, next < 0 ? body.length : next);
    // Cabeceras y cuerpo van separados por una línea en blanco.
    const split = chunk.indexOf('\r\n\r\n');
    if (split > 0) {
      const headers = chunk.subarray(0, split).toString('latin1');
      const ct = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim() || '';
      // El equipo cierra cada parte con CRLF antes del siguiente separador.
      let end = chunk.length;
      if (chunk.subarray(end - 2, end).toString('latin1') === '\r\n') end -= 2;
      parts.push({ contentType: ct.toLowerCase(), body: chunk.subarray(split + 4, end) });
    }
    if (next < 0) break;
    from = next;
  }
  return parts;
}

/** El `boundary` del `Content-Type`, si lo hay. */
export function boundaryOf(contentType: string): string | null {
  return /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)?.slice(1).find(Boolean) ?? null;
}
