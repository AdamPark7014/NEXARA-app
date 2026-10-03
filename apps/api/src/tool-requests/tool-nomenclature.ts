/**
 * Nomenclatura interna de herramienta: prefijo de categoría + serie normalizada.
 * Ej.: Multímetro Fluke 87V / SN 12345 → "MUL-12345"
 */

const CATEGORY_PREFIXES: Array<{ match: RegExp; prefix: string }> = [
  { match: /mult[ií]metro|fluke|clamp/i, prefix: 'MUL' },
  { match: /taladro|drill|perforad/i, prefix: 'TAL' },
  { match: /escalera|ladder/i, prefix: 'ESC' },
  { match: /c[aá]mara|camera|hikvision|dahua/i, prefix: 'CAM' },
  { match: /laptop|notebook|tablet/i, prefix: 'LAP' },
  { match: /radio|walkie|ht/i, prefix: 'RAD' },
  { match: /medidor|tester|pinza/i, prefix: 'MED' },
  { match: /llave|herramienta|kit/i, prefix: 'HER' },
];

export function categoryPrefixFromName(toolName: string, category?: string | null): string {
  const source = `${category || ''} ${toolName || ''}`.trim();
  for (const rule of CATEGORY_PREFIXES) {
    if (rule.match.test(source)) return rule.prefix;
  }
  const letters = source
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  return (letters.slice(0, 3) || 'HER').padEnd(3, 'X');
}

export function normalizeSerialForCode(serial: string): string {
  return String(serial || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/** Código interno sugerido: PREFIJO-SERIE */
export function buildCodigoInterno(input: {
  toolName: string;
  serialNumber: string;
  category?: string | null;
}): string {
  const prefix = categoryPrefixFromName(input.toolName, input.category);
  const serial = normalizeSerialForCode(input.serialNumber) || 'SINSERIE';
  return `${prefix}-${serial}`;
}

/** Largo de las columnas `codigoInterno` y `barcode` de la herramienta (`@db.VarChar(64)`). */
export const LARGO_MAXIMO_CODIGO_ETIQUETA = 64;

/**
 * Para una etiqueta que no está guardada: el trozo más largo de la serie que lleva un
 * código calculado (`PREFIJO-SERIE`, con la serie en mayúsculas y guiones). Sirve para
 * acotar la búsqueda entre las herramientas sin código en vez de recorrer el inventario
 * entero. `undefined` si el código no tiene esa forma (entonces no puede ser calculado);
 * `''` si la serie es `SINSERIE` (hay forma, pero nada que buscar en la serie).
 */
export function pistaDeSerie(code: string): string | undefined {
  const m = /^[A-Z]{3}-([A-Z0-9-]{1,32})$/.exec(String(code ?? ''));
  if (!m) return undefined;
  if (m[1] === 'SINSERIE') return '';
  return m[1].split('-').filter(Boolean).reduce((a, b) => (b.length > a.length ? b : a), '');
}

/**
 * Lo que leyó el lector de una etiqueta, sin lo que mete alrededor (espacios, saltos de
 * línea). Se compara sin distinguir mayúsculas: hay lectores con Bloq Mayús invertido.
 */
export function normalizarCodigoEtiqueta(valor: unknown): string {
  return String(valor ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * El identificador que va en las barras de la etiqueta de una herramienta.
 *
 * No hay una numeración nueva: es la nomenclatura interna que ya existía (`barcode`,
 * que por defecto es el `codigoInterno`). Solo se calcula para las herramientas dadas
 * de alta antes de la nomenclatura, que tienen las dos columnas vacías.
 */
export function codigoDeEtiqueta(item: {
  barcode?: string | null;
  codigoInterno?: string | null;
  toolName: string;
  serialNumber: string;
}): string {
  return (
    (item.barcode || '').trim() ||
    (item.codigoInterno || '').trim() ||
    buildCodigoInterno({ toolName: item.toolName, serialNumber: item.serialNumber })
  );
}
