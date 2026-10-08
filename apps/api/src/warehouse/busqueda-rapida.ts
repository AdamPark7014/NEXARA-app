/**
 * Búsqueda rápida de inventario (pedido de Adam, 07-10-2026): una sola caja, también con
 * lector de código de barras, que encuentra herramientas y artículos de almacén.
 *
 * «Una cosa es un taladro que es uno y uno, y otra un bote de cinchos». Por eso cada
 * resultado dice lo que importa de su tipo:
 *
 * - Herramienta: se agrupan las piezas iguales (nombre + modelo) → «2 disponibles · 1 prestada».
 * - Consumible: existencia en piezas contada con su empaque → «3 botes + 40 pz (340 pz)».
 * - Por medida: en metros con su presentación → «2 bobinas + 120 m (730 m)».
 * - Equipo: por pieza → «4 pz».
 *
 * Todo puro: ni Prisma ni Nest. `BusquedaRapidaService` (tool-requests) trae las filas de
 * la empresa y aquí se filtra, se ordena, se cuenta y se arma el texto.
 */
import { buildCodigoInterno } from '../tool-requests/tool-nomenclature.js';
import { TIPOS_ARTICULO, normalizarTipoArticulo, type TipoArticulo } from '../catalog/tipo-articulo.js';
import { cantidadLegible, empaqueDeCompra, pluralEmpaque, redondear4, type Empaque } from './empaque.js';

// ── Tipos de la respuesta (contrato con la web) ───────────────────────

export const TIPOS_BUSQUEDA = ['TODOS', 'HERRAMIENTA', ...TIPOS_ARTICULO] as const;
export type TipoBusqueda = (typeof TIPOS_BUSQUEDA)[number];
export type TipoResultado = 'HERRAMIENTA' | TipoArticulo;
export type TonoBusqueda = 'success' | 'warning' | 'danger' | 'neutral';

export type ConteosBusqueda = Record<TipoBusqueda | 'SIN_TIPO', number>;

export type PiezaResultado = {
  id: number;
  codigo: string | null;
  /** «Disponible», «Prestada», «En reparación». */
  estado: string;
  quienLaTiene: string | null;
};

export type ResultadoBusqueda = {
  origen: 'herramienta' | 'articulo';
  /** Herramienta: la primera pieza del grupo (la del código, si se escaneó una). Artículo: productId. */
  id: number;
  tipo: TipoResultado | null;
  nombre: string;
  /** Modelo · marca · SKU, en gris. */
  detalle: string | null;
  codigo: string | null;
  codigoBarras: string | null;
  imagenUrl: string | null;
  estado: { texto: string; tono: TonoBusqueda } | null;
  existencia: { cantidad: number; unidad: 'pz' | 'm'; texto: string; bajoMinimo: boolean } | null;
  ubicacion: string | null;
  piezas?: PiezaResultado[];
  href: string;
};

export type RespuestaBusqueda = {
  q: string;
  tipo: TipoBusqueda;
  incluyeAlmacen: boolean;
  conteos: ConteosBusqueda;
  resultados: ResultadoBusqueda[];
};

// ── Lo que trae el servicio ───────────────────────────────────────────

export type HerramientaCandidata = {
  id: number;
  toolName: string;
  model?: string | null;
  serialNumber?: string | null;
  codigoInterno?: string | null;
  barcode?: string | null;
  /** AVAILABLE | ASSIGNED | IN_REPAIR | RETIRED. */
  status: string;
  panoramicPhotoUrl?: string | null;
  actualizadoEn?: Date | string | null;
};

export type ArticuloCandidato = {
  id: number;
  nombre: string;
  sku?: string | null;
  /** `Product.tipoArticulo` tal como viene de la base. */
  tipo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
  /** El código de barras propio, UPC o EAN (en ese orden de preferencia para enseñar). */
  codigoBarras?: string | null;
  upc?: string | null;
  ean?: string | null;
  /** `Product.unitName`: solo cuenta cuando el artículo no tiene tipo. */
  unidad?: string | null;
  imagenUrl?: string | null;
  /** Presentaciones (`ProductPackaging`), con su código de barras: el lector escanea el bote. */
  empaques?: Empaque[];
  actualizadoEn?: Date | string | null;
};

/** Un renglón de `StockLevel`, ya en números. */
export type NivelExistencia = {
  cantidad: number;
  minimo?: number | null;
  almacen?: string | null;
  /** Código o nombre de la ubicación dentro del almacén («A-2»). */
  ubicacion?: string | null;
};

// ── Normalización ─────────────────────────────────────────────────────

export const LIMITE_POR_OMISION = 30;
export const LIMITE_MAXIMO = 100;
/** Ni el lector ni una persona mandan más que esto; lo demás se corta. */
export const LARGO_MAXIMO_Q = 100;
const MAXIMO_TOKENS = 8;

/** «Cámara  PTZ» → «camara ptz»: minúsculas, sin acentos, espacios simples. */
export function normalizarTexto(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Las palabras que deben aparecer todas. Sin repetidas y a lo más ocho. */
export function tokensDeBusqueda(q: unknown): string[] {
  const texto = normalizarTexto(String(q ?? '').slice(0, LARGO_MAXIMO_Q));
  if (!texto) return [];
  return [...new Set(texto.split(' '))].slice(0, MAXIMO_TOKENS);
}

/** Lo que manda la web en `tipo`; vacío o desconocido = TODOS. Acepta minúsculas. */
export function normalizarTipoBusqueda(valor: unknown): TipoBusqueda {
  const limpio = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
  return (TIPOS_BUSQUEDA as readonly string[]).includes(limpio) ? (limpio as TipoBusqueda) : 'TODOS';
}

export function normalizarLimite(valor: unknown): number {
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n) || n <= 0) return LIMITE_POR_OMISION;
  return Math.min(n, LIMITE_MAXIMO);
}

/** Para comparar códigos: lo que leyó el lector sin espacios alrededor y en mayúsculas. */
function claveCodigo(valor: unknown): string {
  return String(valor ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .toUpperCase();
}

function limpio(valor: unknown): string | null {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto || null;
}

function marcaDeTiempo(valor: Date | string | null | undefined): number {
  if (!valor) return 0;
  const t = valor instanceof Date ? valor.getTime() : new Date(valor).getTime();
  return Number.isFinite(t) ? t : 0;
}

// ── Coincidencia y ranking ───────────────────────────────────────────

/** Qué tan bien coincide. Menor es mejor; `null` = no coincide. */
export const RANGO = {
  /** El texto completo es un código de la pieza o del artículo (lo que manda el lector). */
  CODIGO_EXACTO: 0,
  /** El nombre empieza con lo buscado. */
  NOMBRE_EMPIEZA: 1,
  /** Todas las palabras están en el nombre. */
  NOMBRE: 2,
  /** Las palabras están repartidas entre nombre, modelo, marca, códigos y categoría. */
  OTROS_CAMPOS: 3,
} as const;

/**
 * Decide si un candidato coincide y con qué rango. `codigos` son los que cuentan para la
 * coincidencia exacta; `campos` es todo lo demás donde puede estar una palabra.
 */
export function rangoDeCoincidencia(
  entrada: { nombre: string; campos: Array<string | null | undefined>; codigos: Array<string | null | undefined> },
  tokens: readonly string[],
  q: string,
): number | null {
  if (tokens.length === 0) return RANGO.OTROS_CAMPOS;
  const buscado = claveCodigo(q);
  if (buscado && entrada.codigos.some((c) => c && claveCodigo(c) === buscado)) return RANGO.CODIGO_EXACTO;

  const nombre = normalizarTexto(entrada.nombre);
  const todo = [nombre, ...entrada.campos.map(normalizarTexto), ...entrada.codigos.map(normalizarTexto)]
    .filter(Boolean)
    .join(' ');
  if (!tokens.every((t) => todo.includes(t))) return null;
  if (nombre.startsWith(tokens.join(' '))) return RANGO.NOMBRE_EMPIEZA;
  if (tokens.every((t) => nombre.includes(t))) return RANGO.NOMBRE;
  return RANGO.OTROS_CAMPOS;
}

// ── Herramientas ──────────────────────────────────────────────────────

const ETIQUETA_ESTADO_PIEZA: Record<string, string> = {
  AVAILABLE: 'Disponible',
  ASSIGNED: 'Prestada',
  IN_REPAIR: 'En reparación',
  RETIRED: 'Retirada',
};

export function etiquetaEstadoPieza(status: string): string {
  return ETIQUETA_ESTADO_PIEZA[status] ?? status;
}

/** El código de la etiqueta de la pieza: el guardado o, si falta, el que calcula la nomenclatura. */
function codigoDePieza(h: HerramientaCandidata): string {
  return (
    limpio(h.codigoInterno) ??
    buildCodigoInterno({ toolName: h.toolName, serialNumber: String(h.serialNumber ?? '') })
  );
}

function barrasDePieza(h: HerramientaCandidata): string {
  return limpio(h.barcode) ?? codigoDePieza(h);
}

export type GrupoHerramientas = {
  clave: string;
  nombre: string;
  modelo: string | null;
  /** Piezas vivas (sin retiradas), por id. */
  piezas: HerramientaCandidata[];
  actualizadoEn: number;
};

/**
 * Junta las piezas iguales: mismo nombre y modelo (sin acentos ni mayúsculas). Las retiradas
 * no salen: ya no existen para nadie que busque.
 */
export function agruparHerramientas(items: readonly HerramientaCandidata[]): GrupoHerramientas[] {
  const grupos = new Map<string, GrupoHerramientas>();
  const ordenadas = [...items].filter((h) => h.status !== 'RETIRED').sort((a, b) => a.id - b.id);
  for (const h of ordenadas) {
    const clave = `${normalizarTexto(h.toolName)}|${normalizarTexto(h.model)}`;
    const grupo = grupos.get(clave) ?? {
      clave,
      nombre: (h.toolName ?? '').trim() || 'Herramienta',
      modelo: limpio(h.model),
      piezas: [],
      actualizadoEn: 0,
    };
    grupo.piezas.push(h);
    grupo.actualizadoEn = Math.max(grupo.actualizadoEn, marcaDeTiempo(h.actualizadoEn));
    grupos.set(clave, grupo);
  }
  return [...grupos.values()];
}

function plural(n: number, singular: string, varios: string): string {
  return `${n} ${n === 1 ? singular : varios}`;
}

/** «2 disponibles · 1 prestada · 1 en reparación». Verde si hay alguna disponible. */
export function estadoDeHerramientas(piezas: ReadonlyArray<Pick<HerramientaCandidata, 'status'>>): {
  texto: string;
  tono: TonoBusqueda;
} {
  let disponibles = 0;
  let prestadas = 0;
  let enReparacion = 0;
  for (const p of piezas) {
    if (p.status === 'AVAILABLE') disponibles += 1;
    else if (p.status === 'ASSIGNED') prestadas += 1;
    else if (p.status === 'IN_REPAIR') enReparacion += 1;
  }
  const partes: string[] = [];
  if (disponibles > 0) partes.push(plural(disponibles, 'disponible', 'disponibles'));
  if (prestadas > 0) partes.push(plural(prestadas, 'prestada', 'prestadas'));
  if (enReparacion > 0) partes.push(`${enReparacion} en reparación`);
  if (partes.length === 0) partes.push('Sin piezas');
  return { texto: partes.join(' · '), tono: disponibles > 0 ? 'success' : 'warning' };
}

/** Como `rangoDeCoincidencia`, pero el código exacto dice además qué pieza se escaneó. */
function rangoDeGrupo(
  grupo: GrupoHerramientas,
  tokens: readonly string[],
  q: string,
): { rango: number | null; piezaExacta: HerramientaCandidata | null } {
  const buscado = claveCodigo(q);
  const piezaExacta = buscado
    ? (grupo.piezas.find((p) =>
        [codigoDePieza(p), barrasDePieza(p), p.serialNumber].some((c) => c && claveCodigo(c) === buscado),
      ) ?? null)
    : null;
  if (piezaExacta) return { rango: RANGO.CODIGO_EXACTO, piezaExacta };
  const rango = rangoDeCoincidencia(
    {
      nombre: grupo.nombre,
      campos: [grupo.modelo],
      codigos: grupo.piezas.flatMap((p) => [p.serialNumber, codigoDePieza(p), barrasDePieza(p)]),
    },
    tokens,
    '', // el código exacto ya se revisó pieza por pieza
  );
  return { rango, piezaExacta: null };
}

/**
 * El renglón de un grupo de herramientas. `quienLaTiene` por id de pieza lo llena el servicio
 * (préstamo en uso o kit activo) solo para los grupos que salen en la página.
 */
export function resultadoDeHerramientas(
  grupo: GrupoHerramientas,
  opciones: { piezaPrimero?: HerramientaCandidata | null; quienLaTiene?: ReadonlyMap<number, string> } = {},
): ResultadoBusqueda {
  const primero = opciones.piezaPrimero ?? null;
  const piezas = primero ? [primero, ...grupo.piezas.filter((p) => p.id !== primero.id)] : grupo.piezas;
  const principal = piezas[0];
  return {
    origen: 'herramienta',
    id: principal.id,
    tipo: 'HERRAMIENTA',
    nombre: grupo.nombre,
    detalle: grupo.modelo,
    codigo: codigoDePieza(principal),
    codigoBarras: barrasDePieza(principal),
    imagenUrl: limpio(piezas.find((p) => limpio(p.panoramicPhotoUrl))?.panoramicPhotoUrl) ?? null,
    estado: estadoDeHerramientas(piezas),
    existencia: null,
    ubicacion: null,
    piezas: piezas.map((p) => ({
      id: p.id,
      codigo: codigoDePieza(p),
      estado: etiquetaEstadoPieza(p.status),
      quienLaTiene: opciones.quienLaTiene?.get(p.id) ?? null,
    })),
    href: `/erp/almacen/herramientas?herramienta=${principal.id}`,
  };
}

// ── Artículos de almacén ──────────────────────────────────────────────

const UNIDADES_METRO = new Set(['m', 'mt', 'mts', 'metro', 'metros']);

/** Unidad en que se cuenta: la del tipo; sin tipo, metros solo si así se capturó. */
export function unidadDeArticulo(tipo: TipoArticulo | null, unidad?: string | null): 'pz' | 'm' {
  if (tipo === 'MEDIDA') return 'm';
  if (tipo) return 'pz';
  return UNIDADES_METRO.has(normalizarTexto(unidad)) ? 'm' : 'pz';
}

/**
 * «3 botes + 40 pz (340 pz)», «2 bobinas + 120 m (730 m)», «4 pz», «Sin existencia».
 * Mismo texto que `textoExistencia` de la web (`lib/tipos-articulo.ts`).
 */
export function textoExistencia(
  cantidad: number,
  empaque: Pick<Empaque, 'nombre' | 'piezasPorUnidad'> | null | undefined,
  unidad: string,
): string {
  const total = redondear4(Number(cantidad) || 0);
  if (total === 0) return 'Sin existencia';
  const base = `${cantidadLegible(total)} ${unidad}`;
  const capacidad = Number(empaque?.piezasPorUnidad);
  const nombre = (empaque?.nombre ?? '').trim();
  if (total < 0 || !nombre || !Number.isFinite(capacidad) || capacidad <= 0) return base;
  const completos = Math.floor(redondear4(total / capacidad));
  if (completos < 1) return base;
  const resto = redondear4(total - completos * capacidad);
  const empaques = `${completos} ${pluralEmpaque(nombre, completos)}`;
  const partes = resto > 0 ? `${empaques} + ${cantidadLegible(resto)} ${unidad}` : empaques;
  return `${partes} (${base})`;
}

/** Suma de todos los almacenes, en unidad base, con el empaque de compra si el tipo lo usa. */
export function existenciaDeArticulo(
  articulo: Pick<ArticuloCandidato, 'tipo' | 'unidad' | 'empaques'>,
  niveles: readonly NivelExistencia[],
): NonNullable<ResultadoBusqueda['existencia']> {
  const tipo = normalizarTipoArticulo(articulo.tipo) ?? null;
  const unidad = unidadDeArticulo(tipo, articulo.unidad);
  const cantidad = redondear4(niveles.reduce((s, n) => s + (Number(n.cantidad) || 0), 0));
  // El equipo va por pieza: aunque tenga una caja registrada para comprar, se cuenta en piezas.
  const empaque = tipo === 'EQUIPO' ? null : empaqueDeCompra(articulo.empaques ?? []);
  const bajoMinimo = niveles.some((n) => {
    const minimo = Number(n.minimo ?? 0);
    return Number.isFinite(minimo) && (Number(n.cantidad) || 0) < minimo;
  });
  return { cantidad, unidad, texto: textoExistencia(cantidad, empaque, unidad), bajoMinimo };
}

/** «Bodega A-2» si todo está en un lugar; «3 ubicaciones» si está repartido. */
export function ubicacionDeNiveles(niveles: readonly NivelExistencia[]): string | null {
  const nombre = (n: NivelExistencia) =>
    [limpio(n.almacen), limpio(n.ubicacion)].filter(Boolean).join(' ') || null;
  const conExistencia = niveles.filter((n) => (Number(n.cantidad) || 0) > 0);
  const lugares = new Set(
    (conExistencia.length > 0 ? conExistencia : niveles).map(nombre).filter((x): x is string => Boolean(x)),
  );
  if (lugares.size === 0) return null;
  if (lugares.size === 1) return [...lugares][0];
  return `${lugares.size} ubicaciones`;
}

function codigosDeArticulo(a: ArticuloCandidato): string[] {
  return [a.sku, a.codigoBarras, a.upc, a.ean, ...(a.empaques ?? []).map((e) => e.codigoBarras)]
    .map(limpio)
    .filter((c): c is string => Boolean(c));
}

export function resultadoDeArticulo(
  articulo: ArticuloCandidato,
  niveles: readonly NivelExistencia[] = [],
  opciones: { codigoEscaneado?: string | null } = {},
): ResultadoBusqueda {
  const tipo = normalizarTipoArticulo(articulo.tipo) ?? null;
  const detalle = [limpio(articulo.modelo), limpio(articulo.marca), limpio(articulo.sku)].filter(Boolean).join(' · ');
  return {
    origen: 'articulo',
    id: articulo.id,
    tipo,
    nombre: articulo.nombre.trim() || 'Artículo',
    detalle: detalle || null,
    codigo: limpio(articulo.sku),
    // Si se escaneó el bote, la web debe ver ese código para abrirlo con el Enter del lector.
    codigoBarras:
      limpio(opciones.codigoEscaneado) ??
      limpio(articulo.codigoBarras) ??
      limpio(articulo.upc) ??
      limpio(articulo.ean),
    imagenUrl: limpio(articulo.imagenUrl),
    estado: null,
    existencia: existenciaDeArticulo(articulo, niveles),
    ubicacion: ubicacionDeNiveles(niveles),
    href: `/erp/almacen?producto=${articulo.id}`,
  };
}

// ── Selección: filtrar, contar y ordenar ─────────────────────────────

export type Elegido =
  | { origen: 'herramienta'; rango: number; grupo: GrupoHerramientas; piezaExacta: HerramientaCandidata | null }
  | { origen: 'articulo'; rango: number; articulo: ArticuloCandidato; codigoExacto: string | null };

export type Seleccion = { conteos: ConteosBusqueda; elegidos: Elegido[] };

export function conteosVacios(): ConteosBusqueda {
  return { TODOS: 0, HERRAMIENTA: 0, EQUIPO: 0, CONSUMIBLE: 0, MEDIDA: 0, SIN_TIPO: 0 };
}

function nombreDe(e: Elegido): string {
  return e.origen === 'herramienta' ? e.grupo.nombre : e.articulo.nombre;
}

function recienteDe(e: Elegido): number {
  return e.origen === 'herramienta' ? e.grupo.actualizadoEn : marcaDeTiempo(e.articulo.actualizadoEn);
}

/**
 * Lo que coincide, contado por tipo (antes de filtrar por el chip) y ordenado: primero el
 * código exacto, luego por nombre. Sin texto: lo más reciente primero.
 *
 * `totalesArticulos` sustituye el conteo de artículos cuando no se mandó todo el catálogo
 * (sin texto el servicio solo trae los recientes, y cuenta el resto en la base).
 */
export function seleccionar(entrada: {
  q: string;
  tipo: TipoBusqueda;
  limite: number;
  herramientas: readonly HerramientaCandidata[];
  articulos: readonly ArticuloCandidato[];
  totalesArticulos?: Partial<Record<TipoArticulo | 'SIN_TIPO', number>>;
}): Seleccion {
  const q = String(entrada.q ?? '').slice(0, LARGO_MAXIMO_Q).trim();
  const tokens = tokensDeBusqueda(q);
  const conteos = conteosVacios();
  const todos: Elegido[] = [];

  for (const grupo of agruparHerramientas(entrada.herramientas)) {
    const { rango, piezaExacta } = rangoDeGrupo(grupo, tokens, q);
    if (rango == null) continue;
    conteos.HERRAMIENTA += 1;
    todos.push({ origen: 'herramienta', rango, grupo, piezaExacta });
  }

  const buscado = claveCodigo(q);
  for (const articulo of entrada.articulos) {
    const codigos = codigosDeArticulo(articulo);
    const rango = rangoDeCoincidencia(
      {
        nombre: articulo.nombre,
        campos: [articulo.modelo, articulo.marca, articulo.categoria, articulo.subcategoria],
        codigos,
      },
      tokens,
      q,
    );
    if (rango == null) continue;
    const tipo = normalizarTipoArticulo(articulo.tipo) ?? null;
    if (tipo) conteos[tipo] += 1;
    else conteos.SIN_TIPO += 1;
    const codigoExacto =
      rango === RANGO.CODIGO_EXACTO ? (codigos.find((c) => claveCodigo(c) === buscado) ?? null) : null;
    todos.push({ origen: 'articulo', rango, articulo, codigoExacto });
  }

  if (entrada.totalesArticulos) {
    for (const clave of [...TIPOS_ARTICULO, 'SIN_TIPO'] as const) {
      const total = entrada.totalesArticulos[clave];
      if (total != null && Number.isFinite(total)) conteos[clave] = Math.max(conteos[clave], total);
    }
  }
  conteos.TODOS = conteos.HERRAMIENTA + conteos.EQUIPO + conteos.CONSUMIBLE + conteos.MEDIDA + conteos.SIN_TIPO;

  const delTipo = todos.filter((e) => {
    if (entrada.tipo === 'TODOS') return true;
    if (entrada.tipo === 'HERRAMIENTA') return e.origen === 'herramienta';
    return e.origen === 'articulo' && normalizarTipoArticulo(e.articulo.tipo) === entrada.tipo;
  });

  const sinTexto = tokens.length === 0;
  delTipo.sort((a, b) => {
    if (sinTexto) {
      const porFecha = recienteDe(b) - recienteDe(a);
      if (porFecha !== 0) return porFecha;
    } else if (a.rango !== b.rango) {
      return a.rango - b.rango;
    }
    return nombreDe(a).localeCompare(nombreDe(b), 'es', { sensitivity: 'base' });
  });

  return { conteos, elegidos: delTipo.slice(0, Math.max(0, entrada.limite)) };
}

/**
 * La respuesta completa. Los niveles de existencia y quién tiene cada pieza llegan solo para
 * lo elegido (el servicio no consulta existencias de lo que no se va a enseñar).
 */
export function armarRespuesta(entrada: {
  q: string;
  tipo: TipoBusqueda;
  incluyeAlmacen: boolean;
  seleccion: Seleccion;
  nivelesPorProducto?: ReadonlyMap<number, readonly NivelExistencia[]>;
  quienLaTiene?: ReadonlyMap<number, string>;
}): RespuestaBusqueda {
  const resultados = entrada.seleccion.elegidos.map((e) =>
    e.origen === 'herramienta'
      ? resultadoDeHerramientas(e.grupo, { piezaPrimero: e.piezaExacta, quienLaTiene: entrada.quienLaTiene })
      : resultadoDeArticulo(e.articulo, entrada.nivelesPorProducto?.get(e.articulo.id) ?? [], {
          codigoEscaneado: e.codigoExacto,
        }),
  );
  return {
    q: String(entrada.q ?? '').slice(0, LARGO_MAXIMO_Q).trim(),
    tipo: entrada.tipo,
    incluyeAlmacen: entrada.incluyeAlmacen,
    conteos: entrada.seleccion.conteos,
    resultados,
  };
}

/** Todo de una vez, con los datos ya en memoria (pruebas y llamadas pequeñas). */
export function busquedaRapida(entrada: {
  q: string;
  tipo?: unknown;
  limite?: unknown;
  incluyeAlmacen: boolean;
  herramientas: readonly HerramientaCandidata[];
  articulos?: readonly ArticuloCandidato[];
  totalesArticulos?: Partial<Record<TipoArticulo | 'SIN_TIPO', number>>;
  nivelesPorProducto?: ReadonlyMap<number, readonly NivelExistencia[]>;
  quienLaTiene?: ReadonlyMap<number, string>;
}): RespuestaBusqueda {
  const tipo = normalizarTipoBusqueda(entrada.tipo);
  const seleccion = seleccionar({
    q: entrada.q,
    tipo,
    limite: normalizarLimite(entrada.limite),
    herramientas: entrada.herramientas,
    articulos: entrada.incluyeAlmacen ? (entrada.articulos ?? []) : [],
    totalesArticulos: entrada.incluyeAlmacen ? entrada.totalesArticulos : undefined,
  });
  return armarRespuesta({
    q: entrada.q,
    tipo,
    incluyeAlmacen: entrada.incluyeAlmacen,
    seleccion,
    nivelesPorProducto: entrada.nivelesPorProducto,
    quienLaTiene: entrada.quienLaTiene,
  });
}
