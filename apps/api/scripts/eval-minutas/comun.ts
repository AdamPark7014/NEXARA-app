/**
 * Utilidades del eval de minutas: llave, libro de gasto (tope 4 USD) y concurrencia.
 *
 * Llave (nunca en el repo ni en la salida): la directa de `C:\dev\secrets\anthropic\ANTHROPIC_API_KEY.txt`
 * o, con `EVAL_PUERTA=1`, el token del proyecto `pruebas` de la puerta de IA
 * (`C:\dev\secrets\puerta-ia\pruebas.token`, base https://ia.zynoratek.com).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

export const DIR_EVAL = resolve(__dirname);
export const DIR_TRANSCRIPCIONES = join(DIR_EVAL, 'transcripciones');
/** Respuestas completas de cada corrida: fuera de git. */
export const DIR_DETALLE = resolve(__dirname, '../../../../.ai/eval-minutas');
const ARCHIVO_GASTO = join(DIR_EVAL, 'gasto.json');
export const TOPE_USD = 4;

const PRECIOS: Record<string, { entrada: number; salida: number; cacheLeida: number }> = {
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5, cacheLeida: 0.01 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10, cacheLeida: 0.2 },
  'claude-opus-5-5': { entrada: 4, salida: 20, cacheLeida: 0.2 },
};

export function usdDe(modelo: string, u: Anthropic.Usage): number {
  const p = PRECIOS[modelo];
  if (!p) return 0;
  const escrita = u.cache_creation_input_tokens ?? 0;
  const leida = u.cache_read_input_tokens ?? 0;
  return (u.input_tokens * p.entrada + escrita * p.entrada * 1.25 + leida * p.cacheLeida + u.output_tokens * p.salida) / 1e6;
}

export function cargarLlave(): string {
  // Directo por omisión: el proyecto `pruebas` de la puerta tiene 5 USD al mes y lo comparten otros evals.
  if (process.env.EVAL_PUERTA && existsSync('C:\\dev\\secrets\\puerta-ia\\pruebas.token')) {
    process.env.ANTHROPIC_API_KEY = readFileSync('C:\\dev\\secrets\\puerta-ia\\pruebas.token', 'utf8').trim();
    process.env.CLAUDE_BASE_URL = 'https://ia.zynoratek.com';
    return 'puerta (pruebas)';
  }
  process.env.ANTHROPIC_API_KEY = readFileSync('C:\\dev\\secrets\\anthropic\\ANTHROPIC_API_KEY.txt', 'utf8').trim();
  delete process.env.CLAUDE_BASE_URL;
  return 'Anthropic directo';
}

let cliente: Anthropic | null = null;
export function clienteEval(): Anthropic {
  cliente ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseURL: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com',
    authToken: null,
    maxRetries: 3,
    timeout: 600_000,
  });
  return cliente;
}

type Libro = { tope_usd: number; movimientos: Array<{ fecha: string; concepto: string; usd: number }> };
const leer = (): Libro =>
  existsSync(ARCHIVO_GASTO) ? (JSON.parse(readFileSync(ARCHIVO_GASTO, 'utf8')) as Libro) : { tope_usd: TOPE_USD, movimientos: [] };

export const gastado = () => leer().movimientos.reduce((s, m) => s + m.usd, 0);

export function registrarGasto(concepto: string, usd: number) {
  if (!usd) return;
  const libro = leer();
  const fecha = new Date().toISOString().slice(0, 10);
  const previo = libro.movimientos.find((m) => m.fecha === fecha && m.concepto === concepto);
  if (previo) previo.usd = Number((previo.usd + usd).toFixed(6));
  else libro.movimientos.push({ fecha, concepto, usd: Number(usd.toFixed(6)) });
  writeFileSync(ARCHIVO_GASTO, JSON.stringify(libro, null, 2) + '\n');
}

export function asegurarPresupuesto(margen = 0) {
  const g = gastado();
  if (g + margen >= TOPE_USD) throw new Error(`Presupuesto del eval agotado: ${g.toFixed(4)} de ${TOPE_USD} USD.`);
}

export const textoDe = (r: Anthropic.Message) =>
  r.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();

export async function enParalelo<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(items.length);
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (siguiente < items.length) {
        const i = siguiente++;
        salida[i] = await fn(items[i], i);
      }
    }),
  );
  return salida;
}

export const plano = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function argumentos(): Record<string, string> {
  const salida: Record<string, string> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    salida[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : 'si';
  }
  return salida;
}

export function guardarDetalle(nombre: string, datos: unknown) {
  mkdirSync(DIR_DETALLE, { recursive: true });
  writeFileSync(join(DIR_DETALLE, nombre), JSON.stringify(datos, null, 2));
}
