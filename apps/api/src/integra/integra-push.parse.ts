import type { NormalizedEvent } from './integra-push.service';

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

/** Etiqueta legible de un evento de control de acceso (major/minor Hikvision). */
export function acsLabel(major: number | null, minor: number | null): string {
  if (major === 5) {
    if (minor === 75 || minor === 1) return 'Acceso concedido';
    if (minor === 76) return 'Acceso concedido (salida)';
    if (minor === 21 || minor === 22 || minor === 23 || minor === 24) return 'Acceso denegado';
    return `Autenticación ${minor}`;
  }
  if (major === 1) return `Alarma ${minor}`;
  if (major === 2) return `Puerta ${minor}`;
  if (major === 3) return `Excepción ${minor}`;
  return `Evento ${major}.${minor}`;
}

/** Etiqueta de un evento de cámara. */
function camLabel(eventType: string): string {
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
    case 'shelteralarm':
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
 * Recuadros de detección, normalizados a 0..1.
 *
 * El equipo los da sobre una rejilla propia (`normalizedScreenSize`, 1000×1000
 * en estas cámaras), no en píxeles del video: hay que dividir por ella o los
 * recuadros salen fuera del cuadro.
 */
function targetsFrom(alert: Record<string, any>): NormalizedEvent['targets'] {
  const w = Number(alert?.normalizedScreenSize?.normalizedScreenWidth) || 1000;
  const h = Number(alert?.normalizedScreenSize?.normalizedScreenHeight) || 1000;
  const entries = asList(alert?.DetectionRegionList?.DetectionRegionEntry);
  const out: NonNullable<NormalizedEvent['targets']> = [];

  for (const e of entries) {
    const pts = asList(e?.RegionCoordinatesList?.RegionCoordinates)
      .map((c: any) => ({ x: Number(c?.positionX), y: Number(c?.positionY) }))
      .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
    if (pts.length === 0) continue;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs) / w;
    const y0 = Math.min(...ys) / h;
    const x1 = Math.max(...xs) / w;
    const y1 = Math.max(...ys) / h;
    out.push({
      type: str(e?.detectionTarget) || str(e?.targetType) || 'unknown',
      x: x0,
      y: y0,
      w: Math.max(0, x1 - x0),
      h: Math.max(0, y1 - y0),
    });
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
    targets: targetsFrom(alert),
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
