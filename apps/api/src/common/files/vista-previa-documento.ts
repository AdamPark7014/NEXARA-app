/**
 * Vista previa de documentos de oficina como HTML: Excel (xlsx), CSV y Word (docx).
 *
 * Adam (07-10): las actividades comerciales llevan evidencia en Excel, Word o PDF y quiere
 * verla «embebida», en la web y en las apps. El PDF y las imágenes los muestra el navegador
 * (y PDFKit / PdfRenderer en las apps); Excel y Word no, así que aquí se convierten a una
 * página HTML sencilla que la web pinta en un iframe aislado y Android en un WebView. iOS no
 * la necesita: Vista Rápida abre Excel y Word por sí sola.
 *
 * La página nunca lleva scripts: todo texto de las celdas se escapa, los enlaces `javascript:`
 * se quitan y quien la sirve manda una CSP que solo permite estilos en línea e imágenes `data:`.
 */
import ExcelJS from 'exceljs';

export type TipoDocumento = 'pdf' | 'imagen' | 'excel' | 'csv' | 'word' | 'otro';

/** Topes para que un Excel de 50 mil filas no tumbe al teléfono: es una vista previa, no el archivo. */
export const VISTA_PREVIA_MAX_HOJAS = 10;
export const VISTA_PREVIA_MAX_FILAS = 500;
export const VISTA_PREVIA_MAX_COLUMNAS = 40;

const EXT_IMAGEN = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp']);

/** Qué es un archivo, por su extensión y, si no la tiene, por su tipo MIME. */
export function tipoDeDocumento(nombre?: string | null, mime?: string | null): TipoDocumento {
  const ext = (nombre ?? '').toLowerCase().split('?')[0].split('#')[0].match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const m = (mime ?? '').toLowerCase();
  if (ext === 'pdf' || m === 'application/pdf') return 'pdf';
  if (EXT_IMAGEN.has(ext) || m.startsWith('image/')) return 'imagen';
  if (ext === 'xlsx' || ext === 'xlsm' || m.includes('spreadsheetml')) return 'excel';
  if (ext === 'csv' || m === 'text/csv') return 'csv';
  if (ext === 'docx' || m.includes('wordprocessingml')) return 'word';
  return 'otro';
}

/** ¿Se puede ver como HTML (Excel, CSV, Word)? */
export function tieneVistaPreviaHtml(tipo: TipoDocumento): boolean {
  return tipo === 'excel' || tipo === 'csv' || tipo === 'word';
}

export function escapaHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** CSP con que se sirve la vista previa: sin scripts, sin red; solo estilos en línea e imágenes incrustadas. */
export const CSP_VISTA_PREVIA =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *";

const ESTILOS = `
  :root { color-scheme: light; }
  body { margin: 0; padding: 12px; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #fff; }
  h2 { font-size: 14px; margin: 18px 0 8px; color: #0f5f4f; }
  h2:first-child { margin-top: 0; }
  .tabla { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
  table { border-collapse: collapse; font-size: 13px; min-width: 100%; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 8px; vertical-align: top; white-space: pre-wrap; }
  th { background: #f1f5f9; color: #475569; font-weight: 600; position: sticky; top: 0; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  .aviso { margin: 8px 0 0; color: #64748b; font-size: 12px; }
  .doc img { max-width: 100%; height: auto; }
  .doc table td, .doc table th { white-space: normal; }
`;

function pagina(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapaHtml(
    titulo,
  )}</title><style>${ESTILOS}</style></head><body>${cuerpo}</body></html>`;
}

/** «A», «B»… «AA»: el nombre de la columna como en Excel. */
export function letraDeColumna(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/** El texto que Excel enseñaría en la celda (fórmulas → su resultado; fechas → AAAA-MM-DD). */
function textoDeCelda(valor: unknown): { texto: string; numero: boolean } {
  if (valor == null) return { texto: '', numero: false };
  if (typeof valor === 'number') return { texto: String(valor), numero: true };
  if (typeof valor === 'boolean') return { texto: valor ? 'VERDADERO' : 'FALSO', numero: false };
  if (valor instanceof Date) return { texto: valor.toISOString().slice(0, 10), numero: false };
  if (typeof valor === 'object') {
    const v = valor as Record<string, unknown>;
    if ('result' in v) return textoDeCelda(v.result);
    if (Array.isArray(v.richText)) {
      return { texto: (v.richText as Array<{ text?: string }>).map((p) => p.text ?? '').join(''), numero: false };
    }
    if (typeof v.text === 'string') return { texto: v.text, numero: false };
    if ('error' in v) return { texto: String(v.error), numero: false };
  }
  return { texto: String(valor), numero: false };
}

function tablaHtml(filas: Array<Array<{ texto: string; numero: boolean }>>, columnas: number): string {
  const cabeza = `<tr><th></th>${Array.from({ length: columnas }, (_, i) => `<th>${letraDeColumna(i + 1)}</th>`).join('')}</tr>`;
  const cuerpo = filas
    .map(
      (fila, i) =>
        `<tr><th>${i + 1}</th>${Array.from({ length: columnas }, (_, j) => {
          const c = fila[j];
          return c ? `<td${c.numero ? ' class="n"' : ''}>${escapaHtml(c.texto)}</td>` : '<td></td>';
        }).join('')}</tr>`,
    )
    .join('');
  return `<div class="tabla"><table>${cabeza}${cuerpo}</table></div>`;
}

export async function excelAHtml(buffer: Buffer, titulo: string): Promise<string> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  const partes: string[] = [];
  const hojas = libro.worksheets.filter((h) => h.state !== 'hidden' && h.state !== 'veryHidden');
  for (const hoja of hojas.slice(0, VISTA_PREVIA_MAX_HOJAS)) {
    const totalFilas = hoja.actualRowCount;
    const columnas = Math.min(hoja.actualColumnCount || hoja.columnCount || 0, VISTA_PREVIA_MAX_COLUMNAS);
    const filas: Array<Array<{ texto: string; numero: boolean }>> = [];
    let ultimaConDatos = 0;
    hoja.eachRow({ includeEmpty: true }, (fila, n) => {
      if (n > VISTA_PREVIA_MAX_FILAS) return;
      const celdas: Array<{ texto: string; numero: boolean }> = [];
      for (let c = 1; c <= columnas; c += 1) celdas.push(textoDeCelda(fila.getCell(c).value));
      filas[n - 1] = celdas;
      if (celdas.some((x) => x.texto !== '')) ultimaConDatos = n;
    });
    const visibles = Array.from({ length: ultimaConDatos }, (_, i) => filas[i] ?? []);
    partes.push(`<h2>${escapaHtml(hoja.name)}</h2>`);
    if (!visibles.length || !columnas) {
      partes.push('<p class="aviso">Hoja vacía.</p>');
      continue;
    }
    partes.push(tablaHtml(visibles, columnas));
    const recortes: string[] = [];
    if (totalFilas > VISTA_PREVIA_MAX_FILAS) recortes.push(`las primeras ${VISTA_PREVIA_MAX_FILAS} filas de ${totalFilas}`);
    if ((hoja.actualColumnCount || 0) > VISTA_PREVIA_MAX_COLUMNAS) recortes.push(`las primeras ${VISTA_PREVIA_MAX_COLUMNAS} columnas`);
    if (recortes.length) partes.push(`<p class="aviso">Vista previa: ${recortes.join(' y ')}. Descarga el archivo para verlo completo.</p>`);
  }
  if (hojas.length > VISTA_PREVIA_MAX_HOJAS) {
    partes.push(`<p class="aviso">Se muestran ${VISTA_PREVIA_MAX_HOJAS} de ${hojas.length} hojas.</p>`);
  }
  if (!hojas.length) partes.push('<p class="aviso">El libro no tiene hojas visibles.</p>');
  return pagina(titulo, partes.join(''));
}

/** CSV con comillas y separador `,` o `;` (el que más aparezca en la primera línea). */
export function parseaCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i += 1) {
    const ch = limpio[i];
    if (comillas) {
      if (ch === '"' && limpio[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (ch === '"') comillas = false;
      else campo += ch;
      continue;
    }
    if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i += 1;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
      if (filas.length >= VISTA_PREVIA_MAX_FILAS) return filas;
    } else campo += ch;
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

export function csvAHtml(buffer: Buffer, titulo: string): string {
  const filas = parseaCsv(buffer.toString('utf8'));
  const columnas = Math.min(Math.max(0, ...filas.map((f) => f.length)), VISTA_PREVIA_MAX_COLUMNAS);
  if (!filas.length || !columnas) return pagina(titulo, '<p class="aviso">Archivo vacío.</p>');
  const celdas = filas.map((f) =>
    f.slice(0, columnas).map((t) => ({ texto: t, numero: /^-?\d+(?:[.,]\d+)?$/.test(t.trim()) })),
  );
  return pagina(titulo, tablaHtml(celdas, columnas));
}

/** Quita lo que no debe ir en una vista previa aunque la CSP ya lo bloquee. */
export function limpiaHtmlDeWord(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed|style|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*("|')\s*(javascript|vbscript):[^"']*\2/gi, '');
}

export async function wordAHtml(buffer: Buffer, titulo: string): Promise<string> {
  // mammoth es CommonJS; se carga al usarlo para no pesar al arrancar el API.
  const mammoth = (await import('mammoth')) as unknown as {
    convertToHtml: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    default?: { convertToHtml: (input: { buffer: Buffer }) => Promise<{ value: string }> };
  };
  const convertir = mammoth.convertToHtml ?? mammoth.default?.convertToHtml;
  if (!convertir) throw new Error('mammoth no disponible');
  const { value } = await convertir({ buffer });
  const cuerpo = limpiaHtmlDeWord(value).trim();
  return pagina(titulo, cuerpo ? `<div class="doc">${cuerpo}</div>` : '<p class="aviso">Documento vacío.</p>');
}

/** HTML de vista previa para Excel, CSV o Word; null si ese tipo no la tiene (PDF, imagen, otro). */
export async function vistaPreviaHtml(
  buffer: Buffer,
  nombre: string,
  mime?: string | null,
): Promise<string | null> {
  const tipo = tipoDeDocumento(nombre, mime);
  if (tipo === 'excel') return excelAHtml(buffer, nombre);
  if (tipo === 'csv') return csvAHtml(buffer, nombre);
  if (tipo === 'word') return wordAHtml(buffer, nombre);
  return null;
}
