import PDFDocument from 'pdfkit';
import { fuente, loadNexaraLogo, type PDF_FUENTES } from '../common/pdf/nexara-pdf-theme.js';

/**
 * Cotización u orden de venta que se genera desde una oportunidad de Ventas, con la plantilla de la
 * empresa (color, datos fiscales, secciones y pie).
 *
 * El documento se dibujaba con posiciones fijas y sin saltos de hoja. Con más de unas veinte partidas
 * el contenido pasaba del pie y PDFKit abría una hoja por cada texto que ya no cabía: una cotización
 * de treinta partidas salía en 85 hojas con un renglón cada una. Además, una descripción de dos
 * renglones se encimaba con su garantía, y la dirección de la empresa, con su sitio web.
 *
 * Ahora cada bloque mide lo que ocupa antes de pintarse, la tabla repite su encabezado en cada hoja,
 * los totales y las firmas no se parten, y el pie con «Página 1 de 3» va en todas.
 */

export interface QuoteItem {
  description: string;
  brand?: string;
  model?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  ieps: number;
  retention: number;
  lineTotal: number;
  warrantyMonths?: number;
  deliveryTime?: string;
  notes?: string;
}

export interface QuotePdfData {
  quoteNumber: string;
  date: string;
  validity?: string;
  currency: string;
  companyName: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyRfc?: string;
  companyWebsite?: string;
  clientName: string;
  clientCompany?: string;
  clientRfc?: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  projectName?: string;
  scope?: string;
  paymentTerms?: string;
  depositPercent?: number;
  deliveryTime?: string;
  preparedBy?: string;
  notes?: string;
  items: QuoteItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  iepsTotal: number;
  retentionTotal: number;
  total: number;
  primaryColor: string;
  footerText?: string;
}

export type TemplateSections = {
  showClientInfo: boolean;
  showProjectScope: boolean;
  showItemsTable: boolean;
  showTotals: boolean;
  showTerms: boolean;
  showNotes: boolean;
  showPreparedBy: boolean;
  showValidity: boolean;
  showPaymentTerms: boolean;
  showFooterBrand: boolean;
};

// ─── Colores ──────────────────────────────────────────────────────────────────
const BRAND_DARK = '#0a1f3d';
const BRAND_LIGHT = '#e8f0fb';
const BRAND_WHITE = '#ffffff';
const TEXT_DARK = '#1e293b';
const TEXT_MID = '#475569';
const TEXT_SOFT = '#64748b';
const DIVIDER = '#e2e8f0';
const ROW_ALT = '#f8fafc';
const ROJO = '#dc2626';
/**
 * Texto secundario sobre la banda oscura. Antes se pedía `rgba(255,255,255,0.6)`, que PDFKit no
 * entiende: lo ignoraba y el texto salía con el último color usado; en el pie, el de la franja de
 * acento, azul sobre azul marino.
 */
const SOBRE_OSCURO = '#c5d0df';
const COLOR_POR_OMISION = '#0f6ad6';

// ─── Medidas ──────────────────────────────────────────────────────────────────
const M = 40;
const ALTO_PIE = 36;
/** Ancho útil de la hoja A4 con los márgenes del documento. */
export const ANCHO_UTIL_COTIZACION = 595.28 - M * 2;
/**
 * Columnas de la tabla de partidas. Suman el ancho útil: antes sumaban 495 de 515 pt y la columna
 * «Total» quedaba 20 pt antes del borde, sin alinear con el recuadro de totales de abajo.
 */
export const COLUMNAS_COTIZACION = { desc: 203, brand: 70, qty: 38, unit: 44, price: 62, disc: 38, total: 60 } as const;

type Letra = keyof typeof PDF_FUENTES;
type Renglon = { texto: string; letra: Letra; tam: number; color: string; aire?: number };

const dinero = (n: number) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dineroConMoneda = (n: number, moneda = 'MXN') => `${dinero(n)} ${moneda}`;
const cantidad = (n: number) => (n || 0).toLocaleString('es-MX', { maximumFractionDigits: 4 });

/** `#abc` o `#aabbcc`: lo único que PDFKit pinta. Otro valor en la plantilla usa el azul por omisión. */
const colorDePlantilla = (valor?: string | null) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(valor ?? '').trim()) ? String(valor).trim() : COLOR_POR_OMISION);

/** Blanco u oscuro, lo que se lea sobre el color de la plantilla (un amarillo con letra blanca no se lee). */
const textoSobre = (hex: string): string => {
  const limpio = hex.length === 4 ? hex.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(limpio.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62 ? TEXT_DARK : BRAND_WHITE;
};

/** «IVA 16 %» si todas las partidas con impuesto llevan la misma tasa; si no, «IVA» a secas. */
const rotuloDeIva = (items: QuoteItem[]): string => {
  const tasas = [...new Set(items.map((item) => Number(item.tax) || 0).filter((tasa) => tasa > 0))];
  return tasas.length === 1 ? `IVA ${tasas[0]} %` : 'IVA';
};

export function construirPdfDeCotizacion(data: QuotePdfData, sections: TemplateSections): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const esOrden = data.quoteNumber.startsWith('ORD');
    const tipo = esOrden ? 'Orden de venta' : 'Cotización';
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      info: { Title: `${tipo} ${data.quoteNumber}`, Author: data.companyName || 'NEXARA', Subject: data.clientCompany || data.clientName },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width; // 595.28
    const H = doc.page.height; // 841.89
    const CW = W - M * 2;
    const primary = colorDePlantilla(data.primaryColor);
    const sobrePrimario = textoSobre(primary);
    /** Color de los rótulos sobre fondo claro: el de la plantilla, salvo que sea tan claro que no se lea. */
    const colorDeRotulo = sobrePrimario === TEXT_DARK ? TEXT_DARK : primary;
    const f = (letra: Letra) => fuente(doc, letra);

    /** Hasta dónde llega el contenido: el pie y un respiro quedan libres en todas las hojas. */
    const limite = H - ALTO_PIE - 16;
    let y = 0;

    // ─── Texto que se mide antes de pintarse ─────────────────────────────────
    const altoDe = (r: Renglon, ancho: number) => {
      doc.font(f(r.letra)).fontSize(r.tam);
      return doc.heightOfString(r.texto, { width: ancho });
    };
    const altoDeBloque = (renglones: Renglon[], ancho: number) => renglones.reduce((suma, r) => suma + altoDe(r, ancho) + (r.aire ?? 2), 0);
    /** Pinta los renglones uno bajo otro, cada uno donde termina el anterior. Devuelve dónde quedó. */
    const escribirBloque = (renglones: Renglon[], x: number, desde: number, ancho: number): number => {
      let cursor = desde;
      for (const r of renglones) {
        const alto = altoDe(r, ancho);
        doc.fillColor(r.color).text(r.texto, x, cursor, { width: ancho, height: alto + 1 });
        cursor += alto + (r.aire ?? 2);
      }
      return cursor;
    };

    /**
     * Un dato en un solo renglón dentro de su ancho: si no cabe, la letra baja hasta que quepa.
     * PDFKit parte en dos renglones lo que no cabe, y una cantidad partida («$1,234,567.8» y el «9»
     * debajo, o fuera de la celda) se lee como otra cantidad.
     */
    const enUnRenglon = (
      texto: string,
      x: number,
      desde: number,
      ancho: number,
      letra: Letra,
      tam: number,
      color: string,
      alinear: 'left' | 'center' | 'right' = 'left',
    ) => {
      doc.font(f(letra));
      let t = tam;
      while (t > 5 && doc.fontSize(t).widthOfString(texto) > ancho) t -= 0.25;
      const real = doc.fontSize(t).widthOfString(texto);
      const dx = alinear === 'right' ? ancho - real : alinear === 'center' ? (ancho - real) / 2 : 0;
      doc.fillColor(color).text(texto, x + Math.max(0, dx), desde + (tam - t) * 0.6, { lineBreak: false });
    };

    /** Parte un texto en renglones del ancho dado, con la letra que el documento tiene puesta. */
    const partirEnRenglones = (texto: string, ancho: number): string[] => {
      const renglones: string[] = [];
      for (const parrafo of texto.replace(/\r\n?/g, '\n').split('\n')) {
        let actual = '';
        for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
          const candidato = actual ? `${actual} ${palabra}` : palabra;
          if (doc.widthOfString(candidato) <= ancho) {
            actual = candidato;
            continue;
          }
          if (actual) renglones.push(actual);
          // Una palabra más ancha que el renglón (una dirección web larga) se parte por letras.
          let resto = palabra;
          while (doc.widthOfString(resto) > ancho && resto.length > 1) {
            let corte = resto.length - 1;
            while (corte > 1 && doc.widthOfString(resto.slice(0, corte)) > ancho) corte -= 1;
            renglones.push(resto.slice(0, corte));
            resto = resto.slice(corte);
          }
          actual = resto;
        }
        renglones.push(actual);
      }
      return renglones;
    };

    // ─── Hojas ───────────────────────────────────────────────────────────────
    const cabezaDeContinuacion = (): number => {
      doc.rect(0, 0, W, 5).fill(primary);
      doc.font(f('semi')).fontSize(7.5).fillColor(TEXT_DARK)
        .text(`${tipo} ${data.quoteNumber}`, M, 20, { width: CW * 0.5, height: 10, ellipsis: true });
      doc.font(f('texto')).fontSize(7.5).fillColor(TEXT_SOFT)
        .text(data.clientCompany || data.clientName || '', M + CW * 0.5, 20, { width: CW * 0.5, height: 10, align: 'right', ellipsis: true });
      doc.moveTo(M, 36).lineTo(M + CW, 36).lineWidth(0.5).strokeColor(DIVIDER).stroke();
      return 48;
    };
    const nuevaHoja = () => {
      doc.addPage();
      y = cabezaDeContinuacion();
    };
    /** Si lo que sigue no cabe en lo que queda de la hoja, pasa a la siguiente. */
    const asegurar = (alto: number) => {
      if (y + alto > limite) nuevaHoja();
    };
    /** Alto de una hoja de continuación completa: lo más que puede medir un bloque que no se parte. */
    const altoDeHoja = limite - 48;

    /** Un texto largo (alcance, notas) a todo lo ancho: pasa de hoja entre renglones, sin recortarse. */
    const parrafoQueFluye = (texto: string, x: number, ancho: number, letra: Letra, tam: number, color: string) => {
      doc.font(f(letra)).fontSize(tam);
      const altoRenglon = doc.currentLineHeight(true) + 1;
      for (const renglon of partirEnRenglones(texto, ancho)) {
        if (y + altoRenglon > limite) {
          nuevaHoja();
          doc.font(f(letra)).fontSize(tam);
        }
        if (renglon) doc.fillColor(color).text(renglon, x, y, { lineBreak: false });
        y += altoRenglon;
      }
    };

    const rotulo = (texto: string, x: number, desde: number) => {
      doc.font(f('semi')).fontSize(7).fillColor(colorDeRotulo).text(texto, x, desde, { lineBreak: false });
    };

    // ─── Encabezado ──────────────────────────────────────────────────────────
    const boxW = 180;
    const boxX = W - M - boxW;

    // Los datos de la empresa van pegados al logo y terminan antes del recuadro del folio. Antes se
    // reservaban 170 pt para un logo de 56 y el texto, con renglones de posición fija, se metía bajo el recuadro.
    let cmpX = M;
    let logo: { width: number; height: number } | null = null;
    try {
      const bytes = loadNexaraLogo();
      if (bytes) logo = (doc as unknown as { openImage(src: Buffer): { width: number; height: number } }).openImage(bytes);
    } catch {
      logo = null;
    }
    let logoW = 0;
    let logoH = 0;
    if (logo) {
      const escala = Math.min(160 / logo.width, 56 / logo.height);
      logoW = logo.width * escala;
      logoH = logo.height * escala;
      cmpX = M + logoW + 14;
    }
    const cmpW = boxX - 10 - cmpX - 12;
    const empresa: Renglon[] = [
      ...(data.companyName ? [{ texto: data.companyName, letra: 'titulo' as const, tam: 8.5, color: BRAND_WHITE, aire: 3 }] : []),
      ...[
        data.companyRfc ? `RFC: ${data.companyRfc}` : '',
        data.companyPhone ? `Tel: ${data.companyPhone}` : '',
        data.companyEmail || '',
        data.companyAddress || '',
        data.companyWebsite || '',
      ]
        .filter(Boolean)
        .map((texto) => ({ texto, letra: 'texto' as const, tam: 6.5, color: SOBRE_OSCURO, aire: 1.5 })),
    ];
    const hH = Math.max(88, Math.ceil(13 + altoDeBloque(empresa, cmpW) + 8));

    doc.rect(0, 0, W, 5).fill(primary);
    doc.rect(0, 5, W, hH).fill(BRAND_DARK);
    if (logo) {
      try {
        doc.image(logo as unknown as string, M, 5 + (hH - logoH) / 2, { width: logoW });
      } catch {
        /* sin logo */
      }
    }
    escribirBloque(empresa, cmpX, 18, cmpW);

    doc.rect(boxX - 10, 12, boxW + 12, 72).fill(primary);
    doc.font(f('semi')).fontSize(7.5).fillColor(sobrePrimario)
      .text(tipo.toUpperCase(), boxX, 21, { width: boxW, height: 10, align: 'center' });
    // El folio baja de tamaño hasta caber en un renglón (un folio con siglas y revisión es largo).
    doc.font(f('tituloFuerte'));
    let tamFolio = 15;
    while (tamFolio > 8 && doc.fontSize(tamFolio).widthOfString(data.quoteNumber) > boxW) tamFolio -= 0.5;
    doc.fontSize(tamFolio).fillColor(sobrePrimario)
      .text(data.quoteNumber, boxX, 33 + (15 - tamFolio) * 0.6, { width: boxW, height: tamFolio * 1.4, align: 'center', ellipsis: true });
    doc.font(f('texto')).fontSize(7).fillColor(sobrePrimario)
      .text(`Fecha: ${data.date}`, boxX, 55, { width: boxW, height: 9, align: 'center', ellipsis: true });
    if (sections.showValidity && data.validity) {
      doc.text(`Vigente hasta: ${data.validity}`, boxX, 66, { width: boxW, height: 9, align: 'center', ellipsis: true });
    }

    y = 5 + hH + 14;

    // ─── Cliente ─────────────────────────────────────────────────────────────
    if (sections.showClientInfo) {
      const inX = M + 12;
      const rcX = M + CW * 0.56;
      const anchoIzq = rcX - inX - 12;
      const anchoDer = M + CW - rcX - 10;
      const izquierda: Renglon[] = [
        { texto: data.clientName || '—', letra: 'semi', tam: 8.5, color: TEXT_DARK, aire: 2 },
        ...[data.clientCompany || '', data.clientRfc ? `RFC: ${data.clientRfc}` : '', data.clientAddress || '']
          .filter(Boolean)
          .map((texto) => ({ texto, letra: 'texto' as const, tam: 7.5, color: TEXT_MID, aire: 1.5 })),
      ];
      const derecha: Renglon[] = [data.clientEmail || '', data.clientPhone || '']
        .filter(Boolean)
        .map((texto) => ({ texto, letra: 'texto' as const, tam: 7.5, color: TEXT_MID, aire: 1.5 }));
      // El recuadro mide lo que lleva dentro: con 68 pt fijos, una dirección de dos renglones se salía.
      const boxH = Math.max(56, Math.ceil(21 + Math.max(altoDeBloque(izquierda, anchoIzq), altoDeBloque(derecha, anchoDer)) + 8));
      doc.rect(M, y, CW, boxH).fill(BRAND_LIGHT);
      doc.rect(M, y, 3, boxH).fill(primary);

      rotulo('DATOS DEL CLIENTE', inX, y + 9);
      escribirBloque(izquierda, inX, y + 21, anchoIzq);
      if (derecha.length) {
        rotulo('CONTACTO', rcX, y + 9);
        escribirBloque(derecha, rcX, y + 21, anchoDer);
      }
      y += boxH + 12;
    }

    // ─── Proyecto y alcance ──────────────────────────────────────────────────
    if (sections.showProjectScope && (data.projectName || data.scope)) {
      rotulo('PROYECTO / ALCANCE', M, y);
      y += 11;
      if (data.projectName) {
        y = escribirBloque([{ texto: data.projectName, letra: 'semi', tam: 9, color: TEXT_DARK, aire: 3 }], M, y, CW);
      }
      if (data.scope) {
        parrafoQueFluye(data.scope, M, CW, 'texto', 7.5, TEXT_MID);
        y += 6;
      }
      doc.moveTo(M, y + 4).lineTo(M + CW, y + 4).lineWidth(0.5).strokeColor(DIVIDER).stroke();
      y += 14;
    }

    // ─── Partidas ────────────────────────────────────────────────────────────
    if (sections.showItemsTable && data.items.length > 0) {
      const C = COLUMNAS_COTIZACION;
      const hdrH = 20;
      const anchoDesc = C.desc - 10;
      const x2 = M + C.desc;
      const columnas = [
        { label: 'DESCRIPCIÓN', x: M + 5, w: anchoDesc, align: 'left' as const },
        { label: 'MARCA / MODELO', x: x2 + 3, w: C.brand - 6, align: 'center' as const },
        { label: 'CANT.', x: x2 + C.brand, w: C.qty, align: 'center' as const },
        { label: 'UNIDAD', x: x2 + C.brand + C.qty, w: C.unit, align: 'center' as const },
        { label: 'PRECIO UNIT.', x: x2 + C.brand + C.qty + C.unit, w: C.price - 4, align: 'right' as const },
        { label: 'DESC.', x: x2 + C.brand + C.qty + C.unit + C.price, w: C.disc, align: 'center' as const },
        { label: 'TOTAL', x: x2 + C.brand + C.qty + C.unit + C.price + C.disc, w: C.total - 6, align: 'right' as const },
      ];

      const cabezaDeTabla = () => {
        doc.rect(M, y, CW, hdrH).fill(BRAND_DARK);
        for (const col of columnas) enUnRenglon(col.label, col.x, y + 6.5, col.w, 'semi', 6.5, BRAND_WHITE, col.align);
        y += hdrH;
      };

      /** Lo que ocupa una partida: su descripción completa, la línea de garantía, entrega y nota, y la marca. */
      const medir = (item: QuoteItem) => {
        const descripcion = String(item.description || '').trim() || '—';
        const extras = [
          item.warrantyMonths ? `Garantía: ${item.warrantyMonths} ${item.warrantyMonths === 1 ? 'mes' : 'meses'}` : '',
          item.deliveryTime?.trim() ? `Entrega: ${item.deliveryTime.trim()}` : '',
          item.notes?.trim() || '',
        ]
          .filter(Boolean)
          .join(' · ');
        const marca = [item.brand, item.model].filter(Boolean).join(' / ') || '—';
        const altoDesc = altoDe({ texto: descripcion, letra: 'texto', tam: 7.5, color: TEXT_DARK }, anchoDesc);
        const altoExtras = extras ? altoDe({ texto: extras, letra: 'texto', tam: 6.5, color: TEXT_SOFT }, anchoDesc) : 0;
        const altoMarca = altoDe({ texto: marca, letra: 'texto', tam: 7, color: TEXT_MID }, C.brand - 6);
        const contenido = Math.max(altoDesc + (extras ? 2 + altoExtras : 0), altoMarca);
        // Una partida más alta que una hoja entera se recorta a la hoja (con puntos suspensivos).
        const alto = Math.min(Math.max(22, Math.ceil(contenido + 12)), altoDeHoja - hdrH);
        return { descripcion, extras, marca, altoDesc, altoExtras, alto, recortada: Math.ceil(contenido + 12) > alto };
      };

      const primera = medir(data.items[0]!);
      // El rótulo no se queda solo al pie de la hoja: pasa junto con el encabezado y la primera partida.
      asegurar(10 + hdrH + primera.alto);
      rotulo('PARTIDAS', M, y);
      y += 10;
      cabezaDeTabla();

      data.items.forEach((item, idx) => {
        const fila = idx === 0 ? primera : medir(item);
        if (y + fila.alto > limite) {
          nuevaHoja();
          cabezaDeTabla();
        }
        doc.rect(M, y, CW, fila.alto).fill(idx % 2 === 0 ? BRAND_WHITE : ROW_ALT);
        doc.rect(M, y, CW, fila.alto).lineWidth(0.5).stroke(DIVIDER);

        const cy = y + 6;
        const altoLibre = fila.alto - 12;
        doc.font(f('texto')).fontSize(7.5).fillColor(TEXT_DARK).text(fila.descripcion, M + 5, cy, {
          width: anchoDesc,
          height: fila.recortada ? altoLibre - (fila.extras ? fila.altoExtras + 2 : 0) : fila.altoDesc + 1,
          ellipsis: true,
        });
        if (fila.extras) {
          const yExtras = fila.recortada ? y + fila.alto - 6 - fila.altoExtras : cy + fila.altoDesc + 2;
          doc.font(f('texto')).fontSize(6.5).fillColor(TEXT_SOFT).text(fila.extras, M + 5, yExtras, { width: anchoDesc, height: fila.altoExtras + 1 });
        }

        doc.font(f('texto')).fontSize(7).fillColor(TEXT_MID)
          .text(fila.marca, columnas[1]!.x, cy, { width: columnas[1]!.w, height: altoLibre + 1, align: 'center', ellipsis: true });
        // Cantidades y montos van siempre en un renglón.
        enUnRenglon(cantidad(item.quantity), columnas[2]!.x + 2, cy, columnas[2]!.w - 4, 'texto', 7, TEXT_MID, 'center');
        enUnRenglon(item.unit || 'pza', columnas[3]!.x + 2, cy, columnas[3]!.w - 4, 'texto', 7, TEXT_MID, 'center');
        enUnRenglon(dinero(item.unitPrice), columnas[4]!.x, cy, columnas[4]!.w, 'texto', 7.5, TEXT_DARK, 'right');
        enUnRenglon(item.discount > 0 ? `${item.discount} %` : '—', columnas[5]!.x, cy, columnas[5]!.w, 'texto', 7, item.discount > 0 ? ROJO : TEXT_SOFT, 'center');
        enUnRenglon(dinero(item.lineTotal), columnas[6]!.x, cy, columnas[6]!.w, 'semi', 7.5, TEXT_DARK, 'right');

        y += fila.alto;
      });

      doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(1).strokeColor(primary).stroke();
      y += 12;
    }

    // ─── Totales ─────────────────────────────────────────────────────────────
    if (sections.showTotals) {
      const tW = 210;
      const tX = M + CW - tW;
      const rH = 18;
      const filas: Array<{ label: string; value: string; destacada?: boolean; resta?: boolean }> = [
        { label: 'Subtotal', value: dineroConMoneda(data.subtotal, data.currency) },
      ];
      if (data.discountTotal > 0) filas.push({ label: 'Descuento', value: `− ${dineroConMoneda(data.discountTotal, data.currency)}`, resta: true });
      if (data.taxTotal > 0) filas.push({ label: rotuloDeIva(data.items), value: dineroConMoneda(data.taxTotal, data.currency) });
      if (data.iepsTotal > 0) filas.push({ label: 'IEPS', value: dineroConMoneda(data.iepsTotal, data.currency) });
      if (data.retentionTotal > 0) filas.push({ label: 'Retención', value: `− ${dineroConMoneda(data.retentionTotal, data.currency)}`, resta: true });
      filas.push({ label: 'TOTAL', value: dineroConMoneda(data.total, data.currency), destacada: true });
      const anticipo = data.depositPercent && data.depositPercent > 0 ? data.total * (data.depositPercent / 100) : 0;

      // Los totales no se parten entre dos hojas.
      asegurar(filas.length * rH + 2 + (anticipo ? 19 : 0) + 10);
      for (const fila of filas) {
        if (fila.destacada) {
          doc.rect(tX - 10, y, tW + 10, rH + 2).fill(primary);
          enUnRenglon(fila.label, tX, y + 4.5, 56, 'fuerte', 9.5, sobrePrimario);
          enUnRenglon(fila.value, tX + 60, y + 4.5, tW - 60 - 6, 'fuerte', 9.5, sobrePrimario, 'right');
        } else {
          enUnRenglon(fila.label, tX, y + 4, 76, 'texto', 8, fila.resta ? ROJO : TEXT_MID);
          enUnRenglon(fila.value, tX + 80, y + 4, tW - 80 - 6, 'texto', 8, fila.resta ? ROJO : TEXT_DARK, 'right');
        }
        y += rH + (fila.destacada ? 2 : 0);
      }
      if (anticipo) {
        y += 5;
        enUnRenglon(
          `Anticipo requerido (${data.depositPercent} %): ${dineroConMoneda(anticipo, data.currency)}`,
          M + CW * 0.4,
          y,
          CW * 0.6 - 6,
          'texto',
          7.5,
          TEXT_SOFT,
          'right',
        );
        y += 14;
      }
      y += 10;
    }

    // ─── Condiciones y notas ─────────────────────────────────────────────────
    if (sections.showTerms || sections.showNotes || sections.showPaymentTerms) {
      const colW = (CW - 16) / 2;
      const parrafo = (texto: string): Renglon => ({ texto, letra: 'texto', tam: 7.5, color: TEXT_MID, aire: 8 });
      const izquierda: Array<[string, Renglon]> = [];
      if (sections.showPaymentTerms && data.paymentTerms?.trim()) izquierda.push(['CONDICIONES DE PAGO', parrafo(data.paymentTerms.trim())]);
      if (data.deliveryTime?.trim()) izquierda.push(['TIEMPO DE ENTREGA', parrafo(data.deliveryTime.trim())]);
      const notas = sections.showNotes && data.notes?.trim() ? data.notes.trim() : '';
      const altoIzq = izquierda.reduce((suma, [, r]) => suma + 11 + altoDe(r, colW) + 8, 0);
      const altoNotas = notas ? 11 + altoDe(parrafo(notas), colW) + 8 : 0;
      // Unas notas largas (más de media hoja en columna) van a todo lo ancho, debajo, y pasan de hoja por renglones.
      const notasAnchas = altoNotas > altoDeHoja / 2;

      if (izquierda.length || notas) {
        const altoColumnas = Math.max(altoIzq, notasAnchas ? 0 : altoNotas);
        asegurar(12 + Math.min(altoColumnas, altoDeHoja - 12));
        doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor(DIVIDER).stroke();
        y += 12;

        let lY = y;
        for (const [titulo, r] of izquierda) {
          rotulo(titulo, M, lY);
          lY = escribirBloque([r], M, lY + 11, colW);
        }
        let rY = y;
        if (notas && !notasAnchas) {
          const rX = M + colW + 16;
          rotulo('NOTAS ADICIONALES', rX, rY);
          rY = escribirBloque([parrafo(notas)], rX, rY + 11, colW);
        }
        y = Math.max(lY, rY) + 2;

        if (notas && notasAnchas) {
          asegurar(11 + 30);
          rotulo('NOTAS ADICIONALES', M, y);
          y += 11;
          parrafoQueFluye(notas, M, CW, 'texto', 7.5, TEXT_MID);
          y += 10;
        }
      }
    }

    // ─── Firmas ──────────────────────────────────────────────────────────────
    if (sections.showPreparedBy) {
      // Las firmas van juntas: rótulos, espacio para firmar, raya y nombres.
      asegurar(70);
      doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor(DIVIDER).stroke();
      y += 14;
      const sigW = (CW - 20) / 2;
      enUnRenglon('FIRMA DE AUTORIZACIÓN DEL CLIENTE', M, y, sigW, 'texto', 7, TEXT_SOFT);
      enUnRenglon('ELABORÓ', M + sigW + 20, y, sigW, 'texto', 7, TEXT_SOFT);
      y += 34;
      doc.moveTo(M, y).lineTo(M + sigW, y).lineWidth(0.5).strokeColor(TEXT_SOFT).stroke();
      doc.moveTo(M + sigW + 20, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor(TEXT_SOFT).stroke();
      y += 8;
      doc.font(f('texto')).fontSize(7.5).fillColor(TEXT_MID)
        .text(data.clientName || '', M, y, { width: sigW, height: 10, align: 'center', ellipsis: true })
        .text(data.preparedBy || data.companyName || '', M + sigW + 20, y, { width: sigW, height: 10, align: 'center', ellipsis: true });
      y += 14;
    }

    // ─── Pie, en todas las hojas ─────────────────────────────────────────────
    const pie =
      data.footerText?.trim() ||
      (esOrden
        ? `${data.companyName} · Orden de venta ${data.quoteNumber}`
        : `${data.companyName} · Propuesta comercial confidencial · ${data.quoteNumber}`);
    const paginas = doc.bufferedPageRange();
    const anchoFecha = 190;
    const anchoPie = CW - anchoFecha - 10;
    for (let i = 0; i < paginas.count; i += 1) {
      doc.switchToPage(paginas.start + i);
      const fY = H - ALTO_PIE;
      doc.rect(0, fY, W, ALTO_PIE).fill(BRAND_DARK);
      doc.rect(0, fY, W, 3).fill(primary);
      doc.font(f('texto')).fontSize(7).fillColor(SOBRE_OSCURO);
      // El pie de la plantilla cabe en dos renglones; lo que pase de ahí se corta con puntos suspensivos
      // (antes seguía bajando y abría una hoja nueva solo para el resto del pie).
      const dosRenglones = doc.heightOfString(pie, { width: anchoPie }) > doc.currentLineHeight(true) + 1;
      doc.text(pie, M, fY + (dosRenglones ? 8 : 12), { width: anchoPie, height: dosRenglones ? 18 : 9, ellipsis: true });
      enUnRenglon(`${data.date} · Página ${i + 1} de ${paginas.count}`, W - M - anchoFecha, fY + 12, anchoFecha, 'texto', 7, SOBRE_OSCURO, 'right');
      doc.rect(0, H - 5, W, 5).fill(primary);
    }

    doc.end();
  });
}
