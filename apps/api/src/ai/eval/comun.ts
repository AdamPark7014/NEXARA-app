/**
 * Utilidades del eval de IA: llave, presupuesto de pruebas y concurrencia.
 *
 * Llave (nunca en el repo): `ANTHROPIC_API_KEY` del entorno (con `CLAUDE_BASE_URL` si va por
 * la puerta); si no hay, el token del proyecto `pruebas` de la puerta
 * (`C:\dev\secrets\puerta-ia\pruebas.token`) o la llave directa de
 * `C:\dev\secrets\anthropic\ANTHROPIC_API_KEY.txt`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { usoDeRespuesta, type UsoClaude } from '../claude/claude.service.js';

export const DIR_EVAL = resolve(process.cwd(), 'src/ai/eval');
export const DIR_RESULTADOS = join(DIR_EVAL, 'resultados');
/** Detalle de cada corrida (respuestas completas): fuera de git. */
export const DIR_DETALLE = resolve(process.cwd(), '../../.ai/eval-ia');
const ARCHIVO_GASTO = join(DIR_RESULTADOS, 'gasto.json');

const PUERTA_PUBLICA = 'https://ia.zynoratek.com';
const TOKEN_PRUEBAS = 'C:\\dev\\secrets\\puerta-ia\\pruebas.token';
const LLAVE_DIRECTA = 'C:\\dev\\secrets\\anthropic\\ANTHROPIC_API_KEY.txt';

/** Deja `ANTHROPIC_API_KEY` y `CLAUDE_BASE_URL` listos para `ClaudeService` y el juez. */
export function cargarLlave(): string {
  if ((process.env.ANTHROPIC_API_KEY || '').trim()) {
    return `entorno${process.env.CLAUDE_BASE_URL ? ` → ${process.env.CLAUDE_BASE_URL}` : ''}`;
  }
  if (existsSync(TOKEN_PRUEBAS) && !process.env.EVAL_DIRECTO) {
    process.env.ANTHROPIC_API_KEY = readFileSync(TOKEN_PRUEBAS, 'utf8').trim();
    process.env.CLAUDE_BASE_URL = PUERTA_PUBLICA;
    return `puerta (pruebas) → ${PUERTA_PUBLICA}`;
  }
  if (existsSync(LLAVE_DIRECTA)) {
    process.env.ANTHROPIC_API_KEY = readFileSync(LLAVE_DIRECTA, 'utf8').trim();
    delete process.env.CLAUDE_BASE_URL;
    return 'Anthropic directo';
  }
  throw new Error('Sin llave para el eval: define ANTHROPIC_API_KEY o crea el token de pruebas.');
}

let cliente: Anthropic | null = null;
/** Cliente para el juez y el generador (misma llave y URL que `ClaudeService`). */
export function clienteEval(): Anthropic {
  cliente ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseURL: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com',
    authToken: null,
    maxRetries: 3,
    timeout: 300_000,
  });
  return cliente;
}

type Movimiento = { fecha: string; concepto: string; usd: number };
type Libro = { tope_usd: number; movimientos: Movimiento[] };

function leerLibro(): Libro {
  if (!existsSync(ARCHIVO_GASTO)) return { tope_usd: 4, movimientos: [] };
  return JSON.parse(readFileSync(ARCHIVO_GASTO, 'utf8')) as Libro;
}

export function gastado(): number {
  return leerLibro().movimientos.reduce((s, m) => s + m.usd, 0);
}

export function topeUsd(): number {
  return leerLibro().tope_usd;
}

/** Suma un gasto al libro (agrupado por concepto y día para que no crezca sin fin). */
export function registrarGasto(concepto: string, usd: number | null) {
  if (!usd) return;
  const libro = leerLibro();
  const fecha = new Date().toISOString().slice(0, 10);
  const previo = libro.movimientos.find((m) => m.fecha === fecha && m.concepto === concepto);
  if (previo) previo.usd = Number((previo.usd + usd).toFixed(6));
  else libro.movimientos.push({ fecha, concepto, usd: Number(usd.toFixed(6)) });
  mkdirSync(DIR_RESULTADOS, { recursive: true });
  writeFileSync(ARCHIVO_GASTO, JSON.stringify(libro, null, 2) + '\n');
}

export class PresupuestoAgotado extends Error {}

/** Corta antes de pasarse del tope del libro. */
export function asegurarPresupuesto(margen = 0) {
  const g = gastado();
  if (g + margen >= topeUsd()) {
    throw new PresupuestoAgotado(`Presupuesto de pruebas agotado: ${g.toFixed(4)} de ${topeUsd()} USD.`);
  }
}

/** Uso + costo de una respuesta directa del SDK (juez, generador). */
export function usoDe(modelo: string, r: Anthropic.Message): UsoClaude {
  return usoDeRespuesta(modelo, r.usage);
}

export function textoDe(r: Anthropic.Message): string {
  return r.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
}

/** Corre `fn` sobre los elementos con a lo más `n` a la vez, en orden de resultado. */
export async function enParalelo<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(items.length);
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++;
      salida[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
  return salida;
}

/** Sin acentos ni mayúsculas, para comparar texto. */
export function plano(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function argumentos(): Record<string, string> {
  const salida: Record<string, string> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const clave = a[i].slice(2);
    const valor = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : 'si';
    salida[clave] = valor;
  }
  return salida;
}
