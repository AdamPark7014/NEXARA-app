/**
 * Inferencias en código para Asignar con IA (ayudantes, herramientas, cupo).
 * No agranda el prompt de Haiku: lee el texto y el catálogo ya cargado.
 */
import { normalizar } from './nombres.js';

export type AyudanteInferido = { id: number; nombre: string };
export type HerramientaInferida = { descripcion: string; cantidad: number };

const STOP = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'en', 'al', 'a']);

/** Señales de que alguien más va con el responsable. */
const SENAL_AYUDA = /\b(con|junto(?:\s+con)?|acompa[nñ]ad[oa]s?(?:\s+de)?|ayudad[oa]s?(?:\s+por)?|lleven?\s+a|vayan?\s+|tambi[eé]n)\b/;

const PRESETS: Array<{ clave: string; descripcion: string; alias?: string[] }> = [
  { clave: 'escalera', descripcion: 'Escalera' },
  { clave: 'taladro', descripcion: 'Taladro con brocas', alias: ['taladro con brocas'] },
  { clave: 'ponchadora', descripcion: 'Ponchadora RJ45', alias: ['ponchadora rj45'] },
  { clave: 'probador de red', descripcion: 'Probador de red', alias: ['probador'] },
  { clave: 'multimetro', descripcion: 'Multímetro' },
  { clave: 'desarmadores', descripcion: 'Juego de desarmadores', alias: ['juego de desarmadores', 'destornilladores'] },
  { clave: 'pinzas', descripcion: 'Pinzas de electricista', alias: ['pinzas de electricista'] },
  { clave: 'arnes', descripcion: 'Arnés de seguridad', alias: ['arnes de seguridad'] },
  { clave: 'extension', descripcion: 'Extensión eléctrica', alias: ['extension electrica'] },
  { clave: 'laptop', descripcion: 'Laptop de configuración', alias: ['laptop de configuracion', 'computadora'] },
];

const NUMERO_PALABRA: Record<string, number> = {
  un: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
};

function palabrasUtiles(nombre: string): string[] {
  return normalizar(nombre)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

function cantidadCerca(texto: string, ancla: string): number {
  const n = normalizar(texto);
  const a = normalizar(ancla);
  const idx = n.indexOf(a);
  if (idx < 0) return 1;
  const antes = n.slice(Math.max(0, idx - 24), idx);
  const m = antes.match(/(?:^|\s)(\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*$/);
  if (!m) return 1;
  const raw = m[1];
  const num = /^\d+$/.test(raw) ? Number(raw) : (NUMERO_PALABRA[raw] ?? 1);
  return Math.min(20, Math.max(1, num));
}

/**
 * «con Juan y Pedro» → ids del catálogo que no son el responsable.
 * Sin señal de acompañamiento no propone ayudantes (evita confundir al responsable).
 */
export function inferirAyudantes(
  texto: string,
  personas: Array<{ id: number; nombre: string }>,
  responsableId?: number | null,
): AyudanteInferido[] {
  const t = normalizar(texto);
  if (!t || !personas.length || !SENAL_AYUDA.test(t)) return [];

  const out: AyudanteInferido[] = [];
  const vistos = new Set<number>();
  for (const p of personas) {
    if (responsableId != null && p.id === responsableId) continue;
    const parts = palabrasUtiles(p.nombre);
    if (!parts.length) continue;
    // Al menos una palabra del nombre (nombre de pila o apellido) aparece en el texto.
    if (!parts.some((w) => new RegExp(`(?:^|\\s)${w}(?:\\s|$)`).test(t))) continue;
    if (vistos.has(p.id)) continue;
    vistos.add(p.id);
    out.push({ id: p.id, nombre: p.nombre });
    if (out.length >= 5) break;
  }
  return out;
}

/** «lleva la escalera y el taladro» → checklist con presets o nombres del catálogo. */
export function inferirHerramientas(
  texto: string,
  catalogo?: Array<{ nombre: string }> | null,
): HerramientaInferida[] {
  const t = normalizar(texto);
  if (!t) return [];
  const out: HerramientaInferida[] = [];
  const vistos = new Set<string>();

  const agregar = (descripcion: string, ancla: string) => {
    const clave = normalizar(descripcion);
    if (!clave || vistos.has(clave)) return;
    vistos.add(clave);
    out.push({ descripcion, cantidad: cantidadCerca(texto, ancla) });
  };

  for (const p of PRESETS) {
    const alias = [p.clave, ...(p.alias ?? [])];
    const hit = alias.find((a) => t.includes(normalizar(a)));
    if (hit) agregar(p.descripcion, hit);
  }

  for (const item of catalogo ?? []) {
    const nom = (item.nombre || '').trim();
    if (!nom || normalizar(nom).length < 3) continue;
    if (!t.includes(normalizar(nom))) continue;
    agregar(nom, nom);
  }

  return out.slice(0, 15);
}

/** «2 personas», «tres técnicos», «equipo de 4», «cupo 3». */
export function inferirCupo(texto: string): number | null {
  const t = normalizar(texto);
  const m =
    t.match(/\bcupo\s*(?:de\s*)?(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b/) ||
    t.match(/\bequipo\s+de\s+(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b/) ||
    t.match(/\b(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(?:personas?|tecnicos?|t[eé]cnicos?|ingenieros?)\b/);
  if (!m) return null;
  const raw = m[1];
  const n = /^\d+$/.test(raw) ? Number(raw) : (NUMERO_PALABRA[raw] ?? NaN);
  if (!Number.isFinite(n) || n < 1 || n > 20) return null;
  return n;
}
