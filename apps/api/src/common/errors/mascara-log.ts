/**
 * Qué datos salen al log de errores y cómo se recortan.
 *
 * Piezas puras, sin Nest ni Prisma ni red: reciben datos de una petición y devuelven lo que es
 * seguro escribir en `docker logs` y en `logs/*.log`. La idea es que el log diga QUÉ llegó (qué
 * campos, de qué forma, a qué ruta) pero no los valores: una contraseña, una coordenada, una foto
 * en base64, un correo o el token de un enlace de firma no sirven para entender un error y sí
 * sirven para hacer daño si el log se filtra.
 *
 *  - `usuarioParaLog`: de la sesión (el JWT con correo, jti y permisos) solo `{ id, roleKey, isClient }`.
 *  - `formaDe`: el cuerpo o el query reducidos a su forma (`s:12`, `n`, `b`, `fecha`, `[3]`...).
 *  - `pathParaLog`: la URL con los tokens de ruta sustituidos y los valores del query tachados,
 *    salvo una lista blanca de filtros inocuos (`estado`, `semana`, `limit`...).
 *  - `paramsParaLog`: los parámetros de ruta: números y slugs cortos pasan, los tokens no.
 *  - `mensajeSeguroParaLog`: un mensaje sin data URLs, correos ni JWT y con tope de largo.
 *
 * Estas funciones corren en la ruta de errores del API: todo texto se acota antes de aplicarle
 * una expresión regular y nada aquí lanza (si algo raro llega, devuelve un marcador).
 */

const MAX_LLAVES = 30;
/** Cuántos niveles de objetos se expanden; de ahí para abajo solo se dice cuántas llaves hay. */
const MAX_PROF = 3;
const MAX_URL = 2000;
const MAX_PARES_QUERY = 20;
const MAX_LARGO_LLAVE = 60;
const MAX_LARGO_VALOR_QUERY = 40;
const MAX_LARGO_PARAM = 40;
const MAX_SALIDA_PATH = 400;
/** Lo máximo que se examina de un mensaje: lo que pase de aquí no podría salir de todos modos. */
const MAX_ENTRADA_MENSAJE = 5000;

/** Valores del query que sí se conservan: filtros y paginación, nunca texto libre. */
const QUERY_LISTA_BLANCA = new Set([
  'estado',
  'semana',
  'limit',
  'take',
  'skip',
  'page',
  'from',
  'to',
  'desde',
  'hasta',
  'date',
  'tipo',
  'status',
  'orden',
  'sort',
]);

/** Parámetros de ruta que por su nombre cargan un secreto (aunque sean cortos, como un código de recolección). */
const PARAM_SECRETO = /^(token|code|codigo|pickupcode|secret|clave|otp|pin|key|apikey|password)$/i;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_HEX_LARGO = /^[0-9a-f]{16,}$/i;
const RE_TOKEN_MIXTO = /^[A-Za-z0-9_-]{20,}$/;
const RE_JWT_COMPLETO = /^eyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){1,2}$/;
const RE_NUMERO_CORTO = /^\d{1,15}$/;
const RE_VALOR_QUERY_SEGURO = /^[A-Za-z0-9_.:,+%-]*$/;

const RE_DATA_URL = /data:[a-z]+\/[\w.+-]+[^,\s"'<>]{0,100},[A-Za-z0-9+/=%_-]{8,}/gi;
// El lookbehind hace que solo se pruebe el inicio de cada corrida de caracteres de usuario: sin él,
// una corrida larga sin «@» se reintentaba desde cada letra y el costo crecía con el cuadrado.
const RE_CORREO =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const RE_JWT = /\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){1,2}/g;

/** Corta a `max` sin dejar media pareja de sustitutos (un emoji partido no cabe en el JSON de la base). */
function cortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const ultimo = texto.charCodeAt(max - 1);
  return texto.slice(0, ultimo >= 0xd800 && ultimo <= 0xdbff ? max - 1 : max);
}

/**
 * ¿Este texto parece un token (de enlace, de sesión, de integración)? Un UUID, 16 o más caracteres
 * hexadecimales, un JWT, o 20 o más caracteres de token con al menos un dígito (así una palabra
 * larga o un slug sin números no se confunde con un token).
 */
export function pareceToken(texto: string): boolean {
  if (typeof texto !== 'string' || texto.length < 16 || texto.length > MAX_URL) return false;
  if (RE_UUID.test(texto) || RE_HEX_LARGO.test(texto) || RE_JWT_COMPLETO.test(texto)) return true;
  return RE_TOKEN_MIXTO.test(texto) && /\d/.test(texto);
}

/** Pedazos que, en cualquier parte del nombre de una llave, delatan una contraseña, una clave o un dato de pago. */
const FRAGMENTOS_SECRETOS = [
  'password',
  'passwd',
  'contrase', // contrasena y contraseña
  'token',
  'apikey',
  'cardnumber',
  'accountnumber',
];

/** Datos personales y bancarios: se reconocen al inicio o al final del nombre (`rfc`, `rfcEmisor`, `receptorRfc`). */
const EXTREMOS_PERSONALES = ['rfc', 'curp', 'nss', 'clabe', 'taxid'];

/**
 * ¿El nombre de esta llave dice que su valor es un secreto o un dato personal o bancario? Se mira el
 * nombre, no la lista exacta: así `portalPassword`, `counterpartyClabe` o `receptorRfc` también se
 * tachan, y no solo los nombres que alguien pensó de antemano. Se compara en minúsculas y sin `_` ni `-`
 * (`api_key` = `apikey`).
 *
 *  - contiene `password`, `passwd`, `contrase…`, `token`, `apikey`, `cardnumber` o `accountnumber`
 *  - contiene `secret` (salvo `secretar…`: una secretaria no es un secreto)
 *  - empieza o termina en `rfc`, `curp`, `nss`, `clabe` o `taxid`
 *
 * No incluye nombres cortos que pueden ser otra cosa según el lugar (`code`, `pin`, `otp`, `confirm`):
 * cada lista los decide por su cuenta. Nunca lanza.
 */
export function esLlaveSecreta(llave: string): boolean {
  if (typeof llave !== 'string' || llave.length === 0) return false;
  const nombre = llave.toLowerCase().replace(/[_-]/g, '');
  if (FRAGMENTOS_SECRETOS.some((f) => nombre.includes(f))) return true;
  if (/secret(?!ar)/.test(nombre)) return true;
  return EXTREMOS_PERSONALES.some((p) => nombre.startsWith(p) || nombre.endsWith(p));
}

/** Una llave de objeto o de query que puede quedar en el log: las que cargan datos (un correo, un token) no. */
function claveParaLog(llave: string): string {
  if (llave === '__proto__') return '_proto_';
  if (llave.length > MAX_LARGO_LLAVE || /[@\s]/.test(llave) || pareceToken(llave)) return `k:${llave.length}`;
  return llave;
}

/**
 * De la sesión, lo mínimo para saber quién fue: `{ id, roleKey, isClient }`. Nada de correo, jti,
 * permisos, accesos ni departamento (el JWT completo ocupaba ~1 KB por línea y traía el correo).
 * Sin sesión (una petición pública) da `null`.
 */
export function usuarioParaLog(
  user: unknown,
): { id: number | string | null; roleKey: string | null; isClient: boolean } | null {
  if (!user || typeof user !== 'object') return null;
  try {
    const u = user as Record<string, unknown>;
    const id =
      typeof u['id'] === 'number' && Number.isFinite(u['id'])
        ? u['id']
        : typeof u['id'] === 'string' && u['id'].length <= 40 && !u['id'].includes('@')
          ? u['id']
          : null;
    const roleKey =
      typeof u['roleKey'] === 'string' && u['roleKey'].length <= 60 && !u['roleKey'].includes('@')
        ? u['roleKey']
        : null;
    return { id, roleKey, isClient: u['isClient'] === true };
  } catch {
    return null;
  }
}

function forma(valor: unknown, prof: number, ancestros: Set<object>): unknown {
  try {
    if (valor === null || valor === undefined) return null;
    switch (typeof valor) {
      case 'string':
        return `s:${valor.length}`;
      case 'number':
      case 'bigint':
        return 'n';
      case 'boolean':
        return 'b';
      case 'object':
        break;
      default:
        // Una función o un símbolo no viajan por HTTP: se marcan y ya.
        return 'x';
    }

    const objeto = valor as object;
    if (objeto instanceof Date) return 'fecha';
    // Un archivo en memoria: Object.keys de un Buffer recorrería byte por byte.
    if (ArrayBuffer.isView(objeto) || objeto instanceof ArrayBuffer) {
      return `bin:${(objeto as { byteLength: number }).byteLength}`;
    }
    if (ancestros.has(objeto)) return '[ciclo]';

    ancestros.add(objeto);
    try {
      if (Array.isArray(objeto)) {
        const cabeza = `[${objeto.length}]`;
        if (objeto.length === 0 || prof >= 2) return cabeza;
        return [cabeza, forma(objeto[0], prof + 1, ancestros)];
      }

      const llaves = Object.keys(objeto);
      if (prof >= MAX_PROF) return `{${llaves.length}}`;

      const salida: Record<string, unknown> = {};
      const sobran = llaves.length > MAX_LLAVES;
      const tope = sobran ? MAX_LLAVES - 1 : llaves.length;
      for (let i = 0; i < tope; i++) {
        const llave = llaves[i]!;
        let hijo: unknown;
        try {
          hijo = (objeto as Record<string, unknown>)[llave];
        } catch {
          hijo = undefined;
        }
        salida[claveParaLog(llave)] = forma(hijo, prof + 1, ancestros);
      }
      if (sobran) salida['…'] = `+${llaves.length - tope}`;
      return salida;
    } finally {
      ancestros.delete(objeto);
    }
  } catch {
    return '?';
  }
}

/**
 * El valor reducido a su forma, sin ninguno de sus datos: dice QUÉ campos llegaron y de qué tipo,
 * no qué contenían (contraseñas, GPS, fotos, nombres).
 *
 *  - texto → `s:<largo>`; número → `n`; booleano → `b`; vacío → `null`; fecha → `fecha`
 *  - arreglo → `[<n>]`; si cabe (nivel 0 o 1) y no está vacío, `['[<n>]', <forma del primero>]`
 *  - objeto → el mismo objeto con la forma de cada valor: hasta 30 llaves (si hay más, la última es
 *    `'…': '+<n>'`) y hasta 3 niveles (más abajo queda `'{<n>}'` con el número de llaves)
 *  - un archivo en memoria → `bin:<bytes>`; una referencia circular → `[ciclo]`
 * Las llaves que cargan datos (un correo, un token) se sustituyen por `k:<largo>`.
 */
export function formaDe(valor: unknown, prof = 0): unknown {
  return forma(valor, prof, new Set<object>());
}

/** Un segmento de la ruta: tokens y códigos secretos se sustituyen; números, palabras y slugs pasan. */
function segmentoParaLog(segmento: string, anterior: string): string {
  if (!segmento) return segmento;
  // `/tool-requests/pickup/:code`: el código de recolección es corto (6 caracteres), no se reconoce por forma.
  if (anterior === 'pickup' && segmento.toLowerCase() !== 'pendientes') return '<codigo>';
  if (pareceToken(segmento)) return '<token>';
  if (segmento.includes('@') || /%40/i.test(segmento)) return '<correo>';
  return segmento;
}

function valorQueryParaLog(llave: string, valor: string): string {
  if (!QUERY_LISTA_BLANCA.has(llave.toLowerCase())) return '*';
  if (valor.length > MAX_LARGO_VALOR_QUERY || !RE_VALOR_QUERY_SEGURO.test(valor) || pareceToken(valor)) return '*';
  // Un correo o un token escrito con `%` (`maria%40x.com`) pasa el filtro de caracteres: se mira ya decodificado.
  let llano: string;
  try {
    llano = decodeURIComponent(valor);
  } catch {
    return '*';
  }
  if (llano.includes('@') || pareceToken(llano)) return '*';
  return valor;
}

/**
 * La URL de la petición apta para el log. Los segmentos que son un token (UUID, 16 o más
 * hexadecimales, 20 o más caracteres con un dígito) o el código tras `/pickup/` se vuelven
 * `<token>` y `<codigo>`; en el query solo se conservan los valores de una lista blanca de filtros
 * (`estado`, `semana`, `limit`, `take`, `skip`, `page`, `from`, `to`, `desde`, `hasta`, `date`,
 * `tipo`, `status`, `orden`, `sort`) y el resto queda como `*`.
 */
export function pathParaLog(url: unknown): string {
  if (typeof url !== 'string') return '';
  try {
    const sinHash = (cortar(url, MAX_URL).split('#')[0] ?? '');
    const corte = sinHash.indexOf('?');
    const ruta = corte >= 0 ? sinHash.slice(0, corte) : sinHash;
    const query = corte >= 0 ? sinHash.slice(corte + 1) : '';

    let anterior = '';
    const segmentos = ruta.split('/').map((segmento) => {
      const salida = segmentoParaLog(segmento, anterior);
      anterior = segmento.toLowerCase();
      return salida;
    });

    const pares = query
      .split('&')
      .filter(Boolean)
      .slice(0, MAX_PARES_QUERY)
      .map((par) => {
        const igual = par.indexOf('=');
        const llave = igual >= 0 ? par.slice(0, igual) : par;
        const clave = claveParaLog(llave);
        return igual >= 0 ? `${clave}=${valorQueryParaLog(llave, par.slice(igual + 1))}` : clave;
      });

    const completo = segmentos.join('/') + (pares.length ? `?${pares.join('&')}` : '');
    return cortar(completo, MAX_SALIDA_PATH);
  } catch {
    return '';
  }
}

function paramParaLog(llave: string, valor: unknown): unknown {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 'n';
  if (typeof valor === 'string') {
    if (PARAM_SECRETO.test(llave)) return '<token>';
    if (RE_NUMERO_CORTO.test(valor)) return valor;
    if (pareceToken(valor)) return '<token>';
    if (valor.includes('@')) return '<correo>';
    return valor.length <= MAX_LARGO_PARAM ? valor : `s:${valor.length}`;
  }
  return forma(valor, 2, new Set<object>());
}

/**
 * Los parámetros de ruta (`request.params`) para el log: el número y un slug corto (hasta 40
 * caracteres) pasan tal cual; un token, un parámetro que por su nombre es un secreto (`token`,
 * `code`...) y un correo se sustituyen; un texto más largo queda como `s:<largo>`.
 */
export function paramsParaLog(params: unknown): Record<string, unknown> | unknown {
  if (params === null || params === undefined) return {};
  if (typeof params !== 'object' || Array.isArray(params)) return forma(params, 0, new Set<object>());
  try {
    const origen = params as Record<string, unknown>;
    const llaves = Object.keys(origen);
    const salida: Record<string, unknown> = {};
    const sobran = llaves.length > MAX_LLAVES;
    const tope = sobran ? MAX_LLAVES - 1 : llaves.length;
    for (let i = 0; i < tope; i++) {
      const llave = llaves[i]!;
      salida[claveParaLog(llave)] = paramParaLog(llave, origen[llave]);
    }
    if (sobran) salida['…'] = `+${llaves.length - tope}`;
    return salida;
  } catch {
    return '?';
  }
}

/**
 * Un mensaje de error apto para el log: una sola línea, sin data URLs (una foto en base64 pegada
 * en un mensaje), sin correos ni JWT, y de hasta `max` caracteres (300 por omisión).
 */
export function mensajeSeguroParaLog(texto: unknown, max = 300): string {
  let base: string;
  if (typeof texto === 'string') {
    base = texto;
  } else if (texto === null || texto === undefined) {
    base = '';
  } else if (Array.isArray(texto)) {
    base = texto.map((t) => (typeof t === 'string' ? t : '')).join(' | ');
  } else {
    base = '';
  }
  const limpio = cortar(base, MAX_ENTRADA_MENSAJE)
    .replace(RE_DATA_URL, '[archivo]')
    .replace(RE_CORREO, '<correo>')
    .replace(RE_JWT, '<token>')
    .replace(/\s+/g, ' ')
    .trim();
  return cortar(limpio, Math.max(0, max));
}
