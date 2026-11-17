export type Tipo69B = 'PRESUNTO' | 'DEFINITIVO';
export type Entrada69B = { rfc: string; nombre: string | null; tipo: Tipo69B };

export const URL_LISTA_69B_SAT =
  'http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv';

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export function normalizarRfc(rfc: string | null | undefined): string {
  return String(rfc ?? '').replace(/[\s\-]/g, '').toUpperCase();
}

function detectarSeparador(linea: string): RegExp {
  const pipes = (linea.match(/\|/g) ?? []).length;
  const comas = (linea.match(/,/g) ?? []).length;
  return pipes > comas ? /\|/ : /,/;
}

function parseFila(linea: string, sep: RegExp): string[] {
  return linea.split(sep).map((c) => c.replace(/^["']|["']$/g, '').trim());
}

function tipoDe(texto: string): Tipo69B {
  const t = texto.toLowerCase();
  if (t.includes('definit')) return 'DEFINITIVO';
  return 'PRESUNTO';
}

export function parsearCsv69B(csv: string): Entrada69B[] {
  const lineas = String(csv ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) return [];
  const sep = detectarSeparador(lineas[0]);
  const headers = parseFila(lineas[0], sep).map((h) => h.toLowerCase());
  const idxRfc = headers.findIndex((h) => h.includes('rfc'));
  const idxNombre = headers.findIndex((h) => h.includes('nombre') || h.includes('razon'));
  const idxSit = headers.findIndex((h) => h.includes('situ') || h.includes('estatus') || h.includes('supuesto') || h.includes('tipo'));
  if (idxRfc < 0) return [];
  const map = new Map<string, Entrada69B>();
  for (let i = 1; i < lineas.length; i++) {
    const cols = parseFila(lineas[i], sep);
    const rfc = normalizarRfc(cols[idxRfc]);
    if (!RFC_RE.test(rfc)) continue;
    const tipo = idxSit >= 0 ? tipoDe(cols[idxSit] ?? '') : 'PRESUNTO';
    const nombre = idxNombre >= 0 ? (cols[idxNombre]?.trim() || null) : null;
    const prev = map.get(rfc);
    if (!prev || (prev.tipo === 'PRESUNTO' && tipo === 'DEFINITIVO')) {
      map.set(rfc, { rfc, nombre, tipo });
    }
  }
  return [...map.values()];
}
