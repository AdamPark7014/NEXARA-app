import { BadRequestException } from '@nestjs/common';
import type { FichaLeida } from './ficha-ia.js';
import { familiaDeTipo, sinRazonSocial } from './ficha-ia.js';

/**
 * Stock del Diseñador: reglas puras. El inventario sigue siendo uno: lo de Almacén sale de `products`
 * y `stock_levels`, y lo del mayorista de `productos_ct`. Aquí no se guarda ninguna existencia.
 */

/** «DS-2CD1143G2-LIUF», «ds 2cd1143g2 liuf» y «DS2CD1143G2LIUF» son el mismo modelo. */
export const normalizarModelo = (s: unknown) =>
  String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Con menos de 4 letras cualquier cosa coincide con cualquier cosa. */
const LARGO_MINIMO = 4;

/**
 * Cómo puede estar escrito el modelo en otro catálogo: tal cual, sin versión de hardware
 * («TL-SL1218MP V6.0») y sin lo que sigue a la diagonal («…-LIUF/LSRB»). Coincide exacto o no coincide:
 * un parecido equivocado pondría el precio de otro equipo en una cotización.
 */
export function variantesDeModelo(modelo: string): string[] {
  const base = String(modelo ?? '').trim();
  const sinDiagonal = base.split('/')[0];
  const sinVersion = base.replace(/\s*\(?\s*(?:hw\s*)?v(?:er)?\.?\s*\d+(?:\.\d+)*\s*\)?\s*$/i, '');
  return [...new Set([base, sinDiagonal, sinVersion].map(normalizarModelo))].filter((v) => v.length >= LARGO_MINIMO);
}

export type ModeloPedido = {
  /** Con qué lo reconoce la pantalla: el id del catálogo (`hik-…`, `db-7`). */
  clave: string;
  marca: string;
  modelo: string;
  productId: number | null;
  /** La clave de CT que alguien eligió a mano. Gana sobre lo que coincida por modelo. */
  ct: string | null;
};

export const MAX_MODELOS = 200;

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function textoCorto(v: unknown, max: number): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (t.length > max) throw new BadRequestException(`Texto demasiado largo (hasta ${max} caracteres)`);
  return t;
}

function idOpcional(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestException('Producto no válido');
  return n;
}

export function validarModelos(cuerpo: unknown): ModeloPedido[] {
  if (!Array.isArray(cuerpo)) throw new BadRequestException('Falta la lista de modelos');
  if (cuerpo.length > MAX_MODELOS) throw new BadRequestException(`Hasta ${MAX_MODELOS} modelos por consulta`);
  return cuerpo.map((x) => {
    if (!esObjeto(x)) throw new BadRequestException('Modelo no válido');
    const clave = textoCorto(x.clave, 60);
    if (!clave) throw new BadRequestException('Falta la clave del modelo');
    return {
      clave,
      marca: textoCorto(x.marca, 80),
      modelo: textoCorto(x.modelo, 120),
      productId: idOpcional(x.productId),
      ct: textoCorto(x.ct, 40).toUpperCase() || null,
    };
  });
}

export type LineaPedida = ModeloPedido & {
  grupo: 'EQUIPOS' | 'MATERIALES';
  nombre: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
};

export const MAX_LINEAS = 120;

/** La pantalla manda qué y cuánto; el precio nunca: lo pone el servidor. */
export function validarLineas(cuerpo: unknown): LineaPedida[] {
  if (!Array.isArray(cuerpo) || !cuerpo.length) throw new BadRequestException('El diseño no tiene equipos que cotizar');
  if (cuerpo.length > MAX_LINEAS) throw new BadRequestException(`Hasta ${MAX_LINEAS} partidas por cotización`);
  const modelos = validarModelos(cuerpo);
  return cuerpo.map((x, i) => {
    const l = x as Record<string, unknown>;
    const nombre = textoCorto(l.nombre, 200);
    if (!nombre) throw new BadRequestException('A una partida le falta el nombre');
    const cantidad = Number(l.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100_000) throw new BadRequestException(`Cantidad no válida en «${nombre}»`);
    return {
      ...modelos[i],
      grupo: l.grupo === 'MATERIALES' ? 'MATERIALES' : 'EQUIPOS',
      nombre,
      descripcion: textoCorto(l.descripcion, 300),
      cantidad,
      unidad: textoCorto(l.unidad, 20) || 'pieza',
    };
  });
}

/** Lo que CT tiene para un modelo, y lo que necesita elegir entre varias filas. */
export type CandidatoCt = { clave: string; marca: string | null; hay: boolean };

/** Si varias filas coinciden: primero la misma marca y, entre esas, la que tenga piezas. */
export function elegirCandidato<T extends CandidatoCt>(candidatos: readonly T[], marca: string): T | null {
  if (!candidatos.length) return null;
  const m = normalizarModelo(marca);
  const mismaMarca = m ? candidatos.filter((c) => {
    const otra = normalizarModelo(c.marca);
    return otra && (otra.includes(m) || m.includes(otra));
  }) : [];
  // Otra marca con el mismo modelo escrito es casualidad, no el mismo equipo.
  if (m && !mismaMarca.length) return null;
  const lista = mismaMarca.length ? mismaMarca : candidatos;
  return lista.find((c) => c.hay) ?? lista[0];
}

const sinAcento = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * La subcategoría de CT ya dice qué es. Lo que no diga (una «Cámara WiFi» puede ser domo o bala) devuelve
 * null y lo decide la lectura de su descripción.
 */
export function tipoDesdeCt(o: { categoria?: string | null; subcategoria?: string | null }): { familia: string; tipo: string } | null {
  const sub = sinAcento(o.subcategoria);
  const cat = sinAcento(o.categoria);
  const tipo = (t: string) => ({ familia: familiaDeTipo(t), tipo: t });
  if (cat.includes('vigilancia')) {
    if (/\bbala\b/.test(sub)) return tipo('bala');
    if (/\bturret\b/.test(sub)) return tipo('turret');
    if (/\bptz\b/.test(sub)) return tipo('ptz');
    if (/\bdomo\b/.test(sub)) return tipo('domo');
    if (/grabador/.test(sub)) return tipo('nvr');
    if (/videoportero/.test(sub)) return tipo('terminal');
    return null;
  }
  if (cat === 'red activa' && /switch/.test(sub)) return tipo('switch');
  if (/no break|\bups\b/.test(sub)) return tipo('ups');
  if (cat === 'red pasiva' && /gabinete|rack/.test(sub)) return tipo('gabinete');
  if (cat.includes('servidores') && sub === 'servidores') return tipo('servidor');
  if (cat.includes('seguridad inteligente')) {
    if (/control de acceso/.test(sub)) return tipo('terminal');
    if (/sirena/.test(sub)) return tipo('sirena');
    if (/alarma/.test(sub)) return tipo('panel');
  }
  return null;
}

/** Lo que trae CT de un producto. */
export type ProductoCt = {
  clave: string | null;
  numParte: string | null;
  modelo: string | null;
  nombre: string | null;
  marca: string | null;
  categoria: string | null;
  subcategoria: string | null;
  descripcion: string | null;
  especificaciones?: ReadonlyArray<{ tipo?: unknown; valor?: unknown }> | null;
};

const especificacionesDe = (o: ProductoCt) =>
  (Array.isArray(o.especificaciones) ? o.especificaciones : [])
    .map((e) => ({ tipo: String(e?.tipo ?? '').trim(), valor: String(e?.valor ?? '').trim() }))
    .filter((e) => e.tipo && e.valor);

/** Lo que se le da a leer a la IA: lo que dice CT, nada más. */
export function textoDeProducto(o: ProductoCt, max: number): string {
  const specs = especificacionesDe(o)
    .map((e) => `${e.tipo}: ${e.valor}`)
    .join('; ');
  return [`Marca ${o.marca ?? ''}, modelo ${o.modelo || o.numParte || ''}.`, o.nombre, o.descripcion, specs].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * La ficha para el catálogo a partir del producto de CT. Marca y modelo son los de CT; el tipo, el de su
 * subcategoría si la dice. Sin lectura de IA (`leida` null) va con lo que hay, para capturar el resto.
 */
export function fichaDeProducto(o: ProductoCt, leida: FichaLeida | null): FichaLeida & { ct: string } {
  const decidido = tipoDesdeCt(o);
  const tipo = decidido?.tipo ?? leida?.tipo ?? 'generico';
  const caracteristicas = leida?.caracteristicas?.length
    ? leida.caracteristicas
    : especificacionesDe(o)
        .slice(0, 5)
        .map((e) => `${e.tipo}: ${e.valor}`.slice(0, 160));
  return {
    familia: familiaDeTipo(tipo),
    tipo,
    marca: sinRazonSocial(o.marca ?? '').slice(0, 80),
    modelo: String(o.modelo || o.numParte || o.clave || '').slice(0, 120),
    descripcion: String(leida?.descripcion || o.descripcion || o.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    color: leida?.color ?? 'blanco',
    cajaTrasera: leida?.cajaTrasera ?? false,
    lucesVisibles: leida?.lucesVisibles ?? 0,
    datos: leida?.datos ?? [],
    caracteristicas,
    ct: String(o.clave ?? ''),
  };
}

/** Lo de Almacén que importa para cotizar una partida. */
export type EnAlmacen = { productId: number; sku: string; piezas: number; precio: number | null; costo: number | null };

/** La línea que propone el mayorista: la misma que usa el buscador de cotizaciones. */
export type LineaDeMayorista = Record<string, unknown> & { unitPrice?: number };

export const SIN_PRECIO = 'Sin precio: capturarlo antes de enviar.';

/**
 * Una partida de cotización. Si el equipo está en Almacén con precio, manda ese; si no, el de CT; si no hay
 * ninguno queda en cero y avisado: un precio inventado se enviaría sin que nadie lo notara.
 */
export function partidaDeLinea(l: LineaPedida, opciones: { paqueteClave: string; almacen: EnAlmacen | null; mayorista: LineaDeMayorista | null }): Record<string, unknown> {
  const { almacen, mayorista, paqueteClave } = opciones;
  const base: Record<string, unknown> = {
    ...(mayorista ?? {}),
    grupo: l.grupo,
    paqueteClave,
    paqueteCantidad: l.cantidad,
    category: l.grupo === 'MATERIALES' ? 'Materiales' : 'Videovigilancia',
    name: l.nombre,
    description: l.descripcion || (mayorista?.description as string | undefined) || undefined,
    brand: l.marca || (mayorista?.brand as string | undefined) || undefined,
    model: l.modelo || (mayorista?.model as string | undefined) || undefined,
    unit: l.unidad,
    qty: l.cantidad,
    discount: 0,
    tax: 16,
  };
  if (almacen) {
    base.productId = almacen.productId;
    base.sku = almacen.sku;
    if (almacen.precio && almacen.precio > 0) {
      base.unitPrice = almacen.precio;
      if (almacen.costo && almacen.costo > 0) base.unitCost = almacen.costo;
      return base;
    }
    if (!mayorista && almacen.costo && almacen.costo > 0) base.unitCost = almacen.costo;
  }
  if (!mayorista && !(base.unitPrice as number)) {
    base.unitPrice = 0;
    base.notes = SIN_PRECIO;
  }
  return base;
}

/** Tras la primera, las partidas se reemplazan: dos pasadas del mismo diseño no son el doble. */
export const paqueteDelDiseno = (id: number) => `cctv:${id}`;
