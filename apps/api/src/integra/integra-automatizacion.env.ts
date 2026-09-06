/**
 * Interruptores y afinado por entorno de las tareas automáticas de INTEGRA.
 *
 * Todo lo que corre solo contra el parque de un cliente —precalentar streams,
 * reconciliar el espejo, sondear capacidades— tiene que poder apagarse sin
 * desplegar código y sin comentar un `@Cron`. Estas son funciones puras a
 * propósito: se prueban sin levantar Nest y valen tanto para el que lee
 * `process.env` a pelo como para el que va por `ConfigService`.
 *
 * Convención: **encendido por defecto**. Un valor ausente NO apaga nada; solo
 * apaga quien lo dice explícitamente (`0`, `false`, `off`, `no`).
 */

const APAGADO = new Set(['0', 'false', 'off', 'no']);
const ENCENDIDO = new Set(['1', 'true', 'on', 'yes', 'si', 'sí']);

/**
 * ¿Está encendida esta automatización?
 *
 * Un valor que no se reconoce se trata como el valor por defecto y NO como
 * apagado: una errata en el `.env` no debe dejar la consola sin automatizar en
 * silencio.
 */
export function interruptorEncendido(valor: string | undefined | null, porDefecto = true): boolean {
  if (valor == null) return porDefecto;
  const v = String(valor).trim().toLowerCase();
  if (v === '') return porDefecto;
  if (APAGADO.has(v)) return false;
  if (ENCENDIDO.has(v)) return true;
  return porDefecto;
}

/**
 * Entero de entorno con suelo y techo.
 *
 * El techo no es decoración: un escalonado de un día entre cámara y cámara, o
 * un tope de mil registros por vuelta, son formas de dejar la automatización
 * inservible o de convertirla en una tormenta contra el equipo del cliente.
 */
export function enteroDeEntorno(
  valor: string | undefined | null,
  porDefecto: number,
  min: number,
  max: number,
): number {
  // `Number('')` es 0, no NaN: sin este corte, una variable ausente pondría el
  // escalonado a cero y dispararía los diecisiete registros de golpe.
  const bruto = String(valor ?? '').trim();
  if (bruto === '') return porDefecto;
  const n = Number(bruto);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
