/**
 * Portada y marco de hoja de la cotización, medidos del diseño de NEXARA en Canva («Memoria
 * descriptiva y propuesta técnica-económica», carta: 612 × 792 pt).
 *
 * Todo va en vectores menos dos imágenes: el arte de la portada (reescalado con Real-ESRGAN, 240 ppp)
 * y el logotipo. Así el texto se puede seleccionar, imprime nítido y cada hoja pesa casi nada.
 */
import { loadPdfAsset, PDF_FUENTES as F } from '../common/pdf/nexara-pdf-theme.js';

type Doc = PDFKit.PDFDocument;

export const VERDE = '#1FA98A';
const VERDE_CLARO = '#8FD9C4';
const VERDE_PANEL = '#0A1C1F';
const NEGRO = '#232428';
const GRIS_ROMBO = '#43454E';
const BLANCO = '#FFFFFF';

const ANCHO = 612;
const ALTO = 792;

/** Datos del pie, los del diseño: `company_profile` trae datos de relleno. */
export const CONTACTO = {
  web: 'https://nexara.com.mx/',
  webCorta: 'www.nexara.com.mx',
  telefono: '(22) 01 79 18 71',
  correos: ['ventas@nexara.com.mx', 'soporte@nexara.com.mx', 'gerencia@nexara.com.mx'],
  oficina: 'Malltertaiment, Explanada Puebla, Cholula, Puebla 72774, México',
} as const;

/** Línea donde empieza la banda del pie; el cuerpo de la hoja termina antes. */
export const INICIO_PIE = 707.7;

/** Se leen de disco una sola vez por proceso: la vista previa pide el documento a cada rato. */
const enCache = new Map<string, Buffer | null>();
function asset(nombre: string): Buffer | null {
  if (!enCache.has(nombre)) enCache.set(nombre, loadPdfAsset(`cotizacion-nexara/${nombre}`));
  return enCache.get(nombre)!;
}

type OpcionesTexto = {
  fuente: string;
  tamano: number;
  color?: string;
  espaciado?: number;
  alinear?: 'izq' | 'centro' | 'der';
};

/** Un renglón en una línea base fija, sin que PDFKit lo parta ni abra hoja. */
function escribir(doc: Doc, texto: string, x: number, base: number, o: OpcionesTexto): number {
  doc.font(o.fuente).fontSize(o.tamano);
  const ascenso = ((doc as unknown as { _font: { ascender: number } })._font.ascender || 718) / 1000;
  const opciones = { lineBreak: false, characterSpacing: o.espaciado ?? 0 };
  const ancho = doc.widthOfString(texto, opciones);
  const xReal = o.alinear === 'der' ? x - ancho : o.alinear === 'centro' ? x - ancho / 2 : x;
  doc.fillColor(o.color ?? BLANCO).text(texto, xReal, base - ascenso * o.tamano, opciones);
  return ancho;
}

/** Rombo de esquinas redondeadas: un cuadrado girado 45°. `mitad` es la media diagonal. */
function rombo(doc: Doc, cx: number, cy: number, mitad: number, radio: number, color: string) {
  const lado = mitad * Math.SQRT2;
  doc.save();
  doc.rotate(45, { origin: [cx, cy] });
  doc.roundedRect(cx - lado / 2, cy - lado / 2, lado, lado, radio).fill(color);
  doc.restore();
}

// Íconos del pie, en una cuadrícula de 24 × 24.
const ICONO_TELEFONO =
  'M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z';
const ICONO_CORREO =
  'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z';
const ICONO_UBICACION =
  'M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z';

function icono(doc: Doc, ruta: string, x: number, y: number, lado: number) {
  doc.save();
  doc.translate(x, y).scale(lado / 24);
  doc.path(ruta).fill(BLANCO, 'even-odd');
  doc.restore();
}

/** Globo terráqueo: el único ícono que va en línea. */
function iconoWeb(doc: Doc, x: number, y: number, lado: number, color: string = BLANCO) {
  doc.save();
  doc.translate(x, y).scale(lado / 24);
  doc.lineWidth(1.7).strokeColor(color);
  doc.circle(12, 12, 10).stroke();
  doc.ellipse(12, 12, 4.5, 10).stroke();
  doc.path('M2 12h20M3.5 7h17M3.5 17h17').stroke();
  doc.restore();
}

/**
 * Encabezado y pie de cada hoja interior: rombos arriba a la izquierda, logotipo arriba a la derecha
 * y la banda oscura de contacto con el chevrón verde abajo.
 */
export function dibujarMarco(doc: Doc) {
  rombo(doc, 0, 31.7, 38.4, 5.5, NEGRO);
  rombo(doc, 0, 87.9, 50.7, 5, VERDE);
  rombo(doc, 40.4, 54.2, 13, 2.2, VERDE_CLARO);

  const logo = asset('logo_membrete.png');
  if (logo) {
    try {
      doc.image(logo, 509, 15, { width: 75 });
    } catch {
      /* sin logotipo la hoja sigue siendo válida */
    }
  }

  doc.save();
  doc.polygon([0, INICIO_PIE], [372, INICIO_PIE], [434, 760], [402, ALTO], [0, ALTO]).fill(NEGRO);
  doc.path('M522.5 792 L574 746 Q588.6 733 603 746 L612 754 L612 792 Z').fill(GRIS_ROMBO);
  doc.path('M411.6 794 L480.5 731 Q494.8 718 509 731 L580 794').lineWidth(3.6).strokeColor(VERDE).stroke();
  doc.restore();

  const base = { fuente: F.marca, tamano: 7.2, color: BLANCO };
  iconoWeb(doc, 19, 721.5, 8);
  escribir(doc, CONTACTO.web, 33, 728, base);
  icono(doc, ICONO_TELEFONO, 19, 736, 8);
  escribir(doc, CONTACTO.telefono, 33, 742.5, base);
  icono(doc, ICONO_CORREO, 19, 750.5, 8);
  let x = 33;
  for (const correo of CONTACTO.correos) x += escribir(doc, correo, x, 757, base) + 10;
  icono(doc, ICONO_UBICACION, 19, 766, 8);
  escribir(doc, CONTACTO.oficina, 33, 773, base);
}

export type EntradaIndice = { numero: number; titulo: string };

/**
 * Portada: el arte a sangre y encima el texto vivo. El índice es el de esta cotización: crece hacia
 * arriba desde el pie y, con muchos apartados, los renglones se aprietan en lugar de salirse.
 */
export function dibujarPortada(doc: Doc, o: { version: number; indice: EntradaIndice[] }) {
  // Si el arte faltara en un build, la portada sigue oscura y legible.
  doc.rect(0, 0, ANCHO, ALTO).fill('#04090C');
  const arte = asset('portada-nexara.jpg');
  if (arte) {
    try {
      doc.image(arte, 0, 0, { width: ANCHO, height: ALTO });
    } catch {
      /* el arte corrupto no tumba la cotización */
    }
  }

  // Detalle superior izquierdo y triángulo inferior.
  doc.save();
  doc.polygon([12, 0], [30, 0], [50, 22], [32, 22]).fill(VERDE);
  doc.moveTo(44, 0).lineTo(150, 74).lineTo(208, 74).lineTo(260, 0).lineWidth(0.7).strokeOpacity(0.7).strokeColor(VERDE).stroke();
  doc.restore();
  doc.save();
  const degradado = doc.linearGradient(0, 682, 104, 792);
  degradado.stop(0, '#2BBFA0').stop(1, '#12695A');
  doc.polygon([0, 682], [104, ALTO], [0, ALTO]).fill(degradado);
  doc.restore();

  escribir(doc, 'NEXARA', 36, 151, { fuente: F.tituloFuerte, tamano: 49.5, espaciado: 0 });

  const titulo = { fuente: F.marca, tamano: 22, espaciado: 1.3 };
  ['MEMORIA', 'DESCRIPTIVA Y', 'PROPUESTA', 'TÉCNICA-ECONÓMICA'].forEach((linea, i) => {
    escribir(doc, linea, 32, 286 + i * 23, titulo);
  });

  doc.save();
  doc.circle(38, 431, 3.6).fill(VERDE);
  doc.restore();
  escribir(doc, `VERSIÓN ${o.version}.0`, 58, 433.6, { fuente: F.titulo, tamano: 7.5 });

  indiceDePortada(doc, o.indice);

  iconoWeb(doc, 239, 756.5, 11, VERDE);
  escribir(doc, CONTACTO.webCorta, 256, 765, { fuente: F.tituloFuerte, tamano: 8 });
  doc.save();
  doc.moveTo(379, 750).lineTo(379, 776).lineWidth(0.7).strokeColor(BLANCO).stroke();
  doc.restore();
  const leyenda = { fuente: F.titulo, tamano: 5.4 };
  escribir(doc, 'PROPUESTA SUJETA A', 391, 761.5, leyenda);
  escribir(doc, 'CONTRATACIÓN FORMAL', 391, 768.5, leyenda);
}

function indiceDePortada(doc: Doc, indice: EntradaIndice[]) {
  if (!indice.length) return;
  const [izquierda, derecha, abajo] = [33, 387, 745];
  const arribaMinimo = 452;
  const margen = 14;
  const paso = Math.min(38, (abajo - arribaMinimo - margen * 2) / indice.length);
  const alto = paso * indice.length + margen * 2;
  const arriba = abajo - alto;
  const corte = Math.min(100, alto * 0.42);

  doc.save();
  doc.fillOpacity(0.74);
  doc
    .polygon([izquierda, arriba], [derecha - corte, arriba], [derecha, arriba + corte], [derecha, abajo], [izquierda, abajo])
    .fill(VERDE_PANEL);
  doc.restore();

  const anchoTexto = derecha - 102;
  indice.forEach(({ numero, titulo }, i) => {
    const centro = arriba + margen + paso * (i + 0.5);
    escribir(doc, `${String(numero).padStart(2, '0')}.`, 62, centro + 4, { fuente: F.titulo, tamano: 11.5, color: VERDE });

    const tamano = paso < 30 ? 7.2 : 8;
    doc.font(F.titulo).fontSize(tamano);
    const opciones = { width: anchoTexto, characterSpacing: 0.25, lineGap: 1.6, height: tamano * 2.8, ellipsis: true };
    const texto = titulo.toUpperCase();
    const altoTexto = Math.min(doc.heightOfString(texto, { width: anchoTexto, characterSpacing: 0.25, lineGap: 1.6 }), opciones.height);
    doc.fillColor(BLANCO).text(texto, 92, centro - altoTexto / 2 + 0.6, opciones);

    if (i < indice.length - 1) {
      const linea = arriba + margen + paso * (i + 1);
      doc.save();
      doc.moveTo(60, linea).lineTo(derecha - 24, linea).lineWidth(0.4).strokeOpacity(0.5).strokeColor('#5E8C86').stroke();
      doc.restore();
    }
  });
}
