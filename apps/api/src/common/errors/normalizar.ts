import { createHash } from 'crypto';

/**
 * Piezas puras para reconocer «el mismo error» sin guardar los valores que mandó la persona.
 *
 * Sin Nest, sin Prisma, sin tocar la red: reciben texto o un error y devuelven texto.
 *  - `normalizarMensaje`: «Actividad 1234 no encontrada» y «Actividad 99 no encontrada» quedan
 *    iguales; correos, tokens, fechas, montos, números y todo lo que va entre comillas se vuelve
 *    un marcador. Si queda una comilla sin cerrar (o con una cita demasiado larga), el texto se
 *    corta ahí. No promete esconder un nombre propio ni un identificador escrito sin comillas.
 *  - `normalizarRuta` / `rutaPatron`: `/api/activity-evidence/123/entry-photo` y la misma con otro
 *    número son una sola ruta.
 *  - `huellaDeError`: 16 caracteres que cambian solo cuando cambia el error de verdad.
 *  - `resumenInterno`: de un error no controlado (Prisma, TypeError…) deja qué falló y dónde, sin
 *    el cuerpo de la consulta, que es donde viajan los valores que mandó la persona.
 *
 * Estas funciones corren en la ruta de errores del API: el texto de entrada se acota antes de
 * cualquier expresión regular (un mensaje puede traer texto de la persona de hasta varios MB).
 */

const MAX_MENSAJE = 240;
const MAX_RUTA = 160;
const MAX_INTERNO = 200;
const MAX_RESUMEN_MENSAJE = 120;
/** Lo máximo que se examina de un texto antes de normalizarlo: de ahí para delante no se mira. */
const MAX_ENTRADA = 1000;
/** Un arreglo de mensajes (validación) se examina solo en sus primeros textos. */
const MAX_ELEMENTOS = 50;
/** Lo que se lee del mensaje de un error corriente antes de normalizarlo (el resumen usa 120). */
const MAX_MENSAJE_ERROR = 600;
/** Una línea de un mensaje de Prisma se examina hasta aquí; la causa viene al final del mensaje. */
const MAX_LINEA = 600;
const MAX_LINEAS_DESDE_EL_FINAL = 200;
const MAX_LINEA_PILA = 1000;
const MAX_LINEAS_PILA = 200;

const RE_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// El lookbehind hace que solo se pruebe el inicio de cada corrida de caracteres de usuario: sin él,
// una corrida larga sin «@» se reintentaba desde cada letra y el costo crecía con el cuadrado.
const RE_CORREO =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const RE_JWT = /\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){1,2}/g;
const RE_CORRIDA_LARGA = /[A-Za-z0-9_-]{20,}/g;
const RE_FECHA =
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;
const RE_HORA = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
const RE_MONTO = /\$\s?\d[\d,]*(?:\.\d+)?/g;
const RE_COMILLAS = [
  /"[^"]{0,200}"/g,
  /“[^”]{0,200}”/g,
  /«[^»]{0,200}»/g,
  /`[^`]{0,200}`/g,
  // La comilla simple solo abre o cierra junto a un espacio o signo: así «l'a» no se confunde.
  /(?<![\p{L}\p{N}])'[^']{0,200}'(?![\p{L}\p{N}])/gu,
];
// Igual que `\([^()]*[^()\s][^()]*\)`, pero con el «hay algo que no es espacio» como mirada hacia
// adelante: la versión de tres grupos retrocedía en cadena con un «(» seguido de texto largo.
const RE_PARENTESIS = /\((?=[^()]*[^()\s])[^()]*\)/g;
const RE_NUMERO = /\b\d+(?:[.,]\d+)*\b/g;
// Una comilla que sobrevive al enmascarado abrió una cita sin cerrar o demasiado larga: lo que
// sigue puede ser un valor de la persona. El apóstrofo entre dos letras o dígitos («it's») no cuenta.
const RE_COMILLA_SUELTA = /["“”«»`]|(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/u;

/** Corta a `max` sin dejar media pareja de sustitutos (un emoji partido no cabe en el JSON de la base). */
function cortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const ultimo = texto.charCodeAt(max - 1);
  return texto.slice(0, ultimo >= 0xd800 && ultimo <= 0xdbff ? max - 1 : max);
}

function normalizarTexto(texto: string): string {
  // Primero se acota: todo lo demás son expresiones regulares y no deben ver un texto sin tope.
  const acotado = cortar(texto, MAX_ENTRADA);
  let t = acotado.replace(RE_UUID, '<uuid>').replace(RE_CORREO, '<correo>').replace(RE_JWT, '<token>');
  // Una corrida larga de letras y dígitos con al menos un dígito es un token; una palabra larga no.
  t = t.replace(RE_CORRIDA_LARGA, (corrida) => (/\d/.test(corrida) ? '<token>' : corrida));
  t = t.replace(RE_FECHA, '<fecha>').replace(RE_HORA, '<hora>').replace(RE_MONTO, '<monto>');
  for (const re of RE_COMILLAS) t = t.replace(re, '<texto>');
  const suelta = t.search(RE_COMILLA_SUELTA);
  if (suelta >= 0) t = t.slice(0, suelta);
  t = t.replace(RE_PARENTESIS, '(<texto>)').replace(RE_NUMERO, '<n>');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * El mensaje de un error sin lo que cambia de una vez a otra. Idempotente y de hasta 240 caracteres.
 * Un arreglo (los mensajes de validación) se resume con sus tres primeros textos distintos.
 * Lo que no es texto ni arreglo (null, undefined, un objeto) da cadena vacía.
 * Solo se examinan los primeros 1,000 caracteres de cada texto y los primeros 50 de un arreglo.
 */
export function normalizarMensaje(texto: unknown): string {
  let normalizado = '';
  if (typeof texto === 'string') {
    normalizado = normalizarTexto(texto);
  } else if (Array.isArray(texto)) {
    const distintos: string[] = [];
    for (const item of texto.slice(0, MAX_ELEMENTOS)) {
      if (typeof item !== 'string') continue;
      const uno = normalizarTexto(item);
      if (uno && !distintos.includes(uno)) distintos.push(uno);
      if (distintos.length >= 3) break;
    }
    normalizado = distintos.join(' | ');
  }
  return cortar(normalizado, MAX_MENSAJE).trimEnd();
}

function segmentoVariable(segmento: string, anterior = ''): string {
  // `/tool-requests/pickup/:code`: el código de recolección es corto (6 caracteres), no se reconoce por forma.
  if (anterior === 'pickup' && segmento.toLowerCase() !== 'pendientes') return ':codigo';
  if (segmento.includes('@') || /%40/i.test(segmento)) return ':correo';
  if (/^\d+$/.test(segmento)) return ':n';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segmento)) return ':uuid';
  if (/^[0-9a-f]{16,}$/i.test(segmento)) return ':token';
  if (/^[A-Za-z0-9_-]{20,}$/.test(segmento) && /\d/.test(segmento)) return ':token';
  return segmento;
}

/**
 * La ruta sin query, sin barra final y con lo variable convertido en marcador
 * (`:n` número, `:uuid`, `:token`, `:correo`, y `:codigo` tras `/pickup/`). Hasta 160 caracteres.
 */
export function normalizarRuta(ruta: string): string {
  if (typeof ruta !== 'string') return '';
  const sinQuery = (ruta.split('#')[0] ?? '').split('?')[0] ?? '';
  const sinBarraFinal = sinQuery.replace(/\/+$/, '');
  if (!sinBarraFinal) return sinQuery.startsWith('/') ? '/' : '';
  let anterior = '';
  return sinBarraFinal
    .split('/')
    .map((segmento) => {
      const salida = segmentoVariable(segmento, anterior);
      anterior = segmento.toLowerCase();
      return salida;
    })
    .join('/')
    .slice(0, MAX_RUTA);
}

export type PeticionConRuta = {
  route?: { path?: unknown } | null;
  originalUrl?: string;
  url?: string;
} | null;

/**
 * La ruta como la declaró el controlador (`/api/activity-evidence/:id/entry-photo`, con el prefijo
 * global incluido). Si Express no encontró ruta (un 404), la URL normalizada.
 */
export function rutaPatron(req: PeticionConRuta | undefined): string {
  const patron = req?.route?.path;
  if (typeof patron === 'string') return patron.slice(0, MAX_RUTA);
  return normalizarRuta(req?.originalUrl ?? req?.url ?? '');
}

/**
 * Identificador corto y estable de un error: método, ruta, estado, código propio y mensaje
 * normalizado. Dos rechazos «iguales» dan la misma huella aunque cambien los números o los nombres.
 */
export function huellaDeError(datos: {
  metodo: string;
  ruta: string;
  estado: number;
  codigo?: string | null;
  mensaje?: unknown;
}): string {
  const entrada = [
    String(datos.metodo ?? '').toUpperCase(),
    datos.ruta ?? '',
    String(datos.estado ?? ''),
    datos.codigo ?? '',
    normalizarMensaje(datos.mensaje),
  ].join('|');
  return createHash('sha1').update(entrada).digest('hex').slice(0, 16);
}

function nombreDeError(e: unknown): string {
  // Un texto o un número lanzado (`throw 'x'`) no tiene clase de error: no se llama «String».
  if (e === null || typeof e !== 'object') return 'Error';
  const objeto = e as { constructor?: { name?: string }; name?: string } | null | undefined;
  const nombre = objeto?.constructor?.name;
  if (nombre && nombre !== 'Object') return nombre;
  return typeof objeto?.name === 'string' && objeto.name ? objeto.name : 'Error';
}

/**
 * Lo que sigue a «invocation:» en la misma línea. Si es el cuerpo de la consulta (llaves o
 * corchetes, o varios «campo: valor» seguidos) trae los valores enviados y no se conserva.
 */
function pareceCuerpoDeConsulta(cola: string): boolean {
  if (/[{}[\]]/.test(cola)) return true;
  let campos = 0;
  for (let i = cola.indexOf(': '); i >= 0; i = cola.indexOf(': ', i + 2)) campos++;
  return campos >= 2;
}

/**
 * Última línea con letras: en un error de Prisma es la causa; antes va el cuerpo con los valores.
 * Se recorre desde el final, sin partir el mensaje entero (puede ser enorme), y cada línea se
 * examina hasta 600 caracteres.
 */
function ultimaLineaUtil(mensaje: string): string {
  let fin = mensaje.length;
  for (let vistas = 0; fin >= 0 && vistas < MAX_LINEAS_DESDE_EL_FINAL; vistas++) {
    const ini = fin === 0 ? 0 : mensaje.lastIndexOf('\n', fin - 1) + 1;
    const linea = mensaje.slice(ini, Math.min(fin, ini + MAX_LINEA)).trim();
    fin = ini - 1;
    if (!linea || /^[\s~{}[\](),]*$/.test(linea)) continue;
    // La primera línea de Prisma («Invalid `prisma.x.y()` invocation:») no es la causa: se queda lo
    // que siga, salvo que sea el cuerpo de la consulta pegado en la misma línea.
    const marca = /invocation:/i.exec(linea);
    if (!marca) return linea;
    const cola = linea.slice(marca.index + marca[0].length).trim();
    return pareceCuerpoDeConsulta(cola) ? '' : cola;
  }
  return '';
}

/** `archivo.js:línea` del primer marco de la pila que sea código nuestro (dist o src, no node_modules). */
function primerMarcoPropio(stack: unknown): string {
  if (typeof stack !== 'string') return '';
  for (const linea of stack.split(/\r?\n/, MAX_LINEAS_PILA)) {
    // Una línea larguísima es el mensaje del error, no un marco de la pila.
    if (linea.length > MAX_LINEA_PILA) continue;
    if (/node_modules/.test(linea) || !/[\\/](?:dist|src)[\\/]/.test(linea)) continue;
    const m = /([^\\/():\s]+\.(?:[cm]?js|ts)):(\d+)(?::\d+)?\)?\s*$/.exec(linea);
    if (m) return `${m[1]}:${m[2]}`;
  }
  return '';
}

/**
 * Qué falló y dónde, sin valores entre comillas ni números, en hasta 200 caracteres.
 *  - Prisma: `<Nombre> prisma.<modelo>.<acción> <código?> <causa>`. El mensaje de Prisma trae el
 *    cuerpo de la consulta con los valores enviados; solo se conserva su última línea con letras,
 *    y si el cuerpo viene pegado a «invocation:» en una sola línea, solo el modelo, la acción y
 *    el código P.
 *  - Otro error: `<Nombre>: <mensaje normalizado> en <archivo.js:línea>`.
 * No promete esconder un nombre propio ni un identificador escrito sin comillas (un RFC): si el
 * texto de un error los trae sin comillas, pasan. Nunca devuelve llaves ni arrobas.
 * Del mensaje solo se lee el principio (600 caracteres) y, en Prisma, el final.
 */
export function resumenInterno(e: unknown): string {
  try {
    const nombre = nombreDeError(e);
    const objeto = (e && typeof e === 'object' ? e : {}) as { message?: unknown; stack?: unknown; code?: unknown };
    const mensaje = typeof objeto.message === 'string' ? objeto.message : typeof e === 'string' ? e : '';
    const principio = cortar(mensaje, MAX_MENSAJE_ERROR);
    let resumen: string;

    if (nombre.startsWith('PrismaClient')) {
      const op = /prisma\.([\w$]+)(?:\.([\w$]+))?\(/.exec(principio);
      const operacion = op ? `prisma.${op[1]}${op[2] ? `.${op[2]}` : ''}` : '';
      const codigo = typeof objeto.code === 'string' && /^P\d{4}$/.test(objeto.code) ? objeto.code : '';
      const causa = normalizarMensaje(ultimaLineaUtil(mensaje));
      resumen = [nombre, operacion, codigo, causa].filter(Boolean).join(' ');
    } else {
      const base = cortar(normalizarMensaje(principio), MAX_RESUMEN_MENSAJE).trimEnd();
      const donde = primerMarcoPropio(objeto.stack);
      resumen = `${nombre}${base ? `: ${base}` : ''}${donde ? ` en ${donde}` : ''}`;
    }

    return cortar(resumen.replace(/[{}@]/g, ''), MAX_INTERNO).trimEnd();
  } catch {
    return 'Error';
  }
}
