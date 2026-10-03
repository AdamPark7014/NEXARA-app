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
