/**
 * Nombres mal escritos o mal oídos → el catálogo real, en código (sin IA).
 *
 * El dictado escribe «talks» por Tox, «Eric» por Erik, «cuatzacualcos» por Coatzacoalcos o
 * «te pe eme» por TPM; a mano se escribe sin acentos o con una letra de más. Aquí se compara
 * como suena (k/c/qu, s/z/c, x/ks, h muda, ll/y, b/v y algo del inglés que mete el dictado),
 * con distancia de edición para lo que se parece, apodos («Chava» = Salvador) y siglas.
 *
 * Reglas fijas:
 * - Solo se elige un nombre que existe; si hay más de uno parecido, se proponen.
 * - Lo que solo se parece (letras distintas) no gana a lo que coincide igual.
 * - Lo corregido se dice («corregido de "talks"») para que la persona lo vea.
 */

export function normalizar(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cómo suena una palabra (ya normalizada), para que el dictado no impida encontrarla:
 * «Toks» = «Tox» = «talks», «Cristian» = «Christian», «Vanesa» = «Banessa», «cofi» = «coffee».
 */
export function sonido(palabra: string): string {
  return (
    palabra
      // Lo que el dictado en español escribe en inglés (o al revés).
      .replace(/alk/g, 'ok')
      .replace(/ph/g, 'f')
      .replace(/th/g, 't')
      .replace(/sh/g, 'ch')
      .replace(/ck/g, 'k')
      .replace(/ee/g, 'i')
      .replace(/oo/g, 'u')
      .replace(/chr/g, 'cr')
      .replace(/ch/g, '§')
      .replace(/h/g, '')
      .replace(/qu/g, 'k')
      .replace(/g([ei])/g, 'j$1')
      .replace(/gu([ei])/g, 'g$1')
      .replace(/c([ei])/g, 's$1')
      .replace(/c/g, 'k')
      .replace(/z/g, 's')
      .replace(/v/g, 'b')
      .replace(/ll/g, 'y')
      .replace(/ks/g, 'x')
      .replace(/w/g, 'u')
      .replace(/y$/, 'i')
      .replace(/(.)\1+/g, '$1')
      .replace(/§/g, 'ch')
  );
}

/** Distancia de edición (con transposición: «Rimaírez» → «Ramírez» cuenta 1). */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Letras que se pueden equivocar según lo largo de la palabra (como suena): 3 letras, ninguna. */
function tolerancia(clave: string, holgada = false): number {
  const base = clave.length >= 8 ? 2 : clave.length >= 4 ? 1 : 0;
  return holgada ? Math.max(1, base) : base;
}

/**
 * Apodos frecuentes → nombres de pila, para encontrar a la persona en código antes de llamar
 * a la IA («Beto» → Roberto, «Paty» → Patricia, «Toño» → Antonio, «Chava» → Salvador).
 */
export const APODOS: Record<string, string[]> = {
  beto: ['roberto', 'alberto', 'norberto', 'heriberto', 'humberto'],
  paty: ['patricia'],
  pati: ['patricia'],
  tono: ['antonio'],
  tony: ['antonio'],
  pepe: ['jose'],
  chema: ['jose'],
  lupe: ['guadalupe'],
  lupita: ['guadalupe'],
  memo: ['guillermo'],
  paco: ['francisco'],
  pancho: ['francisco'],
  nacho: ['ignacio'],
  chuy: ['jesus'],
  chucho: ['jesus'],
  lalo: ['eduardo'],
  quique: ['enrique'],
  rafa: ['rafael'],
  fer: ['fernando', 'fernanda'],
  mafer: ['fernanda'],
  gaby: ['gabriela'],
  gabi: ['gabriela'],
  ale: ['alejandra', 'alejandro'],
  alex: ['alejandro', 'alejandra'],
  dani: ['daniela', 'daniel'],
  caro: ['carolina'],
  charly: ['carlos'],
  pau: ['paulina'],
  moni: ['monica'],
  vero: ['veronica'],
  lety: ['leticia'],
  isa: ['isabel'],
  santi: ['santiago'],
  tere: ['teresa'],
  mau: ['mauricio'],
  richi: ['ricardo'],
  ricky: ['ricardo'],
  poncho: ['alfonso'],
  cris: ['cristian', 'cristina'],
  chris: ['cristian', 'cristina'],
  mari: ['maria', 'mariana'],
  maru: ['maria'],
  chava: ['salvador'],
  isra: ['israel'],
  clau: ['claudia'],
  efra: ['efrain'],
  gus: ['gustavo'],
  tavo: ['gustavo', 'octavio'],
  checo: ['sergio'],
  goyo: ['gregorio'],
  licha: ['alicia'],
  meche: ['mercedes'],
  chelo: ['consuelo'],
  nando: ['fernando'],
  manolo: ['manuel'],
  juancho: ['juan'],
  rodo: ['rodolfo', 'rodrigo'],
};

/** Palabras que no distinguen un nombre de otro («CEDIS de Tox», «la Torre Médica»). */
export const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'a', 'al', 'con', 'para', 'por', 'and']);

/**
 * Palabras de giro: «Grupo», «Hotel», «Bodegas»… no distinguen a un cliente de otro, así
 * que «Tox nave 2» encuentra a «Grupo Tox» por su palabra propia («tox»).
 */
export const PALABRAS_GIRO = new Set([
  'grupo', 'corporativo', 'corporacion', 'hotel', 'hospital', 'clinica', 'colegio', 'escuela', 'instituto',
  'universidad', 'bodega', 'bodegas', 'plaza', 'tienda', 'tiendas', 'sucursal', 'empresa', 'servicios',
  'centro', 'oficinas', 'farmacia', 'farmacias', 'restaurante', 'constructora', 'inmobiliaria',
  'sa', 'cv', 'sapi', 'rl', 'sc',
]);

/** Palabras que no aportan al comparar (artículos, verbos de relleno, «cliente», «sitio»). */
export const PALABRAS_RELLENO = new Set([
  ...PALABRAS_VACIAS,
  'que', 'se', 'un', 'una', 'unos', 'unas', 'su', 'sus', 'es', 'son', 'esta', 'este', 'esto', 'estos', 'lo', 'le',
  'les', 'hay', 'muy', 'sobre', 'realizar', 'hacer', 'llevar', 'cabo', 'favor', 'cliente', 'sitio', 'actividad',
]);

export function palabrasUtiles(s: string): string[] {
  return normalizar(s)
    .split(' ')
    .filter((w) => w.length >= 2 && !PALABRAS_VACIAS.has(w));
}

/**
 * Qué tan bien coincide `consulta` con `nombre` (0 = nada, 3 = igual), letra por letra.
 * 2: cada palabra de la consulta es (o empieza) una palabra del nombre («antonio» → «José
 *    Antonio Ramírez», «banor» → «Banorte»), o el nombre completo viene dentro de la consulta
 *    («Bodegas Luna Atlixco» → «Bodegas Luna», «Torre Médica del San Rafael» → «Torre Médica»).
 * 1: solo algunas palabras coinciden así: se propone, no se elige.
 */
export function puntaje(consulta: string, nombre: string): number {
  const c = normalizar(consulta);
  const n = normalizar(nombre);
  if (!c || !n) return 0;
  if (c === n) return 3;
  const palabrasN = n.split(' ');
  const palabrasC = palabrasUtiles(consulta);
  const esInicio = (w: string) => palabrasN.some((p) => p.startsWith(w));
  if (palabrasC.length && palabrasC.every((w) => palabrasN.includes(w) || (w.length >= 3 && esInicio(w)))) return 2;
  const utilesN = palabrasUtiles(nombre);
  if (utilesN.length && utilesN.every((w) => palabrasC.includes(w))) return 2;
  // «Tox nave 2» → «Grupo Tox»: basta con las palabras propias del nombre (sin el giro).
  const propiasN = utilesN.filter((w) => w.length >= 3 && !PALABRAS_GIRO.has(w));
  if (propiasN.length && propiasN.every((w) => palabrasC.includes(w))) return 2;
  if (palabrasC.some((w) => w.length >= 3 && esInicio(w))) return 1;
  return 0;
}

/** Una palabra dicha o escrita, con su forma original para poder citarla. */
export type Dicha = {
  /** Como venía («Talks», «te pe eme»). */
  original: string;
  /** Normalizada («talks», «tpm», «salvador» si era el apodo «Chava»). */
  norm: string;
  /** Posición de la primera palabra en el texto (para no repetir la misma palabra). */
  pos: number;
  apodo?: boolean;
  /** Siglas deletreadas («te pe eme» = TPM): solo empatan igual. */
  sigla?: boolean;
};

/** Nombres de las letras, para las siglas deletreadas («te pe eme», «be u a pe»). */
const LETRAS: Record<string, string> = {
  a: 'a', be: 'b', ce: 'c', de: 'd', e: 'e', efe: 'f', ge: 'g', hache: 'h', i: 'i', jota: 'j', ka: 'k',
  ele: 'l', eme: 'm', ene: 'n', o: 'o', pe: 'p', cu: 'q', erre: 'r', ese: 's', te: 't', u: 'u', uve: 'v',
  ve: 'v', equis: 'x', ye: 'y', zeta: 'z',
};
/** Las que no se confunden con una palabra común («de», «a», «te» sí). */
const LETRAS_CLARAS = new Set(['be', 'ce', 'efe', 'ge', 'hache', 'jota', 'ka', 'ele', 'eme', 'ene', 'pe', 'cu', 'erre', 'ese', 'uve', 'equis', 'zeta']);
/** Preposiciones y conjunciones que pegan con unas siglas («de te pe eme») sin ser parte de ellas. */
const NO_ABREN_SIGLAS = new Set(['a', 'e', 'o', 'u', 'i', 'de']);

/**
 * Las palabras de un texto como se pueden comparar con un nombre: cada palabra (sin
 * relleno), los apodos ya traducidos, dos palabras juntas («han lob» = «Hanlob») y las
 * siglas deletreadas.
 */
export function palabrasDe(texto: string | null | undefined): Dicha[] {
  const originales = (texto || '').match(/[\p{L}\p{N}]+/gu) ?? [];
  const palabras = originales.map((original, pos) => ({ original, norm: normalizar(original).replace(/ /g, ''), pos }));
  const salida: Dicha[] = [];
  for (const p of palabras) {
    for (const nombre of APODOS[p.norm] ?? []) salida.push({ ...p, norm: nombre, apodo: true });
    if (p.norm && !PALABRAS_RELLENO.has(p.norm)) salida.push(p);
  }
  for (let i = 0; i + 1 < palabras.length; i++) {
    const [a, b] = [palabras[i], palabras[i + 1]];
    if (a.norm.length >= 2 && b.norm.length >= 2 && !PALABRAS_RELLENO.has(a.norm) && !PALABRAS_RELLENO.has(b.norm) && !/\d/.test(a.norm + b.norm)) {
      salida.push({ original: `${a.original} ${b.original}`, norm: a.norm + b.norm, pos: a.pos });
    }
  }
  // Siglas: dos o más nombres de letra seguidos, con al menos dos que no son palabras comunes.
  for (let i = 0; i < palabras.length; i++) {
    let j = i;
    while (j < palabras.length && LETRAS[palabras[j].norm]) j++;
    let inicio = i;
    while (inicio < j && NO_ABREN_SIGLAS.has(palabras[inicio].norm)) inicio++;
    const tramo = palabras.slice(inicio, j);
    if (tramo.length >= 2 && tramo.filter((p) => LETRAS_CLARAS.has(p.norm)).length >= 2) {
      salida.push({ original: tramo.map((p) => p.original).join(' '), norm: tramo.map((p) => LETRAS[p.norm]).join(''), pos: tramo[0].pos, sigla: true });
    }
    if (j > i) i = j - 1;
  }
  return salida;
}

/**
 * Qué tan parecida es una palabra dicha a una palabra de un nombre (ambas normalizadas):
 * 3 igual · 2 suena igual o una empieza la otra · 1 pocas letras distintas · 0 nada.
 * `estricta` (para escoger qué mandarle a la IA): lo aproximado solo con 5+ letras y la misma
 * inicial. `holgada` (cuando la instrucción ya lo corrobora): una letra aunque sean 3.
 */
export function parecido(dicha: string, delNombre: string, modo: 'normal' | 'estricta' | 'holgada' = 'normal'): number {
  if (!dicha || !delNombre) return 0;
  if (dicha === delNombre) return 3;
  if (dicha.length < 3 || delNombre.length < 2) return 0;
  const a = sonido(dicha);
  const b = sonido(delNombre);
  if (a === b && a.length >= 2) return 2;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 2;
  if (/\d/.test(dicha + delNombre)) return 0;
  if (modo === 'estricta' && (b.length < 5 || a[0] !== b[0])) return 0;
  return distancia(a, b) <= tolerancia(b, modo === 'holgada') ? 1 : 0;
}

/** Iniciales de un nombre de varias palabras («Benemérita Universidad Autónoma de Puebla» → «buap»). */
function siglasDe(nombre: string): string | null {
  const palabras = palabrasUtiles(nombre).filter((w) => !/^\d+$/.test(w) && !['sa', 'cv', 'sapi', 'rl', 'sc'].includes(w));
  return palabras.length >= 3 ? palabras.map((w) => w[0]).join('') : null;
}

/** Calidad de una palabra dicha contra una palabra del nombre (las siglas solo empatan igual). */
function calidad(d: Dicha, delNombre: string, modo: 'normal' | 'estricta' | 'holgada' = 'normal'): number {
  if (d.sigla) return d.norm === delNombre ? 2 : 0;
  const c = parecido(d.norm, delNombre, modo);
  // Un apodo traducido («Chava» → salvador) cuenta como «suena igual», no como igual.
  return d.apodo ? Math.min(c, 2) : c;
}

/** Las palabras de un nombre con las que se le reconoce (sin el giro si tiene otras). */
function palabrasPropias(nombre: string): string[] {
  const utiles = palabrasUtiles(nombre).filter((w) => !['sa', 'cv', 'sapi', 'rl', 'sc'].includes(w));
  const propias = utiles.filter((w) => w.length >= 3 && !PALABRAS_GIRO.has(w));
  return propias.length ? propias : utiles;
}

/**
 * Lo mejor que empata cada palabra propia del nombre con lo dicho (0 si nada), y las
 * siglas del nombre completo si las dijeron.
 */
function empates(dichas: Dicha[], nombre: string, modo: 'normal' | 'estricta' | 'holgada') {
  const propias = palabrasPropias(nombre);
  const porPalabra = propias.map((w) => {
    let mejor: { dicha: Dicha; c: number } | null = null;
    for (const d of dichas) {
      const c = calidad(d, w, modo);
      if (c && (!mejor || c > mejor.c)) mejor = { dicha: d, c };
    }
    return { palabra: w, mejor };
  });
  const siglas = siglasDe(nombre);
  const porSiglas = siglas ? dichas.find((d) => d.norm === siglas && !d.apodo) ?? null : null;
  return { propias, porPalabra, porSiglas };
}

/**
 * `puntaje` más lo que suena igual o se parece (para lo que escribió la IA o se dictó):
 * 1.8 suena igual («Talks» → «Grupo Tox», «Chava» → Salvador) · 1.5 se parece («Jair» →
 * Yahir) · 1 algo se parece (se propone, no se elige). Lo de `puntaje` (2 o 3) gana siempre.
 */
export function puntajeAproximado(consulta: string, nombre: string, modo: 'normal' | 'holgada' = 'normal'): number {
  const base = puntaje(consulta, nombre);
  if (base >= 2) return base;
  const dichas = palabrasDe(consulta);
  if (!dichas.length) return base;
  const { propias, porPalabra, porSiglas } = empates(dichas, nombre, modo);
  if (porSiglas) return 1.8;
  // A: todo lo propio del nombre se dijo (como suena o parecido).
  const todas = porPalabra.length > 0 && porPalabra.every((x) => x.mejor);
  const minimaA = todas ? Math.min(...porPalabra.map((x) => x.mejor!.c)) : 0;
  // B: cada palabra de la consulta (sin giro) está en el nombre: «Jair» → «Yahir Benítez».
  const sueltas = dichas.filter((d) => !d.sigla && !d.original.includes(' '));
  const porPosicion = new Map<number, number>();
  const palabrasN = palabrasUtiles(nombre);
  for (const d of sueltas) {
    if (/^\d+$/.test(d.norm) || (PALABRAS_GIRO.has(d.norm) && sueltas.some((o) => !PALABRAS_GIRO.has(o.norm)))) continue;
    const c = Math.max(0, ...palabrasN.map((w) => calidad(d, w, modo)));
    porPosicion.set(d.pos, Math.max(porPosicion.get(d.pos) ?? 0, c));
  }
  const valoresB = [...porPosicion.values()];
  const minimaB = valoresB.length && valoresB.every((c) => c > 0) ? Math.min(...valoresB) : 0;
  const mejor = Math.max(minimaA, minimaB);
  if (mejor >= 2) return 1.8;
  if (mejor >= 1) return 1.5;
  // Algo propio y largo se parece: se propone.
  if (propias.length && porPalabra.some((x) => x.mejor && x.palabra.length >= 4)) return Math.max(base, 1);
  return base;
}

export type Coincidencia<T> = { elegido: T | null; candidatos: T[] };

/**
 * Elige solo cuando hay un único mejor resultado; si empatan, deja que la persona escoja.
 * `aproximado`: también lo que suena igual o se parece, y solo se elige si no hay otra
 * opción parecida (una sola opción clara).
 */
export function buscar<T>(
  consulta: string | null,
  items: T[],
  nombreDe: (t: T) => string,
  max = 5,
  opciones: { aproximado?: boolean; modo?: 'normal' | 'holgada' } = {},
): Coincidencia<T> {
  if (!consulta || !normalizar(consulta)) return { elegido: null, candidatos: [] };
  const medir = opciones.aproximado ? (n: string) => puntajeAproximado(consulta, n, opciones.modo) : (n: string) => puntaje(consulta, n);
  const puntuados = items
    .map((item) => ({ item, p: medir(nombreDe(item)) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p);
  if (!puntuados.length) return { elegido: null, candidatos: [] };
  const mejor = puntuados[0].p;
  const empatados = puntuados.filter((x) => x.p === mejor);
  const unica = empatados.length === 1 && (mejor >= 2 || (opciones.aproximado && mejor >= 1.5 && puntuados.filter((x) => x.p >= 1.5).length === 1));
  return {
    elegido: unica ? empatados[0].item : null,
    candidatos: puntuados.slice(0, max).map((x) => x.item),
  };
}

/**
 * Qué tanto se mencionó `nombre` en la instrucción completa (para escoger qué mandarle a
 * la IA): 3 igual, 2 suena igual, 1 se parece (5+ letras y misma inicial), 0 nada. También
 * devuelve cómo lo dijeron si no fue igual («talks»).
 */
export function mencion(dichas: Dicha[], nombre: string): { nivel: number; comoSeDijo: string | null } {
  const { porPalabra, porSiglas } = empates(dichas, nombre, 'estricta');
  if (porSiglas) return { nivel: 2, comoSeDijo: porSiglas.original };
  let nivel = 0;
  let comoSeDijo: string | null = null;
  for (const x of porPalabra) {
    if (!x.mejor) continue;
    if (x.mejor.c > nivel) nivel = x.mejor.c;
    if (x.mejor.c < 3 && !x.mejor.dicha.apodo && !comoSeDijo) comoSeDijo = x.mejor.dicha.original;
  }
  return { nivel, comoSeDijo: nivel >= 3 ? null : comoSeDijo };
}

export type Corregido = {
  /** Lo que se dijo o escribió («talks», «bruks cofi», «Chava»). */
  de: string;
  /** apodo («Chava» = Salvador) o parecido (mal escrito o mal oído). */
  como: 'apodo' | 'parecido';
  /** Qué palabra cambiar por cuál (para corregir título, indicaciones y lugar). */
  pares: Array<{ mal: string[]; bien: string }>;
};

/**
 * Si `texto` nombra a `nombre` de otra forma (mal oído, mal escrito, apodo o siglas), qué
 * se dijo. null si lo nombra igual o no lo nombra. Si alguna palabra del nombre se dijo
 * igual, lo que solo «se parece» cuenta solo si va junto a ella («crepas en waffles» →
 * Creppes and Waffles); lejos era otra palabra («José Antonio vaya a Ramos» no es Ramírez).
 */
export function corregidoDe(nombre: string, texto: string | null | undefined): Corregido | null {
  const dichas = palabrasDe(texto);
  if (!dichas.length) return null;
  const { porPalabra, porSiglas } = empates(dichas, nombre, 'normal');
  const original = new Map((nombre.match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => [normalizar(w), w] as const));
  // Las siglas dichas como palabra («BUAP») son el nombre de siempre; deletreadas, se corrigen.
  if (porSiglas) {
    if (!porSiglas.sigla) return null;
    return { de: porSiglas.original, como: 'parecido', pares: [{ mal: normalizar(porSiglas.original).split(' '), bien: porSiglas.norm.toUpperCase() }] };
  }
  const esLiteral = (x: (typeof porPalabra)[number]) =>
    Boolean(
      x.mejor &&
        !x.mejor.dicha.apodo &&
        !x.mejor.dicha.sigla &&
        (x.mejor.c === 3 || (x.mejor.dicha.norm.length >= 3 && x.palabra.startsWith(x.mejor.dicha.norm))),
    );
  const posLiterales = porPalabra.filter(esLiteral).map((x) => x.mejor!.dicha.pos);
  const junto = (pos: number) => posLiterales.some((p) => Math.abs(p - pos) <= 2);
  const corregidas = porPalabra.filter(
    (x) => x.mejor && !esLiteral(x) && (x.mejor.c >= 2 || !posLiterales.length || junto(x.mejor.dicha.pos)),
  );
  if (!corregidas.length) return null;
  const vistas = new Set<string>();
  const partes: string[] = [];
  for (const x of corregidas) {
    const d = x.mejor!.dicha;
    if (vistas.has(d.original)) continue;
    vistas.add(d.original);
    partes.push(d.original);
  }
  const apodo = corregidas.every((x) => x.mejor!.dicha.apodo);
  return {
    de: partes.join(' '),
    como: apodo ? 'apodo' : 'parecido',
    pares: corregidas
      .filter((x) => !x.mejor!.dicha.apodo)
      .map((x) => ({ mal: normalizar(x.mejor!.dicha.original).split(' '), bien: original.get(x.palabra) ?? x.palabra })),
  };
}

/**
 * Nombres propios que la empresa ya escribió en sus actividades y no están en el catálogo
 * («Inventario Toks», lugar «Tienda Maja»): las palabras con mayúscula que no abren el título
 * (esa es el verbo) y las del lugar, de 4+ letras. Se queda la forma más usada de cada una.
 */
export function nombresPropiosDe(registros: Array<{ titulo?: string | null; lugar?: string | null }>, max = 400): string[] {
  const cuenta = new Map<string, Map<string, number>>();
  const sumar = (palabra: string) => {
    const norm = normalizar(palabra);
    if (norm.length < 4 || /\d/.test(norm) || PALABRAS_RELLENO.has(norm) || PALABRAS_GIRO.has(norm)) return;
    const formas = cuenta.get(norm) ?? new Map<string, number>();
    formas.set(palabra, (formas.get(palabra) ?? 0) + 1);
    cuenta.set(norm, formas);
  };
  for (const r of registros) {
    const titulo = r.titulo?.match(/[\p{L}\p{N}]+/gu) ?? [];
    // Un título todo en mayúsculas no dice qué es nombre propio.
    const gritado = titulo.length > 1 && titulo.every((w) => w === w.toUpperCase());
    if (!gritado) titulo.slice(1).forEach((w) => /^\p{Lu}/u.test(w) && sumar(w));
    for (const w of r.lugar?.match(/[\p{L}\p{N}]+/gu) ?? []) sumar(w);
  }
  return [...cuenta.entries()]
    .map(([, formas]) => {
      const [forma, veces] = [...formas.entries()].sort((a, b) => b[1] - a[1])[0];
      const total = [...formas.values()].reduce((s, n) => s + n, 0);
      return { forma, veces, total };
    })
    .sort((a, b) => b.total - a.total || b.veces - a.veces)
    .slice(0, max)
    .map((x) => x.forma);
}

/**
 * Cambia en `texto` lo mal escrito por el nombre bueno («Revisar NVR en Talk» → «Revisar
 * NVR en Tox»): las palabras que se dijeron mal y, si empiezan con mayúscula (no la
 * primera de un título: es el verbo; `primera` sí la revisa, para un lugar), las que se les
 * parecen.
 */
export function corregirEnTexto(texto: string, pares: Corregido['pares'], opciones: { primera?: boolean } = {}): string {
  if (!texto || !pares.length) return texto;
  const piezas = texto.split(/([\p{L}\p{N}]+)/u);
  // piezas: separador, palabra, separador, palabra, …
  const indices: number[] = [];
  for (let i = 1; i < piezas.length; i += 2) indices.push(i);
  const ordenados = [...pares].sort((a, b) => b.mal.length - a.mal.length);
  for (let k = 0; k < indices.length; k++) {
    for (const par of ordenados) {
      const n = par.mal.length;
      if (!n || k + n > indices.length) continue;
      const tramo = indices.slice(k, k + n);
      const iguales = tramo.every((idx, j) => normalizar(piezas[idx]) === par.mal[j]);
      const palabra = piezas[tramo[0]];
      const parecida =
        !iguales &&
        n === 1 &&
        (k > 0 || opciones.primera) &&
        /^\p{Lu}/u.test(palabra) &&
        normalizar(palabra) !== normalizar(par.bien) &&
        (parecido(normalizar(palabra), par.mal[0], 'holgada') > 0 || parecido(normalizar(palabra), normalizar(par.bien), 'holgada') > 0);
      if (!iguales && !parecida) continue;
      if (normalizar(piezas[tramo[0]]) === normalizar(par.bien)) continue;
      piezas[tramo[0]] = par.bien;
      for (let j = 1; j < n; j++) {
        piezas[tramo[j]] = '';
        piezas[tramo[j] - 1] = '';
      }
      break;
    }
  }
  return piezas.join('').replace(/\s{2,}/g, ' ');
}
