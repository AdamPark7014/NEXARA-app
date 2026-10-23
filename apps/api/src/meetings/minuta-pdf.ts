import PDFDocument from 'pdfkit';
import { PDF_FUENTES, loadNexaraLogo, registrarFuentesCorporativas } from '../common/pdf/nexara-pdf-theme.js';
import { MEETING_DEFAULTS, type MeetingType } from './meeting-rhythm.js';
import {
  ESTADO_PREVIO_LABEL,
  PRIORIDAD_LABEL,
  marcaTiempo,
  type Minuta,
  type Prioridad,
  type SeguimientoMinuta,
} from './minuta-ia.js';

/**
 * PDF de la minuta de una reunión grabada: el registro oficial de la junta.
 *
 * Mismo lenguaje que la propuesta técnica (`cotizaciones/propuesta-tecnica-pdf.ts`): fondo blanco,
 * Montserrat para títulos e Inter para el cuerpo, el verde de la marca solo como acento y hojas
 * interiores con encabezado corrido y «Página n de N». La IA solo escribe el contenido (JSON con
 * esquema); la maquetación es toda de aquí.
 *
 *   Portada        título, tipo, fecha, hora, duración, quién conduce y asistentes
 *   Hoja 2         01 Resumen ejecutivo · 02 Lo más importante · índice con páginas
 *   03…            temas (uno por apartado), decisiones, acuerdos (tabla), pendientes y preguntas,
 *                  riesgos, cifras, lecciones y próximos pasos, seguimiento de la reunión anterior
 *   Anexo          transcripción completa con marcas de tiempo
 *
 * Las secciones vacías no se imprimen y el índice se renumera.
 */

const C = {
  tinta: '#111827',
  pizarra: '#475569',
  tenue: '#94A3B8',
  linea: '#E5E7EB',
  cabecera: '#0B1F3A',
  tinte: '#EAF6F3',
  suave: '#F5F7FB',
  acento: '#1F9E84',
  blanco: '#FFFFFF',
} as const;

const F = PDF_FUENTES;
const ANCHO = 612;
const ALTO = 792;
const X = 64;
const DER = ANCHO - 64;
const COL = DER - X;
const INICIO = 92;
const LIMITE = 720;
const CUERPO = 10;
const RENGLON = 14.6;

type Doc = InstanceType<typeof PDFDocument>;

export type MinutaPdfPayload = {
  id: number;
  tipo: string;
  titulo: string;
  fecha: Date;
  horaInicio?: string | null;
  facilitador?: { nombre?: string | null } | null;
  asistentes: Array<{ asistio: boolean; user?: { nombre?: string | null } | null }>;
  minuta: Minuta;
  duracionMs: number;
  iniciadaAt?: Date | null;
  transcripcion?: string | null;
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** `fecha` es @db.Date (medianoche UTC): se lee sin zona. */
function fechaLarga(d: Date, conDia = false): string {
  const base = `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  return conDia ? `${DIAS[d.getUTCDay()]} ${base}` : base;
}

/** `2026-10-23` → `23 oct 2026`. */
function fechaCorta(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1].slice(0, 3)} ${m[1]}` : '—';
}

function duracionTexto(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')} min`;
}

const COLOR_PRIORIDAD: Record<Prioridad, [string, string]> = {
  alta: ['#B42318', '#FEE4E2'],
  media: ['#B54708', '#FEF0C7'],
  baja: ['#475569', '#EEF2F6'],
};

const COLOR_ESTADO: Record<SeguimientoMinuta['estado'], [string, string]> = {
  cumplido: ['#067647', '#DCFAE6'],
  en_proceso: ['#175CD3', '#DCEBFE'],
  sin_avance: ['#B54708', '#FEF0C7'],
  bloqueado: ['#B42318', '#FEE4E2'],
  cancelado: ['#475569', '#EEF2F6'],
  sin_mencion: ['#94A3B8', '#F5F7FB'],
};

// ── Primitivas ──────────────────────────────────────────────────────────

const ascenso = (doc: Doc) => ((doc as unknown as { _font: { ascender: number } })._font.ascender || 718) / 1000;

function renglon(
  doc: Doc,
  texto: string,
  x: number,
  base: number,
  o: { tamano: number; fuente?: string; color?: string; espaciado?: number; alinear?: 'izq' | 'der'; max?: number },
) {
  doc.font(o.fuente ?? F.texto).fontSize(o.tamano);
  let tamano = o.tamano;
  let ancho = doc.widthOfString(texto, { characterSpacing: o.espaciado ?? 0 });
  if (o.max && ancho > o.max) {
    tamano = Math.max(5, (tamano * o.max) / ancho);
    doc.fontSize(tamano);
    ancho = doc.widthOfString(texto, { characterSpacing: o.espaciado ?? 0 });
  }
  const xr = o.alinear === 'der' ? x - ancho : x;
  doc.fillColor(o.color ?? C.tinta).text(texto, xr, base - ascenso(doc) * tamano, { lineBreak: false, characterSpacing: o.espaciado ?? 0 });
  return ancho;
}

function filete(doc: Doc, x1: number, x2: number, y: number, color: string = C.linea, grosor = 0.6) {
  doc.save();
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(grosor).strokeColor(color).stroke();
  doc.restore();
}

function caja(doc: Doc, x: number, y: number, w: number, h: number, color: string, radio = 0) {
  doc.save();
  if (radio) doc.roundedRect(x, y, w, h, radio).fill(color);
  else doc.rect(x, y, w, h).fill(color);
  doc.restore();
}

/** Etiqueta de color (prioridad, estado). Devuelve el ancho. */
function pastilla(doc: Doc, texto: string, x: number, y: number, [tinta, fondo]: [string, string]) {
  doc.font(F.semi).fontSize(7.5);
  const w = doc.widthOfString(texto) + 12;
  caja(doc, x, y, w, 14, fondo, 7);
  doc.fillColor(tinta).text(texto, x + 6, y + 3.4, { lineBreak: false });
  return w;
}

function alto(doc: Doc, texto: string, ancho: number, fuente: string = F.texto, tamano = CUERPO, renglonPt = RENGLON) {
  doc.font(fuente).fontSize(tamano);
  const gap = renglonPt - doc.currentLineHeight(false);
  return doc.heightOfString(texto || ' ', { width: ancho, lineGap: gap });
}

function parrafo(doc: Doc, texto: string, x: number, y: number, ancho: number, o: { fuente?: string; tamano?: number; color?: string; renglon?: number } = {}) {
  const tamano = o.tamano ?? CUERPO;
  doc.font(o.fuente ?? F.texto).fontSize(tamano).fillColor(o.color ?? C.tinta);
  const gap = (o.renglon ?? RENGLON) - doc.currentLineHeight(false);
  doc.text(texto || ' ', x, y, { width: ancho, lineGap: gap });
}

// ── Documento ───────────────────────────────────────────────────────────

type Marca = { objeto: unknown; ancho: number; alto: number } | null;

type Ctx = {
  doc: Doc;
  r: MinutaPdfPayload;
  marca: Marca;
  /** Sección de cada hoja (null = portada), para el encabezado corrido y el pie. */
  secciones: Array<string | null>;
  seccion: string;
  y: number;
};

function abrirMarca(doc: Doc): Marca {
  const bytes = loadNexaraLogo();
  if (!bytes) return null;
  try {
    const o = (doc as unknown as { openImage: (b: Buffer) => { width: number; height: number } }).openImage(bytes);
    return { objeto: o, ancho: o.width, alto: o.height };
  } catch {
    return null;
  }
}

function firma(ctx: Ctx, x: number, y: number, altoMarca: number, tamano: number, espaciado: number) {
  const { doc, marca } = ctx;
  let ancho = 0;
  if (marca) {
    ancho = (marca.ancho / marca.alto) * altoMarca;
    try {
      (doc as unknown as { image: (s: unknown, x: number, y: number, o: object) => void }).image(marca.objeto, x, y, { width: ancho, height: altoMarca });
    } catch {
      ancho = 0;
    }
  }
  const xNombre = ancho ? x + ancho + tamano * 0.9 : x;
  renglon(doc, 'NEXARA', xNombre, y + altoMarca / 2 + tamano * 0.35, { tamano, fuente: F.titulo, espaciado });
  return xNombre;
}

/** Hoja interior nueva con su encabezado corrido. */
function hoja(ctx: Ctx) {
  const { doc } = ctx;
  doc.addPage({ size: 'LETTER', margins: { top: INICIO, bottom: ALTO - LIMITE, left: X, right: ANCHO - DER } });
  ctx.secciones.push(ctx.seccion);
  caja(doc, 0, 0, ANCHO, 64, C.tinte);
  caja(doc, 0, 0, ANCHO, 4, C.acento);
  firma(ctx, X, 28, 15, 8, 2.4);
  renglon(doc, `MINUTA  ·  ${ctx.seccion.toUpperCase()}`, DER, 39, { tamano: 7.5, fuente: F.medio, color: C.pizarra, espaciado: 1.2, alinear: 'der', max: 300 });
  ctx.y = INICIO;
}

/** Garantiza `h` pt libres; si no caben, hoja nueva. */
function asegurar(ctx: Ctx, h: number) {
  if (ctx.y + h > LIMITE) hoja(ctx);
}

/** Apertura de sección: número verde, título y filete. */
function apertura(ctx: Ctx, numero: string, titulo: string, opciones: { hojaNueva?: boolean } = {}) {
  ctx.seccion = titulo;
  if (opciones.hojaNueva) hoja(ctx);
  else asegurar(ctx, 110);
  const { doc } = ctx;
  if (ctx.y > INICIO) ctx.y += 18;
  renglon(doc, numero, X, ctx.y + 10, { tamano: 9, fuente: F.semi, color: C.acento, espaciado: 0.8 });
  renglon(doc, titulo, X, ctx.y + 34, { tamano: 18, fuente: F.titulo, color: C.tinta });
  caja(doc, X, ctx.y + 44, 40, 2, C.acento);
  ctx.y += 62;
  return doc.bufferedPageRange().count;
}

function vinetas(ctx: Ctx, items: string[], o: { numeradas?: boolean; sangria?: number } = {}) {
  const { doc } = ctx;
  const sangria = o.sangria ?? 0;
  items.forEach((t, i) => {
    const ancho = COL - sangria - 18;
    const h = alto(doc, t, ancho);
    asegurar(ctx, h + 4);
    const marcaTexto = o.numeradas ? `${i + 1}.` : '•';
    renglon(doc, marcaTexto, X + sangria, ctx.y + ascenso(doc) * CUERPO + 0.5, {
      tamano: CUERPO,
      fuente: o.numeradas ? F.semi : F.texto,
      color: o.numeradas ? C.acento : C.pizarra,
    });
    parrafo(doc, t, X + sangria + 18, ctx.y, ancho);
    ctx.y += h + 5;
  });
}

type Columna = { titulo: string; ancho: number };

/** Tabla con encabezado oscuro que se repite en cada hoja; `celda` dibuja casos especiales. */
function tabla(
  ctx: Ctx,
  columnas: Columna[],
  filas: string[][],
  celda?: (fila: number, col: number, x: number, y: number) => boolean,
) {
  const { doc } = ctx;
  const encabezado = () => {
    caja(doc, X, ctx.y, COL, 22, C.cabecera);
    let x = X;
    for (const c of columnas) {
      renglon(doc, c.titulo.toUpperCase(), x + 8, ctx.y + 14, { tamano: 7.2, fuente: F.semi, color: C.blanco, espaciado: 0.8, max: c.ancho - 12 });
      x += c.ancho;
    }
    ctx.y += 22;
  };
  asegurar(ctx, 60);
  encabezado();
  filas.forEach((fila, i) => {
    const altos = fila.map((t, j) => alto(doc, t, columnas[j].ancho - 16, F.texto, 9, 12.6));
    const h = Math.max(...altos, 14) + 12;
    if (ctx.y + h > LIMITE) {
      hoja(ctx);
      encabezado();
    }
    if (i % 2 === 1) caja(doc, X, ctx.y, COL, h, C.suave);
    let x = X;
    fila.forEach((t, j) => {
      if (!celda?.(i, j, x + 8, ctx.y + 6)) {
        parrafo(doc, t, x + 8, ctx.y + 6, columnas[j].ancho - 16, { tamano: 9, renglon: 12.6, fuente: j === 0 ? F.medio : F.texto });
      }
      x += columnas[j].ancho;
    });
    ctx.y += h;
    filete(doc, X, DER, ctx.y);
  });
  ctx.y += 6;
}

function subtitulo(ctx: Ctx, texto: string) {
  asegurar(ctx, 50);
  ctx.y += 6;
  renglon(ctx.doc, texto.toUpperCase(), X, ctx.y + 8, { tamano: 7.8, fuente: F.semi, color: C.pizarra, espaciado: 1.3 });
  ctx.y += 18;
}

// ── Portada ─────────────────────────────────────────────────────────────

function portada(ctx: Ctx) {
  const { doc, r } = ctx;
  const m = r.minuta;
  caja(doc, 0, 0, ANCHO, 6, C.acento);
  firma(ctx, X, 58, 30, 12.5, 4.2);

  renglon(doc, 'MINUTA DE REUNIÓN', X, 210, { tamano: 9, fuente: F.semi, color: C.acento, espaciado: 2.4 });
  // Título: 30 → 22 pt hasta que quepa en tres renglones.
  let tamano = 30;
  for (; tamano > 22; tamano -= 2) {
    if (alto(doc, r.titulo, 470, F.titulo, tamano, tamano * 1.16) <= tamano * 1.16 * 3 + 1) break;
  }
  parrafo(doc, r.titulo, X, 224, 470, { fuente: F.titulo, tamano, renglon: tamano * 1.16 });
  let y = 224 + alto(doc, r.titulo, 470, F.titulo, tamano, tamano * 1.16) + 8;
  const tipo = MEETING_DEFAULTS[r.tipo as MeetingType]?.titulo ?? r.tipo;
  renglon(doc, `${tipo} · ${fechaLarga(r.fecha, true)}`, X, y + 12, { tamano: 13, color: C.pizarra, max: COL });
  caja(doc, X, y + 32, 48, 2, C.acento);

  // Rejilla de datos.
  y = Math.max(y + 70, 430);
  filete(doc, X, DER, y);
  const presentes = r.asistentes.filter((a) => a.asistio).length;
  const celdas: Array<[string, string]> = [
    ['Fecha', fechaLarga(r.fecha)],
    ['Hora de inicio', r.horaInicio || '—'],
    ['Duración grabada', r.duracionMs ? duracionTexto(r.duracionMs) : '—'],
    ['Conduce', r.facilitador?.nombre || '—'],
    ['Asistentes', r.asistentes.length ? `${r.asistentes.length} convocados${presentes ? ` · ${presentes} con asistencia` : ''}` : '—'],
    ['Acuerdos propuestos', String(m.acuerdos.length)],
  ];
  const anchoCelda = (COL - 28) / 2;
  let yFila = y + 22;
  for (let i = 0; i < celdas.length; i += 2) {
    for (const [j, [etiqueta, valor]] of [celdas[i], celdas[i + 1]].entries()) {
      const x = X + j * (anchoCelda + 28);
      renglon(doc, etiqueta.toUpperCase(), x, yFila, { tamano: 7.5, fuente: F.medio, color: C.tenue, espaciado: 1.3 });
      renglon(doc, valor, x, yFila + 17, { tamano: 11, color: C.tinta, max: anchoCelda });
    }
    yFila += 42;
  }

  // Asistentes por nombre.
  const nombres = r.asistentes.map((a) => a.user?.nombre).filter(Boolean) as string[];
  if (nombres.length) {
    filete(doc, X, DER, yFila);
    renglon(doc, 'CONVOCADOS', X, yFila + 20, { tamano: 7.5, fuente: F.medio, color: C.tenue, espaciado: 1.3 });
    const texto = nombres.join('  ·  ');
    doc.font(F.texto).fontSize(9.5).fillColor(C.pizarra);
    doc.text(texto, X, yFila + 28, { width: COL, height: 60, ellipsis: true, lineGap: 3 });
  }

  renglon(doc, 'Minuta generada a partir de la grabación de la junta. Revisa los acuerdos antes de darlos por oficiales.', X, 752, {
    tamano: 8,
    color: C.pizarra,
    max: COL,
  });
}

// ── Armado ──────────────────────────────────────────────────────────────

export const generarMinutaPdf = (r: MinutaPdfPayload): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true, autoFirstPage: false, info: { Title: `Minuta · ${r.titulo}`, Author: 'NEXARA' } });
    const partes: Buffer[] = [];
    doc.on('data', (c) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    registrarFuentesCorporativas(doc);

    const ctx: Ctx = { doc, r, marca: null, secciones: [], seccion: 'Portada', y: 0 };
    const m = r.minuta;

    doc.addPage({ size: 'LETTER', margin: 0 });
    ctx.secciones.push(null);
    ctx.marca = abrirMarca(doc);
    portada(ctx);

    // Secciones con contenido, numeradas en orden.
    let n = 0;
    const num = () => String(++n).padStart(2, '0');
    const indice: Array<{ numero: string; titulo: string; pagina: number; nivel: 0 | 1 }> = [];

    // 01 Resumen ejecutivo y 02 Lo más importante.
    const nResumen = num();
    let pagina = apertura(ctx, nResumen, 'Resumen ejecutivo', { hojaNueva: true });
    indice.push({ numero: nResumen, titulo: 'Resumen ejecutivo', pagina, nivel: 0 });
    const hResumen = alto(doc, m.resumenEjecutivo, COL - 28, F.texto, 10.5, 16);
    caja(doc, X, ctx.y, COL, hResumen + 28, C.suave, 6);
    caja(doc, X, ctx.y, 3, hResumen + 28, C.acento);
    parrafo(doc, m.resumenEjecutivo, X + 16, ctx.y + 14, COL - 28, { tamano: 10.5, renglon: 16 });
    ctx.y += hResumen + 40;

    if (m.loMasImportante.length) {
      const numero = num();
      pagina = apertura(ctx, numero, 'Lo más importante');
      indice.push({ numero, titulo: 'Lo más importante', pagina, nivel: 0 });
      m.loMasImportante.forEach((t, i) => {
        const h = alto(doc, t, COL - 44, F.medio, 10.5, 15);
        asegurar(ctx, h + 14);
        renglon(doc, String(i + 1), X + 4, ctx.y + 14, { tamano: 16, fuente: F.titulo, color: C.acento });
        parrafo(doc, t, X + 36, ctx.y + 2, COL - 44, { fuente: F.medio, tamano: 10.5, renglon: 15 });
        ctx.y += Math.max(h, 18) + 8;
        filete(doc, X + 36, DER, ctx.y - 3);
      });
    }

    // Índice: lugar reservado; se llena al final, cuando ya se saben las páginas.
    const entradasIndice = 2 + m.temas.length + 8;
    const altoIndice = 50 + entradasIndice * 17;
    ctx.seccion = 'Índice';
    if (ctx.y + altoIndice + 30 > LIMITE) hoja(ctx);
    else ctx.y += 24;
    const indicePagina = doc.bufferedPageRange().count - 1;
    const indiceY = ctx.y;
    ctx.y += altoIndice;

    // 03 Temas: uno por apartado.
    if (m.temas.length) {
      const numero = num();
      pagina = apertura(ctx, numero, 'Temas tratados', { hojaNueva: true });
      indice.push({ numero, titulo: 'Temas tratados', pagina, nivel: 0 });
      m.temas.forEach((t, i) => {
        const sub = `${Number(numero)}.${i + 1}`;
        const hTitulo = alto(doc, t.titulo, COL - 40, F.titulo, 12.5, 17);
        asegurar(ctx, hTitulo + 60);
        ctx.y += i ? 12 : 0;
        renglon(doc, sub, X, ctx.y + 12, { tamano: 10, fuente: F.semi, color: C.acento });
        parrafo(doc, t.titulo, X + 40, ctx.y, COL - 40, { fuente: F.titulo, tamano: 12.5, renglon: 17 });
        indice.push({ numero: sub, titulo: t.titulo, pagina: doc.bufferedPageRange().count, nivel: 1 });
        ctx.y += hTitulo + 6;
        if (t.resumen) {
          const h = alto(doc, t.resumen, COL - 40, F.texto, 10, RENGLON);
          asegurar(ctx, h + 6);
          parrafo(doc, t.resumen, X + 40, ctx.y, COL - 40, { color: C.pizarra });
          ctx.y += h + 6;
        }
        vinetas(ctx, t.puntos, { sangria: 40 });
        if (t.conclusion) {
          const texto = `Cómo quedó: ${t.conclusion}`;
          const h = alto(doc, texto, COL - 64, F.medio, 9.5, 13.5);
          asegurar(ctx, h + 18);
          caja(doc, X + 40, ctx.y, COL - 40, h + 14, C.tinte, 4);
          parrafo(doc, texto, X + 52, ctx.y + 7, COL - 64, { fuente: F.medio, tamano: 9.5, renglon: 13.5, color: C.cabecera });
          ctx.y += h + 22;
        }
      });
    }

    const seccion = (titulo: string, dibujar: () => void, hojaNueva = false) => {
      const numero = num();
      const p = apertura(ctx, numero, titulo, { hojaNueva });
      indice.push({ numero, titulo, pagina: p, nivel: 0 });
      dibujar();
    };

    if (m.decisiones.length) seccion('Decisiones', () => vinetas(ctx, m.decisiones, { numeradas: true }), true);

    if (m.acuerdos.length) {
      seccion('Acuerdos', () => {
        const columnas: Columna[] = [
          { titulo: '#', ancho: 26 },
          { titulo: 'Acuerdo', ancho: COL - 26 - 128 - 76 - 64 },
          { titulo: 'Responsable', ancho: 128 },
          { titulo: 'Fecha', ancho: 76 },
          { titulo: 'Prioridad', ancho: 64 },
        ];
        tabla(
          ctx,
          columnas,
          m.acuerdos.map((a, i) => [
            String(i + 1),
            a.descripcion,
            a.responsable?.nombre ?? (a.textoResponsable ? `${a.textoResponsable} (por confirmar)` : 'Sin responsable'),
            fechaCorta(a.fechaCompromiso),
            PRIORIDAD_LABEL[a.prioridad],
          ]),
          (fila, col, x, y) => {
            if (col !== 4) return false;
            const p = m.acuerdos[fila].prioridad;
            pastilla(doc, PRIORIDAD_LABEL[p], x, y - 1, COLOR_PRIORIDAD[p]);
            return true;
          },
        );
      });
    }

    if (m.pendientes.length || m.preguntasAbiertas.length) {
      seccion('Pendientes y preguntas abiertas', () => {
        if (m.pendientes.length) {
          subtitulo(ctx, 'Pendientes sin responsable');
          vinetas(ctx, m.pendientes);
        }
        if (m.preguntasAbiertas.length) {
          subtitulo(ctx, 'Preguntas abiertas');
          vinetas(ctx, m.preguntasAbiertas);
        }
      });
    }

    if (m.riesgos.length) {
      seccion('Riesgos y bloqueos', () =>
        tabla(
          ctx,
          [
            { titulo: 'Riesgo o bloqueo', ancho: COL * 0.58 },
            { titulo: 'Mitigación', ancho: COL * 0.42 },
          ],
          m.riesgos.map((x) => [x.riesgo, x.mitigacion ?? 'No se definió']),
        ),
      );
    }

    if (m.cifras.length) {
      seccion('Cifras y datos', () =>
        tabla(
          ctx,
          [
            { titulo: 'Dato', ancho: COL * 0.34 },
            { titulo: 'Contexto', ancho: COL * 0.66 },
          ],
          m.cifras.map((c) => [c.dato, c.contexto || '—']),
        ),
      );
    }

    if (m.lecciones.length || m.proximosPasos.length) {
      seccion('Lecciones y próximos pasos', () => {
        if (m.proximosPasos.length) {
          subtitulo(ctx, 'Próximos pasos');
          vinetas(ctx, m.proximosPasos, { numeradas: true });
        }
        if (m.lecciones.length) {
          subtitulo(ctx, 'Lecciones aprendidas');
          vinetas(ctx, m.lecciones);
        }
      });
    }

    if (m.seguimiento.length) {
      const titulo = m.reunionAnterior
        ? `Seguimiento de la reunión anterior`
        : 'Seguimiento de acuerdos anteriores';
      seccion(titulo, () => {
        if (m.reunionAnterior) {
          const d = new Date(`${m.reunionAnterior.fecha}T12:00:00Z`);
          parrafo(doc, `Acuerdos de «${m.reunionAnterior.titulo}» del ${fechaLarga(d)} y lo que se dijo de cada uno en esta junta.`, X, ctx.y, COL, { color: C.pizarra });
          ctx.y += 26;
        }
        tabla(
          ctx,
          [
            { titulo: 'Acuerdo', ancho: COL * 0.38 },
            { titulo: 'Responsable', ancho: COL * 0.2 },
            { titulo: 'Estado', ancho: COL * 0.16 },
            { titulo: 'Lo que se dijo', ancho: COL * 0.26 },
          ],
          m.seguimiento.map((s) => [s.acuerdo, s.responsable ?? '—', ESTADO_PREVIO_LABEL[s.estado], s.detalle ?? '—']),
          (fila, col, x, y) => {
            if (col !== 2) return false;
            const e = m.seguimiento[fila].estado;
            pastilla(doc, ESTADO_PREVIO_LABEL[e], x, y - 1, COLOR_ESTADO[e]);
            return true;
          },
        );
      });
    }

    // Anexo: la transcripción completa, con la marca de tiempo de cada minuto.
    const texto = (r.transcripcion ?? '').trim();
    if (texto) {
      ctx.seccion = 'Anexo · Transcripción';
      const p = apertura(ctx, 'ANEXO', 'Transcripción de la junta', { hojaNueva: true });
      indice.push({ numero: 'Anexo', titulo: 'Transcripción de la junta', pagina: p, nivel: 0 });
      const nota = 'Texto automático (sin nombres de quién habla); puede tener palabras mal reconocidas. Cada marca es el minuto de la grabación.';
      parrafo(doc, nota, X, ctx.y, COL, { tamano: 8.5, color: C.tenue, renglon: 12 });
      ctx.y += alto(doc, nota, COL, F.texto, 8.5, 12) + 12;
      for (const linea of texto.split('\n')) {
        const mm = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/.exec(linea);
        const marca = mm?.[1] ?? null;
        const cuerpo = (mm ? mm[2] : linea).trim();
        if (!cuerpo) continue;
        const h = alto(doc, cuerpo, COL - 52, F.texto, 8.8, 12.6);
        if (h > LIMITE - INICIO) {
          // Párrafo más largo que una hoja (texto pegado sin saltos): se deja fluir.
          asegurar(ctx, 60);
          parrafo(doc, cuerpo, X + 52, ctx.y, COL - 52, { tamano: 8.8, renglon: 12.6, color: C.pizarra });
          ctx.y = doc.y + 8;
          continue;
        }
        asegurar(ctx, h + 6);
        if (marca) renglon(doc, marca, X, ctx.y + 9, { tamano: 8, fuente: F.semi, color: C.acento });
        parrafo(doc, cuerpo, X + 52, ctx.y, COL - 52, { tamano: 8.8, renglon: 12.6, color: C.pizarra });
        ctx.y += h + 6;
      }
    }

    // Índice con páginas, en el lugar reservado.
    doc.switchToPage(indicePagina);
    let yi = indiceY;
    renglon(doc, 'ÍNDICE', X, yi + 10, { tamano: 9, fuente: F.semi, color: C.acento, espaciado: 2.4 });
    yi += 28;
    filete(doc, X, DER, yi - 6);
    for (const e of indice) {
      const sangria = e.nivel ? 40 : 0;
      const fuente = e.nivel ? F.texto : F.medio;
      const tamano = e.nivel ? 9 : 10;
      renglon(doc, e.nivel ? e.numero : e.numero, X + sangria, yi + 11, { tamano: 8.5, fuente: F.semi, color: e.nivel ? C.tenue : C.acento });
      const xTitulo = X + sangria + (e.nivel ? 30 : 44);
      const anchoTitulo = renglon(doc, e.titulo, xTitulo, yi + 11, { tamano, fuente, color: e.nivel ? C.pizarra : C.tinta, max: DER - xTitulo - 60 });
      renglon(doc, String(e.pagina), DER, yi + 11, { tamano: 9, fuente: F.medio, color: C.pizarra, alinear: 'der' });
      // Puntos guía entre el título y la página.
      doc.save();
      doc.moveTo(xTitulo + anchoTitulo + 6, yi + 10).lineTo(DER - 22, yi + 10).dash(1, { space: 2.5 }).lineWidth(0.6).strokeColor(C.linea).stroke();
      doc.undash();
      doc.restore();
      yi += 17;
    }

    // Pie en todas las hojas menos la portada.
    const total = doc.bufferedPageRange().count;
    for (let i = 1; i < total; i++) {
      doc.switchToPage(i);
      filete(doc, X, DER, 742);
      renglon(doc, `${r.titulo} · ${fechaLarga(r.fecha)}`, X, 758, { tamano: 7.5, color: C.tenue, max: COL - 110 });
      renglon(doc, `Página ${i + 1} de ${total}`, DER, 758, { tamano: 7.5, fuente: F.medio, color: C.pizarra, alinear: 'der' });
    }
    doc.end();
  });

/** Para las pruebas: marca de tiempo tal como sale en el anexo. */
export const marcaAnexo = (ms: number) => `[${marcaTiempo(ms)}]`;
