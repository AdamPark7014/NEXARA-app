import fs from 'fs';
import path from 'path';
import { resolveUploadsDir } from '../uploads-path.js';

/**
 * Mapa de un punto armado con teselas de OpenStreetMap, para los PDF.
 *
 * Los PDF (reporte de ticket / OT) traían la imagen de Google Static Maps. Desde el 23-10-2026
 * Google contesta 403 «You must enable Billing» (el proyecto no tiene facturación) y el proveedor
 * gratuito de respaldo (`staticmap.openstreetmap.de`) ya no existe: el reporte decía «Mapa no
 * disponible». Aquí el mapa se arma con las teselas PNG de 256 px de OSM, que pdfkit coloca una
 * junto a otra recortadas al recuadro, con el pin dibujado encima y el crédito «© OpenStreetMap».
 *
 * Política de uso de tile.openstreetmap.org: poco volumen, User-Agent que identifique la app y
 * crédito visible. Un reporte usa 2–4 teselas y cada una se guarda en disco 30 días.
 */

export const TAMANO_TESELA = 256;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PLAZO_MS = 6000;
const USER_AGENT = 'NEXARA-reportes/1.0 (+https://nexara.com.mx; soporte@nexara.com.mx)';

export type TeselaEnVista = { z: number; x: number; y: number; dx: number; dy: number };

/** Píxel global (Web Mercator) de un punto en un zoom. */
export function pixelGlobal(lat: number, lng: number, zoom: number): { px: number; py: number } {
  const escala = TAMANO_TESELA * 2 ** zoom;
  const sen = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  const px = ((lng + 180) / 360) * escala;
  const py = (0.5 - Math.log((1 + sen) / (1 - sen)) / (4 * Math.PI)) * escala;
  return { px, py };
}

/**
 * Teselas que cubren un recuadro de `ancho`×`alto` centrado en el punto, con la posición de su
 * esquina superior izquierda relativa a la del recuadro (puede ser negativa: se recorta).
 */
export function teselasParaVista(p: { lat: number; lng: number; zoom: number; ancho: number; alto: number }): TeselaEnVista[] {
  const z = Math.max(0, Math.min(19, Math.round(p.zoom)));
  const { px, py } = pixelGlobal(p.lat, p.lng, z);
  const izq = px - p.ancho / 2;
  const arriba = py - p.alto / 2;
  const n = 2 ** z;
  const x0 = Math.floor(izq / TAMANO_TESELA);
  const x1 = Math.floor((izq + p.ancho - 1) / TAMANO_TESELA);
  const y0 = Math.floor(arriba / TAMANO_TESELA);
  const y1 = Math.floor((arriba + p.alto - 1) / TAMANO_TESELA);
  const out: TeselaEnVista[] = [];
  for (let ty = y0; ty <= y1; ty += 1) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = x0; tx <= x1; tx += 1) {
      const x = ((tx % n) + n) % n; // la longitud da la vuelta al mundo
      out.push({ z, x, y: ty, dx: tx * TAMANO_TESELA - izq, dy: ty * TAMANO_TESELA - arriba });
    }
  }
  return out;
}

const dirTeselas = () => resolveUploadsDir('static-maps', 'osm');

/** Una tesela PNG (disco primero, luego OSM); `null` si no se pudo. Nunca lanza. */
export async function obtenerTesela(z: number, x: number, y: number): Promise<Buffer | null> {
  const archivo = path.join(dirTeselas(), `${z}-${x}-${y}.png`);
  try {
    const st = fs.statSync(archivo);
    if (Date.now() - st.mtimeMs < TTL_MS && st.size > 0) return fs.readFileSync(archivo);
  } catch {
    // No está en disco.
  }
  try {
    const ctrl = new AbortController();
    const plazo = setTimeout(() => ctrl.abort(), PLAZO_MS);
    const r = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/png' },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(plazo));
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    // Firma PNG: lo que no sea imagen no entra al PDF.
    if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
    try {
      fs.mkdirSync(dirTeselas(), { recursive: true });
      fs.writeFileSync(archivo, buffer);
    } catch {
      // Sin disco se usa igual.
    }
    return buffer;
  } catch {
    return null;
  }
}

/** Lo mínimo de pdfkit que se usa aquí (para probarlo sin generar un PDF). */
export type LienzoPdf = {
  save(): LienzoPdf;
  restore(): LienzoPdf;
  rect(x: number, y: number, w: number, h: number): LienzoPdf;
  clip(): LienzoPdf;
  image(src: Buffer, x: number, y: number, opts?: { width?: number; height?: number }): LienzoPdf;
  circle(x: number, y: number, r: number): LienzoPdf;
  fillAndStroke(fill?: string, stroke?: string): LienzoPdf;
  lineWidth(w: number): LienzoPdf;
  fillColor(c: string): LienzoPdf;
  fillOpacity(o: number): LienzoPdf;
  fill(c?: string): LienzoPdf;
  font(name: string): LienzoPdf;
  fontSize(n: number): LienzoPdf;
  text(t: string, x: number, y: number, opts?: Record<string, unknown>): LienzoPdf;
};

/**
 * Dibuja el mapa del punto en el recuadro. Devuelve `false` (sin dibujar nada) si no llegó al
 * menos la mitad de las teselas: quien llama pone su «Mapa no disponible».
 */
export async function dibujarMapaOsm(
  doc: LienzoPdf,
  p: { x: number; y: number; ancho: number; alto: number; lat: number; lng: number; zoom?: number },
  obtener: (z: number, x: number, y: number) => Promise<Buffer | null> = obtenerTesela,
): Promise<boolean> {
  const teselas = teselasParaVista({ lat: p.lat, lng: p.lng, zoom: p.zoom ?? 16, ancho: p.ancho, alto: p.alto });
  if (!teselas.length) return false;
  const imagenes = await Promise.all(teselas.map((t) => obtener(t.z, t.x, t.y)));
  const llegaron = imagenes.filter(Boolean).length;
  if (llegaron * 2 < teselas.length) return false;

  doc.save();
  doc.rect(p.x, p.y, p.ancho, p.alto).clip();
  teselas.forEach((t, i) => {
    const img = imagenes[i];
    if (!img) return;
    try {
      doc.image(img, p.x + t.dx, p.y + t.dy, { width: TAMANO_TESELA, height: TAMANO_TESELA });
    } catch {
      // Una tesela ilegible deja su hueco; el resto del mapa sirve.
    }
  });
  // Pin: círculo rojo con borde blanco en el punto (el centro del recuadro).
  const cx = p.x + p.ancho / 2;
  const cy = p.y + p.alto / 2;
  doc.lineWidth(2).circle(cx, cy, 6).fillAndStroke('#dc2626', '#ffffff');
  // Crédito de OpenStreetMap, obligatorio.
  doc.fillOpacity(0.75).rect(p.x + p.ancho - 78, p.y + p.alto - 11, 78, 11).fill('#ffffff');
  doc.fillOpacity(1).fillColor('#334155').font('Helvetica').fontSize(6.5)
    .text('© OpenStreetMap', p.x + p.ancho - 75, p.y + p.alto - 9, { width: 72, lineBreak: false });
  doc.restore();
  return true;
}
