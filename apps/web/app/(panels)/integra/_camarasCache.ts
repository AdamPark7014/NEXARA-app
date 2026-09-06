/**
 * ⚠️ SIEMBRA OPTIMISTA DEL INVENTARIO DE CÁMARAS ⚠️
 *
 * Lo que hay aquí guardado es **la última lista de cámaras conocida**, y sirve
 * para UNA sola cosa: pintar la rejilla antes de que llegue la respuesta del
 * servidor. El inventario de un sitio cambia unas pocas veces al año, así que
 * arrancar con la lista de la visita anterior acierta casi siempre y ahorra un
 * viaje completo antes del primer píxel útil.
 *
 * ## Lo que NO se puede hacer con esto
 *
 * Nada que decida una acción. Ni abrir una puerta, ni borrar, ni dar por buena
 * una capacidad, ni contar cámaras en un informe. Una cámara puede haber sido
 * dada de baja, cambiada de sitio o de empresa desde la última vez, y esta lista
 * no se ha enterado. Es tinta en la pantalla mientras llega la verdad, y en
 * cuanto llega la verdad **se sustituye entera**.
 *
 * ## Cómo se protege
 *
 * - La clave incluye empresa y sitio: la lista de un sitio no puede pintarse en
 *   otro.
 * - Caduca. Pasada la vigencia se ignora y se espera al servidor como antes.
 * - Se saneia campo a campo al leer: lo que haya en `localStorage` es entrada
 *   no confiable, no un objeto de nuestro dominio.
 */

/** Los campos que hacen falta para PINTAR una celda y una fila del rail. */
export type CamaraSembrada = {
  id: string;
  name: string;
  region?: string;
  status?: string | number;
  encodeDevIndexCode?: string | null;
  sourceIp?: string | null;
  model?: string | null;
  hasAudio?: boolean;
  isDoorCamera?: boolean;
  isPtz?: boolean;
  anprCapable?: boolean;
};

type SobreSemilla = {
  v: number;
  guardadoEn: number;
  camaras: CamaraSembrada[];
};

/** Sube cuando cambie la forma de `CamaraSembrada`: invalida lo viejo. */
export const SEMILLA_VERSION = 1;

/** Más allá de una semana la lista deja de ser una apuesta razonable. */
export const SEMILLA_VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;

/** Tope defensivo: nadie tiene un muro con más de esto, y limita el tamaño. */
export const SEMILLA_MAX = 512;

const PREFIJO = "nexara_integra_camaras_v";

export function claveSemillaCamaras(clave: string): string {
  return `${PREFIJO}${SEMILLA_VERSION}:${clave}`;
}

/** Interfaz mínima de `localStorage`, para poder probar sin navegador. */
export type AlmacenSemilla = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function almacenPorDefecto(): AlmacenSemilla | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function textoOpcional(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}

function textoONulo(valor: unknown): string | null | undefined {
  if (valor === null) return null;
  return typeof valor === "string" ? valor : undefined;
}

function boolOpcional(valor: unknown): boolean | undefined {
  return typeof valor === "boolean" ? valor : undefined;
}

/**
 * Convierte una entrada cualquiera en una cámara pintable, o `null`. Sin `id` y
 * sin `name` no hay nada que dibujar, así que esa fila se descarta entera.
 */
export function sanearCamaraSembrada(entrada: unknown): CamaraSembrada | null {
  if (!entrada || typeof entrada !== "object") return null;
  const c = entrada as Record<string, unknown>;
  const id = typeof c.id === "string" ? c.id : null;
  if (!id) return null;
  const name = typeof c.name === "string" ? c.name : "";
  const salida: CamaraSembrada = { id, name: name || id };
  const region = textoOpcional(c.region);
  if (region !== undefined) salida.region = region;
  if (typeof c.status === "string" || typeof c.status === "number") salida.status = c.status;
  const encode = textoONulo(c.encodeDevIndexCode);
  if (encode !== undefined) salida.encodeDevIndexCode = encode;
  const ip = textoONulo(c.sourceIp);
  if (ip !== undefined) salida.sourceIp = ip;
  const model = textoONulo(c.model);
  if (model !== undefined) salida.model = model;
  const audio = boolOpcional(c.hasAudio);
  if (audio !== undefined) salida.hasAudio = audio;
  const puerta = boolOpcional(c.isDoorCamera);
  if (puerta !== undefined) salida.isDoorCamera = puerta;
  const ptz = boolOpcional(c.isPtz);
  if (ptz !== undefined) salida.isPtz = ptz;
  const anpr = boolOpcional(c.anprCapable);
  if (anpr !== undefined) salida.anprCapable = anpr;
  return salida;
}

/**
 * Lee la siembra. Devuelve `null` —y no pinta nada— si no hay, si caducó, si la
 * versión no coincide o si lo guardado no tiene la forma esperada.
 */
export function leerSemillaCamaras(
  clave: string,
  opciones?: { ahora?: number; almacen?: AlmacenSemilla | null },
): CamaraSembrada[] | null {
  const almacen = opciones?.almacen === undefined ? almacenPorDefecto() : opciones.almacen;
  if (!almacen) return null;
  let crudo: string | null = null;
  try {
    crudo = almacen.getItem(claveSemillaCamaras(clave));
  } catch {
    return null;
  }
  if (!crudo) return null;
  let sobre: unknown;
  try {
    sobre = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (!sobre || typeof sobre !== "object") return null;
  const s = sobre as Partial<SobreSemilla>;
  if (s.v !== SEMILLA_VERSION) return null;
  if (typeof s.guardadoEn !== "number" || !Number.isFinite(s.guardadoEn)) return null;
  const ahora = opciones?.ahora ?? Date.now();
  // Un reloj que se fue al pasado no puede dar por buena una siembra futura.
  if (ahora - s.guardadoEn > SEMILLA_VIGENCIA_MS || s.guardadoEn > ahora + 60_000) return null;
  if (!Array.isArray(s.camaras)) return null;
  const camaras: CamaraSembrada[] = [];
  for (const entrada of s.camaras.slice(0, SEMILLA_MAX)) {
    const sana = sanearCamaraSembrada(entrada);
    if (sana) camaras.push(sana);
  }
  return camaras.length > 0 ? camaras : null;
}

/**
 * Guarda la lista recién traída del servidor. Una lista vacía borra la siembra:
 * un sitio que se quedó sin cámaras no debe seguir pintando las de ayer.
 */
export function guardarSemillaCamaras(
  clave: string,
  camaras: readonly unknown[],
  opciones?: { ahora?: number; almacen?: AlmacenSemilla | null },
): void {
  const almacen = opciones?.almacen === undefined ? almacenPorDefecto() : opciones.almacen;
  if (!almacen) return;
  const nombre = claveSemillaCamaras(clave);
  const sanas: CamaraSembrada[] = [];
  for (const entrada of camaras.slice(0, SEMILLA_MAX)) {
    const sana = sanearCamaraSembrada(entrada);
    if (sana) sanas.push(sana);
  }
  try {
    if (sanas.length === 0) {
      almacen.removeItem(nombre);
      return;
    }
    const sobre: SobreSemilla = {
      v: SEMILLA_VERSION,
      guardadoEn: opciones?.ahora ?? Date.now(),
      camaras: sanas,
    };
    almacen.setItem(nombre, JSON.stringify(sobre));
  } catch {
    /* cuota llena o modo privado: la siembra es un lujo, no un requisito */
  }
}

/**
 * ¿La siembra acertó? Compara solo identidades y en orden: es lo que decide si
 * hubo que corregir la pantalla o no. Sirve para la marca de rendimiento y para
 * saber si merece la pena repintar el muro tras revalidar.
 */
export function semillaAcerto(
  sembradas: readonly { id: string }[],
  reales: readonly { id: string }[],
): boolean {
  if (sembradas.length !== reales.length) return false;
  for (let i = 0; i < sembradas.length; i += 1) {
    if (sembradas[i].id !== reales[i].id) return false;
  }
  return true;
}

/**
 * Cámaras que la siembra pintó y ya no existen. El muro tiene que soltarlas en
 * cuanto llega la lista buena: dejar en pantalla un cuadro de una cámara dada de
 * baja es precisamente el fallo que hace peligrosa una caché optimista.
 */
export function idsFantasma(
  sembradas: readonly { id: string }[],
  reales: readonly { id: string }[],
): string[] {
  const vivas = new Set(reales.map((c) => c.id));
  return sembradas.filter((c) => !vivas.has(c.id)).map((c) => c.id);
}
