import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { bufferParaPdf, imagenParaPdf } from '../common/pdf/imagen-para-pdf.js';
import { loadNexaraLogo } from '../common/pdf/nexara-pdf-theme.js';

/**
 * PDF «Propuesta técnica» — el documento que ve el cliente.
 *
 * Copia la propuesta que NEXARA manda a mano (`Primera cotizacion .pdf`): portada negra con la
 * marca, «PROPUESTA TÉCNICA», la versión y el índice numerado; páginas interiores con el número de
 * sección grande en verde, las formas de la esquina, la marca arriba a la derecha y la barra de
 * contacto abajo; planos a página completa en horizontal; y la hoja de cotización con membrete,
 * los recuadros de fecha/folio/validez, la franja verde de cliente y la tabla con encabezado verde.
 *
 * Diferencia con el documento hecho a mano: aquí los números del objetivo salen de las partidas y
 * los términos salen de lo que se cobra, así que la propuesta no puede cobrar instalación y decir
 * «solo suministro» tres párrafos abajo.
 *
 * Sobre el peso y el tiempo (era la otra queja): el documento se escribe de una pasada —sin
 * `bufferPages` ni segundo recorrido para los pies—, la marca se embebe UNA vez y se reutiliza en
 * todas las páginas, y los planos pasan por `imagenParaPdf`, que los baja a la resolución que de
 * verdad se imprime antes de que PDFKit los toque.
 */

const COLOR = {
  negro: '#0B1117',
  grafito: '#2B3238',
  teal: '#31A88F',
  tealVivo: '#15C1A2',
  tealSuave: '#E7F5F1',
  texto: '#1A1A1A',
  gris: '#5B6B7A',
  grisClaro: '#C2CCD4',
  linea: '#222A31',
  lineaSuave: '#D5DDE4',
  blanco: '#FFFFFF',
} as const;

/** Pie de la propuesta modelo. Se sobrescribe con los datos fiscales de la empresa si existen. */
const EMPRESA_POR_OMISION = {
  web: 'https://nexara.com.mx/',
  telefono: '(22) 01 79 18 71',
  telefonoAlterno: '(222) 696 0350',
  correo: 'gerencia@nexara.com.mx',
  direccion: 'Malltertaiment, Explanada Puebla, Cholula, Puebla 72774, México',
  nombre: 'NEXARA',
  lema: 'Conectando Ecosistemas de Tecnología',
};

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
  grupos: PropuestaGrupo[];
  subtotal: number;
  iva: number;
  total: number;
  currency: string;
  terminos: { titulo: string; lineas: string[] };
  participantes: Array<{ nombre: string; rolEtiqueta: string; siglas: string }>;
  empresa?: {
    legalName?: string | null;
    tradeName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    websiteUrl?: string | null;
    fiscalAddress?: string | null;
  } | null;
};

const ANCHO = 612;
const ALTO = 792;
const MARGEN = 48;
const ANCHO_UTIL = ANCHO - MARGEN * 2;

/** Las páginas 01/02/03 sangran el texto para dejar pasar el triángulo verde de la esquina. */
const MARGEN_TEXTO = 88;
const ANCHO_TEXTO = ANCHO - MARGEN_TEXTO - MARGEN;

/** Altura de la barra de contacto; el cuerpo nunca baja de aquí. */
const ALTO_PIE = 62;
const LIMITE_CUERPO = ALTO - ALTO_PIE - 16;

const INDICE: Array<[string, string]> = [
  ['01.', 'OBJETIVO DEL PROYECTO'],
  ['02.', 'ALCANCE DEL PROYECTO'],
  ['03.', 'PLANOS'],
  ['04.', 'COTIZACIÓN'],
];

type Doc = InstanceType<typeof PDFDocument>;
type Modo = 'portada' | 'seccion' | 'plano' | 'cotizacion';

const numeroMx = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cantidadMx = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

function datosEmpresa(payload: PropuestaPayload) {
  const e = payload.empresa;
  return {
    nombre: (e?.tradeName || e?.legalName || EMPRESA_POR_OMISION.nombre).toUpperCase(),
    web: e?.websiteUrl || EMPRESA_POR_OMISION.web,
    telefono: e?.contactPhone || EMPRESA_POR_OMISION.telefono,
    telefonoAlterno: e?.contactPhone ? null : EMPRESA_POR_OMISION.telefonoAlterno,
    correo: e?.contactEmail || EMPRESA_POR_OMISION.correo,
    direccion: e?.fiscalAddress || EMPRESA_POR_OMISION.direccion,
    lema: EMPRESA_POR_OMISION.lema,
  };
}

/** `www.nexara.com.mx` a partir de la URL con esquema, para la portada. */
const dominio = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

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
// Estado del documento
// ─────────────────────────────────────────────────────────────────────────────

type Marca = { imagen: unknown; ancho: number; alto: number } | null;

type Ctx = {
  doc: Doc;
  payload: PropuestaPayload;
  empresa: ReturnType<typeof datosEmpresa>;
  /** Marca con alfa; embebida UNA vez y reutilizada en cada página. */
  marca: Marca;
  modo: Modo;
  seccion: { numero: string; titulo: string } | null;
  /** La sección ya pintó su título: las páginas siguientes solo repiten el número. */
  tituloPuesto: boolean;
  /** Re-entrancia del marco (ver `marcoDePagina`). */
  pintandoMarco?: boolean;
  /** El membrete de la cotización ya se pintó: las hojas siguientes son solo tabla. */
  membretePuesto?: boolean;
};

/**
 * La marca reducida, calculada una sola vez por proceso.
 *
 * El archivo son 343×374 px y 39 KB; se imprime a 62 pt en las interiores y a 200 pt en la
 * portada, así que 260 px de lado sobran. Se conserva el alfa a propósito: con una sola versión
 * sirve para la portada negra y para el membrete blanco, y el documento la embebe una vez.
 */
let marcaEnCache: Buffer | null | undefined;

function bytesDeMarca(): Buffer | null {
  if (marcaEnCache !== undefined) return marcaEnCache;

  const original = loadNexaraLogo();
  let salida = original;
  if (original) {
    try {
      const preparada = bufferParaPdf(original, { maxLado: 260, maxBytes: 0, conservarAlfa: true });
      if (preparada) salida = preparada.datos;
    } catch {
      /* si algo falla se embebe la marca original */
    }
  }
  marcaEnCache = salida;
  return salida;
}

/**
 * Abre la marca una sola vez por documento.
 *
 * `doc.image(buffer, …)` con un Buffer NO reutiliza nada: cada llamada embebe el PNG otra vez —
 * siete páginas, siete copias del mismo logo. Con `doc.openImage` se obtiene el objeto embebido y
 * todas las páginas comparten el mismo XObject.
 */
function abrirMarca(doc: Doc): Marca {
  const bytes = bytesDeMarca();
  if (!bytes) return null;
  try {
    const imagen = (doc as unknown as { openImage: (src: Buffer) => { width: number; height: number } }).openImage(
      bytes,
    );
    return { imagen, ancho: imagen.width, alto: imagen.height };
  } catch {
    return null;
  }
}

function dibujarMarca(ctx: Ctx, marca: Marca, x: number, y: number, ancho: number, colorTexto: string) {
  if (marca) {
    const alto = (marca.alto / marca.ancho) * ancho;
    try {
      (ctx.doc as unknown as { image: (src: unknown, x: number, y: number, o: object) => void }).image(
        marca.imagen,
        x,
        y,
        { width: ancho },
      );
      ctx.doc
        .font('Helvetica-Bold')
        .fontSize(ancho * 0.145)
        .fillColor(colorTexto)
        .text(ctx.empresa.nombre, x - 12, y + alto + 3, {
          width: ancho + 24,
          align: 'center',
          characterSpacing: ancho * 0.045,
        });
      return alto + ancho * 0.145 + 6;
    } catch {
      /* marca corrupta: se cae al texto */
    }
  }
  ctx.doc
    .font('Helvetica-Bold')
    .fontSize(ancho * 0.2)
    .fillColor(colorTexto)
    .text(ctx.empresa.nombre, x, y, { width: ancho + 24, characterSpacing: ancho * 0.05 });
  return ancho * 0.28;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adornos
// ─────────────────────────────────────────────────────────────────────────────

/** Esquina de las páginas interiores: bloque negro, rombo verde y el triángulo grande. */
function esquinaSeccion(doc: Doc) {
  doc.save();
  doc.roundedRect(-16, -16, 62, 58, 16).fill(COLOR.negro);
  doc.save();
  doc.rotate(45, { origin: [76, 52] });
  doc.rect(76 - 9, 52 - 9, 18, 18).fill(COLOR.teal);
  doc.restore();
  doc.moveTo(0, 72).lineTo(104, 150).lineTo(0, 228).fill(COLOR.teal);
  doc.restore();
}

/** Iconitos vectoriales del pie: 8×8 pt, sin un solo píxel. */
function icono(doc: Doc, tipo: 'web' | 'tel' | 'mail' | 'pin', x: number, y: number) {
  doc.save();
  doc.strokeColor(COLOR.blanco).fillColor(COLOR.blanco).lineWidth(0.6);
  if (tipo === 'web') {
    doc.circle(x + 3.4, y + 3.4, 3.4).stroke();
    doc.ellipse(x + 3.4, y + 3.4, 1.5, 3.4).stroke();
    doc.moveTo(x, y + 3.4).lineTo(x + 6.8, y + 3.4).stroke();
  } else if (tipo === 'tel') {
    doc.save();
    doc.rotate(-32, { origin: [x + 3.4, y + 3.4] });
    doc.roundedRect(x + 2.1, y - 0.2, 2.6, 7.2, 1.2).fill();
    doc.restore();
  } else if (tipo === 'mail') {
    doc.rect(x, y + 0.8, 7, 5).stroke();
    doc.moveTo(x, y + 0.8).lineTo(x + 3.5, y + 3.8).lineTo(x + 7, y + 0.8).stroke();
  } else {
    doc.circle(x + 3.4, y + 2.8, 2.6).fill();
    doc.moveTo(x + 1.2, y + 4).lineTo(x + 3.4, y + 7.4).lineTo(x + 5.6, y + 4).fill();
  }
  doc.restore();
}

/**
 * Dibuja por debajo del margen inferior sin que PDFKit abra una página.
 *
 * `doc.text()` compara `y + alto de línea` contra `page.maxY()` y, si se pasa, llama a `addPage()`.
 * Un pie vive justo ahí abajo: sin esto, pintar el pie abre una página, que dispara el pie otra
 * vez, y el documento se va en recursión.
 */
function sinPaginacion(doc: Doc, dibujar: () => void) {
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  try {
    dibujar();
  } finally {
    doc.page.margins.bottom = bottom;
  }
}

/** Barra de contacto del pie, con la curva verde del documento modelo. */
function pieDeSeccion(ctx: Ctx) {
  const { doc, empresa } = ctx;
  const base = ALTO;

  doc.save();
  // Curva verde: asoma por encima de la barra, a la derecha.
  doc
    .moveTo(398, base - 6)
    .lineTo(486, base - 64)
    .lineTo(574, base - 6)
    .lineWidth(7)
    .strokeColor(COLOR.teal)
    .stroke();
  // Loma gris a la derecha, como en el modelo.
  doc.moveTo(512, base - 20).lineTo(556, base - 38).lineTo(612, base - 18).lineTo(612, base).lineTo(512, base).fill(COLOR.grafito);
  // Barra oscura con el corte diagonal.
  doc
    .moveTo(0, base - 50)
    .lineTo(372, base - 50)
    .lineTo(410, base - 16)
    .lineTo(612, base - 16)
    .lineTo(612, base)
    .lineTo(0, base)
    .fill(COLOR.negro);
  doc.restore();

  const filas: Array<['web' | 'tel' | 'mail' | 'pin', string]> = [
    ['web', empresa.web],
    ['tel', empresa.telefono],
    ['mail', empresa.correo],
    ['pin', empresa.direccion],
  ];
  doc.font('Helvetica-Bold').fontSize(6.4).fillColor(COLOR.blanco);
  sinPaginacion(doc, () => {
    filas.forEach(([tipo, valor], i) => {
      const y = base - 46 + i * 9.4;
      icono(doc, tipo, MARGEN - 12, y - 0.6);
      doc.text(valor, MARGEN, y, { width: 330, lineBreak: false });
    });
  });
}

/** Membrete de la hoja de cotización: marca a la izquierda, datos de contacto a la derecha. */
function membrete(ctx: Ctx): number {
  const { doc, empresa } = ctx;
  const alto = dibujarMarca(ctx, ctx.marca, MARGEN + 8, 36, 96, COLOR.texto);
  doc
    .font('Helvetica')
    .fontSize(6.4)
    .fillColor(COLOR.gris)
    .text(empresa.lema.toLowerCase(), MARGEN - 8, 36 + alto + 2, { width: 128, align: 'center' });

  const x = MARGEN + 190;
  const ancho = ANCHO - MARGEN - x;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.texto);
  doc.text(empresa.direccion, x, 40, { width: ancho });
  doc.text(`Correo electrónico: ${empresa.correo}`, x, doc.y + 2, { width: ancho });
  doc.text(
    `Teléfonos: ${empresa.telefono}${empresa.telefonoAlterno ? `    /    ${empresa.telefonoAlterno}` : ''}`,
    x,
    doc.y + 2,
    { width: ancho },
  );

  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR.teal).text('COTIZACIÓN', x, 118, { width: ancho, align: 'center' });
  return 150;
}

// ─────────────────────────────────────────────────────────────────────────────
// Páginas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dibuja el marco de la página recién abierta y deja `doc.y` donde empieza el cuerpo.
 *
 * Va colgado de `pageAdded`, así que también cubre las páginas que abre PDFKit solo cuando un
 * párrafo se desborda: ninguna página puede salir sin su pie.
 */
function marcoDePagina(ctx: Ctx) {
  const { doc } = ctx;
  if (ctx.modo === 'portada' || ctx.modo === 'plano') return;
  // Cinturón: si dibujar el marco abriera otra página, no se vuelve a entrar aquí.
  if (ctx.pintandoMarco) return;
  ctx.pintandoMarco = true;
  try {
    pintarMarco(ctx);
  } finally {
    ctx.pintandoMarco = false;
  }
}

function pintarMarco(ctx: Ctx) {
  const { doc } = ctx;

  if (ctx.modo === 'cotizacion') {
    // El membrete va solo en la primera hoja de la cotización; las de continuación son tabla
    // limpia, como las páginas 9 y 10 del documento modelo.
    if (ctx.membretePuesto) {
      doc.y = 56;
    } else {
      doc.y = membrete(ctx);
      ctx.membretePuesto = true;
    }
    doc.x = MARGEN;
  } else {
    esquinaSeccion(doc);
    dibujarMarca(ctx, ctx.marca, ANCHO - MARGEN - 74, 26, 62, COLOR.texto);
    pieDeSeccion(ctx);

    if (ctx.seccion) {
      doc.font('Helvetica-Bold').fontSize(24).fillColor(COLOR.teal).text(ctx.seccion.numero, MARGEN_TEXTO, 84);
      if (!ctx.tituloPuesto) {
        doc
          .font('Helvetica-Bold')
          .fontSize(14)
          .fillColor(COLOR.texto)
          .text(ctx.seccion.titulo, MARGEN_TEXTO, 124, { width: ANCHO_TEXTO });
        ctx.tituloPuesto = true;
        doc.y = doc.y + 14;
      } else {
        doc.y = 124;
      }
    } else {
      doc.y = 96;
    }
    doc.x = MARGEN_TEXTO;
  }

  // Estado por omisión del cuerpo: si PDFKit siguió un párrafo aquí, continúa con el mismo estilo.
  doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.texto);
}

function abrirPagina(ctx: Ctx, modo: Modo, horizontal = false) {
  ctx.modo = modo;
  ctx.doc.addPage(
    horizontal
      ? { size: 'LETTER', layout: 'landscape', margin: 0 }
      : { size: 'LETTER', layout: 'portrait', margin: MARGEN },
  );
}

/** Abre página si lo que sigue no cabe encima del pie. */
function asegurarEspacio(ctx: Ctx, alto: number) {
  if (ctx.doc.y + alto > LIMITE_CUERPO) abrirPagina(ctx, ctx.modo);
}

function parrafo(ctx: Ctx, texto: string, opciones: { bold?: boolean; size?: number; color?: string; sangria?: number } = {}) {
  const { doc } = ctx;
  const x = MARGEN_TEXTO + (opciones.sangria ?? 0);
  doc
    .font(opciones.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(opciones.size ?? 9.5)
    .fillColor(opciones.color ?? COLOR.texto)
    .text(texto, x, doc.y, {
      width: ANCHO_TEXTO - (opciones.sangria ?? 0),
      align: 'justify',
      lineGap: 1.6,
    });
  doc.moveDown(0.55);
}

function portada(ctx: Ctx) {
  const { doc, payload, empresa } = ctx;
  abrirPagina(ctx, 'portada');

  doc.save();
  doc.rect(0, 0, ANCHO, ALTO).fill(COLOR.negro);
  // Cuña verde de la esquina inferior izquierda.
  doc.moveTo(0, ALTO - 214).lineTo(122, ALTO - 96).lineTo(122, ALTO).lineTo(0, ALTO).fill(COLOR.teal);
  doc.restore();

  // La marca preside la portada, como la ilustración del documento modelo.
  if (ctx.marca) {
    try {
      (doc as unknown as { image: (s: unknown, x: number, y: number, o: object) => void }).image(
        ctx.marca.imagen,
        ANCHO - 250,
        150,
        { width: 200 },
      );
    } catch {
      /* sin marca la portada sigue en pie */
    }
  }

  // Bloque negro con la marca escrita, sobre la ilustración.
  doc.save();
  doc.rect(0, 62, 300, 190).fill('#05090D');
  doc.restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(34)
    .fillColor('#B8C0C7')
    .text(empresa.nombre, MARGEN - 12, 128, { width: 300, characterSpacing: 7 });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#98A3AC')
    .text(empresa.lema, MARGEN - 10, 180, { width: 290 });

  doc.font('Helvetica').fontSize(27).fillColor(COLOR.blanco).text('PROPUESTA', MARGEN - 10, 276, { characterSpacing: 1.6 });
  doc
    .font('Helvetica-Bold')
    .fontSize(27)
    .fillColor(COLOR.tealVivo)
    .text('TÉCNICA', MARGEN - 10, 310, { characterSpacing: 1.6 });

  doc.moveTo(MARGEN - 10, 362).lineTo(268, 362).lineWidth(0.5).strokeColor('#2C3945').stroke();
  doc.circle(MARGEN - 4, 384, 4).fill(COLOR.tealVivo);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLOR.blanco)
    .text(`VERSIÓN ${Math.max(1, Number(payload.revision) || 1)}.0`, MARGEN + 8, 380, { characterSpacing: 0.8 });

  // Índice numerado sobre un panel apenas más claro.
  const indiceY = 438;
  const altoFila = 52;
  doc.save();
  doc.rect(MARGEN - 12, indiceY - 20, 336, INDICE.length * altoFila + 12).fill('#10171E');
  doc.restore();
  INDICE.forEach(([numero, titulo], i) => {
    const y = indiceY + i * altoFila;
    doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR.tealVivo).text(numero, MARGEN + 6, y);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLOR.blanco)
      .text(titulo, MARGEN + 62, y + 4, { characterSpacing: 1.1, lineBreak: false });
    if (i < INDICE.length - 1) {
      doc
        .moveTo(MARGEN + 6, y + 34)
        .lineTo(MARGEN + 290, y + 34)
        .lineWidth(0.5)
        .strokeColor('#28343F')
        .stroke();
    }
  });

  // Folio y cliente: lo único que el documento hecho a mano no traía y aquí sí se sabe.
  doc.font('Helvetica').fontSize(7).fillColor('#7E8B96').text('FOLIO', ANCHO - 236, 620, { width: 200 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.blanco).text(payload.folio, ANCHO - 236, 632, { width: 200 });
  doc.font('Helvetica').fontSize(7).fillColor('#7E8B96').text('CLIENTE', ANCHO - 236, 660, { width: 200 });
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(COLOR.blanco)
    .text(payload.cliente.empresa || payload.cliente.nombre || '—', ANCHO - 236, 672, { width: 200 });

  // Pie de portada: dirección web y la leyenda del modelo.
  sinPaginacion(doc, () => {
    icono(doc, 'web', 250, ALTO - 58);
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(COLOR.blanco)
      .text(dominio(empresa.web).replace(/^(?!www\.)/, 'www.'), 266, ALTO - 58, { lineBreak: false });
    doc.moveTo(400, ALTO - 64).lineTo(400, ALTO - 36).lineWidth(0.6).strokeColor('#4A5862').stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#C7D3DD')
      .text('Propuesta técnica sujeta a\ncontratación formal.', 414, ALTO - 62, { width: 170 });
  });
}

function seccionObjetivo(ctx: Ctx) {
  const { payload } = ctx;
  ctx.seccion = { numero: '01.', titulo: 'OBJETIVO DEL PROYECTO' };
  ctx.tituloPuesto = false;
  abrirPagina(ctx, 'seccion');

  parrafo(ctx, payload.objetivo.intro);

  if (payload.objetivo.beneficios.length) {
    parrafo(ctx, 'Entre los principales beneficios se encuentran:');
    payload.objetivo.beneficios.forEach((beneficio, i) => {
      asegurarEspacio(ctx, 34);
      const etiqueta = `${i + 1}.`;
      const y = ctx.doc.y;
      ctx.doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.texto).text(etiqueta, MARGEN_TEXTO + 18, y, { width: 16 });
      ctx.doc.text(beneficio, MARGEN_TEXTO + 36, y, {
        width: ANCHO_TEXTO - 36,
        align: 'justify',
        lineGap: 1.6,
      });
      ctx.doc.moveDown(0.45);
    });
    ctx.doc.moveDown(0.3);
  }

  asegurarEspacio(ctx, 52);
  parrafo(ctx, payload.objetivo.cierre);
}

function seccionAlcance(ctx: Ctx) {
  const { payload, doc } = ctx;
  ctx.seccion = { numero: '02.', titulo: 'ALCANCE DEL PROYECTO' };
  ctx.tituloPuesto = false;
  abrirPagina(ctx, 'seccion');

  if (!payload.alcance.length) {
    parrafo(ctx, 'El alcance de esta propuesta es el detallado en la sección 04, Cotización.', {
      color: COLOR.gris,
    });
    return;
  }

  payload.alcance.forEach((bloque, i) => {
    asegurarEspacio(ctx, 58);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLOR.texto)
      .text(`${i + 1}. ${bloque.titulo}`, MARGEN_TEXTO, doc.y, { width: ANCHO_TEXTO });
    doc.moveDown(0.35);
    if (bloque.texto) parrafo(ctx, bloque.texto);
    for (const vineta of bloque.vinetas ?? []) {
      asegurarEspacio(ctx, 24);
      const y = doc.y;
      doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.texto).text('•', MARGEN_TEXTO + 20, y, { width: 10 });
      doc.text(vineta, MARGEN_TEXTO + 38, y, { width: ANCHO_TEXTO - 38, align: 'left', lineGap: 1.6 });
      doc.moveDown(0.3);
    }
    doc.moveDown(0.35);
  });
}

function seccionPlanos(ctx: Ctx) {
  const { payload, doc } = ctx;
  // Un plano se lee a página completa y en horizontal, como el CCTV-01 del modelo.
  const vistos = new Set<string>();
  const imagenes: Array<{ nombre: string; ruta: string }> = [];
  const otros: PropuestaPlano[] = [];

  for (const plano of payload.planos) {
    if (!plano.url || vistos.has(plano.url)) continue;
    vistos.add(plano.url);
    const archivo = archivoDePlano(plano.url);
    if (archivo && /\.(png|jpe?g)$/i.test(archivo)) {
      imagenes.push({ nombre: plano.nombre || 'Plano', ruta: archivo });
    } else {
      otros.push(plano);
    }
  }

  for (const imagen of imagenes) {
    const preparada = imagenParaPdf(imagen.ruta, { maxLado: 1600 });
    if (!preparada) continue;
    abrirPagina(ctx, 'plano', true);
    const anchoPagina = ALTO;
    const altoPagina = ANCHO;
    try {
      doc.image(preparada.datos, 24, 24, { fit: [anchoPagina - 48, altoPagina - 62], align: 'center', valign: 'center' });
    } catch {
      continue;
    }
    sinPaginacion(doc, () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(COLOR.gris)
        .text(`03. PLANOS  ·  ${imagen.nombre}`, 24, altoPagina - 28, { width: anchoPagina - 48, lineBreak: false });
    });
  }

  if (imagenes.length && !otros.length) return;

  ctx.seccion = { numero: '03.', titulo: 'PLANOS' };
  ctx.tituloPuesto = false;
  abrirPagina(ctx, 'seccion');

  if (!imagenes.length && !otros.length) {
    parrafo(ctx, 'Esta propuesta no incluye planos anexos.', { color: COLOR.gris });
    return;
  }
  if (otros.length) {
    parrafo(ctx, 'Anexos que acompañan a esta propuesta:');
    for (const plano of otros) {
      asegurarEspacio(ctx, 22);
      const y = doc.y;
      doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.texto).text('•', MARGEN_TEXTO + 20, y, { width: 10 });
      doc.text(plano.nombre || plano.url, MARGEN_TEXTO + 38, y, { width: ANCHO_TEXTO - 38 });
      doc.moveDown(0.3);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 04 Cotización
// ─────────────────────────────────────────────────────────────────────────────

const COL = (() => {
  const anchos = [228, 58, 58, 82, 90];
  let x = MARGEN;
  return (['DESCRIPCIÓN', 'UNIDAD', 'CANTIDAD', 'PRECIO', 'TOTAL'] as const).map((titulo, i) => {
    const col = { titulo, x, ancho: anchos[i]! };
    x += anchos[i]!;
    return col;
  });
})();

/** Importe como en el modelo: el signo pegado a la izquierda y la cifra alineada a la derecha. */
function importe(doc: Doc, valor: number, x: number, ancho: number, y: number) {
  doc.text('$', x + 5, y, { width: 8, lineBreak: false });
  doc.text(numeroMx.format(Number(valor) || 0), x + 5, y, { width: ancho - 10, align: 'right' });
}

function cabeceraTabla(ctx: Ctx) {
  const { doc } = ctx;
  const y = doc.y;
  doc.save();
  doc.rect(MARGEN, y, ANCHO_UTIL, 22).fill(COLOR.teal);
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(7.6).fillColor(COLOR.blanco);
  for (const col of COL) {
    doc.text(col.titulo, col.x, y + 7.5, { width: col.ancho, align: 'center' });
  }
  // Rejilla del encabezado, igual que la del cuerpo.
  doc.save().lineWidth(0.5).strokeColor(COLOR.linea);
  doc.rect(MARGEN, y, ANCHO_UTIL, 22).stroke();
  for (const col of COL.slice(1)) doc.moveTo(col.x, y).lineTo(col.x, y + 22).stroke();
  doc.restore();
  doc.y = y + 22;
}

/** Marco de la fila y sus separadores verticales. */
function rejillaFila(doc: Doc, y: number, alto: number) {
  doc.save().lineWidth(0.5).strokeColor(COLOR.linea);
  doc.rect(MARGEN, y, ANCHO_UTIL, alto).stroke();
  for (const col of COL.slice(1)) doc.moveTo(col.x, y).lineTo(col.x, y + alto).stroke();
  doc.restore();
}

function seccionCotizacion(ctx: Ctx) {
  const { doc, payload } = ctx;
  ctx.seccion = null;
  abrirPagina(ctx, 'cotizacion');

  // Recuadros de fecha, folio y validez.
  const cajaY = 150;
  const cajaX = MARGEN + 190;
  const cajaAncho = ANCHO - MARGEN - cajaX;
  const altoFila = 26;
  doc.save().lineWidth(1).strokeColor(COLOR.texto);
  doc.roundedRect(cajaX - 6, cajaY, cajaAncho + 6, altoFila * 3, 6).stroke();
  doc.restore();

  const campos: Array<[string, string]> = [
    ['Fecha de emisión:', payload.issueDate],
    ['Cotización N°:', payload.folio],
    ['Validez:', payload.validUntil ?? 'Sujeta a confirmación'],
  ];
  campos.forEach(([etiqueta, valor], i) => {
    const y = cajaY + i * altoFila;
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.texto).text(etiqueta, cajaX + 4, y + 8, { width: 116 });
    doc.save().lineWidth(0.8).strokeColor(COLOR.texto);
    doc.rect(cajaX + 122, y, cajaAncho - 128, altoFila).stroke();
    doc.restore();
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLOR.texto)
      .text(valor, cajaX + 128, y + 8, { width: cajaAncho - 140, align: 'center', lineBreak: false });
  });

  // Franja verde de cliente y teléfono.
  const clienteY = cajaY + altoFila * 3 + 16;
  doc.save();
  doc.rect(MARGEN, clienteY, 146, 34).fill(COLOR.teal);
  doc.lineWidth(1).strokeColor(COLOR.texto).rect(MARGEN, clienteY, ANCHO_UTIL, 34).stroke();
  doc.restore();
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.blanco);
  doc.text('Cliente:', MARGEN + 6, clienteY + 5, { width: 100, lineBreak: false });
  doc.text('Teléfono:', MARGEN + 6, clienteY + 18, { width: 100, lineBreak: false });
  doc.fillColor(COLOR.texto);
  doc.text(payload.cliente.empresa || payload.cliente.nombre || '—', MARGEN + 154, clienteY + 5, {
    width: ANCHO_UTIL - 160,
    lineBreak: false,
  });
  doc.text(payload.cliente.telefono || '—', MARGEN + 154, clienteY + 18, { width: ANCHO_UTIL - 160, lineBreak: false });

  doc.y = clienteY + 46;
  cabeceraTabla(ctx);

  for (const grupo of payload.grupos) {
    if (doc.y + 44 > LIMITE_CUERPO + 30) {
      abrirPagina(ctx, 'cotizacion');
      cabeceraTabla(ctx);
    }
    // Banda del grupo: el cliente ve cuánto es equipo y cuánto es trabajo.
    const yGrupo = doc.y;
    doc.save();
    doc.rect(MARGEN, yGrupo, ANCHO_UTIL, 17).fill(COLOR.tealSuave);
    doc.restore();
    doc
      .font('Helvetica-Bold')
      .fontSize(7.8)
      .fillColor(COLOR.texto)
      .text(grupo.etiqueta.toUpperCase(), MARGEN + 6, yGrupo + 5, { width: 300, lineBreak: false });
    doc.fillColor(COLOR.texto).font('Helvetica-Bold').fontSize(7.8);
    importe(doc, grupo.subtotal, COL[4]!.x, COL[4]!.ancho, yGrupo + 5);
    rejillaFila(doc, yGrupo, 17);
    doc.y = yGrupo + 17;

    for (const partida of grupo.partidas) {
      const texto = partida.description ? `${partida.name}\n${partida.description}` : partida.name;
      doc.font('Helvetica').fontSize(7.6);
      const alto = Math.max(doc.heightOfString(texto, { width: COL[0]!.ancho - 12 }), 14) + 14;

      if (doc.y + alto > ALTO - MARGEN) {
        abrirPagina(ctx, 'cotizacion');
        cabeceraTabla(ctx);
      }

      const y = doc.y;
      doc.font('Helvetica').fontSize(7.6).fillColor(COLOR.texto);
      doc.text(texto, COL[0]!.x + 6, y + 7, { width: COL[0]!.ancho - 12 });
      const centro = y + alto / 2 - 4;
      doc.text(partida.unit || 'Pieza', COL[1]!.x, centro, { width: COL[1]!.ancho, align: 'center', lineBreak: false });
      doc.text(cantidadMx.format(Number(partida.qty) || 0), COL[2]!.x, centro, {
        width: COL[2]!.ancho,
        align: 'center',
        lineBreak: false,
      });
      importe(doc, partida.unitPrice, COL[3]!.x, COL[3]!.ancho, centro);
      importe(doc, partida.lineTotal, COL[4]!.x, COL[4]!.ancho, centro);
      rejillaFila(doc, y, alto);
      doc.y = y + alto;
    }
  }

  // Bloque de totales, pegado a la derecha como en el modelo.
  if (doc.y + 70 > ALTO - MARGEN) abrirPagina(ctx, 'cotizacion');
  const totY = doc.y + 8;
  const totAncho = 194;
  const totX = ANCHO - MARGEN - totAncho;
  const filas: Array<[string, number, boolean]> = [
    ['SUBTOTAL', payload.subtotal, false],
    ['IVA', payload.iva, false],
    ['TOTAL', payload.total, true],
  ];
  doc.save().lineWidth(0.8).strokeColor(COLOR.linea);
  doc.rect(totX, totY, totAncho, 17 * filas.length).stroke();
  doc.moveTo(totX + 88, totY).lineTo(totX + 88, totY + 17 * filas.length).stroke();
  doc.restore();
  filas.forEach(([etiqueta, valor, fuerte], i) => {
    const y = totY + i * 17;
    doc
      .font(fuerte ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8.6)
      .fillColor(COLOR.texto)
      .text(etiqueta, totX + 4, y + 5, { width: 80, align: 'right', lineBreak: false });
    importe(doc, valor, totX + 88, totAncho - 88, y + 5);
  });

  // Términos y condiciones: por segmento y por lo que realmente se cobra.
  const terY = Math.max(totY + 17 * filas.length + 18, doc.y + 8);
  doc.y = terY;
  if (doc.y + 90 > ALTO - MARGEN) abrirPagina(ctx, 'cotizacion');
  doc
    .font('Helvetica-Bold')
    .fontSize(7.4)
    .fillColor(COLOR.texto)
    .text(payload.terminos.titulo.toUpperCase(), MARGEN, doc.y, { width: 330 });
  doc.moveDown(0.25);
  for (const linea of payload.terminos.lineas) {
    if (doc.y + 22 > ALTO - MARGEN) abrirPagina(ctx, 'cotizacion');
    doc.font('Helvetica').fontSize(7.4).fillColor(COLOR.texto).text(linea, MARGEN, doc.y, { width: 330, lineGap: 0.6 });
    doc.moveDown(0.14);
  }

  if (payload.participantes.length) {
    doc.moveDown(0.5);
    if (doc.y + 20 > ALTO - MARGEN) abrirPagina(ctx, 'cotizacion');
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(COLOR.gris)
      .text(
        `Elaborada por: ${payload.participantes.map((p) => `${p.nombre} (${p.rolEtiqueta})`).join('  ·  ')}`,
        MARGEN,
        doc.y,
        { width: 330 },
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/** Documento completo, listo para adjuntar al correo o descargar. */
export async function generarPropuestaTecnicaPdf(payload: PropuestaPayload): Promise<Buffer> {
  // Sin `bufferPages`: el documento se escribe de una pasada y cada página sale con su pie puesto.
  const doc = new PDFDocument({ size: 'LETTER', margin: MARGEN, autoFirstPage: false });
  doc.info.Title = `Propuesta técnica ${payload.folio}`;
  doc.info.Author = datosEmpresa(payload).nombre;

  const trozos: Buffer[] = [];
  doc.on('data', (trozo: Buffer) => trozos.push(trozo));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
  });

  const ctx: Ctx = {
    doc,
    payload,
    empresa: datosEmpresa(payload),
    marca: abrirMarca(doc),
    modo: 'portada',
    seccion: null,
    tituloPuesto: false,
  };

  doc.on('pageAdded', () => marcoDePagina(ctx));

  portada(ctx);
  seccionObjetivo(ctx);
  seccionAlcance(ctx);
  seccionPlanos(ctx);
  seccionCotizacion(ctx);

  doc.end();
  return listo;
}
