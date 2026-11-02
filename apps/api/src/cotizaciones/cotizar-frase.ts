/**
 * Cotizar con una frase o una lista pegada: lo que el código lee solo, sin gastar un token.
 *
 * Medido el 01-11 con las 56 cotizaciones reales: las partidas se capturan pegando de la hoja del
 * mayorista o de Excel (hay modelos guardados como «4\tPza\tNVR 32 Canales IP»), y una frase corta
 * se parte igual de fácil cuando todo lo que dice ya se cotizó antes. Solo si algo queda en duda se
 * le pregunta a la IA (`ai/cotizar/cotizar-ia.ts`).
 *
 * Nada de esto guarda: arma una propuesta que la persona revisa y corrige antes de usarla.
 * Módulo puro (sin Nest ni Prisma) para probarlo con jest y para que el eval corra lo mismo.
 */
import { clientesParecidos, type FichaComparable } from '../ventas/clientes-parecidos.js';
import { soloGiro } from '../ai/asistente/nombres.js';
import {
  candidatoLibre,
  complementosDe,
  emparejar,
  ordenDeOpciones,
  palabrasDePartida,
  type CandidatoPartida,
  type Complemento,
  type Seguridad,
} from './emparejar-partidas.js';
import { normalizarTexto } from './partidas-frecuentes.js';

export type LineaPedida = {
  cantidad: number | null;
  unidad: string | null;
  concepto: string;
  /** Datos que ya venían en la lista pegada: mandan sobre los del catálogo. */
  modelo?: string | null;
  marca?: string | null;
  precio?: number | null;
};

export type Lectura = {
  via: 'lista' | 'frase';
  lineas: LineaPedida[];
  /** Quién o dónde, tal como lo dijeron («la bodega de Materiales Pronto»). */
  destino: string | null;
  /** Primera línea de una lista cuando no es un renglón («Propuesta para Hotel Aurora»). */
  encabezado: string | null;
};

const UNIDAD_DE: Record<string, string> = {
  pza: 'Pieza', pz: 'Pieza', pzas: 'Pieza', pzs: 'Pieza', pieza: 'Pieza', piezas: 'Pieza', unidad: 'Pieza', unidades: 'Pieza',
  serv: 'Servicio', servicio: 'Servicio', servicios: 'Servicio',
  lote: 'Lote', lotes: 'Lote',
  m: 'Metro', mt: 'Metro', mts: 'Metro', metro: 'Metro', metros: 'Metro', ml: 'Metro',
  rollo: 'Rollo', rollos: 'Rollo', caja: 'Caja', cajas: 'Caja', kit: 'Kit', kits: 'Kit',
  juego: 'Juego', juegos: 'Juego', hora: 'Hora', horas: 'Hora', hr: 'Hora', hrs: 'Hora',
  licencia: 'Licencia', licencias: 'Licencia', lic: 'Licencia',
};

const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30,
  cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, doscientos: 200, trescientos: 300, quinientos: 500, mil: 1000,
};

const CABECERA = /^(?:cant(?:idad)?\.?|partida|no\.?|#|concepto|descripci[oó]n|unidad|u\.?m\.?|precio|importe|modelo|marca)$/i;
const TOTAL = /^(?:sub ?total|i\.?v\.?a\.?|total|importe total|gran total)\b/i;

/** «1,113.52», «$ 1113.5». `null` si no es una cifra. */
function cifra(texto: string): number | null {
  const t = texto.replace(/[$\s]/g, '').replace(/mxn|usd/gi, '');
  if (!/^\d[\d,]*(?:\.\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const esCantidad = (n: number | null): n is number => n != null && Number.isInteger(n) && n > 0 && n <= 1_000_000;

/** Renglón con columnas (de Excel o de una tabla): cantidad, unidad, concepto, modelo y precio. */
function leerColumnas(celdas: string[]): LineaPedida | null {
  const columnas = celdas.map((c) => c.trim()).filter(Boolean);
  if (!columnas.length || columnas.every((c) => CABECERA.test(c))) return null;
  if (TOTAL.test(columnas[0]!) || (columnas.length > 1 && TOTAL.test(columnas[columnas.length - 2]!))) return null;
  let cantidad: number | null = null;
  let unidad: string | null = null;
  const textos: string[] = [];
  const cifras: number[] = [];
  for (const col of columnas) {
    const n = cifra(col);
    if (n != null) {
      if (!textos.length && cantidad == null && esCantidad(n)) cantidad = n;
      else if (textos.length) cifras.push(n);
      continue;
    }
    const u = UNIDAD_DE[normalizarTexto(col).replace(/\.$/, '')];
    if (u && !unidad) {
      unidad = u;
      continue;
    }
    textos.push(col);
  }
  if (!textos.length) return null;
  const orden = [...textos].sort((a, b) => b.length - a.length);
  const concepto = orden[0]!;
  const resto = textos.filter((t) => t !== concepto);
  const modelo = resto.find((t) => /\d/.test(t) && !/\s/.test(t)) ?? resto.find((t) => /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(t)) ?? resto.find((t) => /\d/.test(t)) ?? null;
  const marca = resto.find((t) => t !== modelo) ?? null;
  return { cantidad, unidad, concepto, modelo, marca, precio: cifras[0] ?? null };
}

/** Renglón de texto: «- 14 cámaras domo», «4 pzas NVR 32 canales $16,019.37», «cámara domo x14». */
export function leerRenglon(linea: string): LineaPedida | null {
  if (/\t/.test(linea)) return leerColumnas(linea.split('\t'));
  if ((linea.match(/\|/g) ?? []).length >= 2) return leerColumnas(linea.split('|'));
  let t = linea.replace(/^\s*(?:[-•*·–—]+|\d{1,2}[.)](?=\s))\s*/, '').trim();
  if (!t || TOTAL.test(t) || CABECERA.test(t)) return null;

  let precio: number | null = null;
  const conPrecio = t.match(/^(.*\S)\s+(\$\s?[\d,]+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})$/);
  if (conPrecio) {
    precio = cifra(conPrecio[2]!);
    t = conPrecio[1]!;
  }

  let cantidad: number | null = null;
  let resto = t;
  const delante = t.match(/^(\d[\d,]*)\s*(?:x\s+|pz[as.]*\s+|piezas?\s+)?(.+)$/i);
  const detras = t.match(/^(.+?)\s*(?:x\s*(\d+)|\((\d+)\)|:\s*(\d+))\s*$/i);
  if (delante && esCantidad(cifra(delante[1]!)) && /[a-záéíóúñ]/i.test(delante[2]!)) {
    cantidad = cifra(delante[1]!);
    resto = delante[2]!;
  } else if (detras) {
    cantidad = Number(detras[2] ?? detras[3] ?? detras[4]);
    resto = detras[1]!;
  } else {
    const palabra = t.match(/^([a-záéíóúñ]+)\s+(.+)$/i);
    const enLetra = palabra ? NUMEROS[normalizarTexto(palabra[1])] : undefined;
    if (enLetra && enLetra > 1) {
      cantidad = enLetra;
      resto = palabra![2]!;
    }
  }

  let unidad: string | null = null;
  const conUnidad = resto.match(/^([a-záéíóúñ.]+)\s+(?:de\s+)?(.+)$/i);
  if (conUnidad) {
    const u = UNIDAD_DE[normalizarTexto(conUnidad[1]).replace(/\.$/, '')];
    // «licencia ZKTeco» dice el producto: se queda el nombre completo.
    if (u && u !== 'Licencia' && u !== 'Kit' && u !== 'Rollo') {
      unidad = u;
      resto = conUnidad[2]!;
    }
  }
  const concepto = resto.replace(/\s+/g, ' ').replace(/^(?:de|el|la|los|las|un|una|unos|unas)\s+/i, '').trim();
  return concepto ? { cantidad, unidad, concepto, precio } : null;
}

/** ¿Es una lista pegada? Varios renglones con cantidad o columnas. */
export function leerLista(texto: string): Lectura | null {
  const renglones = texto.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  const conColumnas = renglones.filter((l) => /\t/.test(l) || (l.match(/\|/g) ?? []).length >= 2);
  if (renglones.length < 2 && !conColumnas.length) return null;

  const leidos = renglones.map((l) => ({ linea: l, leida: leerRenglon(l) }));
  const utiles = leidos.filter((x) => x.leida && (x.leida.cantidad != null || /\t|\|/.test(x.linea) || /^\s*[-•*·–—]/.test(x.linea)));
  // Una lista sin cantidades también vale si cada renglón es corto y empieza con viñeta o es uno solo por línea.
  const porLinea = renglones.length >= 3 && renglones.every((l) => l.length <= 90);
  if (utiles.length < 2 && !conColumnas.length && !porLinea) return null;
  if (utiles.length < renglones.length * 0.5 && !conColumnas.length && !porLinea) return null;

  const primera = leidos[0]!;
  const primeraEsRenglon = utiles.includes(primera);
  const encabezado = !primeraEsRenglon && (!porLinea || utiles.length >= 2) && !CABECERA.test(primera.linea) ? primera.linea : null;
  const lineas = leidos
    .filter((x) => x.leida && !(encabezado && x === primera))
    .map((x) => x.leida!) as LineaPedida[];
  return lineas.length ? { via: 'lista', lineas, destino: encabezado ? destinoDe(encabezado).destino : null, encabezado } : null;
}

const VERBOS =
  /^(?:(?:por favor|oye|hola)[,\s]+)?(?:(?:me\s+)?(?:cot[ií]z(?:a|ar|ame|enme|ale|arle)|necesito|necesitan|ocupo|ocupan|quiero|quieren|requiero|requieren|piden|solicitan|pide|hazme|haz|arma|armar|arme|dame|genera)\s+)?(?:(?:una|la)\s+)?(?:cotizaci[oó]n|propuesta|presupuesto)?\s*(?:de\s+)?/i;

/** Saca «para la bodega de Materiales Pronto» o «cliente Hotel Aurora» del resto de la frase. */
function destinoDe(texto: string): { resto: string; destino: string | null } {
  const inicio = texto.match(/^\s*([^:\n]{2,50}):\s*(.+)$/s);
  if (inicio && !/\d/.test(inicio[1]!)) return { resto: inicio[2]!, destino: inicio[1]!.trim() };
  const m = texto.match(/\b(?:para|cliente|a nombre de)\s+((?:el|la|los|las|un|una)\s+)?([^,;]+)$/i);
  if (!m) return { resto: texto, destino: null };
  const resto = texto.slice(0, m.index).trim();
  // «para una oficina» dice el uso, no a quién: un cliente no se nombra con «un» o «una».
  if (/^un/i.test(m[1] ?? '')) return { resto, destino: null };
  return { resto, destino: m[2]!.replace(/[.\s]+$/, '').trim() };
}

/** Lo que se dice de la cotización y no de las partidas («sin factura», «con margen de 22», «al 20 %»). */
const NOTAS = /[,\s]*\b(?:sin (?:iva|factura)|(?:con\s+)?(?:margen|utilidad|markup)\s*(?:de|del|al|a)?\s*\d{1,3}\s*%?|(?:al|con|a)\s+\d{1,2}\s*%)/gi;

/** Parte una frase en renglones por comas, «y», «con» y «más». */
export function leerFrase(texto: string): Lectura {
  const una = texto.replace(NOTAS, ' ').replace(/\s+/g, ' ').trim();
  const { resto, destino } = destinoDe(una);
  const cuerpo = resto.replace(VERBOS, '').trim();
  const trozos = cuerpo
    .split(/\s*(?:,|;|\+|\by\b|\be\b|\bmás\b|\bmas\b|\bcon\b|\badem[aá]s de\b)\s*/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const lineas = trozos.map((t) => leerRenglon(t)).filter((l): l is LineaPedida => Boolean(l));
  return { via: 'frase', lineas, destino, encabezado: null };
}

/** Lectura por código: la lista si lo es; si no, la frase partida. */
export const leerTexto = (texto: string): Lectura => leerLista(texto) ?? leerFrase(texto);

// ─── Lo que se dice aparte de las partidas ───────────────────────────────────────────────────────

export function margenDeFrase(texto: string): number | null {
  const m = normalizarTexto(texto).match(/\b(?:margen|utilidad|markup)\s*(?:de|del|al|a)?\s*(\d{1,3})\b|\b(?:al|con|a)\s+(\d{1,2})\s*%/);
  if (!m) return null;
  const n = Number(m[1] ?? m[2]);
  return Number.isFinite(n) && n >= 0 && n <= 300 ? n : null;
}

export function sinIvaDeFrase(texto: string): boolean {
  return /\bsin (?:iva|factura)\b/.test(normalizarTexto(texto));
}

export type SegmentoFrase = 'COMERCIAL' | 'OBRA' | 'LICITACION' | 'SERVICIO';

export function segmentoDeFrase(texto: string): SegmentoFrase {
  const t = normalizarTexto(texto);
  if (/\blicitacion\b/.test(t)) return 'LICITACION';
  if (/\bpoliza\b|\bmantenimiento\b/.test(t)) return 'SERVICIO';
  if (/\bobra\b/.test(t)) return 'OBRA';
  return 'COMERCIAL';
}

// ─── Cliente ─────────────────────────────────────────────────────────────────────────────────────

/** El cliente que usa la empresa cuando todavía no hay a quién (19 de 56 cotizaciones). */
export const CLIENTE_GENERICO = 'A QUIEN CORRESPONDA';

export type ClienteConocido = FichaComparable & { salesClientId: number | null };

export type ClienteResuelto = {
  salesClientId: number | null;
  nombre: string;
  /** alta = es este; media = parece (la tarjeta lo pregunta); nuevo = no está; generico = no lo dijeron. */
  seguridad: 'alta' | 'media' | 'nuevo' | 'generico';
  parecidos: Array<{ id: number; nombre: string }>;
};

/**
 * Padrón para buscar: los clientes vigentes más los nombres con que ya se cotizó («Materiales Pronto»
 * está ligada a «Bodega de»). Un nombre que no distingue («Bodega de», «SE») no se reconoce solo.
 */
export function padronDeCotizar(
  padron: FichaComparable[],
  usados: Array<{ nombre: string; salesClientId: number | null }>,
): ClienteConocido[] {
  const salida: ClienteConocido[] = [];
  const vistos = new Set<string>();
  const agregar = (id: number, nombre: string, legalName: string | null | undefined, salesClientId: number | null) => {
    const clave = normalizarTexto(nombre);
    if (clave.length < 3 || vistos.has(clave) || soloGiro(nombre) || clave === normalizarTexto(CLIENTE_GENERICO)) return;
    vistos.add(clave);
    salida.push({ id, name: nombre, legalName: legalName ?? null, salesClientId });
  };
  padron.forEach((c) => agregar(c.id, c.name, c.legalName, c.id));
  usados.forEach((u, i) => agregar(-1 - i, u.nombre, null, u.salesClientId));
  return salida;
}

export function resolverCliente(
  dicho: string | null,
  conocidos: ClienteConocido[],
  generico: { id: number } | null,
): ClienteResuelto {
  const nombre = String(dicho ?? '').trim();
  if (!nombre) {
    return { salesClientId: generico?.id ?? null, nombre: CLIENTE_GENERICO, seguridad: 'generico', parecidos: [] };
  }
  const parecidos = clientesParecidos({ nombre }, conocidos, 3);
  const alta = parecidos.find((p) => p.confianza === 'alta');
  // Sin este paso, «la bodega de Materiales Pronto» no reconoce a «Materiales Pronto».
  const norm = normalizarTexto(nombre);
  const contenido = conocidos
    .filter((c) => normalizarTexto(c.name).length >= 4 && new RegExp(`\\b${normalizarTexto(c.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm))
    .sort((a, b) => b.name.length - a.name.length)[0];
  const elegido = contenido ?? alta?.cliente;
  if (elegido) {
    return { salesClientId: elegido.salesClientId, nombre: elegido.name, seguridad: 'alta', parecidos: [] };
  }
  const lista = parecidos
    .filter((p) => p.cliente.salesClientId != null)
    .map((p) => ({ id: p.cliente.salesClientId!, nombre: p.cliente.name }));
  return { salesClientId: null, nombre, seguridad: lista.length ? 'media' : 'nuevo', parecidos: lista };
}

// ─── La propuesta ────────────────────────────────────────────────────────────────────────────────

export type PartidaPropuesta = {
  /** Lo que se pidió, para que se pueda comparar con lo que se eligió. */
  pedido: string;
  cantidad: number;
  unidad: string;
  fuente: CandidatoPartida['fuente'];
  seguridad: Seguridad;
  name: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  unitCost: number | null;
  unitPrice: number;
  grupo: string | null;
  imagenUrl: string | null;
  veces: number;
  ultimaVez: string | null;
  stock: number | null;
  productCtId: number | null;
  /** Otras opciones para cambiarla con un clic. */
  alternativas: Array<Omit<CandidatoPartida, 'cotizaciones'>>;
};

const sinCotizaciones = ({ cotizaciones: _c, ...resto }: CandidatoPartida) => resto;

/** Costo × (1 + margen/100) a dos decimales. */
const conMargen = (costo: number, margen: number) => Math.round(costo * (1 + margen / 100) * 100) / 100;

/** Unidad si nadie la dijo: un servicio se cobra como servicio; lo demás, por pieza. */
function unidadPorOmision(concepto: string, candidato: CandidatoPartida | null): string {
  if (candidato?.unit) return candidato.unit;
  const palabras = palabrasDePartida(concepto);
  if (palabras.some((p) => ['instalacion', 'configuracion', 'mantenimiento', 'servicio', 'levantamiento', 'envio'].includes(p))) return 'Servicio';
  if (palabras.includes('canalizacion')) return 'Lote';
  return 'Pieza';
}

/**
 * Una línea pedida → partida propuesta. Lo que venía en una lista pegada (modelo, precio) manda sobre
 * el catálogo; lo del catálogo llena lo que falta. El catálogo del mayorista trae costo, no precio:
 * el precio sale con el margen que se dio (o el de siempre) y queda a la vista para cambiarlo.
 */
export function proponerPartida(
  linea: LineaPedida,
  candidatos: CandidatoPartida[],
  margen: number,
): PartidaPropuesta {
  const busqueda = [linea.concepto, linea.modelo].filter(Boolean).join(' ');
  const { elegida: mejor, seguridad, alternativas: otras } = emparejar(busqueda, candidatos);
  // Solo lo seguro se llena solo. Lo que «se parece» queda como opción, sin meter su precio.
  const elegida = seguridad === 'alta' ? mejor : null;
  const alternativas = seguridad === 'media' && mejor ? [mejor, ...otras].sort(ordenDeOpciones) : otras;
  const base = elegida ?? candidatoLibre(linea.concepto, linea.unidad);
  const precioDeCosto = base.fuente === 'catalogo' && base.unitCost ? conMargen(base.unitCost, margen) : null;
  return {
    pedido: linea.concepto,
    cantidad: linea.cantidad ?? 1,
    unidad: linea.unidad ?? unidadPorOmision(linea.concepto, elegida),
    fuente: base.fuente,
    seguridad,
    name: base.name,
    description: base.description,
    brand: linea.marca ?? base.brand,
    model: linea.modelo ?? base.model,
    unitCost: base.unitCost,
    unitPrice: linea.precio ?? precioDeCosto ?? base.unitPrice,
    grupo: base.grupo,
    imagenUrl: base.imagenUrl,
    veces: base.veces,
    ultimaVez: base.ultimaVez,
    stock: base.stock,
    productCtId: base.productCtId,
    alternativas: alternativas.map(sinCotizaciones),
  };
}

export function proponerComplementos(
  lineas: Array<{ concepto: string; cantidad: number }>,
  candidatos: CandidatoPartida[],
  margen: number,
): PartidaPropuesta[] {
  return complementosDe(lineas).map((c: Complemento & { cant: number }) => {
    const propuesta = proponerPartida({ cantidad: c.cant, unidad: null, concepto: c.busca }, candidatos, margen);
    const encontrada = propuesta.fuente !== 'libre' && propuesta.seguridad !== 'ninguna';
    return {
      ...propuesta,
      pedido: c.nombre,
      name: encontrada ? propuesta.name : c.nombre,
      unidad: encontrada ? propuesta.unidad : c.unidad,
      grupo: propuesta.grupo ?? c.grupo,
    };
  });
}

export type CotizacionParecida = { id: number; enComun: number; deLineas: number };

/**
 * ¿Ya se cotizó casi lo mismo? (7 de 52 cotizaciones repiten 80 % o más de otra anterior.) La que
 * comparte más partidas con lo pedido, si son al menos dos y la mitad.
 */
export function cotizacionParecida(lineas: LineaPedida[], candidatos: CandidatoPartida[]): CotizacionParecida | null {
  if (lineas.length < 2) return null;
  const cuenta = new Map<number, number>();
  for (const linea of lineas) {
    const { elegida, seguridad } = emparejar([linea.concepto, linea.modelo].filter(Boolean).join(' '), candidatos);
    if (!elegida || seguridad !== 'alta') continue;
    for (const id of elegida.cotizaciones) cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  const mejor = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  if (!mejor || mejor[1] < 2 || mejor[1] < lineas.length / 2) return null;
  return { id: mejor[0], enComun: mejor[1], deLineas: lineas.length };
}

/**
 * ¿Hace falta la IA? No, si es una lista, o si cada trozo de la frase ya se reconoció con seguridad
 * alta en lo cotizado o en el catálogo y lo que se dijo del destino se reconoce como cliente.
 */
export function bastaConElCodigo(
  lectura: Lectura,
  candidatos: CandidatoPartida[],
  cliente: ClienteResuelto,
): boolean {
  if (lectura.via === 'lista') return lectura.lineas.length > 0;
  if (!lectura.lineas.length) return false;
  if (cliente.seguridad === 'media' || cliente.seguridad === 'nuevo') return false;
  return lectura.lineas.every((l) => emparejar(l.concepto, candidatos).seguridad === 'alta');
}

/** Título de la cotización si nadie lo dio: lo que se cotiza, en corto. */
export function proyectoPorOmision(lineas: Array<{ concepto: string }>): string {
  const cabezas = lineas.slice(0, 3).map((l) => {
    const t = l.concepto.split(/[\n,/|]/)[0]!.trim();
    return t.length > 28 ? `${t.slice(0, 28).trim()}…` : t;
  });
  if (!cabezas.length) return '';
  const texto = cabezas.length > 1 ? `${cabezas.slice(0, -1).join(', ')} y ${cabezas[cabezas.length - 1]}` : cabezas[0]!;
  return `${texto[0]!.toUpperCase()}${texto.slice(1)}`;
}

// ─── Todo junto ──────────────────────────────────────────────────────────────────────────────────

/** Margen con el que se calcula el precio de lo que solo trae costo (el mismo que abre el editor). */
export const MARGEN_POR_OMISION = 20;

export type PropuestaCotizacion = {
  /** Quién resolvió: `lista` y `codigo` no gastan tokens. */
  via: 'lista' | 'codigo' | 'ia';
  cliente: ClienteResuelto;
  proyecto: string;
  segmento: SegmentoFrase;
  /** Margen dicho en la frase; `null` si no se dijo. */
  margen: number | null;
  conIva: boolean;
  partidas: PartidaPropuesta[];
  /** Lo que suele ir con esto: se ofrece, no entra solo. */
  complementos: PartidaPropuesta[];
  parecida: CotizacionParecida | null;
  avisos: string[];
};

export type DependenciasCotizar<U> = {
  padron: FichaComparable[];
  usados: Array<{ nombre: string; salesClientId: number | null }>;
  /** El cliente «A QUIEN CORRESPONDA» de la empresa, si existe. */
  generico: { id: number } | null;
  /** Lo que se tiene en memoria: lo ya cotizado, los paquetes y el formato de conceptos. */
  candidatos: CandidatoPartida[];
  /** Catálogo del mayorista para un concepto; se pregunta solo por lo que no se reconoció. */
  buscarCatalogo: (concepto: string) => Promise<CandidatoPartida[]>;
  /** La IA. Solo se llama si el código no alcanzó. */
  preguntarIa: (frase: string) => Promise<{ cliente: string | null; proyecto: string | null; lineas: Array<{ cant: number | null; unidad: string | null; concepto: string }>; uso: U }>;
};

/**
 * El camino completo: leer por código → (si hace falta) la IA → emparejar cada renglón → cliente,
 * complementos y cotización parecida. El servicio y el eval corren exactamente esto.
 * Si la IA falla no se pierde el pedido: queda lo que leyó el código, con un aviso.
 */
export async function armarPropuesta<U>(
  texto: string,
  deps: DependenciasCotizar<U>,
): Promise<PropuestaCotizacion & { uso: U | null }> {
  const lectura = leerTexto(texto);
  const conocidos = padronDeCotizar(deps.padron, deps.usados);
  let cliente = resolverCliente(lectura.destino, conocidos, deps.generico);
  let lineas = lectura.lineas;
  let proyecto: string | null = lectura.encabezado && !lectura.destino ? lectura.encabezado : null;
  let via: PropuestaCotizacion['via'] = lectura.via === 'lista' ? 'lista' : 'codigo';
  let uso: U | null = null;
  const avisos: string[] = [];

  // Lo que dice el mayorista también cuenta para saber si el código reconoció el renglón.
  const delCatalogo = async (concepto: string) => {
    if (emparejar(concepto, deps.candidatos).seguridad === 'alta') return [];
    return deps.buscarCatalogo(concepto).catch(() => [] as CandidatoPartida[]);
  };
  const conCatalogo = async (pedidos: LineaPedida[]) => {
    const extras = await Promise.all(pedidos.map((l) => delCatalogo([l.concepto, l.modelo].filter(Boolean).join(' '))));
    return [...deps.candidatos, ...extras.flat()];
  };

  let candidatos = await conCatalogo(lineas);
  if (!bastaConElCodigo(lectura, candidatos, cliente)) {
    try {
      const ia = await deps.preguntarIa(texto);
      uso = ia.uso;
      via = 'ia';
      if (ia.lineas.length) {
        lineas = ia.lineas.map((l) => ({ cantidad: l.cant, unidad: l.unidad, concepto: l.concepto }));
        candidatos = await conCatalogo(lineas);
      }
      // Lo que el código ya reconoció se queda; lo demás lo decide lo que entendió la IA.
      if (cliente.seguridad !== 'alta') cliente = resolverCliente(ia.cliente, conocidos, deps.generico);
      proyecto = ia.proyecto ?? proyecto;
    } catch {
      avisos.push('La IA no respondió: esto es lo que se pudo leer sin ella. Revisa los renglones.');
    }
  }

  const margenDicho = margenDeFrase(texto);
  const margen = margenDicho ?? MARGEN_POR_OMISION;
  const partidas = lineas.map((l) => proponerPartida(l, candidatos, margen));
  const resumen = partidas.map((p) => ({ concepto: p.pedido, cantidad: p.cantidad }));
  const faltaPrecio = partidas.filter((p) => !p.unitPrice).length;
  if (!partidas.length) avisos.push('No encontré qué cotizar: di cuántas piezas y de qué, o pega la lista.');
  if (faltaPrecio) avisos.push(faltaPrecio === 1 ? 'Una partida no tiene precio: escríbelo aquí o después.' : `${faltaPrecio} partidas no tienen precio: escríbelos aquí o después.`);

  return {
    via,
    cliente,
    proyecto: proyecto ?? proyectoPorOmision(lineas),
    segmento: segmentoDeFrase(texto),
    margen: margenDicho,
    conIva: !sinIvaDeFrase(texto),
    partidas,
    complementos: proponerComplementos(resumen, candidatos, margen),
    parecida: cotizacionParecida(lineas, deps.candidatos),
    avisos,
    uso,
  };
}
