/**
 * Caché en disco para imágenes estáticas de Google Maps.
 *
 * Cada `staticmap?...` es una petición facturada. Antes se pedía una imagen
 * nueva por cada PDF generado y por cada vista de la página de tickets, aunque
 * fuera exactamente la misma sucursal: el mismo punto se compraba decenas de
 * veces al día. Aquí la imagen se guarda en `uploads/static-maps` con la clave
 * redondeada a 5 decimales (≈1.1 m) + zoom + tamaño + tipo de mapa, así que la
 * segunda vista —de cualquier usuario, web o PDF— sale del disco.
 *
 * Tres límites, porque una caché sin techo es otro problema:
 *   - TTL (`STATIC_MAP_TTL_DAYS`, 30 días): el mapa de una calle cambia poco,
 *     pero no es eterno.
 *   - Tamaño máximo (`STATIC_MAP_CACHE_MAX_MB`, 200 MB): al pasarse se borran
 *     los archivos menos usados recientemente.
 *   - Presupuesto diario de peticiones aguas arriba (`STATIC_MAP_DAILY_BUDGET`,
 *     500): el endpoint es público —el portal de clientes no manda cabecera en
 *     un `<img>`— así que sin techo cualquiera podría gastar la cuenta pidiendo
 *     coordenadas aleatorias. Agotado el presupuesto se sirve lo cacheado y se
 *     responde 503 a los fallos, nunca se compra más.
 */

import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { resolveUploadsDir } from '../uploads-path.js';

export type StaticMapRequest = {
  lat: number;
  lng: number;
  zoom?: number;
  width?: number;
  height?: number;
  scale?: number;
  mapType?: 'roadmap' | 'hybrid' | 'satellite' | 'terrain';
  /** Ruta trazada (recorrido GPS). Se cuantiza igual que el centro. */
  path?: Array<{ lat: number; lng: number }>;
};

export type StaticMapResult = {
  buffer: Buffer;
  contentType: string;
  /** `hit` = disco, `miss` = se compró a Google, `fallback` = proveedor gratuito. */
  source: 'hit' | 'miss' | 'fallback';
  cacheKey: string;
};

/** Precisión de la clave: 5 decimales ≈ 1.1 m. Más detalle solo fragmenta la caché. */
export const COORD_DECIMALS = 5;

const DEFAULT_ZOOM = 16;
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 600;
const MAX_DIMENSION = 640;
const MAX_PATH_POINTS = 40;

const ALLOWED_MAP_TYPES = new Set(['roadmap', 'hybrid', 'satellite', 'terrain']);

const numberEnv = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

const ttlMs = () => numberEnv('STATIC_MAP_TTL_DAYS', 30) * 24 * 60 * 60 * 1000;
const maxCacheBytes = () => numberEnv('STATIC_MAP_CACHE_MAX_MB', 200) * 1024 * 1024;
const dailyBudget = () => numberEnv('STATIC_MAP_DAILY_BUDGET', 500);

export const quantize = (value: number): number =>
  Number(value.toFixed(COORD_DECIMALS));

export const isUsableCoordinate = (lat?: number | null, lng?: number | null): boolean =>
  typeof lat === 'number' && typeof lng === 'number'
  && Number.isFinite(lat) && Number.isFinite(lng)
  && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  // 0,0 es el «null island» que deja una checada sin permiso de ubicación.
  && !(lat === 0 && lng === 0);

const clampInt = (value: number | undefined, min: number, max: number, fallback: number): number => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** Normaliza la petición para que dos vistas «iguales» compartan archivo. */
export const normalizeRequest = (req: StaticMapRequest) => {
  const mapType = ALLOWED_MAP_TYPES.has(String(req.mapType)) ? String(req.mapType) : 'roadmap';
  const points = (req.path ?? [])
    .filter((p) => isUsableCoordinate(p.lat, p.lng))
    .map((p) => ({ lat: quantize(p.lat), lng: quantize(p.lng) }));
  return {
    lat: quantize(req.lat),
    lng: quantize(req.lng),
    zoom: clampInt(req.zoom, 1, 20, DEFAULT_ZOOM),
    width: clampInt(req.width, 64, MAX_DIMENSION, DEFAULT_WIDTH),
    height: clampInt(req.height, 64, MAX_DIMENSION, DEFAULT_HEIGHT),
    scale: req.scale === 2 ? 2 : 1,
    mapType,
    path: samplePath(points, MAX_PATH_POINTS),
  };
};

/** Reduce el recorrido a como mucho `max` puntos conservando inicio y fin. */
export const samplePath = <T>(points: T[], max: number): T[] => {
  if (points.length <= max) return points;
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) out.push(points[Math.round(i * step)]!);
  return out;
};

export const cacheKeyFor = (req: StaticMapRequest): string => {
  const n = normalizeRequest(req);
  const pathPart = n.path.length
    ? `_p${n.path.length}-${n.path.map((p) => `${p.lat},${p.lng}`).join('_')}`
    : '';
  const raw = `${n.lat},${n.lng}_z${n.zoom}_${n.width}x${n.height}@${n.scale}_${n.mapType}${pathPart}`;
  // El nombre de archivo tiene que ser corto y seguro: los recorridos generan
  // claves de cientos de caracteres.
  return `${n.lat},${n.lng}_z${n.zoom}_${n.width}x${n.height}@${n.scale}_${n.mapType}_${hash(raw)}`
    .replace(/[^A-Za-z0-9_.,@x-]/g, '-');
};

/** FNV-1a: no hace falta criptografía, solo un nombre de archivo estable. */
export const hash = (value: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

export const staticMapCacheDir = (): string => resolveUploadsDir('static-maps');

const googleKey = () =>
  (process.env['GOOGLE_MAPS_API_KEY'] || process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'] || '').trim();

export const buildGoogleStaticMapUrl = (req: StaticMapRequest, key: string): string => {
  const n = normalizeRequest(req);
  const params = new URLSearchParams({
    center: `${n.lat},${n.lng}`,
    zoom: String(n.zoom),
    size: `${n.width}x${n.height}`,
    maptype: n.mapType,
    key,
  });
  if (n.scale === 2) params.set('scale', '2');
  if (n.path.length > 1) {
    params.set('path', `color:0x2563eb|weight:4|${n.path.map((p) => `${p.lat},${p.lng}`).join('|')}`);
    const first = n.path[0]!;
    const last = n.path[n.path.length - 1]!;
    params.append('markers', `color:green|label:S|${first.lat},${first.lng}`);
    params.append('markers', `color:red|label:F|${last.lat},${last.lng}`);
    params.delete('center');
    params.delete('zoom');
  } else {
    params.append('markers', `color:red|${n.lat},${n.lng}`);
  }
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
};

/** Proveedor sin clave ni coste, para cuando no hay key o se agotó el presupuesto. */
export const buildFallbackStaticMapUrl = (req: StaticMapRequest): string => {
  const n = normalizeRequest(req);
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${n.lat},${n.lng}`
    + `&zoom=${n.zoom}&size=${n.width}x${n.height}&markers=${n.lat},${n.lng},red-pushpin`;
};

const downloadImage = (imageUrl: string, timeoutMs = 8000): Promise<{ buffer: Buffer; contentType: string } | null> =>
  new Promise((resolve) => {
    try {
      const parsed = new URL(imageUrl);
      const client = parsed.protocol === 'http:' ? http : https;
      const request = client.get(imageUrl, {
        headers: {
          'User-Agent': 'NEXARA static map cache',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      }, (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          response.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (!buffer.length) {
            resolve(null);
            return;
          }
          const contentType = String(response.headers['content-type'] || 'image/png').split(';')[0]!.trim();
          resolve({ buffer, contentType: contentType.startsWith('image/') ? contentType : 'image/png' });
        });
      });
      request.on('error', () => resolve(null));
      request.setTimeout(timeoutMs, () => {
        request.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });

// ── Presupuesto diario de compras aguas arriba ───────────────────────────────

let budgetDay = '';
let budgetSpent = 0;

const today = () => new Date().toISOString().slice(0, 10);

const rollBudget = () => {
  const day = today();
  if (day !== budgetDay) {
    budgetDay = day;
    budgetSpent = 0;
  }
};

export const budgetStatus = () => {
  rollBudget();
  return { day: budgetDay, spent: budgetSpent, limit: dailyBudget() };
};

export const hasBudget = (): boolean => {
  rollBudget();
  return budgetSpent < dailyBudget();
};

/** Solo para pruebas: reinicia el contador diario. */
export const resetBudget = () => {
  budgetDay = today();
  budgetSpent = 0;
};

// ── Caché en disco ───────────────────────────────────────────────────────────

const extensionFor = (contentType: string) => {
  if (contentType.includes('jpeg')) return '.jpg';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('webp')) return '.webp';
  return '.png';
};

const contentTypeFor = (file: string) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
};

const findCached = (dir: string, key: string): string | null => {
  for (const ext of ['.png', '.jpg', '.gif', '.webp']) {
    const candidate = path.join(dir, `${key}${ext}`);
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Disco no disponible: se trata como fallo de caché.
    }
  }
  return null;
};

const isFresh = (file: string): boolean => {
  try {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    return age < ttlMs();
  } catch {
    return false;
  }
};

/**
 * Borra lo más antiguo hasta volver por debajo del techo. Se llama después de
 * escribir, no antes: así una ráfaga no bloquea la respuesta.
 */
export const pruneCache = (dir = staticMapCacheDir()): { removed: number; bytes: number } => {
  let removed = 0;
  let bytes = 0;
  try {
    if (!fs.existsSync(dir)) return { removed, bytes };
    const entries = fs.readdirSync(dir)
      .map((name) => {
        const full = path.join(dir, name);
        try {
          const stat = fs.statSync(full);
          // `mtime` decide la caducidad; `atime` —que refrescamos en cada
          // acierto— decide a quién se desaloja cuando falta espacio.
          return { full, size: stat.size, mtime: stat.mtimeMs, atime: stat.atimeMs };
        } catch {
          return null;
        }
      })
      .filter((entry): entry is { full: string; size: number; mtime: number; atime: number } => entry !== null);

    const expiry = Date.now() - ttlMs();
    for (const entry of entries) {
      if (entry.mtime < expiry) {
        try {
          fs.unlinkSync(entry.full);
          removed += 1;
          bytes += entry.size;
          entry.size = 0;
        } catch {
          // Otro proceso pudo borrarlo ya.
        }
      }
    }

    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    const limit = maxCacheBytes();
    if (total <= limit) return { removed, bytes };

    entries.sort((a, b) => a.atime - b.atime);
    for (const entry of entries) {
      if (total <= limit) break;
      if (entry.size === 0) continue;
      try {
        fs.unlinkSync(entry.full);
        total -= entry.size;
        removed += 1;
        bytes += entry.size;
      } catch {
        // Ignorar: el objetivo es aproximado.
      }
    }
  } catch {
    // La poda nunca debe tumbar una petición.
  }
  return { removed, bytes };
};

/**
 * Devuelve la imagen del punto pedido, del disco si ya se compró.
 *
 * `null` solo cuando no hay imagen posible (sin clave, sin presupuesto y sin
 * proveedor alternativo disponible).
 */
export const getStaticMapImage = async (req: StaticMapRequest): Promise<StaticMapResult | null> => {
  if (!isUsableCoordinate(req.lat, req.lng)) return null;

  const key = cacheKeyFor(req);
  const dir = staticMapCacheDir();

  const cached = findCached(dir, key);
  if (cached && isFresh(cached)) {
    try {
      const buffer = fs.readFileSync(cached);
      if (buffer.length) {
        // Marcar el uso: la poda por tamaño desaloja lo menos usado.
        try {
          const now = new Date();
          fs.utimesSync(cached, now, fs.statSync(cached).mtime);
        } catch {
          // atime es opcional.
        }
        return { buffer, contentType: contentTypeFor(cached), source: 'hit', cacheKey: key };
      }
    } catch {
      // Archivo corrupto: se vuelve a pedir.
    }
  }

  const apiKey = googleKey();
  let downloaded: { buffer: Buffer; contentType: string } | null = null;
  let source: StaticMapResult['source'] = 'miss';

  if (apiKey && hasBudget()) {
    rollBudget();
    budgetSpent += 1;
    downloaded = await downloadImage(buildGoogleStaticMapUrl(req, apiKey));
  }

  // Una copia caducada vale más que otra compra: la calle no se ha movido.
  if (!downloaded && cached) {
    try {
      const buffer = fs.readFileSync(cached);
      if (buffer.length) return { buffer, contentType: contentTypeFor(cached), source: 'hit', cacheKey: key };
    } catch {
      // Archivo ilegible: seguimos al proveedor gratuito.
    }
  }

  if (!downloaded) {
    downloaded = await downloadImage(buildFallbackStaticMapUrl(req));
    if (downloaded) source = 'fallback';
  }

  if (!downloaded) return null;

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${key}${extensionFor(downloaded.contentType)}`), downloaded.buffer);
    pruneCache(dir);
  } catch {
    // Sin disco la imagen igual se devuelve; solo se pierde la caché.
  }

  return { buffer: downloaded.buffer, contentType: downloaded.contentType, source, cacheKey: key };
};
