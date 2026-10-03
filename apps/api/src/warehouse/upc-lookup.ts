/**
 * Consulta de un UPC/EAN en un catálogo internacional, para no teclear a mano el
 * nombre, la marca y el modelo de un producto que el mundo ya conoce.
 *
 * Reglas del dueño que este archivo sostiene:
 *  - La consulta sale del servidor, nunca del navegador.
 *  - Hacia afuera solo viaja el código. Ni empresa, ni usuario, ni almacén.
 *  - Si el servicio falla, tarda o se acaba la cuota, el alta sigue: el formulario se
 *    queda vacío con una nota, no con un error.
 *
 * El proveedor por defecto es el punto de prueba de UPCitemdb (gratis, sin llave,
 * ~100 consultas al día por IP). Otro proveedor entra implementando `ProveedorUpc`.
 */

import { clasificarCodigo, esConsultableInternacional } from './codigo-barras.js';

export const UPC_LOOKUP_URL_DEFECTO = 'https://api.upcitemdb.com/prod/trial/lookup';
export const UPC_LOOKUP_TIMEOUT_MS = 4000;

/** Lo que el alta de producto puede prellenar. */
export type ProductoInternacional = {
  codigo: string;
  nombre: string | null;
  marca: string | null;
  modelo: string | null;
  descripcion: string | null;
  imagenUrl: string | null;
  categoria: string | null;
};

export type MotivoSinResultado =
  | 'CODIGO_NO_CONSULTABLE'
  | 'NO_ENCONTRADO'
  | 'LIMITE'
  | 'SIN_SERVICIO'
  | 'DESACTIVADO';

export type ResultadoUpc =
  | { encontrado: true; codigo: string; fuente: string; producto: ProductoInternacional }
  | { encontrado: false; codigo: string; motivo: MotivoSinResultado; mensaje: string };

/** El proveedor avisó que se acabó la cuota (HTTP 429 o su equivalente). */
export class LimiteUpcError extends Error {
  constructor(mensaje = 'El catálogo internacional alcanzó su límite de consultas') {
    super(mensaje);
    this.name = 'LimiteUpcError';
  }
}

/** Un catálogo externo. Devuelve `null` si no conoce el código. */
export interface ProveedorUpc {
  nombre: string;
  buscar(codigo: string, signal: AbortSignal): Promise<ProductoInternacional | null>;
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const MENSAJES: Record<MotivoSinResultado, string> = {
  CODIGO_NO_CONSULTABLE: 'Este código no es un UPC/EAN: captura los datos a mano.',
  NO_ENCONTRADO: 'El catálogo internacional no conoce este código. Captura los datos a mano.',
  LIMITE: 'El catálogo internacional llegó a su límite por hoy. Captura los datos a mano.',
  SIN_SERVICIO: 'No se pudo consultar el catálogo internacional. Captura los datos a mano.',
  DESACTIVADO: 'La consulta internacional está apagada. Captura los datos a mano.',
};

export function sinResultado(codigo: string, motivo: MotivoSinResultado): ResultadoUpc {
  return { encontrado: false, codigo, motivo, mensaje: MENSAJES[motivo] };
}

function texto(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/\s+/g, ' ').trim();
  return limpio ? limpio.slice(0, max) : null;
}

/** Solo imágenes por https: el navegador bloquea las http dentro del panel. */
function primeraImagen(valor: unknown): string | null {
  if (!Array.isArray(valor)) return null;
  for (const candidata of valor) {
    if (typeof candidata === 'string' && /^https:\/\/\S+$/i.test(candidata.trim())) {
      return candidata.trim().slice(0, 500);
    }
  }
  return null;
}

/**
 * Respuesta de UPCitemdb → lo que entiende el alta. `category` llega como ruta
 * («Electronics > Cameras > Surveillance»): se toma la hoja, que es lo que se captura.
 */
export function mapearUpcItemDb(cuerpo: unknown, codigo: string): ProductoInternacional | null {
  const items = (cuerpo as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const item = items[0] as Record<string, unknown> | null;
  if (!item || typeof item !== 'object') return null;

  const nombre = texto(item.title, 200);
  const marca = texto(item.brand, 120);
  const modelo = texto(item.model, 120);
  // Sin nombre, marca ni modelo no hay nada que prellenar.
  if (!nombre && !marca && !modelo) return null;

  const rutaCategoria = texto(item.category, 300);
  const categoria = rutaCategoria
    ? (rutaCategoria.split('>').pop() ?? '').trim().slice(0, 120) || null
    : null;

  return {
    codigo,
    nombre,
    marca,
    modelo,
    descripcion: texto(item.description, 1000),
    imagenUrl: primeraImagen(item.images),
    categoria,
  };
}

/** Arma la URL: `{code}` se sustituye; si no viene, el código va como `?upc=`. */
export function urlDeConsulta(base: string, codigo: string): string {
  const seguro = encodeURIComponent(codigo);
  if (base.includes('{code}')) return base.replace('{code}', seguro);
  return `${base}${base.includes('?') ? '&' : '?'}upc=${seguro}`;
}

export function crearProveedorUpcItemDb(opciones: {
  url?: string | null;
  key?: string | null;
  fetch?: FetchLike;
}): ProveedorUpc {
  const base = (opciones.url || '').trim() || UPC_LOOKUP_URL_DEFECTO;
  const key = (opciones.key || '').trim();
  const pedir: FetchLike = opciones.fetch ?? ((url, init) => fetch(url, init));

  return {
    nombre: 'upcitemdb',
    async buscar(codigo, signal) {
      const headers: Record<string, string> = { Accept: 'application/json' };
      // Con plan de pago UPCitemdb pide la llave en estos dos encabezados.
      if (key) {
        headers.user_key = key;
        headers.key_type = '3scale';
      }
      const res = await pedir(urlDeConsulta(base, codigo), { headers, signal });
      if (res.status === 429) throw new LimiteUpcError();
      if (res.status === 404) return null;
      const cuerpo = await res.json().catch(() => null);
      const code = String((cuerpo as { code?: unknown } | null)?.code ?? '').toUpperCase();
      if (code === 'EXCEED_LIMIT' || code === 'TOO_FAST') throw new LimiteUpcError();
      // INVALID_UPC / NOT_FOUND: el catálogo contestó, solo que no lo tiene.
      if (code === 'INVALID_UPC' || code === 'NOT_FOUND' || code === 'INVALID_QUERY') return null;
      if (!res.ok) throw new Error(`Catálogo internacional respondió HTTP ${res.status}`);
      return mapearUpcItemDb(cuerpo, codigo);
    },
  };
}

type EntradaCache = { resultado: ResultadoUpc; expira: number };

export type OpcionesConsultaUpc = {
  proveedor: ProveedorUpc | null;
  timeoutMs?: number;
  /** Cuánto se recuerda un acierto. Un UPC no cambia de producto. */
  ttlAciertoMs?: number;
  /** Cuánto se recuerda un «no existe», para no gastar cuota preguntando lo mismo. */
  ttlVacioMs?: number;
  maxEntradas?: number;
  ahora?: () => number;
};

/**
 * Consulta con caché en memoria y fallo suave. Nunca lanza: lo peor que devuelve es
 * `encontrado: false` con el motivo.
 */
export class ConsultaUpc {
  private readonly cache = new Map<string, EntradaCache>();

  constructor(private readonly opciones: OpcionesConsultaUpc) {}

  private get ahora(): number {
    return (this.opciones.ahora ?? Date.now)();
  }

  private recordar(codigo: string, resultado: ResultadoUpc, ttl: number) {
    const max = this.opciones.maxEntradas ?? 500;
    if (this.cache.size >= max) {
      // Map conserva el orden de inserción: sale la más vieja.
      const primera = this.cache.keys().next().value;
      if (primera !== undefined) this.cache.delete(primera);
    }
    this.cache.set(codigo, { resultado, expira: this.ahora + ttl });
  }

  async buscar(valor: unknown): Promise<ResultadoUpc> {
    const { codigo } = clasificarCodigo(valor);
    // Lo que no es un GTIN no sale del servidor: ni gasta cuota ni viaja.
    if (!esConsultableInternacional(codigo)) return sinResultado(codigo, 'CODIGO_NO_CONSULTABLE');

    const proveedor = this.opciones.proveedor;
    if (!proveedor) return sinResultado(codigo, 'DESACTIVADO');

    const guardado = this.cache.get(codigo);
    if (guardado && guardado.expira > this.ahora) return guardado.resultado;
    if (guardado) this.cache.delete(codigo);

    const control = new AbortController();
    const timeout = setTimeout(
      () => control.abort(),
      this.opciones.timeoutMs ?? UPC_LOOKUP_TIMEOUT_MS,
    );
    try {
      // La carrera hace valer el tope aunque el proveedor ignore la señal de aborto.
      const producto = await Promise.race([
        proveedor.buscar(codigo, control.signal),
        new Promise<never>((_, reject) => {
          control.signal.addEventListener('abort', () => reject(new Error('timeout')), {
            once: true,
          });
        }),
      ]);
      if (!producto) {
        const vacio = sinResultado(codigo, 'NO_ENCONTRADO');
        this.recordar(codigo, vacio, this.opciones.ttlVacioMs ?? 10 * 60_000);
        return vacio;
      }
      const acierto: ResultadoUpc = {
        encontrado: true,
        codigo,
        fuente: proveedor.nombre,
        producto,
      };
      this.recordar(codigo, acierto, this.opciones.ttlAciertoMs ?? 24 * 3600_000);
      return acierto;
    } catch (err) {
      // Ni el límite ni la caída se guardan: al rato puede volver a funcionar.
      if (err instanceof LimiteUpcError) return sinResultado(codigo, 'LIMITE');
      return sinResultado(codigo, 'SIN_SERVICIO');
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Proveedor según el entorno. `UPC_LOOKUP_URL=off` apaga la consulta; vacío usa el
 * punto de prueba de UPCitemdb. `UPC_LOOKUP_KEY` es opcional (plan de pago).
 */
export function proveedorDesdeEntorno(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: FetchLike,
): ProveedorUpc | null {
  const url = (env.UPC_LOOKUP_URL || '').trim();
  if (/^(off|none|false|0)$/i.test(url)) return null;
  return crearProveedorUpcItemDb({ url, key: env.UPC_LOOKUP_KEY, fetch: fetchImpl });
}
