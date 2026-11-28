/**
 * Resumen corto y seguro de un error, para guardarlo en el latido de las tareas programadas.
 *
 * Por qué no se guarda `error.message` tal cual: los errores de Prisma traen, a partir de la segunda línea, los
 * argumentos de la consulta con sus valores (correos, ids, textos de clientes). El latido se verá en un endpoint y se
 * guardará en la base, así que aquí solo entra la primera línea con contenido, sin datos personales ni credenciales.
 *
 * Reglas:
 *   - Solo la primera línea con texto de `message` (Prisma empieza con una línea en blanco).
 *   - Correos → `[correo]`; tokens JWT (`eyJ…`) → `[token]`; `Bearer xxx` → `Bearer [token]`;
 *     números de 9 o más dígitos (teléfonos, cuentas, folios largos) → `#`.
 *   - Se antepone `name` si no es el genérico `Error`, y el `code` corto de Prisma o de red (`P2002`, `ECONNREFUSED`).
 *   - Máximo 200 caracteres en total.
 *   - Acepta cualquier valor lanzado: un string suelto, un objeto o `undefined` no hacen fallar a nadie.
 *
 * Las expresiones regulares tienen cuantificadores acotados y se aplican sobre un texto ya recortado: un mensaje
 * enorme o malicioso no puede volverlas lentas (la lección del normalizador de errores, 28-11-2026).
 */

export const ERROR_CORTO_MAX = 200;

/** Se recorta antes de enmascarar: más allá de esto no hay nada que mostrar y solo costaría tiempo. */
const LECTURA_MAX = 1000;

const SIN_DETALLE = 'error sin detalle';

const JWT = /eyJ[A-Za-z0-9_-]{5,2000}\.[A-Za-z0-9_-]{5,2000}(?:\.[A-Za-z0-9_-]{0,2000})?/g;
const BEARER = /Bearer\s{1,8}[A-Za-z0-9._~+/=-]{1,2000}/gi;
const CORREO = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,6}/g;
const NUMERO_LARGO = /\d{9,}/g;

function textoDe(valor: unknown): string {
  if (valor === undefined || valor === null) return '';
  if (typeof valor === 'string') return valor;
  if (valor instanceof Error) return valor.message ?? '';
  if (typeof valor === 'object') {
    const mensaje = (valor as { message?: unknown }).message;
    return typeof mensaje === 'string' ? mensaje : '';
  }
  if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'bigint') return String(valor);
  return '';
}

function primeraLinea(texto: string): string {
  for (const linea of texto.slice(0, LECTURA_MAX).split(/\r?\n/)) {
    const limpia = linea.trim();
    if (limpia) return limpia;
  }
  return '';
}

function enmascarar(texto: string): string {
  return texto
    .replace(JWT, '[token]')
    .replace(BEARER, 'Bearer [token]')
    .replace(CORREO, '[correo]')
    .replace(NUMERO_LARGO, '#');
}

function etiquetaDe(valor: unknown): string {
  if (typeof valor !== 'object' || valor === null) return '';
  const { name, code } = valor as { name?: unknown; code?: unknown };
  const partes: string[] = [];
  if (typeof name === 'string' && name && name !== 'Error' && /^[A-Za-z0-9_.$-]{1,80}$/.test(name)) partes.push(name);
  if (typeof code === 'string' && /^[A-Z0-9_]{2,24}$/.test(code)) partes.push(`[${code}]`);
  return partes.join(' ');
}

export function errorCorto(error: unknown): string {
  try {
    const linea = enmascarar(primeraLinea(textoDe(error))) || SIN_DETALLE;
    const etiqueta = etiquetaDe(error);
    const completo = etiqueta ? `${etiqueta}: ${linea}` : linea;
    return completo.length > ERROR_CORTO_MAX ? `${completo.slice(0, ERROR_CORTO_MAX - 1)}…` : completo;
  } catch {
    // Un objeto con getters que lanzan, por ejemplo: el resumen nunca debe romper a quien lo pide.
    return SIN_DETALLE;
  }
}
