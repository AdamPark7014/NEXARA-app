import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { bufferParaPdf, imagenParaPdf } from '../common/pdf/imagen-para-pdf.js';
import { loadNexaraLogo, PDF_FUENTES, registrarFuentesCorporativas } from '../common/pdf/nexara-pdf-theme.js';

/**
 * PDF «Propuesta técnica» — el documento que ve el cliente.
 *
 * Lleva todo lo que trae la propuesta que NEXARA arma a mano (`Primera cotizacion .pdf`) y en el
 * mismo orden, con el lenguaje de una propuesta de consultoría: fondo blanco, tipografía real y el
 * verde de la marca solo como acento (filetes, numerales y números de sección).
 *
 * - Portada blanca: marca pequeña arriba, «PROPUESTA TÉCNICA», el proyecto como título, el cliente,
 *   una rejilla de datos (preparada para, proyecto, folio, fecha, versión, vigencia), el índice
 *   01–04 y la leyenda legal. Sin la ilustración del modelo (es una captura del video del sitio).
 * - Hojas interiores con encabezado corrido (marca a la izquierda, sección a la derecha) y pie con
 *   el folio y «Página n de N», separados del cuerpo por filetes finos.
 * - 01 Objetivo, 02 Alcance (título del proyecto, introducción y apartados 2.1, 2.2… con párrafos y
 *   viñetas), 03 Planos a página completa y 04 Cotización (emisor, cliente, folio, fecha, validez,
 *   tabla, totales, términos y quién la elaboró).
 *
 * Todo va en vectores: pesa poco, imprime nítido y el pie lleva los datos reales y la paginación.
 *
 * Diferencia con el documento hecho a mano: los números del objetivo salen de las partidas y los
 * términos salen de lo que se cobra, así que la propuesta no puede cobrar instalación y decir
 * «solo suministro» tres párrafos abajo.
 *
 * Tipografía (`PDF_FUENTES`, SIL OFL 1.1, embebidas): Montserrat SemiBold para títulos, Inter para
 * el resto. Escala: 32 título de portada · 20 título de sección · 12 subtítulo · 10.5 cuerpo ·
 * 9.5 tabla · 8 etiquetas, encabezado y pie. Si faltan los archivos, sale con Helvetica.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Paleta, fuentes y medidas
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  /** Texto principal. */
  tinta: '#111827',
  /** Texto secundario: datos del emisor, pie, encabezado, unidades. */
  pizarra: '#475569',
  /** Etiquetas. */
  tenue: '#94A3B8',
  /** Filetes. */
  linea: '#E5E7EB',
  /** Encabezado de la tabla. */
  cabecera: '#F3F4F6',
  /** Verde de la marca: solo filetes, numerales y números de sección. */
  acento: '#1F9E84',
  blanco: '#FFFFFF',
} as const;

const F = PDF_FUENTES;

const ANCHO = 612;
const ALTO = 792;

/** Columna de las hojas interiores: márgenes de 64 pt, medida de 484 pt. */
const COL_X = 64;
const COL_DER = ANCHO - 64;
const COL_ANCHO = COL_DER - COL_X;

/** Encabezado corrido: marca de 15 pt de alto, texto en línea base 46.5 y filete debajo. */
const CABEZA = { marcaY: 36, marcaAlto: 15, base: 46.5, filete: 60 };
/** Pie: filete y renglón del folio y la paginación. */
const PIE = { filete: 748, base: 764 };

/** Apertura de sección: número, título y filete verde. */
const APERTURA = { numero: 110, titulo: 140, filete: 156 };
/** Primer renglón del cuerpo en la hoja donde empieza la sección y en las de continuación. */
const INICIO_SECCION = 184;
const INICIO_CONTINUACION = 88;
/** De aquí para abajo no entra el cuerpo. */
const LIMITE_CUERPO = 724;

/** Cuerpo: Inter 10.5 pt con renglón de 15.5 pt (≈1.5). */
const CUERPO = 10.5;
const RENGLON = 15.5;
const ENTRE_PARRAFOS = 8;

/** Datos de la empresa cuando el perfil no los trae: los de la propuesta modelo. */
const EMPRESA_POR_OMISION = {
  web: 'https://nexara.com.mx/',
  telefono: '(22) 01 79 18 71',
  telefonoAlterno: '(222) 696 0350',
  correo: 'gerencia@nexara.com.mx',
  /** Dirección del membrete de la cotización del modelo. */
  direccion: 'Santiago Momoxpan, 72775 Cholula de Rivadavia, Pue.',
  /** Dirección de la barra de contacto del modelo (la oficina). */
  oficina: 'Malltertaiment, Explanada Puebla, Cholula, Puebla 72774, México',
  nombre: 'NEXARA',
  lema: 'Conectando Ecosistemas de Tecnología',
};

const SECCIONES = [
  { numero: '01', titulo: 'Objetivo del proyecto' },
  { numero: '02', titulo: 'Alcance del proyecto' },
  { numero: '03', titulo: 'Planos' },
  { numero: '04', titulo: 'Cotización' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export type PropuestaPartida = {
  name: string;
  description?: string | null;
  unit?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type PropuestaGrupo = {
  grupo: string;
  etiqueta: string;
  subtotal: number;
  partidas: PropuestaPartida[];
};

export type PropuestaBloque = {
  /** Sin título, el bloque es la introducción del alcance y no se numera. */
  titulo: string;
  texto?: string | null;
  vinetas?: string[];
  parametros?: Record<string, unknown> | null;
};

export type PropuestaPlano = {
  url: string;
  nombre?: string | null;
  tipo?: string | null;
};

export type PropuestaEmpresa = {
  legalName?: string | null;
  tradeName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  websiteUrl?: string | null;
  fiscalAddress?: string | null;
};

export type PropuestaPayload = {
  folio: string;
  revision: number;
  issueDate: string;
  validUntil?: string | null;
  segmentoEtiqueta: string;
  cliente: {
    nombre?: string | null;
    empresa?: string | null;
    telefono?: string | null;
    correo?: string | null;
    direccion?: string | null;
  };
  proyecto?: string | null;
  objetivo: { intro: string; beneficios: string[]; cierre: string };
  alcance: PropuestaBloque[];
  planos: PropuestaPlano[];
  /** Partidas en el orden en que se imprimen; el PDF del cliente no imprime el grupo. */
  grupos: PropuestaGrupo[];
  subtotal: number;
  iva: number;
  total: number;
  currency: string;
  terminos: { titulo: string; lineas: string[] };
  participantes: Array<{ nombre: string; rolEtiqueta: string; siglas: string }>;
  empresa?: PropuestaEmpresa | null;
};

type Doc = InstanceType<typeof PDFDocument>;
type Modo = 'portada' | 'seccion' | 'plano';

const numeroMx = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cantidadMx = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** `2026-09-17` → `17 de septiembre de 2026`, sin pasar por zonas horarias. */
export function fechaLarga(valor?: string | null): string | null {
  const texto = String(valor ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  const mes = m ? MESES[Number(m[2]) - 1] : undefined;
  if (!m || !mes) return texto || null;
  return `${Number(m[3])} de ${mes} de ${m[1]}`;
}

/**
 * Datos de contacto que imprime la propuesta: los del perfil de la empresa cuando existen, los del
 * documento modelo cuando no.
 */
export function datosEmpresaPropuesta(e?: PropuestaEmpresa | null) {
  const limpio = (v?: string | null) => (v ?? '').trim() || null;
  const telefono = limpio(e?.contactPhone);
  return {
    nombre: (limpio(e?.tradeName) || EMPRESA_POR_OMISION.nombre).toUpperCase(),
    web: limpio(e?.websiteUrl) || EMPRESA_POR_OMISION.web,
    telefono: telefono || EMPRESA_POR_OMISION.telefono,
    telefonoAlterno: telefono ? null : EMPRESA_POR_OMISION.telefonoAlterno,
    correo: limpio(e?.contactEmail) || EMPRESA_POR_OMISION.correo,
    direccion: limpio(e?.fiscalAddress) || EMPRESA_POR_OMISION.direccion,
    oficina: limpio(e?.fiscalAddress) || EMPRESA_POR_OMISION.oficina,
    lema: EMPRESA_POR_OMISION.lema,
  };
}

type Empresa = ReturnType<typeof datosEmpresaPropuesta>;

/** `https://nexara.com.mx/` → `www.nexara.com.mx`. */
const dominio = (url: string) =>
  url
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/^(?!www\.)/i, 'www.');

/**
 * Archivo local de un anexo; `null` si es remoto o no existe.
 *
 * Los anexos se guardan con URL `/uploads/<carpeta>/<archivo>` (o `/<carpeta>/<archivo>` en los
 * flujos viejos) y el disco está en `UPLOADS_ROOT` o en `<raíz del repo>/uploads`, que no es el
 * directorio de trabajo del API. Por eso se prueban varias raíces antes de rendirse.
 */
function archivoDePlano(url: string): string | null {
  try {
    if (!url || /^https?:\/\//i.test(url)) return null;
    const limpio = url.split('?')[0]!.replace(/^\/+/, '');
    const sinPrefijo = limpio.replace(/^uploads\//, '');
    const raices = [
      process.env['UPLOADS_ROOT']?.trim(),
      path.resolve(process.cwd(), 'uploads'),
      path.resolve(process.cwd(), '..', 'uploads'),
      path.resolve(process.cwd(), '..', '..', 'uploads'),
    ].filter((r): r is string => Boolean(r));

    const candidatos = [path.resolve(process.cwd(), limpio), ...raices.map((raiz) => path.join(raiz, sinPrefijo))];
    for (const candidato of candidatos) {
      if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) return candidato;
    }
  } catch {
    /* un anexo ilegible no tumba la propuesta */
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marca: se lee una vez por proceso y se embebe una vez por documento
// ─────────────────────────────────────────────────────────────────────────────

type Imagen = { objeto: unknown; ancho: number; alto: number } | null;

/**
 * La marca reducida, calculada una sola vez por proceso.
 *
 * El archivo son 343×374 px y 39 KB; se imprime a 30 pt como máximo, así que 260 px de lado sobran.
 */
let marcaEnCache: Buffer | null | undefined;

function bytesDeMarca(): Buffer | null {
  if (marcaEnCache !== undefined) return marcaEnCache;
  const original = loadNexaraLogo();
  let salida = original;
  if (original) {
    try {
      salida = bufferParaPdf(original, { maxLado: 260, maxBytes: 0, conservarAlfa: true })?.datos ?? original;
    } catch {
      /* si algo falla se embebe la marca original */
    }
  }
  marcaEnCache = salida;
  return salida;
}

/**
 * `doc.image(buffer, …)` con un Buffer NO reutiliza nada: cada llamada embebe el PNG otra vez —diez
 * hojas, diez copias de la marca—. Con `doc.openImage` todas las hojas comparten el mismo XObject.
 */
function abrirMarca(doc: Doc): Imagen {
  const bytes = bytesDeMarca();
  if (!bytes) return null;
  try {
    const objeto = (doc as unknown as { openImage: (src: Buffer) => { width: number; height: number } }).openImage(bytes);
    return { objeto, ancho: objeto.width, alto: objeto.height };
  } catch {
    return null;
  }
}

/** Dibuja la marca a un alto dado; devuelve el ancho usado (0 si no hay marca). */
function dibujarMarca(doc: Doc, marca: Imagen, x: number, y: number, alto: number): number {
  if (!marca) return 0;
  const ancho = (marca.ancho / marca.alto) * alto;
  try {
    (doc as unknown as { image: (src: unknown, x: number, y: number, o: object) => void }).image(marca.objeto, x, y, {
      width: ancho,
      height: alto,
    });
    return ancho;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitivas
// ─────────────────────────────────────────────────────────────────────────────

/** Ascendente de la fuente en curso, en em: PDFKit pone la línea base a esa altura del `y` que recibe. */
const ascenso = (doc: Doc) => ((doc as unknown as { _font: { ascender: number } })._font.ascender || 718) / 1000;

/** `lineGap` que da un renglón de `renglon` pt con la fuente y el cuerpo en curso. */
const interlinea = (doc: Doc, renglon: number) => renglon - doc.currentLineHeight(false);

/** Línea base del primer renglón de un bloque de texto que empieza en `arriba`. */
function baseDesde(doc: Doc, arriba: number, fuente: string, tamano: number) {
  doc.font(fuente).fontSize(tamano);
  return arriba + ascenso(doc) * tamano;
}

type OpcionesRenglon = {
  tamano: number;
  fuente?: string;
  color?: string;
  alinear?: 'izq' | 'der' | 'centro';
  espaciado?: number;
  max?: number;
  /** Cifras de ancho fijo (`tnum`) para que las columnas de importes cuadren. */
  tabular?: boolean;
};

/**
 * Texto de un renglón en una línea base fija, sin que PDFKit lo envuelva.
 *
 * Sin `width` PDFKit no usa su LineWrapper y nunca abre una página por su cuenta: es lo que permite
 * escribir el pie (que vive debajo del margen inferior) y numerar las hojas al final.
 */
function renglon(doc: Doc, texto: string, x: number, base: number, o: OpcionesRenglon) {
  doc.font(o.fuente ?? F.texto).fontSize(o.tamano);
  const opciones = { characterSpacing: o.espaciado ?? 0, ...(o.tabular ? { features: ['tnum' as const] } : {}) };
  let tamano = o.tamano;
  let ancho = doc.widthOfString(texto, opciones);
  if (o.max && ancho > o.max) {
    tamano = Math.max(4.5, (tamano * o.max) / ancho);
    doc.fontSize(tamano);
    ancho = doc.widthOfString(texto, opciones);
  }
  const xReal = o.alinear === 'der' ? x - ancho : o.alinear === 'centro' ? x - ancho / 2 : x;
  doc.fillColor(o.color ?? C.tinta).text(texto, xReal, base - ascenso(doc) * tamano, {
    lineBreak: false,
    ...opciones,
  });
  return ancho;
}

/** Ancho de un texto con una fuente y cuerpo dados. */
function anchoDe(doc: Doc, texto: string, fuente: string, tamano: number, espaciado = 0, tabular = false) {
  doc.font(fuente).fontSize(tamano);
  return doc.widthOfString(texto, { characterSpacing: espaciado, ...(tabular ? { features: ['tnum' as const] } : {}) });
}

/** Filete horizontal. */
function filete(doc: Doc, x1: number, x2: number, y: number, color: string = C.linea, grosor = 0.6) {
  doc.save();
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(grosor).strokeColor(color).stroke();
  doc.restore();
}

/** Barra de acento (el filete verde de los títulos y del total). */
function barra(doc: Doc, x: number, y: number, ancho: number, alto: number) {
  doc.save();
  doc.rect(x, y, ancho, alto).fill(C.acento);
  doc.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado del documento
// ─────────────────────────────────────────────────────────────────────────────

type Ctx = {
  doc: Doc;
  payload: PropuestaPayload;
  empresa: Empresa;
  marca: Imagen;
  modo: Modo;
  /** Sección en curso («OBJETIVO DEL PROYECTO»); el encabezado de cada hoja la repite. */
  seccion: string | null;
  /**
   * Qué es cada hoja, para numerarlas al final. Se llena en `pageAdded`, que también ve las hojas
   * que PDFKit abre solo cuando un párrafo se desborda.
   */
  paginas: Modo[];
  pintandoMarco?: boolean;
};

/** Márgenes de las hojas interiores: el `maxY` de PDFKit queda encima del pie. */
const MARGENES_INTERIOR = {
  top: INICIO_CONTINUACION,
  bottom: ALTO - LIMITE_CUERPO,
  left: COL_X,
  right: ANCHO - COL_DER,
};

function abrirPagina(ctx: Ctx, modo: Modo, tamano?: [number, number]) {
  ctx.modo = modo;
  if (modo === 'seccion') ctx.doc.addPage({ size: 'LETTER', margins: MARGENES_INTERIOR });
  else ctx.doc.addPage({ size: tamano ?? 'LETTER', margin: 0 });
}

/** Estilo del cuerpo; también es el que hereda un párrafo que PDFKit sigue en la hoja siguiente. */
function estiloCuerpo(doc: Doc) {
  doc.font(F.texto).fontSize(CUERPO).fillColor(C.tinta);
}

/** `lineGap` del cuerpo. */
function gapCuerpo(doc: Doc) {
  estiloCuerpo(doc);
  return interlinea(doc, RENGLON);
}

// ─────────────────────────────────────────────────────────────────────────────
// Encabezado y pie de las hojas interiores
// ─────────────────────────────────────────────────────────────────────────────

/** Marca pequeña con «NEXARA» espaciado, alineados a la línea base dada. */
function firmaDeMarca(ctx: Ctx, x: number, y: number, altoMarca: number, tamano: number, espaciado: number) {
  const { doc } = ctx;
  const anchoMarca = dibujarMarca(doc, ctx.marca, x, y, altoMarca);
  const xNombre = anchoMarca ? x + anchoMarca + tamano * 0.9 : x;
  // Centro óptico: la altura de mayúsculas de Montserrat es 0.7 em.
  const base = y + altoMarca / 2 + tamano * 0.35;
  renglon(doc, ctx.empresa.nombre, xNombre, base, { tamano, fuente: F.titulo, espaciado });
  return { xNombre, base };
}

/**
 * Hoja interior: encabezado corrido (marca y sección) y pie (folio). Deja `doc.y` donde empieza el
 * cuerpo de una hoja de continuación.
 *
 * Va colgado de `pageAdded`, así que también cubre las hojas que abre PDFKit cuando un párrafo se
 * desborda: ninguna hoja interior sale sin su encabezado.
 */
function marcoDeSeccion(ctx: Ctx) {
  const { doc } = ctx;
  if (ctx.modo !== 'seccion' || ctx.pintandoMarco) return;
  ctx.pintandoMarco = true;
  try {
    firmaDeMarca(ctx, COL_X, CABEZA.marcaY, CABEZA.marcaAlto, 8, 2.4);
    if (ctx.seccion) {
      renglon(doc, ctx.seccion.toUpperCase(), COL_DER, CABEZA.base, {
        tamano: 7.5,
        fuente: F.medio,
        color: C.pizarra,
        alinear: 'der',
        espaciado: 1.2,
      });
    }
    filete(doc, COL_X, COL_DER, CABEZA.filete);

    filete(doc, COL_X, COL_DER, PIE.filete);
    renglon(doc, `Propuesta técnica  ·  ${ctx.payload.folio}`, COL_X, PIE.base, {
      tamano: 8,
      color: C.pizarra,
      max: COL_ANCHO - 120,
    });

    doc.x = COL_X;
    doc.y = INICIO_CONTINUACION;
    estiloCuerpo(doc);
  } finally {
    ctx.pintandoMarco = false;
  }
}

/** Abre la primera hoja de una sección con su número, título y filete; deja `doc.y` en el cuerpo. */
function abrirSeccion(ctx: Ctx, numero: string, titulo: string) {
  const { doc } = ctx;
  ctx.seccion = titulo;
  abrirPagina(ctx, 'seccion');
  renglon(doc, numero, COL_X, APERTURA.numero, { tamano: 11, fuente: F.semi, color: C.acento, espaciado: 1 });
  renglon(doc, titulo, COL_X, APERTURA.titulo, { tamano: 20, fuente: F.titulo, color: C.tinta, max: COL_ANCHO });
  barra(doc, COL_X, APERTURA.filete, 32, 2);
  doc.x = COL_X;
  doc.y = INICIO_SECCION;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuerpo de texto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abre hoja si lo que sigue no cabe encima del pie. Lo que ni en una hoja entera cabría solo pide
 * dos renglones: así nunca se abre una hoja que tampoco serviría.
 */
function asegurarEspacio(ctx: Ctx, alto: number) {
  const necesario = alto > LIMITE_CUERPO - INICIO_CONTINUACION ? RENGLON * 2 : alto;
  if (ctx.doc.y + necesario > LIMITE_CUERPO) abrirPagina(ctx, 'seccion');
}

function altoTexto(doc: Doc, texto: string, ancho: number, fuente: string = F.texto, tamano = CUERPO, renglonPt = RENGLON) {
  doc.font(fuente).fontSize(tamano);
  return doc.heightOfString(texto, { width: ancho, lineGap: interlinea(doc, renglonPt) });
}

/** Arranque de una lista que no se parte: el primer elemento y el comienzo del segundo. */
const ARRANQUE_DE_LISTA = RENGLON * 3.3;

/**
 * Lo que un párrafo necesita libre al pie: dos renglones, o —si presenta una lista— el párrafo
 * entero y el arranque de la lista.
 */
function reservaDeParrafo(doc: Doc, texto: string, despues: number, conSiguiente: boolean) {
  const alto = altoTexto(doc, texto, COL_ANCHO);
  return conSiguiente ? alto + despues + ARRANQUE_DE_LISTA : Math.min(alto, RENGLON * 2);
}

/**
 * Párrafo del cuerpo. Un párrafo nunca deja un renglón huérfano al pie; `conSiguiente` reserva
 * además el arranque de lo que sigue (la frase que presenta una lista no se queda sin su lista).
 */
function parrafo(ctx: Ctx, texto: string, despues = ENTRE_PARRAFOS, conSiguiente = false) {
  const { doc } = ctx;
  asegurarEspacio(ctx, reservaDeParrafo(doc, texto, despues, conSiguiente));
  const gap = gapCuerpo(doc);
  doc.text(texto, COL_X, doc.y, { width: COL_ANCHO, lineGap: gap });
  doc.y += despues;
}

/**
 * El elemento con el que viaja el `i`-ésimo de una lista: el primero viaja con el segundo (una lista
 * no arranca con un elemento solo al pie) y el penúltimo con el último (ni termina con uno solo en
 * la hoja siguiente).
 */
const conQuienViaja = (lista: string[], i: number) =>
  lista.length > 1 && (i === 0 || i === lista.length - 2) ? lista[i + 1] : undefined;

/**
 * Lo que un elemento de lista necesita libre al pie: sus dos primeros renglones, o —si viaja con el
 * siguiente (`conQuienViaja`)— todo él más el arranque del siguiente.
 */
function reservaDeLista(doc: Doc, texto: string, ancho: number, ultimo?: string) {
  const alto = altoTexto(doc, texto, ancho);
  if (ultimo === undefined) return Math.min(alto, RENGLON * 2);
  return alto + 6 + Math.min(altoTexto(doc, ultimo, ancho), RENGLON * 2);
}

/** Elemento numerado (beneficios): numeral verde alineado a la derecha y texto con sangría francesa. */
function elementoNumerado(ctx: Ctx, numero: number, texto: string, ultimo?: string) {
  const { doc } = ctx;
  const xTexto = COL_X + 24;
  const ancho = COL_DER - xTexto;
  asegurarEspacio(ctx, reservaDeLista(doc, texto, ancho, ultimo));
  const y = doc.y;
  renglon(doc, `${numero}.`, xTexto - 9, baseDesde(doc, y, F.texto, CUERPO), {
    tamano: CUERPO,
    fuente: F.semi,
    color: C.acento,
    alinear: 'der',
    tabular: true,
  });
  const gap = gapCuerpo(doc);
  doc.text(texto, xTexto, y, { width: ancho, lineGap: gap });
  doc.x = COL_X;
  doc.y += 6;
}

/** Viñeta: cuadrito verde a la altura de las minúsculas y el texto con sangría francesa. */
function vineta(ctx: Ctx, texto: string, ultimo?: string, o?: { tamano?: number; renglon?: number }) {
  const { doc } = ctx;
  const tamano = o?.tamano ?? CUERPO;
  const renglonPt = o?.renglon ?? RENGLON;
  const xTexto = COL_X + 16;
  const ancho = COL_DER - xTexto;
  asegurarEspacio(ctx, reservaDeLista(doc, texto, ancho, ultimo));
  const y = doc.y;
  cuadrito(doc, COL_X + 3, baseDesde(doc, y, F.texto, tamano), tamano);
  doc.font(F.texto).fontSize(tamano).fillColor(C.tinta);
  doc.text(texto, xTexto, y, { width: ancho, lineGap: interlinea(doc, renglonPt) });
  doc.x = COL_X;
  doc.y += 3;
}

/** Cuadrito de viñeta centrado en la altura de las minúsculas (0.55 em en Inter). */
function cuadrito(doc: Doc, x: number, base: number, tamano: number) {
  const lado = Math.max(2.6, tamano * 0.3);
  doc.save();
  doc.rect(x, base - tamano * 0.275 - lado / 2, lado, lado).fill(C.acento);
  doc.restore();
}

/** Párrafos de un texto libre: cada salto de línea es un párrafo nuevo. */
const parrafosDe = (texto?: string | null) =>
  String(texto ?? '')
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

/** «Etiqueta: resto» → ['Etiqueta', 'resto'] cuando la etiqueta es corta; si no, `null`. */
function conEtiqueta(texto: string): [string, string] | null {
  const m = /^([^:.]{3,32}):\s+(.+)$/s.exec(texto.trim());
  if (!m) return null;
  const resto = m[2]!.trim();
  return [m[1]!.trim(), resto.charAt(0).toUpperCase() + resto.slice(1)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Portada
// ─────────────────────────────────────────────────────────────────────────────

/** Renglones de un texto partido palabra por palabra al ancho dado, con la fuente en curso. */
function partirEnRenglones(doc: Doc, texto: string, ancho: number): string[] {
  const renglones: string[] = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && doc.widthOfString(prueba) > ancho) {
      renglones.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) renglones.push(actual);
  return renglones;
}

/**
 * Título de la portada: el cuerpo más grande (32 → 24 pt) con el que cabe en tres renglones sin
 * dejar una palabra sola en el último. Si no hay forma, baja una palabra al último renglón; un
 * nombre muy largo va a 24 pt en cuatro renglones y, si ni así cabe, el cuarto termina en «…».
 */
function tituloDePortada(doc: Doc, texto: string, ancho: number): { tamano: number; renglones: string[] } {
  const viuda = (r: string[]) => r.length > 1 && !/\s/.test(r[r.length - 1]!);
  let sinViuda: { tamano: number; renglones: string[] } | null = null;
  for (const tamano of [32, 30, 28, 26, 24]) {
    doc.font(F.titulo).fontSize(tamano);
    const renglones = partirEnRenglones(doc, texto, ancho);
    if (renglones.length > 3) continue;
    if (!viuda(renglones)) return { tamano, renglones };
    if (!sinViuda) {
      const previo = renglones[renglones.length - 2]!.split(' ');
      if (previo.length > 1) {
        const bajada = previo.pop()!;
        const arreglados = [...renglones.slice(0, -2), previo.join(' '), `${bajada} ${renglones[renglones.length - 1]}`];
        if (doc.widthOfString(arreglados[arreglados.length - 1]!) <= ancho) sinViuda = { tamano, renglones: arreglados };
      }
    }
  }
  if (sinViuda) return sinViuda;
  doc.font(F.titulo).fontSize(24);
  const todos = partirEnRenglones(doc, texto, ancho);
  if (todos.length <= 4) return { tamano: 24, renglones: todos };
  const renglones = todos.slice(0, 4);
  let ultimo = renglones[3]!;
  while (ultimo.includes(' ') && doc.widthOfString(`${ultimo}…`) > ancho) ultimo = ultimo.replace(/\s+\S+$/, '');
  renglones[3] = `${ultimo.replace(/[\s,.;:]+$/, '')}…`;
  return { tamano: 24, renglones };
}

/**
 * Portada blanca: la marca pequeña arriba, el proyecto como protagonista, el cliente, una rejilla
 * de datos, el índice y la leyenda legal.
 */
function portada(ctx: Ctx, indice: Array<{ numero: string; titulo: string; nota?: string }>) {
  const { doc, payload, empresa } = ctx;
  abrirPagina(ctx, 'portada');
  const X = COL_X;

  // Marca, nombre y lema.
  const { xNombre } = firmaDeMarca(ctx, X, 58, 30, 12.5, 4.2);
  renglon(doc, empresa.lema.toUpperCase(), xNombre + 0.5, 58 + 30 + 1, {
    tamano: 6.5,
    fuente: F.medio,
    color: C.tenue,
    espaciado: 1.3,
  });

  // «PROPUESTA TÉCNICA», el proyecto y el cliente.
  const cliente = payload.cliente.empresa?.trim() || payload.cliente.nombre?.trim() || '';
  const proyecto = payload.proyecto?.trim() || '';
  renglon(doc, 'PROPUESTA TÉCNICA', X, 236, { tamano: 9, fuente: F.semi, color: C.acento, espaciado: 2.4 });

  const anchoTitulo = 440;
  const titulo = proyecto || `Propuesta de solución para ${cliente || 'su proyecto'}`;
  const t = tituloDePortada(doc, titulo, anchoTitulo);
  const interlineaTitulo = t.tamano * 1.16;
  let base = 250 + t.tamano * 0.97;
  for (const linea of t.renglones) {
    renglon(doc, linea, X, base, { tamano: t.tamano, fuente: F.titulo, color: C.tinta });
    base += interlineaTitulo;
  }
  let y = base - interlineaTitulo + 16;

  if (cliente) {
    doc.font(F.texto).fontSize(14).fillColor(C.pizarra);
    const gap = interlinea(doc, 19);
    const alto = Math.min(doc.heightOfString(cliente, { width: anchoTitulo, lineGap: gap }), 38);
    doc.text(cliente, X, y, { width: anchoTitulo, lineGap: gap, height: alto + 1, ellipsis: true });
    y += alto;
  }
  barra(doc, X, y + 18, 48, 2);

  // Rejilla de datos: dos columnas, etiqueta pequeña y valor.
  const yRejilla = 488;
  filete(doc, X, COL_DER, yRejilla);
  const anchoCelda = (COL_ANCHO - 28) / 2;
  const celdas: Array<[string, string]> = [
    ['Preparada para', cliente || '—'],
    ['Proyecto', proyecto || '—'],
    ['Folio', payload.folio],
    ['Fecha de emisión', fechaLarga(payload.issueDate) ?? '—'],
    ['Versión', `${Math.max(1, Math.trunc(Number(payload.revision) || 1))}.0`],
    ['Vigencia', fechaLarga(payload.validUntil) ?? 'Sujeta a confirmación'],
  ];
  const renglonValor = 14.5;
  let yFila = yRejilla + 22;
  for (let i = 0; i < celdas.length; i += 2) {
    let altoFila = 0;
    for (const [j, [etiqueta, valor]] of [celdas[i]!, celdas[i + 1]!].entries()) {
      const x = X + j * (anchoCelda + 28);
      renglon(doc, etiqueta.toUpperCase(), x, yFila, { tamano: 7.5, fuente: F.medio, color: C.tenue, espaciado: 1.3 });
      doc.font(F.texto).fontSize(11).fillColor(C.tinta);
      const gap = interlinea(doc, renglonValor);
      const alto = Math.min(doc.heightOfString(valor, { width: anchoCelda, lineGap: gap }), renglonValor * 3);
      doc.text(valor, x, yFila + 7, { width: anchoCelda, lineGap: gap, height: alto + 1, ellipsis: true });
      altoFila = Math.max(altoFila, alto);
    }
    yFila += 7 + altoFila + 20;
  }

  // Índice: una franja discreta de cuatro columnas.
  const yIndice = Math.max(yFila + 2, 656);
  filete(doc, X, COL_DER, yIndice);
  const anchoIndice = COL_ANCHO / indice.length;
  indice.forEach(({ numero, titulo: nombre, nota }, i) => {
    const x = X + i * anchoIndice;
    const apagada = Boolean(nota);
    renglon(doc, numero, x, yIndice + 20, {
      tamano: 9,
      fuente: F.semi,
      color: apagada ? C.tenue : C.acento,
      espaciado: 0.8,
    });
    renglon(doc, nombre, x, yIndice + 34, {
      tamano: 8.5,
      fuente: F.medio,
      color: apagada ? C.tenue : C.tinta,
      max: anchoIndice - 12,
    });
    if (nota) {
      renglon(doc, nota.replace(/^·\s*/, ''), x, yIndice + 46, { tamano: 7, color: C.tenue, max: anchoIndice - 12 });
    }
  });

  // La oficina (la barra de contacto del modelo) y la leyenda legal.
  if (empresa.oficina !== empresa.direccion) {
    renglon(doc, empresa.oficina, X, 739, { tamano: 8, color: C.tenue, max: COL_ANCHO });
  }
  renglon(doc, `${dominio(empresa.web)}  ·  Propuesta técnica sujeta a contratación formal.`, X, 752, {
    tamano: 8,
    color: C.pizarra,
    max: COL_ANCHO,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 01 Objetivo y 02 Alcance
// ─────────────────────────────────────────────────────────────────────────────

function seccionObjetivo(ctx: Ctx) {
  const { payload } = ctx;
  abrirSeccion(ctx, '01', 'Objetivo del proyecto');

  for (const texto of parrafosDe(payload.objetivo.intro)) parrafo(ctx, texto);

  const beneficios = payload.objetivo.beneficios.map((b) => b.trim()).filter(Boolean);
  if (beneficios.length) {
    parrafo(ctx, 'Entre los principales beneficios se encuentran:', 7, true);
    beneficios.forEach((beneficio, i) => elementoNumerado(ctx, i + 1, beneficio, conQuienViaja(beneficios, i)));
    ctx.doc.y += ENTRE_PARRAFOS - 4;
  }

  for (const texto of parrafosDe(payload.objetivo.cierre)) parrafo(ctx, texto);
}

/**
 * 02: el nombre del proyecto como título, la introducción (bloques sin título) y los apartados
 * numerados («2.1 Modernización del sistema de grabación») con sus párrafos y viñetas. Sin bloques
 * la sección no se imprime y el índice de la portada lo dice.
 */
function seccionAlcance(ctx: Ctx) {
  const { doc, payload } = ctx;
  const bloques = payload.alcance.filter(
    (b) => b && (b.titulo?.trim() || b.texto?.trim() || (b.vinetas ?? []).some((v) => String(v).trim())),
  );
  if (!bloques.length) return;

  abrirSeccion(ctx, '02', 'Alcance del proyecto');

  const proyecto = payload.proyecto?.trim();
  if (proyecto) {
    doc.font(F.titulo).fontSize(13.5).fillColor(C.tinta);
    doc.text(proyecto, COL_X, doc.y, { width: COL_ANCHO, lineGap: interlinea(doc, 19) });
    doc.y += 10;
  }

  const SUBTITULO = 12;
  const sangria = 34;
  let numero = 0;
  for (const bloque of bloques) {
    const titulo = bloque.titulo?.trim();
    const parrafos = parrafosDe(bloque.texto);
    const vinetas = (bloque.vinetas ?? []).map((v) => String(v).trim()).filter(Boolean);

    if (titulo) {
      numero += 1;
      doc.y += 10;
      // El subtítulo no se queda solo al pie: viaja con lo que le sigue, y si lo que sigue es la
      // frase que presenta una lista, también con el arranque de la lista.
      const alto = altoTexto(doc, titulo, COL_ANCHO - sangria, F.titulo, SUBTITULO, 16);
      const siguiente = parrafos.length
        ? reservaDeParrafo(doc, parrafos[0]!, ENTRE_PARRAFOS, parrafos.length === 1 && vinetas.length > 0)
        : vinetas.length
          ? ARRANQUE_DE_LISTA
          : 0;
      asegurarEspacio(ctx, alto + 6 + siguiente);
      const y = doc.y;
      renglon(doc, `2.${numero}`, COL_X, baseDesde(doc, y, F.titulo, SUBTITULO), {
        tamano: SUBTITULO,
        fuente: F.titulo,
        color: C.acento,
        tabular: true,
      });
      doc.font(F.titulo).fontSize(SUBTITULO).fillColor(C.tinta);
      doc.text(titulo, COL_X + sangria, y, { width: COL_ANCHO - sangria, lineGap: interlinea(doc, 16) });
      doc.x = COL_X;
      doc.y += 6;
    }
    parrafos.forEach((texto, i) =>
      parrafo(ctx, texto, ENTRE_PARRAFOS, i === parrafos.length - 1 && vinetas.length > 0),
    );
    if (vinetas.length) {
      vinetas.forEach((v, i) => vineta(ctx, v, conQuienViaja(vinetas, i)));
      doc.y += ENTRE_PARRAFOS - 3;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 03 Planos
// ─────────────────────────────────────────────────────────────────────────────

/** Lado mayor de la hoja de un plano: 17 in, el tabloide de los planos de CAD. */
const LADO_PLANO = 1224;
/** Franja inferior de la hoja del plano (sección, nombre y número de página). */
const FRANJA_PLANO = 34;

type Planos = {
  imagenes: Array<{ nombre: string; imagen: NonNullable<ReturnType<typeof imagenParaPdf>> }>;
  /** Anexos que no son imagen local (PDF, enlaces o archivos que no están en disco). */
  otros: string[];
};

/**
 * Anexos listos para imprimir, preparados antes de la portada para que su índice diga exactamente
 * lo que trae el documento.
 */
function prepararPlanos(planos: PropuestaPlano[]): Planos {
  const vistos = new Set<string>();
  const listos: Planos = { imagenes: [], otros: [] };
  for (const plano of planos) {
    if (!plano?.url || vistos.has(plano.url)) continue;
    vistos.add(plano.url);
    const nombre = plano.nombre?.trim() || plano.url;
    const archivo = archivoDePlano(plano.url);
    const imagen = archivo && /\.(png|jpe?g)$/i.test(archivo) ? imagenParaPdf(archivo, { maxLado: 1600 }) : null;
    if (imagen?.ancho && imagen.alto) listos.imagenes.push({ nombre, imagen });
    else listos.otros.push(nombre);
  }
  return listos;
}

/**
 * Cada plano a página completa y a su propia proporción, con una franja fina abajo para la sección
 * y el número de página; el plano trae su propio marco y cuadro de datos, como el CCTV-01 del
 * modelo. Los anexos que no son imagen (PDF o enlaces) se enlistan en una hoja «03».
 */
function seccionPlanos(ctx: Ctx, planos: Planos) {
  const { doc } = ctx;
  for (const { nombre, imagen: preparada } of planos.imagenes) {
    const escala = LADO_PLANO / Math.max(preparada.ancho, preparada.alto);
    const ancho = Math.round(preparada.ancho * escala);
    const alto = Math.round(preparada.alto * escala);
    abrirPagina(ctx, 'plano', [ancho, alto + FRANJA_PLANO]);
    try {
      doc.image(preparada.datos, 0, 0, { width: ancho, height: alto });
    } catch {
      /* un plano corrupto deja su hoja en blanco, no tumba la propuesta */
    }
    doc.save();
    doc.rect(0, alto, ancho, FRANJA_PLANO).fill(C.blanco);
    doc.restore();
    filete(doc, 0, ancho, alto, C.linea, 0.8);
    const base = alto + FRANJA_PLANO / 2 + 3.5;
    const ancho03 = renglon(doc, '03', 28, base, { tamano: 10, fuente: F.semi, color: C.acento, espaciado: 1 });
    renglon(doc, `PLANOS  ·  ${nombre.toUpperCase()}`, 28 + ancho03 + 12, base, {
      tamano: 9,
      fuente: F.medio,
      color: C.pizarra,
      espaciado: 1.2,
      max: ancho * 0.6,
    });
  }

  const nombres = planos.otros;
  if (!nombres.length) return;

  abrirSeccion(ctx, '03', 'Planos');
  parrafo(ctx, 'Anexos que acompañan a esta propuesta:', 7, true);
  nombres.forEach((n, i) => vineta(ctx, n, conQuienViaja(nombres, i)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 04 Cotización
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNAS = (() => {
  const definicion: Array<[string, number, 'izq' | 'centro' | 'der']> = [
    ['DESCRIPCIÓN', 228, 'izq'],
    ['UNIDAD', 50, 'centro'],
    ['CANTIDAD', 54, 'centro'],
    ['PRECIO', 72, 'der'],
    ['TOTAL', 80, 'der'],
  ];
  let x = COL_X;
  return definicion.map(([titulo, ancho, alinear]) => {
    const col = { titulo, x, ancho, alinear };
    x += ancho;
    return col;
  });
})();

/** Filas de la tabla: descripción 9.5 pt; importes 9 pt con cifras tabulares. */
const FILA = { tamano: 9.5, importe: 9, relleno: 7.5, renglon: 13, minimo: 27, pad: 8 };
const ENCABEZADO_TABLA = 24;

function encabezadoTabla(doc: Doc, y: number) {
  doc.save();
  doc.rect(COL_X, y, COL_ANCHO, ENCABEZADO_TABLA).fill(C.cabecera);
  doc.restore();
  for (const col of COLUMNAS) {
    const base = y + ENCABEZADO_TABLA / 2 + 2.6;
    const x =
      col.alinear === 'izq' ? col.x + FILA.pad : col.alinear === 'der' ? col.x + col.ancho - FILA.pad : col.x + col.ancho / 2;
    renglon(doc, col.titulo, x, base, {
      tamano: 7.5,
      fuente: F.semi,
      color: C.pizarra,
      espaciado: 1,
      alinear: col.alinear,
      max: col.ancho - 10,
    });
  }
  return y + ENCABEZADO_TABLA;
}

/** Importe con el signo a la izquierda de la celda y la cifra tabular alineada a la derecha. */
function importe(doc: Doc, valor: number, x: number, ancho: number, base: number, tamano: number) {
  const cifra = numeroMx.format(Number(valor) || 0);
  renglon(doc, '$', x + FILA.pad, base, { tamano, color: C.pizarra });
  renglon(doc, cifra, x + ancho - FILA.pad, base, {
    tamano,
    color: C.tinta,
    alinear: 'der',
    max: ancho - FILA.pad * 2 - 8,
    tabular: true,
  });
}

/**
 * Recuadro de datos con filete de 1 pt y sin relleno: título en versalitas y pares etiqueta/valor
 * apilados. Devuelve el alto que ocupa (o que ocuparía, con `medir`).
 */
function recuadro(
  doc: Doc,
  x: number,
  y: number,
  ancho: number,
  titulo: string,
  filas: Array<[string, string, boolean?]>,
  o: { alto?: number; medir?: boolean } = {},
) {
  const pad = 14;
  const anchoValor = ancho - pad * 2;
  const renglonValor = 13.5;
  const entreFilas = 6;
  const baseTitulo = y + pad + 6;
  let cursor = baseTitulo + 11;
  const posiciones: Array<{ base: number; arriba: number; alto: number }> = [];
  for (const [etiqueta, valor, fuerte] of filas) {
    // Con etiqueta: la etiqueta (8 pt) y debajo el valor; sin ella, el valor solo (el nombre del cliente).
    const base = cursor + (etiqueta ? 7 : 0);
    const arriba = etiqueta ? base + 3.5 : cursor;
    doc.font(fuerte ? F.semi : F.texto).fontSize(10);
    const gap = interlinea(doc, renglonValor);
    const alto = Math.min(doc.heightOfString(valor || '—', { width: anchoValor, lineGap: gap }), renglonValor * 3);
    posiciones.push({ base, arriba, alto });
    cursor = arriba + alto + entreFilas;
  }
  // `heightOfString` cuenta el interlineado bajo el último renglón (~1.4 pt), que no se ve.
  const altoTotal = Math.max(o.alto ?? 0, cursor - entreFilas - 1.4 + pad - 2 - y);
  if (o.medir) return altoTotal;

  doc.save();
  doc.rect(x + 0.5, y + 0.5, ancho - 1, altoTotal - 1).lineWidth(1).strokeColor(C.linea).stroke();
  doc.restore();
  renglon(doc, titulo.toUpperCase(), x + pad, baseTitulo, {
    tamano: 7.5,
    fuente: F.semi,
    color: C.pizarra,
    espaciado: 1.2,
  });
  filas.forEach(([etiqueta, valor, fuerte], i) => {
    const p = posiciones[i]!;
    if (etiqueta) renglon(doc, etiqueta, x + pad, p.base, { tamano: 8, color: C.tenue });
    doc.font(fuerte ? F.semi : F.texto).fontSize(10).fillColor(C.tinta);
    const gap = interlinea(doc, renglonValor);
    doc.text(valor || '—', x + pad, p.arriba, { width: anchoValor, lineGap: gap, height: p.alto + 1, ellipsis: true });
  });
  return altoTotal;
}

function seccionCotizacion(ctx: Ctx) {
  const { doc, payload, empresa } = ctx;
  abrirSeccion(ctx, '04', 'Cotización');

  // Emisor, alineado a la derecha frente al título, como el membrete de la cotización del modelo.
  const telefonos = empresa.telefonoAlterno ? `${empresa.telefono}  /  ${empresa.telefonoAlterno}` : empresa.telefono;
  const emisor = [empresa.direccion, `Correo electrónico: ${empresa.correo}`, `Teléfonos: ${telefonos}`];
  emisor.forEach((linea, i) =>
    renglon(doc, linea, COL_DER, APERTURA.numero + i * 13, {
      tamano: 8.5,
      color: C.pizarra,
      alinear: 'der',
      max: COL_ANCHO - 200,
    }),
  );

  // Cliente y datos de la cotización.
  const yRecuadros = INICIO_SECCION;
  const cliente = payload.cliente;
  const razon = cliente.empresa?.trim() || '';
  const contacto = cliente.nombre?.trim() || '';
  const filasCliente: Array<[string, string, boolean?]> = [['', razon || contacto, true]];
  if (razon && contacto && razon !== contacto) filasCliente.push(['Atención', contacto]);
  filasCliente.push(['Teléfono', cliente.telefono?.trim() || '']);
  if (cliente.correo?.trim()) filasCliente.push(['Correo', cliente.correo.trim()]);
  const filasDatos: Array<[string, string, boolean?]> = [
    ['Cotización N°', payload.folio, true],
    ['Fecha de emisión', fechaLarga(payload.issueDate) ?? ''],
    ['Validez', fechaLarga(payload.validUntil) ?? 'Sujeta a confirmación'],
  ];
  const separacion = 16;
  const anchoRecuadro = (COL_ANCHO - separacion) / 2;
  const xDatos = COL_X + anchoRecuadro + separacion;
  const alto = Math.max(
    recuadro(doc, COL_X, yRecuadros, anchoRecuadro, 'Cliente', filasCliente, { medir: true }),
    recuadro(doc, xDatos, yRecuadros, anchoRecuadro, 'Datos de la cotización', filasDatos, { medir: true }),
  );
  recuadro(doc, COL_X, yRecuadros, anchoRecuadro, 'Cliente', filasCliente, { alto });
  recuadro(doc, xDatos, yRecuadros, anchoRecuadro, 'Datos de la cotización', filasDatos, { alto });

  let y = encabezadoTabla(doc, yRecuadros + alto + 24);

  // Las partidas van seguidas, sin subtotales por grupo (el modelo no los tiene).
  const partidas = payload.grupos.flatMap((g) => g.partidas);
  const anchoDescripcion = COLUMNAS[0]!.ancho - FILA.pad * 2;
  const nuevaHojaDeTabla = () => {
    abrirPagina(ctx, 'seccion');
    return encabezadoTabla(doc, INICIO_CONTINUACION);
  };
  // Los totales nunca quedan solos en una hoja: viajan con la última partida.
  const altoFilaTotal = 24;
  const altoTotales = 12 + altoFilaTotal * 2 + 34;

  partidas.forEach((partida, i) => {
    const nombre = String(partida.name ?? '').trim();
    const descripcion = String(partida.description ?? '').trim();
    const detalle = descripcion && descripcion !== nombre ? descripcion : '';
    doc.font(detalle ? F.medio : F.texto).fontSize(FILA.tamano);
    const gapNombre = interlinea(doc, FILA.renglon);
    const altoNombre = nombre ? doc.heightOfString(nombre, { width: anchoDescripcion, lineGap: gapNombre }) - gapNombre : 0;
    doc.font(F.texto).fontSize(FILA.tamano - 1);
    const gapDetalle = interlinea(doc, FILA.renglon - 1);
    const altoDetalle = detalle
      ? doc.heightOfString(detalle, { width: anchoDescripcion, lineGap: gapDetalle }) - gapDetalle + 3
      : 0;
    const alto = Math.max(FILA.minimo, altoNombre + altoDetalle + FILA.relleno * 2);

    const reserva = i === partidas.length - 1 ? altoTotales : 0;
    if (y + alto + reserva > LIMITE_CUERPO) y = nuevaHojaDeTabla();

    filete(doc, COL_X, COL_DER, y + alto);

    const yTexto = y + FILA.relleno;
    if (nombre) {
      doc.font(detalle ? F.medio : F.texto).fontSize(FILA.tamano).fillColor(C.tinta);
      doc.text(nombre, COLUMNAS[0]!.x + FILA.pad, yTexto, { width: anchoDescripcion, lineGap: gapNombre });
    }
    if (detalle) {
      doc.font(F.texto).fontSize(FILA.tamano - 1).fillColor(C.pizarra);
      doc.text(detalle, COLUMNAS[0]!.x + FILA.pad, yTexto + altoNombre + 3, {
        width: anchoDescripcion,
        lineGap: gapDetalle,
      });
    }
    // Unidad, cantidad e importes en la línea base del primer renglón de la descripción.
    const base = baseDesde(doc, yTexto, detalle ? F.medio : F.texto, FILA.tamano);
    renglon(doc, partida.unit?.trim() || 'Pieza', COLUMNAS[1]!.x + COLUMNAS[1]!.ancho / 2, base, {
      tamano: FILA.importe,
      color: C.pizarra,
      alinear: 'centro',
      max: COLUMNAS[1]!.ancho - 8,
    });
    renglon(doc, cantidadMx.format(Number(partida.qty) || 0), COLUMNAS[2]!.x + COLUMNAS[2]!.ancho / 2, base, {
      tamano: FILA.importe,
      alinear: 'centro',
      tabular: true,
    });
    importe(doc, partida.unitPrice, COLUMNAS[3]!.x, COLUMNAS[3]!.ancho, base, FILA.importe);
    importe(doc, partida.lineTotal, COLUMNAS[4]!.x, COLUMNAS[4]!.ancho, base, FILA.importe);
    y += alto;
  });
  if (!partidas.length) {
    renglon(doc, 'Sin partidas capturadas.', COL_X + FILA.pad, y + 18, { tamano: FILA.tamano, color: C.pizarra });
    filete(doc, COL_X, COL_DER, y + FILA.minimo);
    y += FILA.minimo;
  }

  // Totales a la derecha, con el signo de pesos en una sola columna; nota de moneda a la izquierda.
  y += 12;
  const totX = COLUMNAS[3]!.x - 34;
  const cifraTotal = numeroMx.format(Number(payload.total) || 0);
  const anchoCifras = Math.max(
    anchoDe(doc, cifraTotal, F.fuerte, 12, 0, true),
    anchoDe(doc, numeroMx.format(Number(payload.subtotal) || 0), F.texto, 10, 0, true),
  );
  const xSigno = COL_DER - FILA.pad - anchoCifras - 14;
  const filasTotales: Array<[string, number]> = [
    ['SUBTOTAL', payload.subtotal],
    ['IVA', payload.iva],
  ];
  filasTotales.forEach(([etiqueta, valor], i) => {
    const fy = y + i * altoFilaTotal;
    // El filete bajo el IVA lo pone el filete verde del total.
    if (i === 0) filete(doc, totX, COL_DER, fy);
    if (i < filasTotales.length - 1) filete(doc, totX, COL_DER, fy + altoFilaTotal);
    const base = fy + altoFilaTotal / 2 + 3.4;
    renglon(doc, etiqueta, totX + FILA.pad, base, { tamano: 7.5, fuente: F.semi, color: C.pizarra, espaciado: 1.2 });
    renglon(doc, '$', xSigno, base, { tamano: 10, color: C.pizarra });
    renglon(doc, numeroMx.format(Number(valor) || 0), COL_DER - FILA.pad, base, {
      tamano: 10,
      alinear: 'der',
      tabular: true,
    });
  });
  const yTotal = y + altoFilaTotal * filasTotales.length;
  barra(doc, totX, yTotal, COL_DER - totX, 2);
  const baseTotal = yTotal + 23;
  renglon(doc, 'TOTAL', totX + FILA.pad, baseTotal, { tamano: 9, fuente: F.fuerte, color: C.tinta, espaciado: 1.4 });
  renglon(doc, '$', xSigno, baseTotal, { tamano: 12, fuente: F.fuerte, color: C.tinta });
  renglon(doc, cifraTotal, COL_DER - FILA.pad, baseTotal, { tamano: 12, fuente: F.fuerte, alinear: 'der', tabular: true });
  renglon(doc, `Importes en ${payload.currency || 'MXN'}.`, COL_X, y + altoFilaTotal / 2 + 3.4, {
    tamano: 8,
    color: C.pizarra,
  });
  doc.x = COL_X;
  doc.y = baseTotal + 30;

  // Términos y condiciones y firma: van juntos a la hoja siguiente si ahí caben enteros.
  const lineas = payload.terminos.lineas.map((l) => l.trim()).filter(Boolean);
  const participantes = payload.participantes.filter((p) => p?.nombre?.trim());
  const TAMANO_TERMINOS = 9;
  const RENGLON_TERMINOS = 13.5;
  const xTerminos = COL_X + 16;
  const textoDeTermino = (linea: string) => {
    const partes = conEtiqueta(linea);
    return partes ? `${partes[0]}. ${partes[1]}` : linea;
  };
  // Alto real: encabezado, cada término con su separación (sin la del último) y la firma hasta el
  // renglón del cargo.
  const altoCierre =
    (lineas.length
      ? 26 +
        lineas.reduce(
          (acc, l) => acc + altoTexto(doc, textoDeTermino(l), COL_DER - xTerminos, F.texto, TAMANO_TERMINOS, RENGLON_TERMINOS) + 5,
          -5,
        )
      : 0) + (participantes.length ? 44 + (Math.ceil(participantes.length / 3) - 1) * 48 + 28 : 0);
  if (doc.y + altoCierre > LIMITE_CUERPO && altoCierre <= LIMITE_CUERPO - INICIO_CONTINUACION) {
    abrirPagina(ctx, 'seccion');
  }

  // Términos y condiciones: cada renglón con su etiqueta en negritas.
  if (lineas.length) {
    asegurarEspacio(ctx, 30 + 30);
    renglon(doc, payload.terminos.titulo.toUpperCase(), COL_X, doc.y + 7, {
      tamano: 8.5,
      fuente: F.semi,
      color: C.tinta,
      espaciado: 1.4,
    });
    filete(doc, COL_X, COL_DER, doc.y + 15);
    doc.y += 26;
    const xTexto = xTerminos;
    const anchoTexto = COL_DER - xTexto;
    for (const linea of lineas) {
      const partes = conEtiqueta(linea);
      const alto = altoTexto(doc, textoDeTermino(linea), anchoTexto, F.texto, TAMANO_TERMINOS, RENGLON_TERMINOS);
      asegurarEspacio(ctx, Math.min(alto, RENGLON_TERMINOS * 2));
      const y0 = doc.y;
      cuadrito(doc, COL_X + 3, baseDesde(doc, y0, F.texto, TAMANO_TERMINOS), TAMANO_TERMINOS);
      doc.font(F.texto).fontSize(TAMANO_TERMINOS);
      const gap = interlinea(doc, RENGLON_TERMINOS);
      if (partes) {
        doc.font(F.semi).fillColor(C.tinta).text(`${partes[0]}. `, xTexto, y0, {
          width: anchoTexto,
          lineGap: gap,
          continued: true,
        });
        doc.font(F.texto).fillColor(C.tinta).text(partes[1]);
      } else {
        doc.fillColor(C.tinta).text(linea, xTexto, y0, { width: anchoTexto, lineGap: gap });
      }
      doc.x = COL_X;
      doc.y += 5;
    }
  }

  // Quién la elaboró, con línea de firma.
  if (participantes.length) {
    const porFila = 3;
    const anchoFirma = (COL_ANCHO - 28 * (porFila - 1)) / porFila;
    const filasFirma = Math.ceil(participantes.length / porFila);
    asegurarEspacio(ctx, 44 + (filasFirma - 1) * 48 + 28);
    let yf = doc.y + 44;
    participantes.forEach((p, i) => {
      const col = i % porFila;
      if (i > 0 && col === 0) yf += 48;
      const x = COL_X + col * (anchoFirma + 28);
      filete(doc, x, x + anchoFirma, yf, C.tenue, 0.6);
      renglon(doc, p.nombre.trim(), x, yf + 14, { tamano: 9.5, fuente: F.semi, max: anchoFirma });
      renglon(doc, p.rolEtiqueta?.trim() || 'Elaboró', x, yf + 26, { tamano: 8, color: C.pizarra, max: anchoFirma });
    });
    doc.y = yf + 30;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeración
// ─────────────────────────────────────────────────────────────────────────────

/** «Página n de N» en todas las hojas menos la portada; se escribe al final, ya con el total. */
function numerarPaginas(ctx: Ctx) {
  const { doc } = ctx;
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i += 1) {
    const modo = ctx.paginas[i];
    if (!modo || modo === 'portada') continue;
    doc.switchToPage(start + i);
    const texto = `Página ${i + 1} de ${count}`;
    if (modo === 'plano') {
      const { width, height } = doc.page;
      renglon(doc, texto, width - 28, height - FRANJA_PLANO / 2 + 3.5, {
        tamano: 9,
        fuente: F.medio,
        color: C.pizarra,
        alinear: 'der',
        tabular: true,
      });
    } else {
      renglon(doc, texto, COL_DER, PIE.base, { tamano: 8, color: C.pizarra, alinear: 'der', tabular: true });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/** Documento completo, listo para adjuntar al correo o descargar. */
export async function generarPropuestaTecnicaPdf(payload: PropuestaPayload): Promise<Buffer> {
  const empresa = datosEmpresaPropuesta(payload.empresa);
  // `bufferPages` solo para escribir «Página n de N» al final: el total no se sabe antes.
  const doc = new PDFDocument({ size: 'LETTER', margins: MARGENES_INTERIOR, autoFirstPage: false, bufferPages: true });
  doc.info.Title = `Propuesta técnica ${payload.folio}`;
  doc.info.Author = empresa.nombre;
  registrarFuentesCorporativas(doc);

  const trozos: Buffer[] = [];
  doc.on('data', (trozo: Buffer) => trozos.push(trozo));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
  });

  const ctx: Ctx = {
    doc,
    payload,
    empresa,
    marca: abrirMarca(doc),
    modo: 'portada',
    seccion: null,
    paginas: [],
  };

  doc.on('pageAdded', () => {
    ctx.paginas.push(ctx.modo);
    marcoDeSeccion(ctx);
  });

  // El índice de la portada dice qué secciones trae esta propuesta; se sabe de antemano.
  const hayAlcance = payload.alcance.some(
    (b) => b && (b.titulo?.trim() || b.texto?.trim() || (b.vinetas ?? []).some((v) => String(v).trim())),
  );
  const planos = prepararPlanos(payload.planos);
  const hayPlanos = planos.imagenes.length + planos.otros.length > 0;
  const indice = SECCIONES.map((s) => ({
    ...s,
    nota:
      s.numero === '02' && !hayAlcance
        ? 'Detallado en la cotización'
        : s.numero === '03' && !hayPlanos
          ? 'Sin anexos'
          : undefined,
  }));

  portada(ctx, indice);
  seccionObjetivo(ctx);
  seccionAlcance(ctx);
  seccionPlanos(ctx, planos);
  seccionCotizacion(ctx);
  numerarPaginas(ctx);

  doc.end();
  return listo;
}
