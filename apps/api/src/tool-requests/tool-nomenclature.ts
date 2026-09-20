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
