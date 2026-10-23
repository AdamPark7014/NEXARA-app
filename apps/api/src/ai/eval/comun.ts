/**
 * Utilidades del eval de IA: llave, presupuesto de pruebas, costo estimado y concurrencia.
 *
 * Todo el eval va SIEMPRE por la puerta (`https://ia.zynoratek.com`) con el token del proyecto
 * `pruebas` (`C:\dev\secrets\puerta-ia\pruebas.token`): así cada centavo pasa por el tope de
 * la puerta. No hay camino a la llave directa de Anthropic (se salta el tope) y una
 * `ANTHROPIC_API_KEY` del entorno se ignora. Regla de Adam (23-10-2026): pruebas solo con
 * Haiku 5.5; otro modelo solo pidiéndolo explícitamente.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { estimarUsd, usoDeRespuesta, type UsoClaude } from '../claude/claude.service.js';

export const DIR_EVAL = resolve(process.cwd(), 'src/ai/eval');
export const DIR_RESULTADOS = join(DIR_EVAL, 'resultados');
/** Detalle de cada corrida (respuestas completas): fuera de git. */
export const DIR_DETALLE = resolve(process.cwd(), '../../.ai/eval-ia');
const ARCHIVO_GASTO = join(DIR_RESULTADOS, 'gasto.json');

const PUERTA_PUBLICA = 'https://ia.zynoratek.com';
const TOKEN_PRUEBAS = 'C:\\dev\\secrets\\puerta-ia\\pruebas.token';

/**
 * Deja `ANTHROPIC_API_KEY` (token de pruebas) y `CLAUDE_BASE_URL` (la puerta) listos para
 * `ClaudeService` y el juez. Sin token, se detiene: nunca cae a la llave directa.
 */
export function cargarLlave(): string {
  if (!existsSync(TOKEN_PRUEBAS)) {
    throw new Error(
      `Falta el token de pruebas de la puerta (${TOKEN_PRUEBAS}). El eval solo corre por la puerta; ` +
        'dalo de alta con «pnpm --dir C:\\dev\\apps\\PUERTA-IA-app alta -- --nombre pruebas --modelos claude-haiku-5-5».',
    );
  }
  const token = readFileSync(TOKEN_PRUEBAS, 'utf8').trim();
  if (!token) throw new Error(`El token de pruebas (${TOKEN_PRUEBAS}) está vacío.`);
  process.env.ANTHROPIC_API_KEY = token;
  process.env.CLAUDE_BASE_URL = PUERTA_PUBLICA;
  return `puerta (pruebas) → ${PUERTA_PUBLICA}`;
}

/** Modelos por nombre corto. Por omisión, Haiku: los demás solo si se piden. */
export const MODELOS: Record<string, string> = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
};

export function modeloDe(nombre: string | undefined, porOmision = 'haiku'): string {
  const clave = (nombre || porOmision).trim().toLowerCase();
  const modelo = MODELOS[clave];
  if (!modelo) throw new Error(`Modelo desconocido: ${nombre} (usa ${Object.keys(MODELOS).join(', ')})`);
  return modelo;
}

/**
 * Costo estimado de una llamada: `cacheada` es la parte del prompt que se lee de la caché
 * (`primera` = la escribe, 1.25×). null si el modelo no está en la tabla de precios.
 */
export function costoLlamada(
  modelo: string,
  tokens: { entrada: number; cacheada?: number; salida: number },
  primera = false,
): number {
  const cacheada = Math.min(tokens.cacheada ?? 0, tokens.entrada);
  return (
    estimarUsd(modelo, {
      entrada: tokens.entrada - cacheada,
      salida: tokens.salida,
      ...(primera ? { cacheEscrita: cacheada } : { cacheLeida: cacheada }),
    }) ?? 0
  );
}

/** Lo que queda del tope del libro de gasto. */
export function restante(): number {
  return Math.max(0, topeUsd() - gastado());
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
