import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Quién puede abrir `/go2rtc/*` en integra.nexara.com.mx (Traefik `forwardAuth` → API).
 *
 * Antes go2rtc estaba en internet sin autenticación: cualquiera veía cámaras adivinando el nombre
 * del stream, y go2rtc 1.9.7 acepta fuentes dinámicas en `src=` (`rtsp://…`, `exec:…`, `ffmpeg:…`).
 * Ahora:
 *  - los dos scripts del visor son públicos (solo JS);
 *  - los segmentos HLS (`/api/hls/…?id=`) pasan: el `id` lo crea go2rtc al abrir un m3u8 autorizado;
 *  - `src` solo puede ser un nombre de stream (letras, números, `_`, `-`), nunca una URL;
 *  - con eso, entra quien trae la firma que la API pone en la URL del stream, o una sesión de personal.
 */

export type DecisionGo2rtc = 'permitir' | 'denegar' | 'requiere-sesion';

const RUTAS_LIBRES = new Set(['/go2rtc/video-stream.js', '/go2rtc/video-rtc.js']);
const SRC_SEGURO = /^[A-Za-z0-9_-]{1,120}$/;
const ID_HLS = /^[A-Za-z0-9_-]{4,64}$/;
/** La URL HLS que entrega la API sirve 12 h (un turno de monitoreo). */
export const VIGENCIA_FIRMA_MS = 12 * 60 * 60 * 1000;

function firma(src: string, exp: number, secreto: string): string {
  return createHmac('sha256', secreto).update(`go2rtc|${src}|${exp}`).digest('base64url').slice(0, 32);
}

/** `nx=<exp>.<firma>` para pegar a la URL de un stream. */
export function tokenDeStream(src: string, secreto: string, ahora = Date.now(), vigenciaMs = VIGENCIA_FIRMA_MS): string {
  const exp = Math.floor((ahora + vigenciaMs) / 1000);
  return `${exp}.${firma(src, exp, secreto)}`;
}

export function tokenDeStreamValido(src: string, token: string | null, secreto: string, ahora = Date.now()): boolean {
  if (!token) return false;
  const [expTxt, recibida] = token.split('.');
  const exp = Number(expTxt);
  if (!Number.isFinite(exp) || !recibida || exp * 1000 < ahora) return false;
  const esperada = Buffer.from(firma(src, exp, secreto));
  const dada = Buffer.from(recibida);
  return esperada.length === dada.length && timingSafeEqual(esperada, dada);
}

export function decidirAccesoGo2rtc(uriOriginal: string, secreto: string, ahora = Date.now()): DecisionGo2rtc {
  let url: URL;
  try {
    url = new URL(uriOriginal || '/', 'https://integra.nexara.com.mx');
  } catch {
    return 'denegar';
  }
  const ruta = url.pathname;
  if (!ruta.startsWith('/go2rtc/')) return 'denegar';
  if (RUTAS_LIBRES.has(ruta)) return 'permitir';
  if (ruta.startsWith('/go2rtc/api/hls/')) {
    return ID_HLS.test(url.searchParams.get('id') ?? '') ? 'permitir' : 'denegar';
  }
  const src = url.searchParams.get('src') ?? '';
  if (!SRC_SEGURO.test(src)) return 'denegar';
  if (tokenDeStreamValido(src, url.searchParams.get('nx'), secreto, ahora)) return 'permitir';
  return 'requiere-sesion';
}

/** Secreto de las firmas: uno propio si existe, si no derivado del JWT. */
export function secretoGo2rtc(): string {
  const propio = process.env.GO2RTC_STREAM_SECRET?.trim();
  if (propio) return propio;
  const jwt = process.env.JWT_SECRET?.trim();
  if (!jwt) throw new Error('Sin secreto para firmar streams');
  return createHmac('sha256', jwt).update('go2rtc-streams').digest('hex');
}
