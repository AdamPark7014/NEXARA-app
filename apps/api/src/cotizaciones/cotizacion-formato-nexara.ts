/**
 * Cotización en el formato con el que Christian cotiza: hoja membretada, título
 * COTIZACIÓN, datos del cliente, franja comercial, partidas, subtotal / IVA /
 * total, importe con letra, condiciones y firma. El costo y el margen no entran.
 */
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { importeConLetra } from './importe-letra.js';
import { factorMargen } from './cotizacion-totals.js';
import { normalizarOpciones } from './personalizacion.js';
import { segmentosLista } from './vinetas-texto.js';
import { anexarPaginasPdf, clasificarPlanos, type PlanoArchivo } from '../common/pdf/planos-pdf.js';

const TEAL = '#1FAF8D';
const TEAL_OSC = '#15735F';
const TEAL_CLARO = '#E8F5F1';
const CARBON = '#24262A';
const GRIS = '#5F6368';
const LINEA = '#C9D1CF';
const TINTA = '#222222';

const PAGE_W = 612;
const PAGE_H = 792;
const LM = 46;
const AW = PAGE_W - LM * 2;
const TOP = 124;
const BOTTOM = 684;

const FIRMA = {
  nombre: 'CHRISTIAN EDUARDO DEL POZO SÁNCHEZ',
  cargo: 'REPRESENTANTE LEGAL DE',
  razon: 'NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.',
};

const ENTREGA_DEFAULT = '15 días naturales, o según disponibilidad de inventario al confirmar el pedido.';
const PAGO_DEFAULT =
  '50% de anticipo para confirmar el pedido y 50% contra entrega, mediante transferencia electrónica.';
const GARANTIA_DEFAULT = 'La otorgada por el fabricante.';

const TERMINOS_DEFAULT = [
  'Forma de pago: se requiere un 50% de anticipo para la confirmación del pedido y programación del suministro. El 50% restante deberá liquidarse contra entrega del equipo.',
  'Alcance: el precio cotizado cubre únicamente el suministro del equipo descrito en la presente propuesta. No se incluyen servicios de instalación, configuración, puesta en marcha, capacitación, adecuaciones eléctricas, de red o cualquier otro servicio no especificado expresamente en la cotización.',
  'Disponibilidad: la entrega está sujeta a disponibilidad de inventario al momento de la confirmación del pedido y recepción del anticipo.',
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PartidaFormato = {
  partida: string;
  titulo: string;
  marca: string;
  modelo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
};

export type FormatoNexara = {
  numero: string;
  fecha: string;
  vence: string;
  vigenciaDias: number;
  moneda: string;
  cliente: string;
  atencion: string;
  telefono: string;
  correo: string;
  ubicacion: string;
  proyecto: string;
  responsable: string;
  trabajo: string;
  pagoCorto: string;
  entrega: string;
  /** Frase de vigencia de las condiciones comerciales (la misma que edita la cotización). */
  vigencia: string;
  condicionesPago: string;
  garantia: string;
  partidas: PartidaFormato[];
  subtotal: number;
  ivaPorciento: number;
  iva: number;
  total: number;
  letras: string;
  terminos: string[];
};

type QuoteLike = {
  quoteNumber?: string | null;
  issueDate?: Date | string | null;
  validUntil?: Date | string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  atencion?: string | null;
  trabajo?: string | null;
  projectName?: string | null;
  preparedBy?: string | null;
  paymentTerms?: string | null;
  deliveryTime?: string | null;
  depositPercent?: number | null;
  /** 20 = el precio impreso ya incluye ese margen. Null o 0: el precio de la partida. */
  marginPercent?: unknown;
  currency?: string | null;
  note?: string | null;
  opciones?: unknown;
  items?: Array<Record<string, unknown>> | null;
};

const dinero = (n: number) =>
  `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaCorta = (valor: Date | string | null | undefined): string => {
  if (!valor) return '';
  const iso = valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
};

const diasEntre = (desde: Date | string | null | undefined, hasta: Date | string | null | undefined): number => {
  const a = desde ? new Date(desde) : null;
  const b = hasta ? new Date(hasta) : null;
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 15;
  const dias = Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / 86_400_000);
  return dias > 0 ? dias : 15;
};

/** Lo que imprime «Tiempo de entrega» si la cotización no escribió el suyo. */
export const ENTREGA_POR_OMISION = ENTREGA_DEFAULT;
/** Lo que imprime «Garantía» si la cotización no escribió la suya. */
export const GARANTIA_POR_OMISION = GARANTIA_DEFAULT;

/**
 * Vigencia de las condiciones comerciales. Si quien cotiza escribió una frase, esa es la que sale
 * en el PDF; si no, la de siempre (días naturales y fecha de vencimiento).
 */
export function textoVigencia(dias: number, vence: string, propia?: string | null): string {
  const escrito = String(propia ?? '').trim();
  if (escrito) return escrito;
  if (dias > 0 && vence) return `${dias} días naturales (vence el ${vence})`;
  if (dias > 0) return `${dias} días naturales a partir de la fecha de emisión de esta propuesta.`;
  return '15 días naturales';
}

const pagoCorto = (deposito: unknown): string => {
  const n = Math.round(Number(deposito ?? 50));
  if (!Number.isFinite(n) || n >= 100) return n >= 100 ? 'Contado' : '50% anticipo';
  if (n <= 0) return 'Contra entrega';
  return `${n}% anticipo`;
};

function terminosDeNota(nota: string | null | undefined): string[] {
  const texto = String(nota ?? '').replace(/\r\n?/g, '\n').trim();
  if (!texto) return TERMINOS_DEFAULT;
  const bloques = texto
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return bloques.length ? bloques : TERMINOS_DEFAULT;
}

/** De la cotización guardada (o del borrador de la vista previa) al formato impreso. */
export function formatoDesdeCotizacion(quote: QuoteLike): FormatoNexara {
  const opciones = normalizarOpciones(quote.opciones);
  const moneda = String(quote.currency ?? 'MXN').toUpperCase() === 'USD' ? 'USD' : 'MXN';
  // El PDF del cliente no enseña el margen: el precio de cada partida ya lo trae.
  const factor = factorMargen(quote.marginPercent);
  const crudas = (quote.items ?? []).map((item, i) => {
    const qty = Number(item['qty'] ?? 0) || 0;
    const precio = Number(item['unitPrice'] ?? 0) || 0;
    const labor = (Number(item['laborHours'] ?? 0) || 0) * (Number(item['laborRate'] ?? 0) || 0);
    const descuento = Math.min(100, Math.max(0, Number(item['discount'] ?? 0) || 0));
    const bruto = (qty * precio + labor) * (1 - descuento / 100);
    const taxRaw = item['tax'] == null || item['tax'] === '' ? 16 : Number(item['tax']);
    const tax = Number.isFinite(taxRaw) ? taxRaw : 16;
    const fila: PartidaFormato = {
      partida: String(item['partida'] ?? '').trim() || String(i + 1),
      titulo: String(item['name'] ?? '').trim(),
      marca: String(item['brand'] ?? '').trim(),
      modelo: String(item['model'] ?? '').trim(),
      descripcion: String(item['description'] ?? '').trim(),
      unidad: String(item['unit'] ?? '').trim() || 'Pieza',
      cantidad: qty,
      precioUnitario: round2(precio * factor),
      importe: round2(bruto * factor),
    };
    return { fila, tax, bruto };
  });
  const partidas = crudas.map((p) => p.fila);
  const subtotalBase = round2(crudas.reduce((a, p) => a + p.bruto, 0));
  const ivaBase = round2(crudas.reduce((a, p) => a + p.bruto * (p.tax / 100), 0));
  const subtotal = round2(partidas.reduce((a, p) => a + p.importe, 0));
  let iva = round2(crudas.reduce((a, p) => a + p.fila.importe * (p.tax / 100), 0));
  const tasas = new Set(crudas.map((p) => p.tax));
  const ivaPorciento = tasas.size === 1 ? [...tasas][0]! : 16;
  // Total = (subtotal + IVA) × (1 + margen/100). El centavo de redondeo cae en el IVA.
  const total = round2((subtotalBase + ivaBase) * factor);
  if (round2(subtotal + iva) !== total) iva = round2(total - subtotal);
  const empresa = String(quote.clientCompany ?? '').trim();
  const nombre = String(quote.clientName ?? '').trim();
  const atencionExplicita = String(quote.atencion ?? '').trim();
  const dias = diasEntre(quote.issueDate, quote.validUntil);
  const vence = fechaCorta(quote.validUntil);
  return {
    numero: String(quote.quoteNumber ?? '').trim() || 'COTIZACIÓN',
    fecha: fechaCorta(quote.issueDate) || fechaCorta(new Date()),
    vence,
    vigenciaDias: dias,
    vigencia: textoVigencia(dias, vence, opciones.condiciones.vigencia),
    moneda,
    cliente: empresa || nombre || '—',
    atencion: atencionExplicita || (empresa && nombre && empresa !== nombre ? nombre : ''),
    telefono: String(quote.clientPhone ?? '').trim(),
    correo: String(quote.clientEmail ?? '').trim(),
    ubicacion: String(quote.clientAddress ?? '').trim(),
    proyecto: String(quote.projectName ?? '').trim(),
    responsable: String(quote.preparedBy ?? '').trim() || 'Christian Del Pozo',
    trabajo: String(quote.trabajo ?? '').trim() || 'Ventas',
    pagoCorto: pagoCorto(quote.depositPercent),
    entrega: opciones.condiciones.tiempoEntrega.trim() || String(quote.deliveryTime ?? '').trim() || ENTREGA_DEFAULT,
    condicionesPago: String(quote.paymentTerms ?? '').trim() || PAGO_DEFAULT,
    garantia: opciones.condiciones.garantia.trim() || GARANTIA_DEFAULT,
    partidas,
    subtotal,
    ivaPorciento,
    iva,
    total,
    letras: importeConLetra(total, moneda),
    terminos: terminosDeNota(quote.note),
  };
}

function directorioAssets(): string {
  const candidatos = [
    path.resolve(__dirname, '../assets/cotizacion-nexara'),
    path.resolve(__dirname, '../../src/assets/cotizacion-nexara'),
    path.resolve(process.cwd(), 'src/assets/cotizacion-nexara'),
    path.resolve(process.cwd(), 'apps/api/src/assets/cotizacion-nexara'),
    path.resolve(process.cwd(), 'dist/assets/cotizacion-nexara'),
  ];
  return candidatos.find((d) => fs.existsSync(path.join(d, 'membrete_carta.png'))) ?? candidatos[0]!;
}

type Doc = PDFKit.PDFDocument;

function fuentes(doc: Doc, dir: string): { regular: string; bold: string } {
  const regular = path.join(dir, 'URWGothic-Book.ttf');
  const bold = path.join(dir, 'URWGothic-Demi.ttf');
  if (fs.existsSync(regular) && fs.existsSync(bold)) {
    doc.registerFont('NX', regular);
    doc.registerFont('NX-B', bold);
    return { regular: 'NX', bold: 'NX-B' };
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
}

type Lapiz = {
  doc: Doc;
  y: number;
  f: string;
  fb: string;
  numero: string;
  pagina: number;
};

function asegurar(p: Lapiz, alto: number) {
  if (p.y + alto <= BOTTOM) return;
  hoja(p);
}

function hoja(p: Lapiz) {
  p.doc.addPage({ size: 'LETTER', margin: 0 });
  p.pagina += 1;
  const membrete = path.join(directorioAssets(), 'membrete_carta.png');
  if (fs.existsSync(membrete)) {
    p.doc.image(membrete, 0, 0, { width: PAGE_W, height: PAGE_H });
  }
  const x = LM + 28;
  p.doc.fillColor(TEAL).font(p.fb).fontSize(20);
  p.doc.text('COTIZACIÓN', x, 52, { lineBreak: false });
  p.doc.fillColor(CARBON).font(p.fb).fontSize(10);
  p.doc.text(p.pagina === 1 ? 'NEXARA' : `N° ${p.numero}  (continuación)`, x, 76, { lineBreak: false });
  p.doc.fillColor(GRIS).font(p.f).fontSize(8);
  p.doc.text(p.pagina === 1 ? 'Conectando ecosistemas de tecnología' : '', x, 90, { lineBreak: false });
  p.doc.save();
  p.doc.strokeColor(TEAL).lineWidth(1.2).moveTo(x, 106).lineTo(PAGE_W - LM - 150, 106).stroke();
  p.doc.restore();
  p.y = TOP;
}

function texto(p: Lapiz, valor: string, x: number, y: number, ancho: number, opts: PDFKit.Mixins.TextOptions & { font?: string; size?: number; color?: string }) {
  p.doc.font(opts.font ?? p.f).fontSize(opts.size ?? 8).fillColor(opts.color ?? TINTA);
  p.doc.text(valor, x, y, { width: ancho, lineGap: 1, ...opts });
}

function altoDe(p: Lapiz, valor: string, ancho: number, size = 8, font?: string): number {
  p.doc.font(font ?? p.f).fontSize(size);
  return p.doc.heightOfString(valor || ' ', { width: ancho, lineGap: 1 });
}

function cajaDatos(p: Lapiz, x: number, w: number, titulo: string, filas: Array<[string, string]>) {
  const etiqueta = w * 0.34;
  const valor = w - etiqueta;
  let y = p.y;
  p.doc.save();
  p.doc.rect(x, y, w, 16).fill(CARBON);
  p.doc.restore();
  texto(p, titulo, x + 5, y + 3.5, w - 10, { font: p.fb, size: 8, color: '#FFFFFF' });
  y += 16;
  for (const [k, v] of filas) {
    const h = Math.max(14, altoDe(p, v || '—', valor - 8, 8) + 5);
    p.doc.save();
    p.doc.rect(x, y, etiqueta, h).fill(TEAL_CLARO);
    p.doc.restore();
    texto(p, k, x + 4, y + 3, etiqueta - 6, { font: p.fb, size: 7.5, color: TEAL_OSC });
    texto(p, v || '—', x + etiqueta + 4, y + 3, valor - 8, { size: 8, color: TINTA });
    y += h;
  }
  p.doc.save();
  p.doc.strokeColor(LINEA).lineWidth(0.6).rect(x, p.y, w, y - p.y).stroke();
  p.doc.restore();
  return y - p.y;
}

function franja(p: Lapiz, celdas: Array<[string, string]>) {
  const w = AW / celdas.length;
  const y = p.y;
  const h = 32;
  celdas.forEach(([titulo, valor], i) => {
    const x = LM + i * w;
    p.doc.save();
    p.doc.rect(x, y, w, 15).fill(TEAL);
    p.doc.rect(x, y + 15, w, h - 15).fill(TEAL_CLARO);
    p.doc.restore();
    texto(p, titulo, x + 2, y + 3, w - 4, { font: p.fb, size: 7.5, color: '#FFFFFF', align: 'center' });
    texto(p, valor || '—', x + 2, y + 18, w - 4, { size: 8, color: TINTA, align: 'center' });
  });
  p.y = y + h;
}

/** Parte un párrafo en renglones que caben en `ancho`, respetando los saltos de línea. */
function partirTexto(p: Lapiz, valor: string, ancho: number, size: number, font: string): string[] {
  p.doc.font(font).fontSize(size);
  const usable = Math.max(8, ancho);
  const lineas: string[] = [];
  for (const parrafo of valor.replace(/\r\n/g, '\n').split('\n')) {
    if (!parrafo) {
      lineas.push('');
      continue;
    }
    let resto = parrafo;
    while (resto.length) {
      if (p.doc.widthOfString(resto) <= usable) {
        lineas.push(resto);
        break;
      }
      let corte = 1;
      let lo = 1;
      let hi = resto.length;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (p.doc.widthOfString(resto.slice(0, mid)) <= usable) {
          corte = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      let espacio = -1;
      for (let i = corte; i > 0; i -= 1) {
        if (resto[i - 1] === ' ') {
          espacio = i - 1;
          break;
        }
      }
      const hasta = espacio > 0 ? espacio : Math.max(1, corte);
      const trozo = resto.slice(0, hasta).trimEnd();
      lineas.push(trozo || resto.slice(0, Math.max(1, corte)));
      resto = resto.slice(trozo ? hasta : Math.max(1, corte)).replace(/^\s+/, '');
    }
  }
  return lineas.length ? lineas : [''];
}

function altoRenglon(p: Lapiz, size: number, font: string): number {
  p.doc.font(font).fontSize(size);
  return Math.max(p.doc.currentLineHeight(true) + 1, size + 2);
}

/**
 * Un renglón ya medido. Sin `width` PDFKit no lo parte ni abre una hoja en blanco al llegar al
 * margen: el corte de página lo decide esta tabla.
 */
function renglonFijo(p: Lapiz, valor: string, x: number, y: number, ancho: number, font: string, size: number, color: string, align: 'left' | 'center' | 'right' = 'left') {
  p.doc.font(font).fontSize(size).fillColor(color);
  if (align === 'left') {
    p.doc.text(valor || ' ', x, y, { lineBreak: false });
    return;
  }
  p.doc.text(valor || ' ', x, y, { width: ancho, align, lineBreak: false });
}

function filaPartida(p: Lapiz, partida: PartidaFormato | null, anchos: number[], encabezado = false, zebra = false) {
  const x0 = LM;
  if (encabezado) {
    const y = p.y;
    p.doc.save();
    p.doc.rect(x0, y, AW, 16).fill(TEAL);
    p.doc.restore();
    let x = x0;
    for (const [i, titulo] of ['Partida', 'Descripción', 'Unidad', 'Cant.', 'Precio unitario', 'Total'].entries()) {
      texto(p, titulo, x + 3, y + 4, anchos[i]! - 6, { font: p.fb, size: 8, color: '#FFFFFF', align: 'center' });
      x += anchos[i]!;
    }
    p.y = y + 16;
    return;
  }
  if (!partida) return;
  const descAncho = anchos[1]! - 8;
  const xDesc = x0 + anchos[0]! + 4;
  const titulo = partida.titulo || 'Concepto';
  const marca = [partida.marca ? `Marca: ${partida.marca}` : '', partida.modelo ? `Modelo: ${partida.modelo}` : '']
    .filter(Boolean)
    .join(' · ');
  const bloques: Array<{ texto: string; font: string; size: number; color: string }> = [
    { texto: titulo, font: p.fb, size: 8.5, color: TINTA },
  ];
  if (marca) bloques.push({ texto: marca, font: p.f, size: 7.5, color: TEAL_OSC });
  if (partida.descripcion) bloques.push({ texto: partida.descripcion, font: p.f, size: 7.5, color: GRIS });

  const lineas: Array<{ t: string; font: string; size: number; color: string; lh: number; sangria: number; marca: boolean }> = [];
  for (const bloque of bloques) {
    const lh = altoRenglon(p, bloque.size, bloque.font);
    p.doc.font(bloque.font).fontSize(bloque.size);
    const sangriaVineta = Math.ceil(p.doc.widthOfString('•') + 4);
    const segmentos = segmentosLista(bloque.texto);
    const lista = segmentos.length ? segmentos : [{ tipo: 'parrafo' as const, texto: bloque.texto }];
    for (const seg of lista) {
      if (!seg.texto) {
        lineas.push({ t: '', font: bloque.font, size: bloque.size, color: bloque.color, lh: Math.max(4, Math.round(lh * 0.4)), sangria: 0, marca: false });
        continue;
      }
      if (seg.tipo === 'vineta') {
        const ancho = Math.max(8, descAncho - sangriaVineta);
        const envueltas = partirTexto(p, seg.texto, ancho, bloque.size, bloque.font);
        envueltas.forEach((t, i) => {
          lineas.push({ t, font: bloque.font, size: bloque.size, color: bloque.color, lh, sangria: sangriaVineta, marca: i === 0 });
        });
      } else {
        for (const t of partirTexto(p, seg.texto, descAncho, bloque.size, bloque.font)) {
          lineas.push({ t, font: bloque.font, size: bloque.size, color: bloque.color, lh, sangria: 0, marca: false });
        }
      }
    }
  }
  const pad = 4;
  const nuevaHojaDeTabla = () => {
    hoja(p);
    filaPartida(p, null, anchos, true);
  };
  if (p.y + lineas[0]!.lh + pad * 2 > BOTTOM) nuevaHojaDeTabla();

  const cant = Number.isInteger(partida.cantidad) ? String(partida.cantidad) : String(partida.cantidad);
  const celdas = [
    { t: partida.partida, align: 'center' as const },
    null,
    { t: partida.unidad, align: 'center' as const },
    { t: cant, align: 'center' as const },
    { t: dinero(partida.precioUnitario), align: 'right' as const },
    { t: dinero(partida.importe), align: 'right' as const },
  ];
  let yCeldas = p.y;
  let celdasPendientes = true;
  const pintarCeldas = () => {
    if (!celdasPendientes) return;
    celdasPendientes = false;
    let x = x0;
    celdas.forEach((c, i) => {
      if (c) renglonFijo(p, c.t, x + 3, yCeldas + pad, anchos[i]! - 6, p.f, 8, TINTA, c.align);
      x += anchos[i]!;
    });
  };

  let y = p.y + pad;
  for (const linea of lineas) {
    if (y + linea.lh > BOTTOM) {
      pintarCeldas();
      p.doc.save();
      p.doc.strokeColor(LINEA).lineWidth(0.3).moveTo(x0, y).lineTo(x0 + AW, y).stroke();
      p.doc.restore();
      nuevaHojaDeTabla();
      yCeldas = p.y;
      y = p.y + pad;
    }
    if (zebra) {
      p.doc.save();
      p.doc.rect(x0, y, AW, linea.lh).fill(TEAL_CLARO);
      p.doc.restore();
    }
    if (linea.marca) renglonFijo(p, '•', xDesc, y, linea.sangria, linea.font, linea.size, linea.color);
    if (linea.t) renglonFijo(p, linea.t, xDesc + linea.sangria, y, descAncho - linea.sangria, linea.font, linea.size, linea.color);
    y += linea.lh;
  }
  pintarCeldas();
  if (zebra) {
    p.doc.save();
    p.doc.rect(x0, y, AW, pad).fill(TEAL_CLARO);
    p.doc.restore();
  }
  p.doc.save();
  p.doc.strokeColor(LINEA).lineWidth(0.3).moveTo(x0, y + pad).lineTo(x0 + AW, y + pad).stroke();
  p.doc.restore();
  p.y = y + pad;
}

function totales(p: Lapiz, q: FormatoNexara) {
  const cajaW = AW * 0.32;
  const x = LM + AW - cajaW;
  const letrasW = AW - cajaW - 12;
  const hLetras = altoDe(p, q.letras, letrasW, 8);
  const h = Math.max(62, hLetras + 4);
  asegurar(p, h + 8);
  texto(p, q.letras, LM, p.y + 2, letrasW, { size: 8, color: TINTA });
  const y = p.y;
  const filas: Array<[string, string, boolean]> = [
    ['SUBTOTAL', dinero(q.subtotal), false],
    [`IVA ${q.ivaPorciento}%`, dinero(q.iva), false],
    ['TOTAL', dinero(q.total), true],
  ];
  filas.forEach((fila, i) => {
    const yy = y + i * 18;
    if (fila[2]) {
      p.doc.save();
      p.doc.rect(x, yy, cajaW, 20).fill(CARBON);
      p.doc.restore();
    }
    texto(p, fila[0], x + 4, yy + 4, cajaW * 0.42, {
      font: fila[2] ? p.fb : p.f,
      size: fila[2] ? 10 : 8,
      color: fila[2] ? '#FFFFFF' : TINTA,
      align: 'right',
    });
    texto(p, fila[1], x + cajaW * 0.42, yy + 4, cajaW * 0.54, {
      font: fila[2] ? p.fb : p.f,
      size: fila[2] ? 10 : 8,
      color: fila[2] ? '#FFFFFF' : TINTA,
      align: 'right',
    });
  });
  p.doc.save();
  p.doc.strokeColor(LINEA).lineWidth(0.6).rect(x, y, cajaW, 56).stroke();
  p.doc.restore();
  p.y = y + h;
}

/**
 * Cotización en el formato de Christian — el que de verdad descarga y manda el cliente — más sus
 * planos (plano de CAD, hoja de servicio del levantamiento, fotos): sin ellos, pidió Monica por
 * WhatsApp, solo quedan listados como nombre suelto. Una imagen va a página completa; un PDF (lo
 * normal en CAD y en la hoja de servicio) anexa sus páginas reales al final, sin convertirlo a
 * imagen, así no pierde nitidez ni texto seleccionable.
 */
export async function generarCotizacionNexaraPdf(
  quote: QuoteLike | FormatoNexara,
  planos: PlanoArchivo[] = [],
): Promise<Buffer> {
  const q = 'partidas' in quote && 'letras' in quote ? (quote as FormatoNexara) : formatoDesdeCotizacion(quote as QuoteLike);
  const anexos = clasificarPlanos(planos);
  const dir = directorioAssets();
  const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: false, bufferPages: true });
  doc.info.Title = `Cotización ${q.numero}`;
  doc.info.Author = 'NEXARA';
  const { regular, bold } = fuentes(doc, dir);
  const p: Lapiz = { doc, y: 0, f: regular, fb: bold, numero: q.numero, pagina: 0 };
  const trozos: Buffer[] = [];
  doc.on('data', (t: Buffer) => trozos.push(t));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
  });

  hoja(p);
  const mitad = (AW - 12) / 2;
  const altoIzq = cajaDatos(p, LM, mitad, 'DATOS DEL CLIENTE', [
    ['Cliente:', q.cliente],
    ['Atención:', q.atencion],
    ['Teléfono:', q.telefono],
    ['Correo:', q.correo],
    ['Ubicación:', q.ubicacion],
  ]);
  const yDatos = p.y;
  const altoDer = cajaDatos(p, LM + mitad + 12, mitad, 'DATOS DE LA COTIZACIÓN', [
    ['Fecha de emisión:', q.fecha],
    ['Cotización N°:', q.numero],
    ['Validez:', `${q.vigenciaDias} días`],
    ['Moneda:', q.moneda],
    ['Proyecto:', q.proyecto],
  ]);
  p.y = yDatos + Math.max(altoIzq, altoDer) + 10;
  franja(p, [
    ['Responsable comercial', q.responsable],
    ['Trabajo', q.trabajo],
    ['Condiciones de pago', q.pagoCorto],
    ['Fecha de vencimiento', q.vence || '—'],
  ]);
  p.y += 10;

  const anchos = [AW * 0.09, AW * 0.45, AW * 0.1, AW * 0.07, AW * 0.145, AW * 0.145];
  filaPartida(p, null, anchos, true);
  q.partidas.forEach((partida, i) => filaPartida(p, partida, anchos, false, i % 2 === 1));
  if (!q.partidas.length) {
    texto(p, 'Sin partidas capturadas.', LM + 8, p.y + 6, AW - 16, { size: 8, color: GRIS });
    p.y += 22;
  }
  p.doc.save();
  p.doc.strokeColor(LINEA).lineWidth(0.6).rect(LM, p.y - (q.partidas.length ? 0 : 22), AW, 0.6).stroke();
  p.doc.restore();
  p.y += 8;
  totales(p, q);

  p.y += 12;
  asegurar(p, 80);
  texto(p, 'CONDICIONES COMERCIALES', LM, p.y, AW, { font: p.fb, size: 10, color: TEAL_OSC });
  p.y += 16;
  const condiciones: Array<[string, string]> = [
    ['Tiempo de entrega:', q.entrega],
    ['Condiciones de pago:', q.condicionesPago],
    ['Vigencia:', q.vigencia],
  ];
  if (q.garantia) condiciones.push(['Garantía:', q.garantia]);
  condiciones.push([
    'Moneda:',
    `Precios en ${q.moneda === 'USD' ? 'dólares americanos (USD)' : 'pesos mexicanos (MXN)'}, más IVA ${q.ivaPorciento}% desglosado.`,
  ]);
  for (const [k, v] of condiciones) {
    const h = Math.max(altoDe(p, v, AW * 0.76, 8), 12);
    asegurar(p, h + 4);
    texto(p, k, LM, p.y, AW * 0.22, { font: p.fb, size: 8, color: TEAL_OSC });
    texto(p, v, LM + AW * 0.22, p.y, AW * 0.78, { size: 8, color: TINTA });
    p.y += h + 3;
  }

  if (q.terminos.length) {
    p.y += 8;
    asegurar(p, 36);
    texto(p, 'TÉRMINOS Y CONDICIONES', LM, p.y, AW, { font: p.fb, size: 10, color: TEAL_OSC });
    p.y += 14;
    for (const linea of q.terminos) {
      const h = altoDe(p, linea, AW - 16, 7.8);
      asegurar(p, h + 4);
      texto(p, '■', LM, p.y, 12, { size: 7, color: TEAL });
      texto(p, linea, LM + 12, p.y, AW - 14, { size: 7.8, color: TINTA });
      p.y += h + 4;
    }
  }

  if (anexos.otros.length) {
    hoja(p);
    texto(p, 'ANEXOS', LM, p.y, AW, { font: p.fb, size: 10, color: TEAL_OSC });
    p.y += 16;
    texto(p, 'Anexos que acompañan a esta cotización (no se pudieron imprimir aquí):', LM, p.y, AW, { size: 8, color: TINTA });
    p.y += 14;
    for (const nombre of anexos.otros) {
      texto(p, `•  ${nombre}`, LM + 4, p.y, AW - 8, { size: 8, color: TINTA });
      p.y += 13;
    }
  }
  // Cada plano en imagen a página completa, como dice la ayuda del editor de «03 Planos».
  for (const { nombre, imagen } of anexos.imagenes) {
    hoja(p);
    texto(p, nombre, LM, p.y, AW, { font: p.fb, size: 9, color: CARBON });
    p.y += 16;
    const altoDisponible = BOTTOM - p.y;
    const escala = Math.min(AW / imagen.ancho, altoDisponible / imagen.alto, 1);
    const ancho = Math.round(imagen.ancho * escala);
    const alto = Math.round(imagen.alto * escala);
    try {
      p.doc.image(imagen.datos, LM + (AW - ancho) / 2, p.y, { width: ancho, height: alto });
    } catch {
      /* un anexo corrupto deja su hueco en blanco, no tumba la cotización */
    }
    p.y += alto;
  }

  // El cierre va siempre al final de verdad: después de los anexos, incluso de los planos en PDF
  // (que se insertan más abajo antes de esta página) — nunca antes de ellos. Si hubo anexos con
  // página propia (lista o imagen), el cierre arranca su propia hoja: nunca se encima a un plano.
  if (anexos.otros.length || anexos.imagenes.length) {
    hoja(p);
  } else {
    p.y += 22;
  }
  asegurar(p, 150);
  texto(p, 'ATENTAMENTE', LM, p.y, AW, { font: p.fb, size: 9, color: TINTA, align: 'center' });
  p.y += 18;
  // Firma impresa de Christian: queda fija en todas las cotizaciones (pidió Monica por WhatsApp).
  const firma = path.join(directorioAssets(), 'firma_christian.png');
  const firmaW = 110;
  const firmaH = firmaW * (232 / 288);
  if (fs.existsSync(firma)) {
    p.doc.image(firma, LM + (AW - firmaW) / 2, p.y, { width: firmaW, height: firmaH });
  }
  p.y += firmaH - 8;
  const firmaX = LM + AW * 0.275;
  p.doc.save();
  p.doc.strokeColor(CARBON).lineWidth(0.8).moveTo(firmaX, p.y).lineTo(firmaX + AW * 0.45, p.y).stroke();
  p.doc.restore();
  p.y += 6;
  texto(p, FIRMA.nombre, LM, p.y, AW, { size: 9, color: TINTA, align: 'center' });
  p.y += 12;
  texto(p, FIRMA.cargo, LM, p.y, AW, { size: 8, color: TINTA, align: 'center' });
  p.y += 12;
  texto(p, FIRMA.razon, LM, p.y, AW, { font: p.fb, size: 8, color: TINTA, align: 'center' });

  const total = p.pagina;
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i += 1) {
    doc.switchToPage(rango.start + i);
    doc.font(regular).fontSize(7).fillColor(GRIS);
    doc.text(`${q.numero}  ·  Página ${i + 1} de ${total}`, LM, 698, {
      width: AW,
      align: 'right',
      lineBreak: false,
    });
  }
  doc.end();
  const base = await listo;
  // antesDeFinal: 1 — la última página de `base` siempre es la del cierre (ATENTAMENTE y firma);
  // los planos en PDF se insertan justo antes, nunca después.
  return anexarPaginasPdf(base, anexos.pdfs, { antesDeFinal: 1 });
}
