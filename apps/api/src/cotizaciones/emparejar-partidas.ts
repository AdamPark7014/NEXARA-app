/**
 * De lo que se pidió («NVR 32 canales») a una partida con datos: la que ya se cotizó, la del catálogo
 * del mayorista o, si no hay, un renglón libre con lo que se pidió y sin precio.
 *
 * Todo esto es código: a la IA no le llega ningún catálogo. Ella solo separa la frase en renglones y
 * aquí se decide con qué partida va cada uno, con qué seguridad y qué otras se ofrecen para cambiarla.
 * Módulo puro (sin Nest ni Prisma) para probarlo con jest y para que el eval corra lo mismo.
 */
import { distancia } from '../ai/asistente/nombres.js';
import { normalizarTexto, type FilaCotizada } from './partidas-frecuentes.js';
import { CATALOGO_PARTIDAS_V2 } from './catalogo-partidas-base.js';
import { PAQUETES } from './paquetes.js';
import type { GrupoPartida } from './partidas-grupos.js';

export type FuentePartida = 'usada' | 'catalogo' | 'formato' | 'paquete' | 'libre';

export type CandidatoPartida = {
  fuente: FuentePartida;
  name: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  unit: string | null;
  /** Costo interno; `null` si no se conoce. */
  unitCost: number | null;
  /** Precio al cliente; 0 si no hay. */
  unitPrice: number;
  grupo: string | null;
  imagenUrl: string | null;
  /** En cuántas cotizaciones salió (solo las usadas). */
  veces: number;
  ultimaVez: string | null;
  /** Piezas en el mayorista (solo catálogo). */
  stock: number | null;
  productCtId: number | null;
  /** Cotizaciones donde salió (solo las usadas): sirve para reconocer una casi igual. */
  cotizaciones: number[];
};

export type Seguridad = 'alta' | 'media' | 'ninguna';

export type Emparejada = {
  elegida: CandidatoPartida | null;
  seguridad: Seguridad;
  puntaje: number;
  /** Otras opciones para cambiarla con un clic (sin la elegida). */
  alternativas: CandidatoPartida[];
  /** Lo que se ofrece en pantalla: lo que abre con lo pedido primero. Si no es segura, incluye a la mejor. */
  opciones: CandidatoPartida[];
};

/** A partir de aquí se elige sola; entre media y alta solo se ofrece: un precio equivocado no entra sin que lo vean. */
export const PUNTAJE_ALTA = 0.85;
export const PUNTAJE_MEDIA = 0.5;
const PUNTAJE_ALTERNATIVA = 0.3;
const MAX_ALTERNATIVAS = 3;

/** Lo ya cotizado gana en un empate: trae el precio que la empresa de verdad dio. */
const ORDEN_FUENTE: Record<FuentePartida, number> = { usada: 0, paquete: 1, catalogo: 2, formato: 3, libre: 4 };

const VACIAS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'a', 'al', 'con', 'para', 'por', 'un', 'una', 'unos', 'unas',
  'tipo', 'pieza', 'pza', 'marca', 'modelo', 'suministro', 'nuevo', 'nueva', 'solo', 'sobre', 'hasta', 'concepto',
]);

/** Plurales que no se tocan: «gps» no es el plural de «gp». */
const SIN_PLURAL = new Set(['gps', 'ups', 'dns', 'pos', 'vms', 'mas', 'tres', 'seis', 'pies', 'iris', 'wifi', 'hdmi', 'aws']);

/** Dos palabras para lo mismo. Se comparan ya en singular. */
const SINONIMOS: Record<string, string> = {
  bullet: 'bala',
  tubular: 'bala',
  minidomo: 'domo',
  videograbador: 'grabador',
  videograbadora: 'grabador',
  grabadora: 'grabador',
  nobreak: 'ups',
  hdd: 'disco',
  canaleta: 'canalizacion',
  tuberia: 'canalizacion',
  tubo: 'canalizacion',
  conduit: 'canalizacion',
  ducto: 'canalizacion',
  montaje: 'instalacion',
  instalar: 'instalacion',
  instalado: 'instalacion',
  instalada: 'instalacion',
  rollo: 'bobina',
  carrete: 'bobina',
  checador: 'asistencia',
  portatil: 'laptop',
  notebook: 'laptop',
  conmutador: 'switch',
  flete: 'envio',
  plug: 'conector',
  jack: 'conector',
  cam: 'camara',
  camra: 'camara',
  pantalla: 'monitor',
  biometrica: 'biometrico',
  memory: 'memoria',
  camera: 'camara',
  printer: 'impresora',
  license: 'licencia',
  licencing: 'licencia',
  battery: 'bateria',
};

/** Lo que dice que el renglón es trabajo y no un producto. */
const DE_SERVICIO = new Set(['instalacion', 'configuracion', 'mantenimiento', 'servicio', 'levantamiento', 'desinstalacion', 'adecuacion', 'tendido', 'armado', 'maniobra']);

/** Frases que valen por una sola palabra. Se aplican ya sin acentos y en minúsculas. */
const FRASES: Array<[RegExp, string]> = [
  [/\bhewlett[- ]packard enterprise\b/g, 'hpe'],
  [/\bhewlett[- ]packard\b/g, 'hp'],
  [/\baccess ?points?\b|\bpuntos? de acceso\b/g, 'ap'],
  [/\bno ?breaks?\b/g, 'ups'],
  [/\bdiscos? duros?\b/g, 'disco'],
  [/\bcable de red\b/g, 'cable utp'],
  [/\bcontrol(?:es)? de asistencia\b|\breloj(?:es)? checador(?:es)?\b/g, 'asistencia'],
  [/\ball in one\b/g, 'aio'],
  [/\bmano de obra\b|\bpuesta a punto\b/g, 'instalacion'],
  [/\bcat(?:egoria)?\.? ?(\d[a-z]?)\b/g, 'cat$1'],
  [/\b(\d+(?:\.\d+)?) ?(?:mp|megapixel(?:es)?)\b/g, '$1mp'],
  [/\b(\d+) ?(tb|gb|kva|va|w)\b/g, '$1$2'],
  [/\b(\d+) ?(?:ch|canal(?:es)?)\b/g, '$1 canal'],
  [/\b(\d+) ?(?:puertos?|ptos?)\b/g, '$1 puerto'],
];

function singular(palabra: string): string {
  if (palabra.length <= 3 || /\d/.test(palabra) || SIN_PLURAL.has(palabra)) return palabra;
  if (/(?:or|on|al|el|ol|ar|er|ir|ur|an|en|in|un|ad|ed|id|ud)es$/.test(palabra) || palabra.endsWith('ches')) return palabra.slice(0, -2);
  if (palabra.endsWith('ces')) return `${palabra.slice(0, -3)}z`;
  return palabra.endsWith('s') ? palabra.slice(0, -1) : palabra;
}

/** Palabras de un texto como se comparan: sin acentos, en singular y con un solo nombre para cada cosa. */
export function palabrasDePartida(texto: unknown): string[] {
  let t = normalizarTexto(texto);
  for (const [patron, valor] of FRASES) t = t.replace(patron, valor);
  const salida: string[] = [];
  const agregar = (cruda: string) => {
    const limpia = cruda.replace(/^[.-]+|[.-]+$/g, '');
    if (!limpia || (limpia.length < 2 && !/\d/.test(limpia))) return;
    const una = singular(limpia);
    const palabra = SINONIMOS[una] ?? una;
    if (!VACIAS.has(palabra) && !salida.includes(palabra)) salida.push(palabra);
  };
  for (const cruda of t.split(/[^a-z0-9.-]+/)) {
    // «Licencia-20» son dos palabras; «DS-7732» y «TL-SG1428PE» son un modelo.
    const partes = cruda.split('-');
    const separable = partes.length > 1 && partes.every((p) => /^\d+$/.test(p) || /^[a-z]{4,}$/.test(p));
    if (separable) partes.forEach(agregar);
    else agregar(cruda);
  }
  return salida;
}

/** Se ve como modelo: letras y números juntos, o con guion («DS-2CD», «TL-SG1428PE»). */
const pareceModelo = (p: string) => /[a-z]/.test(p) && /\d/.test(p) && p.length >= 4 && !/^\d+(?:mp|tb|gb|kva|va|w)$/.test(p) && !/^cat\d/.test(p);

/** Cómo escribe el mayorista una marca que la gente dice de otro modo. */
const MARCA_EN_CATALOGO: Record<string, string> = { hpe: 'hewlett' };

/** Marcas que se dicen en una frase; a estas se suman las que traen los candidatos. */
const MARCAS = ['hikvision', 'dahua', 'zebra', 'hpe', 'hp', 'dell', 'lenovo', 'cisco', 'tp-link', 'ubiquiti', 'ruijie', 'grandstream', 'zkteco', 'samsung', 'logitech', 'kenwood', 'hikrobot', 'rosslare', 'vivotek', 'panduit', 'belden', 'hanwha', 'axis', 'epson', 'apc'];

/** Lo que no se puede ignorar al comparar: una cifra, un modelo o una marca que se pidió. */
const esEspecifica = (p: string, marcas: Set<string>) => /\d/.test(p) || marcas.has(p);

type Indexado = { candidato: CandidatoPartida; titulo: Set<string>; detalle: Set<string>; primera: string | null };

function indexar(candidato: CandidatoPartida): Indexado {
  const nombre = String(candidato.name ?? '');
  // Hay nombres de 600 letras pegados de una ficha: lo que sigue a la primera línea útil es detalle.
  const titulo = palabrasDePartida(`${nombre.slice(0, 160)} ${candidato.brand ?? ''} ${candidato.model ?? ''}`);
  const detalle = palabrasDePartida(`${nombre.slice(160)} ${candidato.description ?? ''}`.slice(0, 1200));
  // «DDR5-4800» también dice 4800.
  const piezas = titulo.flatMap((p) => (p.includes('-') ? p.split('-').filter((x) => x.length >= 3) : []));
  return { candidato, titulo: new Set([...titulo, ...piezas]), detalle: new Set(detalle), primera: titulo[0] ?? null };
}

function hallada(palabra: string, lista: Set<string>): boolean {
  if (lista.has(palabra)) return true;
  if (pareceModelo(palabra)) {
    // «DS-7732» dentro de «DS-7732NXI-K4»; un modelo no se compara por parecido.
    for (const suya of lista) if (suya.startsWith(palabra) || palabra.startsWith(suya) && suya.length >= 5) return true;
    return false;
  }
  // Error de dedo solo en palabras largas: «bocina» y «bobina» son cosas distintas.
  if (palabra.length < 7 || /\d/.test(palabra)) return false;
  for (const suya of lista) if (suya.length >= 7 && !/\d/.test(suya) && suya[0] === palabra[0] && distancia(palabra, suya) <= 1) return true;
  return false;
}

/** 0 a 1: qué tanto de lo pedido está en la partida. La primera palabra es lo que se pide: pesa más. */
export function puntuarPartida(
  consulta: string[],
  indexado: Pick<Indexado, 'titulo' | 'detalle'> & { primera?: string | null },
  marcas: ReadonlySet<string> = new Set(),
): number {
  if (!consulta.length) return 0;
  const cabeza = consulta.find((p) => !/^\d/.test(p)) ?? consulta[0]!;
  let total = 0;
  let logrado = 0;
  for (const palabra of consulta) {
    // Quien dice una marca la quiere: «Disco HPE 4 TB» no es un Seagate de 4 TB.
    const peso = palabra === cabeza ? 2.5 : pareceModelo(palabra) || marcas.has(palabra) ? 3 : /^\d/.test(palabra) ? 2 : 1;
    total += peso;
    if (hallada(palabra, indexado.titulo)) logrado += peso;
    else if (hallada(palabra, indexado.detalle)) logrado += peso * 0.5;
  }
  const puntaje = logrado / total;
  // «Terminal facial» no es la instalación de una terminal.
  const esTrabajo = indexado.primera != null && DE_SERVICIO.has(indexado.primera);
  // «Canalización» vale las dos cosas: el material y el trabajo de hacerla.
  if (esTrabajo && !consulta.some((p) => DE_SERVICIO.has(p) || p === 'canalizacion')) return puntaje * 0.5;
  // «Disco duro» no es una cámara que menciona su disco.
  return hallada(cabeza, indexado.titulo) ? puntaje : puntaje * 0.6;
}

const fechaDe = (c: CandidatoPartida) => (c.ultimaVez ? new Date(c.ultimaVez).getTime() || 0 : 0);

/** ¿Trae todo lo específico que se pidió (marca, modelo y cifras)? Para medir las opciones que se ofrecen. */
export function cumpleLoPedido(concepto: string, candidato: Pick<CandidatoPartida, 'name' | 'brand' | 'model'>): boolean | null {
  const titulo = new Set(palabrasDePartida(`${candidato.name.slice(0, 160)} ${candidato.brand ?? ''} ${candidato.model ?? ''}`));
  const marcas = new Set(MARCAS);
  const pedidas = palabrasDePartida(concepto).filter((p) => esEspecifica(p, marcas));
  return pedidas.length ? pedidas.every((p) => hallada(p, titulo)) : null;
}

/** Palabras de marca entre lo que se está comparando. */
function marcasDe(candidatos: CandidatoPartida[]): Set<string> {
  const marcas = new Set(MARCAS);
  for (const c of candidatos) if (c.brand) for (const p of palabrasDePartida(c.brand)) if (p.length >= 3) marcas.add(p);
  return marcas;
}

/**
 * ¿Se puede llenar solo? Un precio equivocado sale caro, así que además del puntaje:
 * - toda cifra, modelo o marca que se pidió debe estar en el título («Memoria HPE» no es una Kingston);
 * - del mayorista, lo pedido debe decir algo específico y abrir el nombre, sin empates: «Inyector PoE»
 *   tiene decenas y se elige de la lista; «Laptop Dell XPS» no es un adaptador «para laptop Dell XPS»;
 * - «Mano de obra» a secas no es la instalación de una terminal en particular.
 *
 * Lo que no pasa se ofrece con un clic, sin meter su precio.
 */
function esSegura(consulta: string[], i: Indexado, puntuados: Array<{ i: Indexado; puntaje: number }>, marcas: Set<string>): boolean {
  const especificas = consulta.filter((p) => esEspecifica(p, marcas));
  if (especificas.some((p) => !hallada(p, i.titulo))) return false;
  const utiles = consulta.filter((p) => !DE_SERVICIO.has(p));
  if (!utiles.length && i.titulo.size > consulta.length + 1) return false;
  // «Canalización» a secas puede ser la canaleta, el tubo o el trabajo: se elige de la lista.
  if (consulta.length === 1 && consulta[0] === 'canalizacion') return false;
  // Una sola palabra contra un nombre largo es solo un parecido. Vale si abre el nombre y no hay otra
  // igual: «Access point» cuando solo se ha cotizado uno.
  if (consulta.length === 1 && i.titulo.size >= 5) {
    const abre = i.primera === consulta[0];
    const otra = puntuados.some((x) => x.i.candidato.fuente === i.candidato.fuente && x.i.primera === consulta[0] && claveDe(x.i.candidato) !== claveDe(i.candidato));
    if (!abre || otra) return false;
  }
  // «Instalación de cableado» no es una bobina cuyo nombre largo dice que incluye instalación.
  if (utiles.length < consulta.length && !(i.primera && DE_SERVICIO.has(i.primera))) return false;
  // Solo lo que la empresa ya cotizó se llena sin más. Un paquete trae un precio de referencia y una
  // cámara TurboHD: «cámara domo» no basta para meterla junto a un NVR.
  if (i.candidato.fuente === 'usada') {
    // Con nombres pegados de una ficha, lo pedido debe abrirlo o coincidir en varias cifras y marcas:
    // «Conector RJ45» no es un convertidor de fibra cuya ficha menciona un puerto RJ45.
    const pedido = consulta.find((p) => !/^\d/.test(p));
    const alInicio = [...i.titulo].slice(0, 3).some((p) => pedido != null && hallada(pedido, new Set([p])));
    return alInicio || i.titulo.size < 8 || especificas.length >= 2;
  }
  if (!especificas.length) return false;
  const cabeza = consulta.find((p) => !/^\d/.test(p));
  const primeras = [...i.titulo].slice(0, 2);
  if (cabeza && !especificas.includes(cabeza) && !primeras.some((p) => hallada(cabeza, new Set([p])))) return false;
  if (cabeza && especificas.includes(cabeza) && consulta.length < 3) return false;
  const empates = puntuados.filter((x) => x.i !== i && x.i.candidato.fuente === 'catalogo' && Math.abs(x.puntaje - puntuados[0]!.puntaje) < 0.001);
  return !empates.some((x) => claveDe(x.i.candidato) !== claveDe(i.candidato));
}

/** Del mayorista conviene ver primero lo que hay en existencia y más barato. */
export const ordenDeOpciones = (a: CandidatoPartida, b: CandidatoPartida) =>
  ORDEN_FUENTE[a.fuente] - ORDEN_FUENTE[b.fuente] ||
  b.veces - a.veces ||
  Number((b.stock ?? 0) > 0) - Number((a.stock ?? 0) > 0) ||
  (a.unitCost ?? a.unitPrice) - (b.unitCost ?? b.unitPrice);

/** Elige la mejor partida para lo pedido y deja otras a la mano. */
export function emparejar(concepto: string, candidatos: CandidatoPartida[]): Emparejada {
  const consulta = palabrasDePartida(concepto);
  const esTrabajo = consulta.some((p) => DE_SERVICIO.has(p));
  // El mayorista vende cosas: una instalación solo puede ser algo que la empresa ya cobró.
  const aComparar = esTrabajo ? candidatos.filter((c) => c.fuente !== 'catalogo') : candidatos;
  const marcas = marcasDe(aComparar);
  const modelosPedidos = consulta.filter(pareceModelo);
  const esModeloPedido = (c: CandidatoPartida) => modelosPedidos.includes(normalizarTexto(c.model));
  const puntuados = aComparar
    .map(indexar)
    .map((i) => ({ i, puntaje: puntuarPartida(consulta, i, marcas) }))
    .filter((x) => x.puntaje >= PUNTAJE_ALTERNATIVA || esModeloPedido(x.i.candidato))
    .sort(
      (a, b) =>
        b.puntaje - a.puntaje ||
        ORDEN_FUENTE[a.i.candidato.fuente] - ORDEN_FUENTE[b.i.candidato.fuente] ||
        b.i.candidato.veces - a.i.candidato.veces ||
        fechaDe(b.i.candidato) - fechaDe(a.i.candidato),
    );
  // Un modelo dicho tal cual va primero, diga lo que diga el resto del nombre.
  const exactas = puntuados.filter((x) => esModeloPedido(x.i.candidato));
  const exacta = exactas[0];
  const mejor = exacta ?? puntuados[0];
  // Y se llena solo si ya se cotizó, o si se dijo nada más el modelo y solo una pieza lo tiene. Del
  // mayorista no basta: en su catálogo una cinta para la impresora ZC300 también dice «ZC300».
  const porModelo =
    exacta != null &&
    (exacta.i.candidato.fuente === 'usada' ||
      (modelosPedidos.length === consulta.length && new Set(exactas.map((x) => normalizarTexto(x.i.candidato.name))).size === 1));
  const distintas = (excluir: CandidatoPartida | null) => {
    const vistas = new Set(excluir ? [claveDe(excluir)] : []);
    return puntuados
      .map((x) => x.i.candidato)
      .filter((c) => {
        const clave = claveDe(c);
        if (vistas.has(clave)) return false;
        vistas.add(clave);
        return true;
      });
  };
  const cabezaConsulta = consulta.find((p) => !/^\d/.test(p));
  // «Canalización» también es el trabajo de hacerla: esa opción no debe quedar debajo de los materiales.
  const abren = new Set(
    puntuados
      .filter((x) => cabezaConsulta != null && (x.i.primera === cabezaConsulta || (cabezaConsulta === 'canalizacion' && x.i.primera != null && DE_SERVICIO.has(x.i.primera))))
      .map((x) => x.i.candidato),
  );
  // Lo que ES lo pedido va primero: «Cámara domo» antes que una caja de conexiones para cámara.
  // Lo específico que se pidió va antes que lo barato: «Switch PoE 24 puertos» no empieza por uno de 5.
  const aciertos = new Map(puntuados.map((x) => [x.i.candidato, consulta.filter((p) => esEspecifica(p, marcas) && hallada(p, x.i.titulo)).length]));
  const puntajes = new Map(puntuados.map((x) => [x.i.candidato, x.puntaje]));
  const enOrden = (a: CandidatoPartida, b: CandidatoPartida) =>
    (aciertos.get(b) ?? 0) - (aciertos.get(a) ?? 0) ||
    (puntajes.get(b) ?? 0) - (puntajes.get(a) ?? 0) ||
    Number(abren.has(b)) - Number(abren.has(a)) ||
    ordenDeOpciones(a, b);
  if (!mejor || (!exacta && mejor.puntaje < PUNTAJE_MEDIA)) {
    const opciones = distintas(null).slice(0, MAX_ALTERNATIVAS);
    return { elegida: null, seguridad: 'ninguna', puntaje: mejor?.puntaje ?? 0, alternativas: opciones, opciones };
  }
  const elegida = mejor.i.candidato;
  // La marca ordena las opciones, pero no vuelve seguro lo demás: «Lector UHF Rosslare» no es cualquier lector Rosslare.
  const segura = porModelo || (puntuarPartida(consulta, mejor.i) >= PUNTAJE_ALTA && esSegura(consulta, mejor.i, puntuados, marcas));
  // Junto a una elegida segura solo se ofrece lo que también es eso («Kit de limpieza» no es «Kit Extensor HDMI»).
  const delMismo = new Set(puntuados.filter((x) => !segura || (cabezaConsulta != null && x.i.primera === cabezaConsulta && x.puntaje >= PUNTAJE_ALTA)).map((x) => x.i.candidato));
  // Las opciones son las que más se parecen; entre ellas, lo más a la mano primero.
  const alternativas = distintas(elegida)
    .filter((c) => delMismo.has(c))
    .slice(0, MAX_ALTERNATIVAS * 3)
    .sort(enOrden)
    .slice(0, MAX_ALTERNATIVAS);
  const opciones = segura
    ? alternativas
    : [elegida, ...distintas(elegida).slice(0, MAX_ALTERNATIVAS * 3)].sort(enOrden).slice(0, MAX_ALTERNATIVAS + 1);
  return { elegida, seguridad: segura ? 'alta' : 'media', puntaje: mejor.puntaje, alternativas, opciones };
}

const claveDe = (c: CandidatoPartida) => `${normalizarTexto(c.name)}|${normalizarTexto(c.model)}`;

/**
 * Qué buscar en el catálogo del mayorista: lo que se pide con su marca y sus cifras, y si no da nada,
 * con menos palabras. El buscador devuelve pocos: sin lo específico, los primeros de «switch» son de
 * 5 puertos aunque se pidan 24. Sin sinónimos: el catálogo dice «canaleta», no «canalización». Una
 * sola palabra solo si trae cifra.
 */
export function consultasDeCatalogo(concepto: string): string[] {
  const palabras = [
    ...new Set(
      normalizarTexto(concepto)
        .split(/[^a-z0-9-]+/)
        .filter((p) => p.length >= 2 && !VACIAS.has(p))
        .map(singular),
    ),
  ];
  const cabeza = palabras.find((p) => !/^\d/.test(p));
  const especificas = palabras.filter((p) => p !== cabeza && (/\d/.test(p) || MARCAS.includes(p)));
  const enCatalogo = (lista: string[]) => lista.map((p) => MARCA_EN_CATALOGO[p] ?? p).join(' ');
  const salida = [
    // Un modelo dicho es lo más exacto: se busca solo.
    ...palabras.filter(pareceModelo),
    ...(cabeza && especificas.length ? [enCatalogo([cabeza, ...especificas].slice(0, 4))] : []),
    enCatalogo(palabras.slice(0, 3)),
    enCatalogo(palabras.slice(0, 2)),
  ];
  if (/\d/.test(palabras[0] ?? '')) salida.push(palabras[0]!);
  return [...new Set(salida)].filter((q) => q.includes(' ') || /\d/.test(q));
}

const numero = (valor: unknown): number | null => {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};
const limpio = (valor: unknown): string | null => String(valor ?? '').trim() || null;

const SIN_DATO = /^(?:n\/?a|s\/?m|-+|\.+)$/i;

const marcaLimpia = (valor: unknown): string | null => {
  const texto = limpio(valor);
  return texto && !SIN_DATO.test(texto) ? texto : null;
};

/**
 * El modelo tal como conviene repetirlo. Hay filas con la fila de Excel pegada entera
 * («4\tPza\tNVR 32 Canales\tDHI-NVR5432-EI2\t$64,077.46»), con «N/A» o con el mismo nombre.
 */
function modeloLimpio(valor: unknown, nombre: string): string | null {
  let texto = limpio(valor);
  if (texto && /\t/.test(texto)) {
    texto = texto.split('\t').map((c) => c.trim()).find((c) => /[a-z]/i.test(c) && /\d/.test(c) && !/\s/.test(c)) ?? null;
  }
  if (!texto || SIN_DATO.test(texto) || normalizarTexto(texto) === normalizarTexto(nombre)) return null;
  return texto;
}

/** Renglones ya cotizados → candidatos, juntando repetidas con los datos de su última vez. */
export function candidatosDeUsadas(filas: FilaCotizada[]): CandidatoPartida[] {
  type Grupo = { ultima: FilaCotizada; cuando: number; cotizaciones: Set<number> };
  const grupos = new Map<string, Grupo>();
  for (const fila of filas) {
    const nombre = normalizarTexto(fila.name);
    if (nombre.length < 2) continue;
    const clave = `${nombre}|${normalizarTexto(fila.model)}`;
    const cuando = new Date(fila.createdAt).getTime() || 0;
    const grupo = grupos.get(clave);
    if (!grupo) {
      grupos.set(clave, { ultima: fila, cuando, cotizaciones: new Set([fila.cotizacionId]) });
      continue;
    }
    grupo.cotizaciones.add(fila.cotizacionId);
    if (cuando > grupo.cuando || (cuando === grupo.cuando && fila.id > grupo.ultima.id)) {
      grupo.ultima = fila;
      grupo.cuando = cuando;
    }
  }
  return [...grupos.values()].map(({ ultima, cuando, cotizaciones }) => {
    const costo = numero(ultima.unitCost);
    const nombreLimpio = String(ultima.name ?? '').trim();
    return {
      fuente: 'usada' as const,
      name: nombreLimpio,
      description: limpio(ultima.description),
      brand: marcaLimpia(ultima.brand),
      model: modeloLimpio(ultima.model, nombreLimpio),
      unit: limpio(ultima.unit),
      unitCost: costo != null && costo > 0 ? costo : null,
      unitPrice: Math.max(0, numero(ultima.unitPrice) ?? 0),
      grupo: limpio(ultima.grupo),
      imagenUrl: limpio(ultima.imagenUrl),
      veces: cotizaciones.size,
      ultimaVez: new Date(cuando).toISOString(),
      stock: null,
      productCtId: null,
      cotizaciones: [...cotizaciones],
    };
  });
}

const sinPrecio = (parcial: Pick<CandidatoPartida, 'fuente' | 'name'> & Partial<CandidatoPartida>): CandidatoPartida => ({
  description: null,
  brand: null,
  model: null,
  unit: null,
  unitCost: null,
  unitPrice: 0,
  grupo: null,
  imagenUrl: null,
  veces: 0,
  ultimaVez: null,
  stock: null,
  productCtId: null,
  cotizaciones: [],
  ...parcial,
});

/** Lo que ya vive en código: los paquetes con su precio de partida y el formato de conceptos, sin precio. */
export const CANDIDATOS_FIJOS: CandidatoPartida[] = [
  ...PAQUETES.flatMap((paquete) =>
    paquete.partidas.map((p) =>
      sinPrecio({ fuente: 'paquete', name: p.name, description: p.description ?? null, unit: p.unit, unitPrice: p.unitPrice, grupo: p.grupo }),
    ),
  ),
  ...CATALOGO_PARTIDAS_V2.map((p) =>
    sinPrecio({ fuente: 'formato', name: p.equipo, brand: p.marca, model: p.modelo, unit: p.unidad, grupo: p.grupo, description: p.descripcion ?? null }),
  ),
];

/** Del mayorista: lo que devuelve su buscador como candidato, con costo y sin precio. */
export function candidatoDelMayorista(oferta: {
  id: number;
  nombre?: string | null;
  clave?: string | null;
  descripcion?: string | null;
  marca?: string | null;
  modelo?: string | null;
  costMxn?: number | null;
  imagen?: string | null;
  stockTotal?: number | null;
}, concepto: string): CandidatoPartida {
  return sinPrecio({
    fuente: 'catalogo',
    name: oferta.nombre || oferta.clave || concepto,
    description: oferta.descripcion ?? null,
    brand: oferta.marca ?? null,
    model: oferta.modelo ?? null,
    unit: 'Pieza',
    unitCost: Number(oferta.costMxn) > 0 ? Number(oferta.costMxn) : null,
    grupo: 'EQUIPOS',
    imagenUrl: oferta.imagen ?? null,
    stock: oferta.stockTotal ?? 0,
    productCtId: oferta.id,
  });
}

/** Partida libre: lo que se pidió, sin precio. El editor ya sabe capturar el resto. */
export function candidatoLibre(concepto: string, unidad: string | null): CandidatoPartida {
  const texto = concepto.trim();
  return {
    fuente: 'libre',
    name: texto ? `${texto[0]!.toUpperCase()}${texto.slice(1)}` : 'Concepto',
    description: null,
    brand: null,
    model: null,
    unit: unidad,
    unitCost: null,
    unitPrice: 0,
    grupo: null,
    imagenUrl: null,
    veces: 0,
    ultimaVez: null,
    stock: null,
    productCtId: null,
    cotizaciones: [],
  };
}

// ─── Lo que suele ir con esto ────────────────────────────────────────────────────────────────────

export type Complemento = {
  /** Lo que se busca en el catálogo. */
  busca: string;
  /** Nombre si no hay nada en el catálogo. */
  nombre: string;
  unidad: string;
  grupo: GrupoPartida;
  /** `igual` = tantas como lo que lo pide (una instalación por cámara); `una` = 1. */
  cantidad: 'igual' | 'una';
};

type Regla = { si: string[]; ofrece: Complemento[] };

const INSTALACION = (de: string): Complemento => ({
  busca: `instalacion ${de}`,
  nombre: `Instalación de ${de}`,
  unidad: 'Servicio',
  grupo: 'MANO_DE_OBRA',
  cantidad: 'igual',
});

/**
 * Sacado de las cotizaciones grandes de la empresa: lo que acompaña a cada cosa cuando se cotiza un
 * sistema y no una pieza suelta. Solo se ofrece: nada entra sin que la persona lo marque.
 */
export const REGLAS_COMPLEMENTO: Regla[] = [
  {
    si: ['camara'],
    ofrece: [
      INSTALACION('cámara'),
      { busca: 'bobina cable utp cat6', nombre: 'Bobina de cable UTP Cat6', unidad: 'Pieza', grupo: 'MATERIALES', cantidad: 'una' },
    ],
  },
  {
    si: ['nvr', 'dvr', 'grabador'],
    ofrece: [
      { busca: 'disco videovigilancia', nombre: 'Disco duro para videovigilancia', unidad: 'Pieza', grupo: 'EQUIPOS', cantidad: 'igual' },
      { busca: 'switch poe', nombre: 'Switch PoE', unidad: 'Pieza', grupo: 'EQUIPOS', cantidad: 'una' },
      { busca: 'configuracion nvr', nombre: 'Configuración y puesta en marcha', unidad: 'Servicio', grupo: 'MANO_DE_OBRA', cantidad: 'una' },
    ],
  },
  {
    si: ['asistencia', 'biometrico', 'lector', 'terminal'],
    ofrece: [
      INSTALACION('terminal'),
      { busca: 'licencia biotime', nombre: 'Licencia de software de control', unidad: 'Licencia', grupo: 'EQUIPOS', cantidad: 'una' },
    ],
  },
  {
    si: ['ap'],
    ofrece: [
      INSTALACION('punto de acceso'),
      { busca: 'bobina cable utp cat6', nombre: 'Bobina de cable UTP Cat6', unidad: 'Pieza', grupo: 'MATERIALES', cantidad: 'una' },
    ],
  },
  {
    si: ['bobina', 'cable'],
    ofrece: [
      { busca: 'tendido cableado', nombre: 'Tendido y terminación de cableado', unidad: 'Metro', grupo: 'MANO_DE_OBRA', cantidad: 'una' },
      { busca: 'conector rj45', nombre: 'Conector RJ45', unidad: 'Pieza', grupo: 'MATERIALES', cantidad: 'una' },
    ],
  },
];

/** Una computadora armada: lo que falta de la lista. */
const PIEZAS_DE_PC = ['procesador', 'tarjeta madre', 'memoria ram', 'ssd', 'gabinete', 'fuente de poder'];

/**
 * Qué más ofrecer para lo que ya se pidió. Cada complemento va una sola vez, con la cantidad del
 * renglón que lo pidió, y no se ofrece lo que ya está en la lista.
 */
export function complementosDe(lineas: Array<{ concepto: string; cantidad: number }>): Array<Complemento & { cant: number }> {
  const conPalabras = lineas.map((l) => ({ ...l, palabras: new Set(palabrasDePartida(l.concepto)) }));
  const yaEsta = (busca: string) => {
    const palabras = palabrasDePartida(busca);
    const cabeza = palabras[0];
    if (!cabeza) return true;
    return conPalabras.some((l) => l.palabras.has(cabeza) && (palabras.length < 2 || palabras.slice(1).some((p) => l.palabras.has(p)) || cabeza !== 'instalacion'));
  };
  const salida = new Map<string, Complemento & { cant: number }>();
  for (const regla of REGLAS_COMPLEMENTO) {
    // Lo pide el renglón que ES eso: «Licencia de 20 checadores» no es un checador que instalar.
    const pide = conPalabras.filter((l) => regla.si.includes(palabrasDePartida(l.concepto)[0] ?? ''));
    if (!pide.length) continue;
    const cuantas = pide.reduce((suma, l) => suma + l.cantidad, 0);
    for (const c of regla.ofrece) {
      if (salida.has(c.busca) || yaEsta(c.busca)) continue;
      salida.set(c.busca, { ...c, cant: c.cantidad === 'igual' ? Math.max(1, cuantas) : 1 });
    }
  }
  const piezas = PIEZAS_DE_PC.filter((p) => conPalabras.some((l) => palabrasDePartida(p).every((x) => l.palabras.has(x))));
  if (piezas.length >= 2) {
    for (const p of PIEZAS_DE_PC) {
      if (piezas.includes(p) || salida.has(p)) continue;
      salida.set(p, { busca: p, nombre: `${p[0]!.toUpperCase()}${p.slice(1)}`, unidad: 'Pieza', grupo: 'EQUIPOS', cantidad: 'una', cant: 1 });
    }
  }
  return [...salida.values()].slice(0, 6);
}
