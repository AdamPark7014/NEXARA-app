import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { bufferParaPdf, imagenParaPdf } from '../common/pdf/imagen-para-pdf.js';
import { loadNexaraLogo } from '../common/pdf/nexara-pdf-theme.js';

/**
 * PDF «Propuesta técnica» — el documento que ve el cliente.
 *
 * Lleva todo lo que trae la propuesta que NEXARA arma a mano (`Primera cotizacion .pdf`), con el
 * mismo orden y el mismo lenguaje de marca, pero dibujado en vectores para que imprima nítido:
 *
 * - Portada oscura y tipográfica: marca, lema, «PROPUESTA TÉCNICA», versión, índice 01–04, datos
 *   de la propuesta (cliente, proyecto, folio, fecha) y el pie con el sitio y la leyenda legal.
 * - Hojas interiores con el membrete del modelo redibujado: rombo negro, rombo verde y el triángulo
 *   de la esquina; la marca arriba a la derecha; la barra de contacto con el galón verde abajo; y
 *   «Página n de N».
 * - 01 Objetivo, 02 Alcance (título del proyecto, introducción y bloques numerados con párrafos y
 *   viñetas), 03 Planos a página completa y 04 Cotización (emisor, cliente, folio, fecha, validez,
 *   tabla, totales, términos y quién la elaboró).
 *
 * Por qué vectores y no el arte del modelo como fondo: el membrete del modelo es un JPEG de
 * 1017×1600 px (≈125 ppp en carta) y sale borroso al imprimir; la portada es una captura de un
 * video. Redibujados pesan unos cuantos KB, se imprimen a cualquier resolución y el pie puede
 * llevar los datos reales de la empresa y el número de página.
 *
 * Diferencia con el documento hecho a mano: los números del objetivo salen de las partidas y los
 * términos salen de lo que se cobra, así que la propuesta no puede cobrar instalación y decir
 * «solo suministro» tres párrafos abajo.
 *
 * Tipografía: Helvetica (el modelo usa Century Gothic, pero el repositorio no trae ninguna TTF que
 * se pueda embeber). Una sola escala: 30 número de sección · 14 títulos · 10.5 subtítulos ·
 * 9.8 cuerpo · 7.8 tabla · 7 etiquetas.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Paleta y medidas
// ─────────────────────────────────────────────────────────────────────────────

/** Colores tomados del arte y del PDF modelo. */
const C = {
  /** Verde de marca de las formas (triángulo, galón, cuña de portada). */
  verde: '#3CB498',
  /** Verde para texto y rellenos sobre blanco (el «01.» y los encabezados del modelo). */
  verdeTexto: '#309C85',
  /** Rombo pequeño. */
  verdeClaro: '#66C3AE',
  /** Cuña de la portada. */
  verdeProfundo: '#018F81',
  tinta: '#0A0E12',
  panel: '#0E1A21',
  /** Barra de contacto y loma del pie. */
  carbon: '#363636',
  loma: '#505052',
  texto: '#1C2126',
  suave: '#5F6B75',
  tenue: '#8A949C',
  linea: '#D6DCE1',
  cebra: '#F3F6F6',
  blanco: '#FFFFFF',
} as const;

const ANCHO = 612;
const ALTO = 792;

/** Columna de texto de las hojas interiores: libre del triángulo de la esquina. */
const COL_X = 84;
const COL_DER = 540;
const COL_ANCHO = COL_DER - COL_X;

/** Número de sección («01.») y título de sección. */
const NUMERO = { base: 98, tamano: 30 };
const TITULO = { base: 126, tamano: 14 };
/** Primer renglón del cuerpo en la hoja donde empieza la sección y en las de continuación. */
const INICIO_SECCION = 158;
const INICIO_CONTINUACION = 124;

/** Barra de contacto: de aquí para abajo no entra el cuerpo. */
const PIE_Y = 748;
const LIMITE_CUERPO = 712;

/** Cuerpo: 9.8 pt con renglón de 14.2 pt. */
const CUERPO = 9.8;
const RENGLON = 14.2;
/** `lineGap` que da ese renglón con Helvetica (su alto de línea es 1.156 em). */
const INTERLINEA = RENGLON - CUERPO * 1.156;
const ENTRE_PARRAFOS = 7;

/** Alto de mayúsculas de Helvetica: PDFKit pone la línea base a 0.718 em del `y` que recibe. */
const ASCENSO = 0.718;
const arriba = (base: number, tamano: number) => base - ASCENSO * tamano;

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
  { numero: '01.', titulo: 'OBJETIVO DEL PROYECTO' },
  { numero: '02.', titulo: 'ALCANCE DEL PROYECTO' },
  { numero: '03.', titulo: 'PLANOS' },
  { numero: '04.', titulo: 'COTIZACIÓN' },
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
 * El archivo son 343×374 px y 39 KB; se imprime a 60 pt como máximo, así que 260 px de lado sobran.
 * Se conserva el alfa: la misma imagen va sobre la portada oscura y sobre las hojas blancas.
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

/** Dibuja la marca a un ancho dado; devuelve el alto usado (0 si no hay marca). */
function dibujarMarca(doc: Doc, marca: Imagen, x: number, y: number, ancho: number): number {
  if (!marca) return 0;
  const alto = (marca.alto / marca.ancho) * ancho;
  try {
    (doc as unknown as { image: (src: unknown, x: number, y: number, o: object) => void }).image(marca.objeto, x, y, {
      width: ancho,
      height: alto,
    });
    return alto;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitivas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Texto de un renglón en una posición fija, sin que PDFKit lo envuelva.
 *
 * Sin `width` PDFKit no usa su LineWrapper y nunca abre una página por su cuenta: es lo que permite
 * escribir el pie (que vive debajo del margen inferior) y numerar las hojas al final.
 */
function renglon(
  doc: Doc,
  texto: string,
  x: number,
  base: number,
  o: { tamano: number; fuente?: string; color?: string; alinear?: 'izq' | 'der' | 'centro'; espaciado?: number; max?: number },
) {
  doc.font(o.fuente ?? 'Helvetica').fontSize(o.tamano);
  const espaciado = o.espaciado ?? 0;
  let tamano = o.tamano;
  let ancho = doc.widthOfString(texto, { characterSpacing: espaciado }) - espaciado;
  if (o.max && ancho > o.max) {
    tamano = Math.max(4.5, (tamano * o.max) / ancho);
    doc.fontSize(tamano);
    ancho = doc.widthOfString(texto, { characterSpacing: espaciado }) - espaciado;
  }
  const xReal = o.alinear === 'der' ? x - ancho : o.alinear === 'centro' ? x - ancho / 2 : x;
  doc.fillColor(o.color ?? C.texto).text(texto, xReal, arriba(base, tamano), {
    lineBreak: false,
    characterSpacing: espaciado,
  });
  return ancho;
}

/** Polígono con esquinas redondeadas (el rombo, el triángulo y la barra del membrete). */
function poligonoRedondeado(doc: Doc, puntos: Array<[number, number]>, radio: number) {
  const n = puntos.length;
  const recorte = (a: [number, number], b: [number, number]): [number, number] => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const largo = Math.hypot(dx, dy) || 1;
    const t = Math.min(radio / largo, 0.5);
    return [a[0] + dx * t, a[1] + dy * t];
  };
  for (let i = 0; i < n; i += 1) {
    const actual = puntos[i]!;
    const previo = puntos[(i - 1 + n) % n]!;
    const siguiente = puntos[(i + 1) % n]!;
    const entrada = recorte(actual, previo);
    const salida = recorte(actual, siguiente);
    if (i === 0) doc.moveTo(entrada[0], entrada[1]);
    else doc.lineTo(entrada[0], entrada[1]);
    doc.quadraticCurveTo(actual[0], actual[1], salida[0], salida[1]);
  }
  doc.closePath();
}

/** Rombo (cuadrado a 45°) de centro y semidiagonal dados. */
function rombo(doc: Doc, cx: number, cy: number, r: number, radio: number, color: string) {
  doc.save();
  poligonoRedondeado(
    doc,
    [
      [cx, cy - r],
      [cx + r, cy],
      [cx, cy + r],
      [cx - r, cy],
    ],
    radio,
  );
  doc.fill(color);
  doc.restore();
}

/** Iconitos vectoriales del pie: 7×7 pt. */
function icono(doc: Doc, tipo: 'web' | 'tel' | 'mail' | 'pin', x: number, y: number, color: string) {
  doc.save();
  doc.strokeColor(color).fillColor(color).lineWidth(0.6);
  if (tipo === 'web') {
    doc.circle(x + 3.4, y + 3.4, 3.2).stroke();
    doc.ellipse(x + 3.4, y + 3.4, 1.4, 3.2).stroke();
    doc.moveTo(x + 0.2, y + 3.4).lineTo(x + 6.6, y + 3.4).stroke();
  } else if (tipo === 'tel') {
    // Auricular: la curva del mango y los dos extremos más gruesos.
    doc.lineCap('round').lineWidth(1.3);
    doc.moveTo(x + 1.5, y + 1.3).bezierCurveTo(x + 0.5, y + 3.6, x + 3.4, y + 6.6, x + 5.7, y + 5.7).stroke();
    doc.lineWidth(2);
    doc.moveTo(x + 0.9, y + 0.7).lineTo(x + 2.3, y + 2.0).stroke();
    doc.moveTo(x + 5.0, y + 5.1).lineTo(x + 6.3, y + 6.4).stroke();
  } else if (tipo === 'mail') {
    doc.rect(x, y + 1, 6.8, 4.8).stroke();
    doc.moveTo(x, y + 1).lineTo(x + 3.4, y + 3.9).lineTo(x + 6.8, y + 1).stroke();
  } else {
    doc.circle(x + 3.4, y + 2.6, 2.5).fill();
    doc.moveTo(x + 1.2, y + 3.8).lineTo(x + 3.4, y + 7.2).lineTo(x + 5.6, y + 3.8).fill();
    doc.circle(x + 3.4, y + 2.6, 0.9).fill(C.carbon);
  }
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
  /** Número de la sección en curso («01.»); cada hoja de la sección lo repite. */
  seccion: string | null;
  /**
   * Qué es cada hoja, para numerarlas al final. Se llena en `pageAdded`, que también ve las hojas
   * que PDFKit abre solo cuando un párrafo se desborda.
   */
  paginas: Modo[];
  pintandoMarco?: boolean;
};

/** Márgenes de las hojas interiores: el `maxY` de PDFKit queda encima de la barra de contacto. */
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
  doc.font('Helvetica').fontSize(CUERPO).fillColor(C.texto);
}

// ─────────────────────────────────────────────────────────────────────────────
// Membrete de las hojas interiores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Esquina del membrete: rombo negro recortado por el borde, rombo verde grande (el «triángulo»)
 * y el rombo pequeño. Proporciones del arte del modelo a escala uniforme.
 */
function esquina(doc: Doc) {
  rombo(doc, 0, 28, 37, 5, '#000000');
  rombo(doc, 0, 108.6, 64.3, 7, C.verde);
  rombo(doc, 38.6, 54, 9.7, 2.2, C.verdeClaro);
}

/** Barra de contacto con la punta en flecha, el galón verde y la loma gris. */
function pie(ctx: Ctx) {
  const { doc, empresa } = ctx;
  const alto = ALTO - PIE_Y;

  doc.save();
  // Loma gris, abajo a la derecha.
  poligonoRedondeado(
    doc,
    [
      [516, ALTO + 8],
      [556, PIE_Y + 8],
      [ANCHO + 20, PIE_Y + 8],
      [ANCHO + 20, ALTO + 8],
    ],
    9,
  );
  doc.fill(C.loma);
  // Galón verde.
  doc
    .moveTo(426, ALTO + 4)
    .lineTo(484, PIE_Y - 4)
    .lineTo(542, ALTO + 4)
    .lineWidth(4.2)
    .lineJoin('round')
    .lineCap('butt')
    .strokeColor(C.verde)
    .stroke();
  // Barra oscura con la punta en flecha.
  poligonoRedondeado(
    doc,
    [
      [-10, PIE_Y],
      [388, PIE_Y],
      [388 + alto * 0.98, PIE_Y + alto * 0.66],
      [388 + alto * 0.56, ALTO + 6],
      [-10, ALTO + 6],
    ],
    5,
  );
  doc.fill(C.carbon);
  doc.restore();

  // Contacto en dos columnas: sitio y teléfono / correo y dirección.
  const telefonos = empresa.telefonoAlterno ? `${empresa.telefono}  ·  ${empresa.telefonoAlterno}` : empresa.telefono;
  const filas: Array<['web' | 'tel' | 'mail' | 'pin', string, number, number, number]> = [
    ['web', dominio(empresa.web), 30, PIE_Y + 16, 118],
    ['tel', telefonos, 30, PIE_Y + 29, 118],
    ['mail', empresa.correo, 168, PIE_Y + 16, 212],
    ['pin', empresa.oficina, 168, PIE_Y + 29, 212],
  ];
  for (const [tipo, valor, x, base, max] of filas) {
    icono(doc, tipo, x - 11, base - 6, C.blanco);
    renglon(doc, valor, x, base, { tamano: 6.8, fuente: 'Helvetica-Bold', color: C.blanco, max });
  }
}

/**
 * Hoja interior: esquina, marca arriba a la derecha, pie y número de sección. Deja `doc.y` donde
 * empieza el cuerpo de una hoja de continuación.
 *
 * Va colgado de `pageAdded`, así que también cubre las hojas que abre PDFKit cuando un párrafo se
 * desborda: ninguna hoja interior sale sin su membrete.
 */
function marcoDeSeccion(ctx: Ctx) {
  const { doc } = ctx;
  if (ctx.modo !== 'seccion' || ctx.pintandoMarco) return;
  ctx.pintandoMarco = true;
  try {
    esquina(doc);
    // Marca con su nombre debajo, alineada al margen derecho.
    const anchoMarca = 44;
    const centro = COL_DER - anchoMarca / 2;
    const altoMarca = dibujarMarca(doc, ctx.marca, centro - anchoMarca / 2, 30, anchoMarca);
    renglon(doc, ctx.empresa.nombre, centro, altoMarca ? 30 + altoMarca + 12 : 60, {
      tamano: 8.4,
      fuente: 'Helvetica-Bold',
      alinear: 'centro',
      espaciado: 2.6,
    });
    pie(ctx);
    if (ctx.seccion) {
      renglon(doc, ctx.seccion, COL_X, NUMERO.base, {
        tamano: NUMERO.tamano,
        fuente: 'Helvetica-Bold',
        color: C.verdeTexto,
      });
    }
    doc.x = COL_X;
    doc.y = arriba(INICIO_CONTINUACION + 8, CUERPO);
    estiloCuerpo(doc);
  } finally {
    ctx.pintandoMarco = false;
  }
}

/** Abre la primera hoja de una sección con su título; deja `doc.y` en el primer renglón. */
function abrirSeccion(ctx: Ctx, numero: string, titulo: string) {
  const { doc } = ctx;
  ctx.seccion = numero;
  abrirPagina(ctx, 'seccion');
  renglon(doc, titulo, COL_X, TITULO.base, { tamano: TITULO.tamano, fuente: 'Helvetica-Bold', espaciado: 0.6 });
  doc.save();
  doc.rect(COL_X, TITULO.base + 9, 26, 2.2).fill(C.verde);
  doc.restore();
  doc.x = COL_X;
  doc.y = arriba(INICIO_SECCION, CUERPO);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuerpo de texto
// ─────────────────────────────────────────────────────────────────────────────

/** Abre hoja si lo que sigue no cabe encima del pie. */
function asegurarEspacio(ctx: Ctx, alto: number) {
  if (ctx.doc.y + alto > LIMITE_CUERPO) abrirPagina(ctx, 'seccion');
}

function altoTexto(doc: Doc, texto: string, ancho: number, fuente = 'Helvetica', tamano = CUERPO) {
  doc.font(fuente).fontSize(tamano);
  return doc.heightOfString(texto, { width: ancho, lineGap: INTERLINEA });
}

/**
 * Párrafo del cuerpo. Un párrafo nunca deja un renglón huérfano al pie; `conSiguiente` reserva
 * además el arranque de lo que sigue (la frase que presenta una lista no se queda sin su lista).
 */
function parrafo(ctx: Ctx, texto: string, despues = ENTRE_PARRAFOS, conSiguiente = false) {
  const { doc } = ctx;
  const alto = altoTexto(doc, texto, COL_ANCHO);
  asegurarEspacio(ctx, conSiguiente ? alto + despues + RENGLON * 2 : Math.min(alto, RENGLON * 2));
  estiloCuerpo(doc);
  doc.text(texto, COL_X, doc.y, { width: COL_ANCHO, lineGap: INTERLINEA });
  doc.y += despues;
}

/**
 * Lo que un elemento de lista necesita libre al pie: sus dos primeros renglones, o —si es el
 * penúltimo— todo él más el arranque del último, para que el último nunca quede solo en la hoja
 * siguiente.
 */
function reservaDeLista(doc: Doc, texto: string, ancho: number, ultimo?: string) {
  const alto = altoTexto(doc, texto, ancho);
  if (ultimo === undefined) return Math.min(alto, RENGLON * 2);
  return alto + 6 + Math.min(altoTexto(doc, ultimo, ancho), RENGLON * 2);
}

/** Elemento numerado (beneficios): número verde alineado a la derecha y texto colgado. */
function elementoNumerado(ctx: Ctx, numero: number, texto: string, ultimo?: string) {
  const { doc } = ctx;
  const xTexto = COL_X + 26;
  const ancho = COL_DER - xTexto;
  asegurarEspacio(ctx, reservaDeLista(doc, texto, ancho, ultimo));
  const y = doc.y;
  renglon(doc, `${numero}.`, xTexto - 8, y + ASCENSO * CUERPO, {
    tamano: CUERPO,
    fuente: 'Helvetica-Bold',
    color: C.verdeTexto,
    alinear: 'der',
  });
  estiloCuerpo(doc);
  doc.text(texto, xTexto, y, { width: ancho, lineGap: INTERLINEA });
  doc.x = COL_X;
  doc.y += 6;
}

/** Viñeta: el rombo de la marca en pequeño y el texto colgado. `ultimo`: ver `reservaDeLista`. */
function vineta(ctx: Ctx, texto: string, ultimo?: string) {
  const { doc } = ctx;
  const xTexto = COL_X + 18;
  const ancho = COL_DER - xTexto;
  asegurarEspacio(ctx, reservaDeLista(doc, texto, ancho, ultimo));
  const y = doc.y;
  rombo(doc, COL_X + 6, y + CUERPO * 0.42, 2.3, 0.4, C.verde);
  estiloCuerpo(doc);
  doc.text(texto, xTexto, y, { width: ancho, lineGap: INTERLINEA });
  doc.x = COL_X;
  doc.y += 3;
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

/** Hexágono regular (de punta) para el motivo de la portada. */
function hexagono(doc: Doc, cx: number, cy: number, r: number) {
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  }
  doc.closePath();
}

/**
 * Portada: oscura y tipográfica, con la estructura de la del modelo (marca y lema arriba,
 * «PROPUESTA TÉCNICA», versión, índice, cuña verde y pie) y, en lugar de la ilustración, los datos
 * de la propuesta y un motivo de hexágonos en líneas finas.
 */
function portada(ctx: Ctx, indice: Array<{ numero: string; titulo: string; nota?: string }>) {
  const { doc, payload, empresa } = ctx;
  abrirPagina(ctx, 'portada');

  doc.save();
  doc.rect(0, 0, ANCHO, ALTO).fill(C.tinta);

  // Motivo: hexágonos concéntricos del logotipo, en líneas finas, saliendo por la derecha.
  const hx = 492;
  const hy = 250;
  [
    [196, 0.1, 0.7],
    [160, 0.16, 0.7],
    [124, 0.26, 0.8],
    [88, 0.5, 1.1],
  ].forEach(([r, opacidad, grosor]) => {
    doc.save();
    hexagono(doc, hx, hy, r!);
    doc.lineWidth(grosor!).strokeOpacity(opacidad!).strokeColor(C.verde).stroke();
    doc.restore();
  });

  // Filete superior en ángulo, como el marco del arte original.
  doc
    .moveTo(0, 30)
    .lineTo(150, 30)
    .lineTo(176, 56)
    .lineTo(ANCHO - 170, 56)
    .lineWidth(0.6)
    .strokeOpacity(0.5)
    .strokeColor('#2C3A44')
    .stroke();
  doc.strokeOpacity(1);

  // Cuña verde de la esquina inferior izquierda.
  doc.moveTo(0, 548).lineTo(214, ALTO).lineTo(0, ALTO).fill(C.verdeProfundo);
  doc.restore();

  // Marca y lema.
  const xMarca = 56;
  const altoMarca = dibujarMarca(doc, ctx.marca, xMarca, 104, 50);
  const xNombre = altoMarca ? xMarca + 66 : xMarca;
  renglon(doc, empresa.nombre, xNombre, 136, {
    tamano: 30,
    fuente: 'Helvetica-Bold',
    color: C.blanco,
    espaciado: 8,
  });
  renglon(doc, empresa.lema.toUpperCase(), xNombre + 1, 151, {
    tamano: 6.8,
    color: '#9FB0BA',
    espaciado: 1.55,
  });

  // Título.
  renglon(doc, 'PROPUESTA', 54, 288, { tamano: 44, color: C.blanco, espaciado: 1.5 });
  renglon(doc, 'TÉCNICA', 54, 336, { tamano: 44, fuente: 'Helvetica-Bold', color: C.verde, espaciado: 1.5 });
  doc.save();
  doc.moveTo(56, 364).lineTo(300, 364).lineWidth(0.6).strokeColor('#2A353E').stroke();
  doc.circle(60.5, 386, 3.6).fill(C.verde);
  doc.restore();
  renglon(doc, `VERSIÓN ${Math.max(1, Math.trunc(Number(payload.revision) || 1))}.0`, 72, 389.2, {
    tamano: 8.6,
    color: C.blanco,
    espaciado: 1.2,
  });

  // Índice sobre un panel con el corte en diagonal del modelo.
  const panelY = 440;
  const fila = 46;
  const altoPanel = fila * indice.length + 16;
  doc.save();
  doc
    .moveTo(40, panelY)
    .lineTo(290, panelY)
    .lineTo(290 + altoPanel * 0.22, panelY + altoPanel)
    .lineTo(40, panelY + altoPanel)
    .closePath()
    .fillOpacity(0.92)
    .fill(C.panel);
  doc.restore();
  indice.forEach(({ numero, titulo, nota }, i) => {
    const base = panelY + 32 + i * fila;
    const apagada = Boolean(nota);
    renglon(doc, numero, 62, base, {
      tamano: 15,
      fuente: 'Helvetica-Bold',
      color: apagada ? '#3E5A57' : C.verde,
    });
    const ancho = renglon(doc, titulo, 110, base - 1.5, {
      tamano: 8.4,
      color: apagada ? '#62717B' : C.blanco,
      espaciado: 0.9,
    });
    if (nota) renglon(doc, nota, 110 + ancho + 8, base - 1.5, { tamano: 7, color: '#62717B' });
    if (i < indice.length - 1) {
      const y = base + 16;
      doc.save();
      doc
        .moveTo(62, y)
        .lineTo(282 + (y - panelY) * 0.22, y)
        .lineWidth(0.5)
        .strokeColor('#233640')
        .stroke();
      doc.restore();
    }
  });

  // Datos de la propuesta, a la derecha del índice.
  const x = 356;
  const anchoDato = ANCHO - 48 - x;
  doc.save();
  doc.rect(x - 14, panelY + 6, 1.6, altoPanel - 12).fill(C.verde);
  doc.restore();
  const cliente = payload.cliente.empresa?.trim() || payload.cliente.nombre?.trim() || '';
  const datos: Array<[string, string, number]> = [
    ['PREPARADA PARA', cliente, 2],
    ['PROYECTO', payload.proyecto?.trim() || '', 3],
    ['FOLIO', payload.folio, 1],
    ['FECHA DE EMISIÓN', fechaLarga(payload.issueDate) ?? '', 1],
  ];
  let y = panelY + 18;
  for (const [etiqueta, valor, renglones] of datos) {
    if (!valor) continue;
    renglon(doc, etiqueta, x, y, { tamano: 6.6, color: '#7F909B', espaciado: 1.3 });
    doc.font(etiqueta === 'PREPARADA PARA' ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.6).fillColor(C.blanco);
    const alto = Math.min(
      doc.heightOfString(valor, { width: anchoDato, lineGap: 1.5 }),
      renglones * (9.6 * 1.156 + 1.5),
    );
    doc.text(valor, x, y + 5, { width: anchoDato, lineGap: 1.5, height: alto, ellipsis: true });
    y += 5 + alto + 16;
  }

  // Pie: sitio y leyenda.
  icono(doc, 'web', 250, ALTO - 56.5, C.verde);
  renglon(doc, dominio(empresa.web), 264, ALTO - 50, { tamano: 8.8, fuente: 'Helvetica-Bold', color: C.blanco });
  doc.save();
  doc
    .moveTo(392, ALTO - 66)
    .lineTo(392, ALTO - 34)
    .lineWidth(0.6)
    .strokeColor('#46545E')
    .stroke();
  doc.restore();
  renglon(doc, 'Propuesta técnica sujeta a', 406, ALTO - 54, { tamano: 8.2, color: '#C9D3DA' });
  renglon(doc, 'contratación formal.', 406, ALTO - 43, { tamano: 8.2, color: '#C9D3DA' });
}

// ─────────────────────────────────────────────────────────────────────────────
// 01 Objetivo y 02 Alcance
// ─────────────────────────────────────────────────────────────────────────────

function seccionObjetivo(ctx: Ctx) {
  const { payload } = ctx;
  abrirSeccion(ctx, '01.', 'OBJETIVO DEL PROYECTO');

  for (const texto of parrafosDe(payload.objetivo.intro)) parrafo(ctx, texto);

  const beneficios = payload.objetivo.beneficios.map((b) => b.trim()).filter(Boolean);
  if (beneficios.length) {
    parrafo(ctx, 'Entre los principales beneficios se encuentran:', 6, true);
    beneficios.forEach((beneficio, i) =>
      elementoNumerado(ctx, i + 1, beneficio, i === beneficios.length - 2 ? beneficios[i + 1] : undefined),
    );
    ctx.doc.y += ENTRE_PARRAFOS - 6;
  }

  for (const texto of parrafosDe(payload.objetivo.cierre)) parrafo(ctx, texto);
}

/**
 * 02: el nombre del proyecto como título, la introducción (bloques sin título) y los bloques
 * numerados («1. Modernización del sistema de grabación») con sus párrafos y viñetas. Sin bloques
 * la sección no se imprime y el índice de la portada lo dice.
 */
function seccionAlcance(ctx: Ctx) {
  const { doc, payload } = ctx;
  const bloques = payload.alcance.filter(
    (b) => b && (b.titulo?.trim() || b.texto?.trim() || (b.vinetas ?? []).some((v) => String(v).trim())),
  );
  if (!bloques.length) return;

  abrirSeccion(ctx, '02.', 'ALCANCE DEL PROYECTO');

  const proyecto = payload.proyecto?.trim();
  if (proyecto) {
    doc.font('Helvetica-Bold').fontSize(12.5).fillColor(C.texto);
    doc.text(proyecto, COL_X, doc.y, { width: COL_ANCHO, lineGap: 2.5 });
    doc.y += 8;
  }

  let numero = 0;
  for (const bloque of bloques) {
    const titulo = bloque.titulo?.trim();
    const parrafos = parrafosDe(bloque.texto);
    const vinetas = (bloque.vinetas ?? []).map((v) => String(v).trim()).filter(Boolean);

    if (titulo) {
      numero += 1;
      doc.y += 7;
      // El subtítulo no se queda solo al pie: necesita dos renglones de lo que le sigue.
      const texto = `${numero}. ${titulo}`;
      const alto = altoTexto(doc, texto, COL_ANCHO - 18, 'Helvetica-Bold', 10.5);
      asegurarEspacio(ctx, alto + RENGLON * 2 + 6);
      const y = doc.y;
      renglon(doc, `${numero}.`, COL_X, y + ASCENSO * 10.5, {
        tamano: 10.5,
        fuente: 'Helvetica-Bold',
        color: C.verdeTexto,
      });
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.texto);
      doc.text(titulo, COL_X + 18, y, { width: COL_ANCHO - 18, lineGap: 2 });
      doc.x = COL_X;
      doc.y += 5;
    }
    parrafos.forEach((texto, i) =>
      parrafo(ctx, texto, ENTRE_PARRAFOS, i === parrafos.length - 1 && vinetas.length > 0),
    );
    if (vinetas.length) {
      vinetas.forEach((v, i) => vineta(ctx, v, i === vinetas.length - 2 ? vinetas[i + 1] : undefined));
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
 * modelo. Los anexos que no son imagen (PDF o enlaces) se enlistan en una hoja «03.».
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
    doc.moveTo(0, alto).lineTo(ancho, alto).lineWidth(0.8).strokeColor(C.linea).stroke();
    doc.rect(0, alto, 6, FRANJA_PLANO).fill(C.verde);
    doc.restore();
    const ancho03 = renglon(doc, '03.', 24, alto + 22, { tamano: 12, fuente: 'Helvetica-Bold', color: C.verdeTexto });
    renglon(doc, `PLANOS  ·  ${nombre}`, 24 + ancho03 + 10, alto + 22, {
      tamano: 11,
      color: C.suave,
      espaciado: 0.6,
      max: ancho * 0.6,
    });
  }

  const nombres = planos.otros;
  if (!nombres.length) return;

  abrirSeccion(ctx, '03.', 'PLANOS');
  parrafo(ctx, 'Anexos que acompañan a esta propuesta:', 6, true);
  nombres.forEach((n, i) => vineta(ctx, n, i === nombres.length - 2 ? nombres[i + 1] : undefined));
}

// ─────────────────────────────────────────────────────────────────────────────
// 04 Cotización
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNAS = (() => {
  const definicion: Array<[string, number, 'izq' | 'centro' | 'der']> = [
    ['DESCRIPCIÓN', 234, 'izq'],
    ['UNIDAD', 46, 'centro'],
    ['CANTIDAD', 46, 'centro'],
    ['PRECIO', 62, 'der'],
    ['TOTAL', 68, 'der'],
  ];
  let x = COL_X;
  return definicion.map(([titulo, ancho, alinear]) => {
    const col = { titulo, x, ancho, alinear };
    x += ancho;
    return col;
  });
})();

const FILA = { tamano: 7.8, relleno: 6.5, interlinea: 1.4, minimo: 24 };
const ENCABEZADO_TABLA = 20;

function encabezadoTabla(doc: Doc, y: number) {
  doc.save();
  doc.rect(COL_X, y, COL_ANCHO, ENCABEZADO_TABLA).fill(C.verdeTexto);
  doc.restore();
  for (const col of COLUMNAS) {
    const base = y + ENCABEZADO_TABLA / 2 + 2.4;
    const x = col.alinear === 'izq' ? col.x + 8 : col.alinear === 'der' ? col.x + col.ancho - 8 : col.x + col.ancho / 2;
    renglon(doc, col.titulo, x, base, {
      tamano: 6.8,
      fuente: 'Helvetica-Bold',
      color: C.blanco,
      espaciado: 0.6,
      alinear: col.alinear,
      max: col.ancho - 8,
    });
  }
  return y + ENCABEZADO_TABLA;
}

/** Importe con el signo a la izquierda de la celda y la cifra alineada a la derecha. */
function importe(doc: Doc, valor: number, x: number, ancho: number, base: number, tamano: number, fuente = 'Helvetica') {
  const cifra = numeroMx.format(Number(valor) || 0);
  renglon(doc, '$', x + 8, base, { tamano, fuente, color: C.texto });
  renglon(doc, cifra, x + ancho - 8, base, { tamano, fuente, color: C.texto, alinear: 'der', max: ancho - 24 });
}

/** Tarjeta de pares etiqueta/valor con título en verde. */
function tarjeta(
  doc: Doc,
  x: number,
  y: number,
  ancho: number,
  titulo: string,
  filas: Array<[string, string, boolean?]>,
  anchoEtiqueta: number,
) {
  const alto = 26 + filas.length * 14 + 6;
  doc.save();
  doc.roundedRect(x, y, ancho, alto, 5).lineWidth(0.8).strokeColor(C.linea).stroke();
  doc.restore();
  renglon(doc, titulo, x + 12, y + 16, { tamano: 6.8, fuente: 'Helvetica-Bold', color: C.verdeTexto, espaciado: 1.1 });
  filas.forEach(([etiqueta, valor, fuerte], i) => {
    const base = y + 34 + i * 14;
    renglon(doc, etiqueta, x + 12, base, { tamano: 7.6, color: C.suave });
    renglon(doc, valor || '—', x + 12 + anchoEtiqueta, base, {
      tamano: 8.6,
      fuente: fuerte ? 'Helvetica-Bold' : 'Helvetica',
      max: ancho - 24 - anchoEtiqueta,
    });
  });
  return alto;
}

function seccionCotizacion(ctx: Ctx) {
  const { doc, payload, empresa } = ctx;
  abrirSeccion(ctx, '04.', 'COTIZACIÓN');

  // Emisor, como el membrete de la hoja de cotización del modelo.
  const telefonos = empresa.telefonoAlterno ? `${empresa.telefono}  /  ${empresa.telefonoAlterno}` : empresa.telefono;
  const emisor = [empresa.direccion, `Correo electrónico: ${empresa.correo}`, `Teléfonos: ${telefonos}`];
  emisor.forEach((linea, i) => renglon(doc, linea, COL_X, 158 + i * 11, { tamano: 7.8, color: C.suave, max: COL_ANCHO }));

  // Cliente y datos de la cotización.
  const yTarjetas = 204;
  const cliente = payload.cliente;
  const razon = cliente.empresa?.trim() || '';
  const contacto = cliente.nombre?.trim() || '';
  const filasCliente: Array<[string, string, boolean?]> = [['Cliente:', razon || contacto, true]];
  if (razon && contacto && razon !== contacto) filasCliente.push(['Atención:', contacto]);
  filasCliente.push(['Teléfono:', cliente.telefono?.trim() || '']);
  if (cliente.correo?.trim()) filasCliente.push(['Correo:', cliente.correo.trim()]);
  const filasDatos: Array<[string, string, boolean?]> = [
    ['Cotización N°:', payload.folio, true],
    ['Fecha de emisión:', fechaLarga(payload.issueDate) ?? ''],
    ['Validez:', fechaLarga(payload.validUntil) ?? 'Sujeta a confirmación'],
  ];
  const anchoCliente = 234;
  const altoA = tarjeta(doc, COL_X, yTarjetas, anchoCliente, 'CLIENTE', filasCliente, 52);
  const altoB = tarjeta(
    doc,
    COL_X + anchoCliente + 10,
    yTarjetas,
    COL_ANCHO - anchoCliente - 10,
    'DATOS DE LA COTIZACIÓN',
    filasDatos,
    74,
  );

  let y = encabezadoTabla(doc, yTarjetas + Math.max(altoA, altoB) + 18);

  // Las partidas van seguidas, sin subtotales por grupo (el modelo no los tiene).
  const partidas = payload.grupos.flatMap((g) => g.partidas);
  const anchoDescripcion = COLUMNAS[0]!.ancho - 16;
  const nuevaHojaDeTabla = () => {
    abrirPagina(ctx, 'seccion');
    return encabezadoTabla(doc, INICIO_CONTINUACION - 6);
  };
  // Los totales nunca quedan solos en una hoja: viajan con la última partida.
  const altoTotal = 17;
  const altoTotales = 10 + altoTotal * 3;

  partidas.forEach((partida, i) => {
    const nombre = String(partida.name ?? '').trim();
    const descripcion = String(partida.description ?? '').trim();
    const detalle = descripcion && descripcion !== nombre ? descripcion : '';
    doc.font(detalle ? 'Helvetica-Bold' : 'Helvetica').fontSize(FILA.tamano);
    const altoNombre = nombre ? doc.heightOfString(nombre, { width: anchoDescripcion, lineGap: FILA.interlinea }) : 0;
    doc.font('Helvetica').fontSize(FILA.tamano - 0.4);
    const altoDetalle = detalle ? doc.heightOfString(detalle, { width: anchoDescripcion, lineGap: FILA.interlinea }) + 2 : 0;
    // `heightOfString` cuenta el interlineado bajo el último renglón, que no se ve.
    const alto = Math.max(FILA.minimo, altoNombre + altoDetalle + FILA.relleno * 2 - FILA.interlinea - FILA.tamano * 0.2);

    const reserva = i === partidas.length - 1 ? altoTotales : 0;
    if (y + alto + reserva > LIMITE_CUERPO) y = nuevaHojaDeTabla();

    doc.save();
    if (i % 2 === 1) doc.rect(COL_X, y, COL_ANCHO, alto).fill(C.cebra);
    doc.moveTo(COL_X, y + alto).lineTo(COL_DER, y + alto).lineWidth(0.5).strokeColor(C.linea).stroke();
    doc.restore();

    const yTexto = y + FILA.relleno;
    if (nombre) {
      doc.font(detalle ? 'Helvetica-Bold' : 'Helvetica').fontSize(FILA.tamano).fillColor(C.texto);
      doc.text(nombre, COLUMNAS[0]!.x + 8, yTexto, { width: anchoDescripcion, lineGap: FILA.interlinea });
    }
    if (detalle) {
      doc.font('Helvetica').fontSize(FILA.tamano - 0.4).fillColor(C.suave);
      doc.text(detalle, COLUMNAS[0]!.x + 8, yTexto + altoNombre + 2, { width: anchoDescripcion, lineGap: FILA.interlinea });
    }
    // Unidad, cantidad e importes en el primer renglón, alineados con el nombre.
    const base = yTexto + ASCENSO * FILA.tamano;
    renglon(doc, partida.unit?.trim() || 'Pieza', COLUMNAS[1]!.x + COLUMNAS[1]!.ancho / 2, base, {
      tamano: FILA.tamano,
      alinear: 'centro',
      max: COLUMNAS[1]!.ancho - 6,
    });
    renglon(doc, cantidadMx.format(Number(partida.qty) || 0), COLUMNAS[2]!.x + COLUMNAS[2]!.ancho / 2, base, {
      tamano: FILA.tamano,
      alinear: 'centro',
    });
    importe(doc, partida.unitPrice, COLUMNAS[3]!.x, COLUMNAS[3]!.ancho, base, FILA.tamano);
    importe(doc, partida.lineTotal, COLUMNAS[4]!.x, COLUMNAS[4]!.ancho, base, FILA.tamano);
    y += alto;
  });
  if (!partidas.length) {
    renglon(doc, 'Sin partidas capturadas.', COL_X + 8, y + 16, { tamano: FILA.tamano, color: C.suave });
    y += FILA.minimo;
  }

  // Totales a la derecha; nota de moneda a la izquierda.
  y += 10;
  const totX = COLUMNAS[3]!.x - 40;
  const totAncho = COL_DER - totX;
  const anchoImporte = COLUMNAS[4]!.ancho + 20;
  const filas: Array<[string, number, boolean]> = [
    ['SUBTOTAL', payload.subtotal, false],
    ['IVA', payload.iva, false],
    ['TOTAL', payload.total, true],
  ];
  filas.forEach(([etiqueta, valor, fuerte], i) => {
    const fy = y + i * altoTotal;
    doc.save();
    if (fuerte) doc.rect(totX, fy, totAncho, altoTotal).fill(C.verdeTexto);
    else doc.moveTo(totX, fy + altoTotal).lineTo(COL_DER, fy + altoTotal).lineWidth(0.5).strokeColor(C.linea).stroke();
    doc.restore();
    const base = fy + altoTotal / 2 + 3;
    renglon(doc, etiqueta, COL_DER - anchoImporte - 12, base, {
      tamano: fuerte ? 8.6 : 7.8,
      fuente: 'Helvetica-Bold',
      color: fuerte ? C.blanco : C.suave,
      alinear: 'der',
      espaciado: 0.8,
    });
    const color = fuerte ? C.blanco : C.texto;
    const fuente = fuerte ? 'Helvetica-Bold' : 'Helvetica';
    renglon(doc, '$', COL_DER - anchoImporte, base, { tamano: fuerte ? 9 : 8.2, fuente, color });
    renglon(doc, numeroMx.format(Number(valor) || 0), COL_DER - 8, base, {
      tamano: fuerte ? 9 : 8.2,
      fuente,
      color,
      alinear: 'der',
    });
  });
  renglon(doc, `Importes en ${payload.currency || 'MXN'}.`, COL_X, y + 11, { tamano: 7.2, color: C.suave });
  doc.x = COL_X;
  doc.y = y + altoTotal * filas.length + 26;

  // Términos y condiciones: cada renglón con su etiqueta en negritas.
  const lineas = payload.terminos.lineas.map((l) => l.trim()).filter(Boolean);
  if (lineas.length) {
    asegurarEspacio(ctx, 16 + 26);
    renglon(doc, payload.terminos.titulo.toUpperCase(), COL_X, doc.y + 7, {
      tamano: 7.4,
      fuente: 'Helvetica-Bold',
      color: C.verdeTexto,
      espaciado: 1.1,
    });
    doc.y += 16;
    for (const linea of lineas) {
      const partes = conEtiqueta(linea);
      const texto = partes ? `${partes[0]}. ${partes[1]}` : linea;
      doc.font('Helvetica').fontSize(8);
      const alto = doc.heightOfString(texto, { width: COL_ANCHO - 14, lineGap: 1.6 });
      asegurarEspacio(ctx, alto);
      const y0 = doc.y;
      rombo(doc, COL_X + 3, y0 + 3.4, 1.9, 0.3, C.verde);
      doc.fillColor(C.texto);
      if (partes) {
        doc.font('Helvetica-Bold').text(`${partes[0]}. `, COL_X + 14, y0, {
          width: COL_ANCHO - 14,
          lineGap: 1.6,
          continued: true,
        });
        doc.font('Helvetica').text(partes[1]);
      } else {
        doc.text(linea, COL_X + 14, y0, { width: COL_ANCHO - 14, lineGap: 1.6 });
      }
      doc.x = COL_X;
      doc.y += 3.5;
    }
  }

  // Quién la elaboró, con línea de firma.
  const participantes = payload.participantes.filter((p) => p?.nombre?.trim());
  if (participantes.length) {
    const porFila = 3;
    const anchoFirma = (COL_ANCHO - 20 * (porFila - 1)) / porFila;
    const filasFirma = Math.ceil(participantes.length / porFila);
    asegurarEspacio(ctx, 30 + filasFirma * 44);
    let yf = doc.y + 30;
    participantes.forEach((p, i) => {
      const col = i % porFila;
      if (i > 0 && col === 0) yf += 44;
      const x = COL_X + col * (anchoFirma + 20);
      doc.save();
      doc.moveTo(x, yf).lineTo(x + anchoFirma, yf).lineWidth(0.6).strokeColor(C.tenue).stroke();
      doc.restore();
      renglon(doc, p.nombre.trim(), x, yf + 12, { tamano: 8.4, fuente: 'Helvetica-Bold', max: anchoFirma });
      renglon(doc, p.rolEtiqueta?.trim() || 'Elaboró', x, yf + 23, { tamano: 7.4, color: C.suave, max: anchoFirma });
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
      renglon(doc, texto, width - 24, height - FRANJA_PLANO + 22, { tamano: 11, color: C.suave, alinear: 'der' });
    } else {
      renglon(doc, texto, ANCHO - 18, ALTO - 13, {
        tamano: 7,
        fuente: 'Helvetica-Bold',
        color: C.blanco,
        alinear: 'der',
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Página (1 = portada) donde arranca cada sección. La vista previa del editor la usa para llevar el
 * PDF a la sección que se está escribiendo. Una sección que no se imprime no aparece.
 */
export type SeccionesPropuesta = Partial<Record<'portada' | 'objetivo' | 'alcance' | 'planos' | 'cotizacion', number>>;

/**
 * Documento completo, listo para adjuntar al correo o descargar. Si se pasa `secciones`, se llena
 * con la página donde empieza cada sección (solo se anota: no cambia nada de lo que se dibuja).
 */
export async function generarPropuestaTecnicaPdf(payload: PropuestaPayload, secciones?: SeccionesPropuesta): Promise<Buffer> {
  const empresa = datosEmpresaPropuesta(payload.empresa);
  // `bufferPages` solo para escribir «Página n de N» al final: el total no se sabe antes.
  const doc = new PDFDocument({ size: 'LETTER', margins: MARGENES_INTERIOR, autoFirstPage: false, bufferPages: true });
  doc.info.Title = `Propuesta técnica ${payload.folio}`;
  doc.info.Author = empresa.nombre;

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
      s.numero === '02.' && !hayAlcance
        ? '· detallado en la cotización'
        : s.numero === '03.' && !hayPlanos
          ? '· sin anexos'
          : undefined,
  }));

  const marcar = (clave: keyof SeccionesPropuesta, dibujar: () => void) => {
    const antes = ctx.paginas.length;
    dibujar();
    if (secciones && ctx.paginas.length > antes) secciones[clave] = antes + 1;
  };
  marcar('portada', () => portada(ctx, indice));
  marcar('objetivo', () => seccionObjetivo(ctx));
  marcar('alcance', () => seccionAlcance(ctx));
  marcar('planos', () => seccionPlanos(ctx, planos));
  marcar('cotizacion', () => seccionCotizacion(ctx));
  numerarPaginas(ctx);

  doc.end();
  return listo;
}
