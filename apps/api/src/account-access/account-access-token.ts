/**
 * Ficha de corta vida para «Acceso a cuentas».
 *
 * Christian vuelve a escribir su contraseña y el servidor le da una ficha de 5 minutos, firmada con
 * HMAC-SHA256 y atada a su usuario. No se guarda en ninguna parte: si el servidor se reinicia, se
 * vuelve a pedir la contraseña. Módulo puro (sin Nest ni Prisma).
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const VIGENCIA_FICHA_MS = 5 * 60_000;
const ALCANCE = 'account-access';

type Carga = { uid: number; exp: number; scope: string };

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function firmar(cuerpo: string, secreto: string): string {
  return createHmac('sha256', secreto).update(cuerpo).digest('base64url');
}

export function emitirFicha(uid: number, secreto: string, ahora = Date.now()): { ficha: string; venceEn: number } {
  if (!secreto) throw new Error('Falta el secreto para firmar la ficha');
  const carga: Carga = { uid, exp: ahora + VIGENCIA_FICHA_MS, scope: ALCANCE };
  const cuerpo = b64(JSON.stringify(carga));
  return { ficha: `${cuerpo}.${firmar(cuerpo, secreto)}`, venceEn: carga.exp };
}

/** ¿La ficha es de ese usuario, está firmada por este servidor y sigue vigente? */
export function fichaValida(ficha: unknown, uid: number, secreto: string, ahora = Date.now()): boolean {
  if (!secreto || typeof ficha !== 'string') return false;
  const partes = ficha.split('.');
  if (partes.length !== 2) return false;
  const [cuerpo, firma] = partes;
  const esperada = firmar(cuerpo, secreto);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Partial<Carga>;
    return carga.scope === ALCANCE && carga.uid === uid && typeof carga.exp === 'number' && carga.exp > ahora;
  } catch {
    return false;
  }
}

// Sin 0/O, 1/l/I: se lee y se dicta sin confusiones.
const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz';
const NUMEROS = '23456789';
const ALFABETO = MAYUSCULAS + MINUSCULAS + NUMEROS;

/** Contraseña aleatoria legible (14 por omisión) con mayúscula, minúscula y número. */
export function generarContrasenaSegura(largo = 14): string {
  const n = Math.max(10, largo);
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(MAYUSCULAS), pick(MINUSCULAS), pick(NUMEROS)];
  while (chars.length < n) chars.push(pick(ALFABETO));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
