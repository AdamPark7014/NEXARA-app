/**
 * ¿Ya existe este cliente? Comparación en código, sin IA.
 *
 * El padrón juntó «BUAP» y «Benemer», «ANFO» y «ANFORA», «GAMINF» y «GAMING». Aquí se compara un
 * nombre contra los que ya hay: acentos, mayúsculas, «S.A. de C.V.», puntos («B.U.A.P.»), siglas en
 * las dos direcciones, palabras que faltan, nombres a medio escribir, cómo suena y errores de dedo.
 *
 * Reglas fijas:
 * - Solo avisa: la persona decide si es el mismo o si crea otro.
 * - Una palabra que no distingue («Grupo», «Puebla») no basta para decir que se parecen.
 * - Dos giros distintos no son el mismo («Hotel Portal» y «Farmacias del Portal»).
 */
import { distancia, normalizar, sonido } from '../ai/asistente/nombres.js';

export type FichaComparable = {
  id: number;
  name: string;
  legalName?: string | null;
  taxId?: string | null;
};

export type MotivoParecido =
  | 'rfc'
  | 'mismo-nombre'
  | 'siglas'
  | 'silabas'
  | 'mal-escrito'
  | 'contenido'
  | 'a-medio-escribir'
  | 'siglas-parciales';

export type Parecido<T extends FichaComparable> = {
  cliente: T;
  motivo: MotivoParecido;
  /** alta: casi seguro el mismo; media: conviene mirarlo. */
  confianza: 'alta' | 'media';
  /** Con qué nombre del cliente coincidió (el comercial o la razón social). */
  coincideCon: string;
};

/** Forma jurídica al final del nombre, ya normalizado y sin puntos. */
const FORMA_JURIDICA =
  /(?:\s+(?:s ?a ?p ?i|s ?a ?b|s ?a ?s|s ?a|s ?c ?p|s ?c ?s|s ?c|a ?c|i ?a ?p|i ?b ?p|s ?de ?r ?l|s ?en ?c|inc|llc|ltd|corp))(?:\s+de\s+(?:c ?v|r ?l(?:\s+de\s+c ?v)?|i ?p))?$/;

/** Conectores: «Benemérita Universidad Autónoma de Puebla» se recuerda sin el «de». */
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'al', 'a', 'and', 'the', 'of', 'para', 'por']);

/** Lo que dice qué clase de negocio es: no identifica a nadie, y dos distintos no son el mismo. */
const GIROS: Record<string, string> = {
  grupo: 'grupo',
  corporativo: 'grupo',
  corporacion: 'grupo',
  empresa: 'grupo',
  empresas: 'grupo',
  compania: 'grupo',
  cia: 'grupo',
  operadora: 'grupo',
  servicios: 'grupo',
  oficinas: 'grupo',
  hotel: 'hotel',
  hoteles: 'hotel',
  hospital: 'salud',
  clinica: 'salud',
  sanatorio: 'salud',
  medicos: 'salud',
  medica: 'salud',
  colegio: 'escuela',
  escuela: 'escuela',
  instituto: 'escuela',
  universidad: 'escuela',
  tecnologico: 'escuela',
  preparatoria: 'escuela',
  farmacia: 'farmacia',
  farmacias: 'farmacia',
  farmaceutica: 'farmacia',
  restaurante: 'restaurante',
  restaurantes: 'restaurante',
  cafe: 'restaurante',
  cafeteria: 'restaurante',
  plaza: 'plaza',
  centro: 'plaza',
  inmobiliaria: 'plaza',
  constructora: 'constructora',
  construcciones: 'constructora',
  automotriz: 'automotriz',
  agencia: 'automotriz',
  bodega: 'bodega',
  bodegas: 'bodega',
  tienda: 'tienda',
  tiendas: 'tienda',
  sucursal: 'tienda',
  logistica: 'logistica',
  transportes: 'logistica',
  banco: 'banco',
};

/** Lugares y palabras comunes: comparten nombre muchos clientes que no tienen que ver. */
const DEBILES = new Set([
  'mexico',
  'mexicana',
  'mexicano',
  'nacional',
  'puebla',
  'poblano',
  'poblana',
  'cholula',
  'tlaxcala',
  'veracruz',
  'cdmx',
  'centro',
  'norte',
  'sur',
  'oriente',
  'poniente',
  'integral',
  'general',
  'internacional',
  'consulting',
  'consultores',
  'soluciones',
  'san',
  'santa',
  'santo',
]);

/** Lo que se le quita a un nombre antes de compararlo. */
export function nucleoDelNombre(nombre: string | null | undefined): string {
  const sinPuntos = (nombre ?? '').replace(/\./g, '').replace(/&/g, ' y ');
  let n = normalizar(sinPuntos);
  // Dos pasadas: «… S. de R.L. de C.V.» y «…, S.C.» pueden traer más de una forma pegada.
  for (let i = 0; i < 2; i++) n = n.replace(FORMA_JURIDICA, '').trim();
  return n;
}

function palabrasDe(nucleo: string): string[] {
  return nucleo.split(' ').filter((w) => w && !CONECTORES.has(w));
}

const compacto = (nucleo: string) => nucleo.replace(/ /g, '');
const esGiro = (w: string) => Object.prototype.hasOwnProperty.call(GIROS, w);
export const esPropia = (w: string) => !esGiro(w) && !DEBILES.has(w) && !/^\d+$/.test(w);
const pareceSiglas = (nucleo: string) => !nucleo.includes(' ') && nucleo.length >= 2 && nucleo.length <= 8;

/** Iniciales del nombre, sin y con conectores: BUAP y UDLAP se forman de maneras distintas. */
function iniciales(nucleo: string): string[] {
  const todas = nucleo.split(' ').filter(Boolean);
  const utiles = todas.filter((w) => !CONECTORES.has(w));
  if (utiles.length < 2) return [];
  const sin = utiles.map((w) => w[0]).join('');
  const con = todas.map((w) => w[0]).join('');
  return sin === con ? [sin] : [sin, con];
}

/** «Pemex» = Petróleos Mexicanos, «Telmex» = Teléfonos de México: un trozo del inicio de cada palabra. */
function formaSilabas(palabra: string, palabras: string[]): boolean {
  if (palabras.length < 2 || palabras.length > 4 || palabra.length < 5) return false;
  const seguir = (resto: string, i: number): boolean => {
    if (i === palabras.length) return resto.length === 0;
    for (let n = Math.min(resto.length, palabras[i].length); n >= 1; n--) {
      if (palabras[i].startsWith(resto.slice(0, n)) && seguir(resto.slice(n), i + 1)) return true;
    }
    return false;
  };
  return seguir(palabra, 0);
}

/** Errores que se aceptan en el nombre completo según lo largo: en los cortos, ninguno. */
function toleranciaDe(largo: number): number {
  if (largo >= 11) return 3;
  if (largo >= 8) return 2;
  if (largo >= 5) return 1;
  return 0;
}

/**
 * Dos palabras que son la misma: iguales, suenan igual o difieren en una letra si son largas.
 * Más estricto que con el nombre completo: «americano» no es «Américas» ni «Serta» es «Serte».
 */
function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3 || /\d/.test(a + b)) return false;
  const sa = sonido(a);
  const sb = sonido(b);
  if (sa === sb) return true;
  const corto = Math.min(sa.length, sb.length);
  return corto >= 6 && distancia(sa, sb) <= (corto >= 11 ? 2 : 1);
}

/** Una palabra cortada es el inicio de la otra («ibero» e «iberoamericana», «Benemer» y «Benemérita»). */
const cortada = (corta: string, larga: string, minimo = 4) => corta.length >= minimo && larga.length > corta.length && larga.startsWith(corta);

function girosEnConflicto(a: string[], b: string[]): boolean {
  const ga = new Set(a.filter(esGiro).map((w) => GIROS[w]));
  const gb = new Set(b.filter(esGiro).map((w) => GIROS[w]));
  if (!ga.size || !gb.size) return false;
  return ![...ga].some((g) => gb.has(g));
}

type Comparacion = { motivo: MotivoParecido; confianza: 'alta' | 'media'; fuerza: number };

/** Compara dos nombres ya limpios. Sin parecido, null. */
function comparar(nucleoA: string, nucleoB: string): Comparacion | null {
  if (!nucleoA || !nucleoB) return null;
  const ca = compacto(nucleoA);
  const cb = compacto(nucleoB);
  if (ca === cb) return { motivo: 'mismo-nombre', confianza: 'alta', fuerza: 100 };

  const pa = palabrasDe(nucleoA);
  const pb = palabrasDe(nucleoB);

  // Siglas, en las dos direcciones: el nombre corto contra las iniciales del largo.
  for (const [corto, largo, palabrasLargo] of [
    [nucleoA, nucleoB, pb],
    [nucleoB, nucleoA, pa],
  ] as const) {
    if (!pareceSiglas(corto)) continue;
    const ini = iniciales(largo);
    if (corto.length >= 3 && ini.includes(corto)) return { motivo: 'siglas', confianza: 'alta', fuerza: 95 };
    if (formaSilabas(corto, palabrasLargo)) return { motivo: 'silabas', confianza: 'alta', fuerza: 90 };
    // Le falta o le sobra una letra a las siglas: «Universidad Autónoma de Puebla» y BUAP.
    if (corto.length >= 3 && ini.some((s) => s.length >= 3 && s.length !== corto.length && distancia(s, corto) === 1)) {
      return { motivo: 'siglas-parciales', confianza: 'media', fuerza: 55 };
    }
    // Las siglas apenas empiezan: «Benemérita Universidad» y BUAP. Un lugar no cuenta: «Ibero Puebla» no es IPADE.
    if (palabrasLargo.length === 2 && corto.length >= 3 && !palabrasLargo.some((w) => DEBILES.has(w)) && corto.startsWith(palabrasLargo.map((w) => w[0]).join(''))) {
      return { motivo: 'siglas-parciales', confianza: 'media', fuerza: 50 };
    }
  }

  // Dos giros distintos no son el mismo, aunque compartan apellido.
  if (girosEnConflicto(pa, pb)) return null;

  // Como suena o con errores de dedo, el nombre completo.
  if (!/\d/.test(ca + cb)) {
    const sa = sonido(ca);
    const sb = sonido(cb);
    if (sa === sb && sa.length >= 3) return { motivo: 'mal-escrito', confianza: 'alta', fuerza: 88 };
    const corto = Math.min(sa.length, sb.length);
    const tolerancia = toleranciaDe(corto);
    if (tolerancia && distancia(sa, sb) <= tolerancia) {
      // Una sola palabra de pocas letras: puede ser otro negocio.
      return { motivo: 'mal-escrito', confianza: corto >= 8 ? 'alta' : 'media', fuerza: corto >= 8 ? 85 : 62 };
    }
  }

  // Palabra por palabra: todas las propias del nombre más corto están en el otro.
  const [cortas, largas] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const propias = cortas.filter(esPropia);
  if (propias.length) {
    const exactas = propias.filter((w) => largas.some((l) => mismaPalabra(w, l)));
    // Con otra palabra igual al lado alcanza un trozo más corto: «Tec de Monterrey» y «Tecnológico de Monterrey».
    const minimo = exactas.length ? 3 : 4;
    const inicios = propias.filter((w) => !exactas.includes(w) && largas.some((l) => cortada(w, l, minimo) || cortada(l, w, minimo)));
    if (exactas.length + inicios.length === propias.length) {
      const largo = propias.reduce((s, w) => s + w.length, 0);
      if (!inicios.length && (propias.length >= 2 || largo >= 5)) return { motivo: 'contenido', confianza: 'alta', fuerza: 80 };
      if (!inicios.length && largo >= 3) return { motivo: 'contenido', confianza: 'media', fuerza: 60 };
      if (inicios.length && largo >= 4) return { motivo: 'a-medio-escribir', confianza: 'media', fuerza: 65 };
    }
  }

  // A medio escribir: «Benemer» y «Benemérita…», «ANFO» y «ANFORA», «Bodega de» y «Bodega de Aurrerá».
  const [menor, mayor] = ca.length <= cb.length ? [palabrasDe(nucleoA).join(' '), palabrasDe(nucleoB).join(' ')] : [palabrasDe(nucleoB).join(' '), palabrasDe(nucleoA).join(' ')];
  if (menor.length >= 4 && mayor.startsWith(menor) && !palabrasDe(menor).every((w) => DEBILES.has(w))) {
    return { motivo: 'a-medio-escribir', confianza: 'media', fuerza: 64 };
  }
  return null;
}

function normalizarRfc(rfc: string | null | undefined): string {
  return (rfc ?? '').replace(/[^a-z0-9ñ&]/gi, '').toUpperCase();
}

/** RFC genéricos del SAT: los comparten miles, no identifican a nadie. */
const RFC_GENERICOS = new Set(['XAXX010101000', 'XEXX010101000']);

/**
 * Los clientes del padrón que se parecen a lo que se quiere dar de alta, del más al menos
 * parecido. `padron` ya viene filtrado por empresa: aquí no se mira de quién es cada uno.
 */
export function clientesParecidos<T extends FichaComparable>(
  alta: { nombre: string; razonSocial?: string | null; rfc?: string | null; excluirId?: number | null },
  padron: T[],
  max = 5,
): Parecido<T>[] {
  const nombres = [alta.nombre, alta.razonSocial].map(nucleoDelNombre).filter(Boolean);
  const rfc = normalizarRfc(alta.rfc);
  const salida: Array<Parecido<T> & { fuerza: number }> = [];
  for (const cliente of padron) {
    if (alta.excluirId && cliente.id === alta.excluirId) continue;
    let mejor: (Comparacion & { coincideCon: string }) | null = null;
    if (rfc.length >= 12 && !RFC_GENERICOS.has(rfc) && normalizarRfc(cliente.taxId) === rfc) {
      mejor = { motivo: 'rfc', confianza: 'alta', fuerza: 110, coincideCon: cliente.taxId ?? '' };
    }
    for (const suyo of [cliente.name, cliente.legalName]) {
      const nucleoSuyo = nucleoDelNombre(suyo);
      for (const mio of nombres) {
        const c = comparar(mio, nucleoSuyo);
        if (c && (!mejor || c.fuerza > mejor.fuerza)) mejor = { ...c, coincideCon: suyo ?? '' };
      }
    }
    if (mejor) {
      salida.push({ cliente, motivo: mejor.motivo, confianza: mejor.confianza, coincideCon: mejor.coincideCon, fuerza: mejor.fuerza });
    }
  }
  // Si ya hay uno casi seguro, unas siglas que apenas se parecen solo estorban.
  const hayAlta = salida.some((p) => p.confianza === 'alta');
  return salida
    .filter((p) => !hayAlta || p.motivo !== 'siglas-parciales')
    .sort((a, b) => b.fuerza - a.fuerza || a.cliente.name.localeCompare(b.cliente.name, 'es'))
    .slice(0, max)
    .map(({ fuerza: _fuerza, ...resto }) => resto);
}

/** Por qué se parecen, en palabras para quien da de alta. */
export function explicarParecido(motivo: MotivoParecido): string {
  switch (motivo) {
    case 'rfc':
      return 'Tiene el mismo RFC';
    case 'mismo-nombre':
      return 'Es el mismo nombre';
    case 'siglas':
      return 'Son las siglas de ese nombre';
    case 'silabas':
      return 'Es la forma corta de ese nombre';
    case 'siglas-parciales':
      return 'Las siglas casi coinciden';
    case 'mal-escrito':
      return 'Se escribe casi igual';
    case 'contenido':
      return 'Comparten el nombre';
    case 'a-medio-escribir':
      return 'Uno parece el otro a medio escribir';
    default:
      return 'Se parecen';
  }
}
