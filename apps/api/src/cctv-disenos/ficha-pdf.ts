/**
 * Del PDF de una memoria técnica a lo que se le manda a la IA: el texto de cada hoja y algunas hojas
 * como imagen. Usa `poppler-utils` (ya viene en la imagen de la API) para no cargar el archivo en
 * memoria. Trabaja en una carpeta temporal que se borra al terminar: el PDF no se guarda, porque la
 * licencia de los materiales del fabricante no deja redistribuirlo y aquí solo interesan sus datos.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

const TOPE_SALIDA = 64 * 1024 * 1024;
const TIEMPO_MS = 60_000;

/** La puerta acepta 2 MB por petición: se dejan 1.4 MB para imágenes, ya en base64. */
export const TOPE_IMAGENES_BASE64 = 1_400_000;
// Las cotas del dibujo son chicas: a 110 dpi la IA ya no las distingue.
const RESOLUCIONES_DPI = [150, 110, 80];

export type ImagenDeHoja = { hoja: number; mediaType: 'image/jpeg'; base64: string };

/** Un PDF de verdad empieza con `%PDF-`; el nombre y el tipo que manda el navegador no prueban nada. */
export function esPdf(buffer: Buffer | undefined): buffer is Buffer {
  return Boolean(buffer && buffer.length > 8 && buffer.subarray(0, 5).toString('latin1') === '%PDF-');
}

/**
 * Texto de cada hoja. Lanza si el PDF está dañado o tiene contraseña. Va con `-raw`: las tablas de una
 * ficha son dos columnas, y tanto el modo normal como `-layout` separan cada etiqueta de su valor y
 * parten palabras («Di mens i on»). Medido con 9 fichas reales.
 */
export async function textoDeHojas(ruta: string): Promise<string[]> {
  const { stdout } = await ejecutar('pdftotext', ['-enc', 'UTF-8', '-raw', ruta, '-'], { maxBuffer: TOPE_SALIDA, timeout: TIEMPO_MS });
  const hojas = stdout.split('\f');
  // `pdftotext` termina cada hoja con salto de página: lo que sigue al último no es una hoja.
  if (!hojas[hojas.length - 1].trim()) hojas.pop();
  return hojas;
}

async function renderizar(ruta: string, hojas: readonly number[], dpi: number, carpeta: string): Promise<ImagenDeHoja[]> {
  const salida: ImagenDeHoja[] = [];
  for (const hoja of hojas) {
    const base = join(carpeta, `h${hoja}-${dpi}`);
    await ejecutar('pdftoppm', ['-jpeg', '-jpegopt', 'quality=70', '-r', String(dpi), '-f', String(hoja), '-l', String(hoja), '-singlefile', ruta, base], {
      timeout: TIEMPO_MS,
    });
    salida.push({ hoja, mediaType: 'image/jpeg', base64: (await readFile(`${base}.jpg`)).toString('base64') });
  }
  return salida;
}

/** Las hojas como imagen, bajando la resolución hasta que quepan; si ni así, las que quepan. */
export async function imagenesDeHojas(ruta: string, hojas: readonly number[], carpeta: string): Promise<ImagenDeHoja[]> {
  let imagenes: ImagenDeHoja[] = [];
  for (const dpi of RESOLUCIONES_DPI) {
    imagenes = await renderizar(ruta, hojas, dpi, carpeta);
    if (imagenes.reduce((a, i) => a + i.base64.length, 0) <= TOPE_IMAGENES_BASE64) return imagenes;
  }
  const caben: ImagenDeHoja[] = [];
  let suma = 0;
  for (const i of imagenes) {
    if (suma + i.base64.length > TOPE_IMAGENES_BASE64) continue;
    suma += i.base64.length;
    caben.push(i);
  }
  return caben;
}

/** Corre `trabajo` con el PDF en una carpeta temporal y la borra pase lo que pase. */
export async function conPdfTemporal<T>(pdf: Buffer, trabajo: (ruta: string, carpeta: string) => Promise<T>): Promise<T> {
  const carpeta = await mkdtemp(join(tmpdir(), 'cctv-ficha-'));
  try {
    const ruta = join(carpeta, 'ficha.pdf');
    await writeFile(ruta, pdf);
    return await trabajo(ruta, carpeta);
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
