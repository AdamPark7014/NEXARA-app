/**
 * Anexos de una cotización (planos de CAD, hoja de servicio del levantamiento, fotos) que se
 * imprimen en el PDF que recibe el cliente. Compartido entre los dos formatos de cotización
 * (`cotizacion-formato-nexara.ts`, el que de verdad se descarga, y `propuesta-tecnica-pdf.ts`) para
 * no mantener dos veces la misma resolución de archivo y el mismo anexado de páginas.
 */
import fs from 'fs';
import path from 'path';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { imagenParaPdf } from './imagen-para-pdf.js';

export type PlanoArchivo = {
  url: string;
  nombre?: string | null;
  tipo?: string | null;
};

export type PlanosClasificados = {
  imagenes: Array<{ nombre: string; imagen: NonNullable<ReturnType<typeof imagenParaPdf>> }>;
  /** Planos en PDF (lo normal en CAD, o la hoja de servicio del levantamiento): sus páginas reales
   * se anexan al final, sin convertirlas a imagen — así no pierden nitidez ni texto seleccionable. */
  pdfs: Array<{ nombre: string; archivo: string }>;
  /** Anexos que de verdad no se pueden imprimir (remotos o que ya no están en disco). */
  otros: string[];
};

/**
 * Archivo local de un anexo; `null` si es remoto o no existe.
 *
 * Los anexos se guardan con URL `/uploads/<carpeta>/<archivo>` (o `/<carpeta>/<archivo>` en los
 * flujos viejos) y el disco está en `UPLOADS_ROOT` o en `<raíz del repo>/uploads`, que no es el
 * directorio de trabajo del API. Por eso se prueban varias raíces antes de rendirse.
 */
export function archivoLocalDePlano(url: string): string | null {
  try {
    if (!url || /^https?:\/\//i.test(url)) return null;
    const limpio = url.split('?')[0]!.replace(/^\/+/, '');
    const sinPrefijo = limpio.replace(/^uploads\//, '');
    const raices = [
      process.env['UPLOADS_ROOT']?.trim(),
      path.resolve(process.cwd(), 'uploads'),
      path.resolve(process.cwd(), '..', 'uploads'),
      path.resolve(process.cwd(), '..', '..', 'uploads'),
    ].filter((r): r is string => Boolean(r));

    const candidatos = [path.resolve(process.cwd(), limpio), ...raices.map((raiz) => path.join(raiz, sinPrefijo))];
    for (const candidato of candidatos) {
      if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) return candidato;
    }
  } catch {
    /* un anexo ilegible no tumba la cotización */
  }
  return null;
}

/** Separa imágenes embebibles, PDF (páginas reales al final) y lo que no se puede imprimir. */
export function clasificarPlanos(planos: PlanoArchivo[]): PlanosClasificados {
  const vistos = new Set<string>();
  const listos: PlanosClasificados = { imagenes: [], pdfs: [], otros: [] };
  for (const plano of planos) {
    if (!plano?.url || vistos.has(plano.url)) continue;
    vistos.add(plano.url);
    const nombre = plano.nombre?.trim() || plano.url;
    const archivo = archivoLocalDePlano(plano.url);
    if (archivo && /\.pdf$/i.test(archivo)) {
      listos.pdfs.push({ nombre, archivo });
      continue;
    }
    const imagen = archivo && /\.(png|jpe?g)$/i.test(archivo) ? imagenParaPdf(archivo, { maxLado: 1600 }) : null;
    if (imagen?.ancho && imagen.alto) listos.imagenes.push({ nombre, imagen });
    else listos.otros.push(nombre);
  }
  return listos;
}

/**
 * Anexa las páginas reales de los planos en PDF: se copian tal cual, sin pasar por imagen. Un
 * plano corrupto o ilegible se salta, no tumba el documento.
 *
 * `antesDeFinal` conserva esa cantidad de páginas finales del documento base después de lo
 * anexado — así el cierre (ATENTAMENTE y firma) se queda hasta el final de verdad, con los
 * planos antes y no después.
 */
export async function anexarPaginasPdf(
  buffer: Buffer,
  pdfs: PlanosClasificados['pdfs'],
  opts: { antesDeFinal?: number } = {},
): Promise<Buffer> {
  if (!pdfs.length) return buffer;
  const final = await PDFLibDocument.load(buffer);
  let cursor = Math.max(0, final.getPageCount() - (opts.antesDeFinal ?? 0));
  for (const { archivo } of pdfs) {
    try {
      const bytes = await fs.promises.readFile(archivo);
      const ajeno = await PDFLibDocument.load(bytes);
      const paginas = await final.copyPages(ajeno, ajeno.getPageIndices());
      paginas.forEach((pagina) => {
        final.insertPage(cursor, pagina);
        cursor += 1;
      });
    } catch {
      /* un plano corrupto o protegido se omite, no tumba el documento */
    }
  }
  return Buffer.from(await final.save());
}
