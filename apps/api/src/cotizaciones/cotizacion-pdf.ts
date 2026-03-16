import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export type CotizacionPdfItem = {
  category?: string | null;
  name: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  sku?: string | null;
  partNumber?: string | null;
  batchReference?: string | null;
  unit?: string | null;
  qty: number;
  unitPrice: number;
  discount: number;
  tax: number;
  ieps?: number;
  retention?: number;
  laborHours?: number;
  laborRate?: number;
  warrantyMonths?: number;
  lineTotal: number;
};

export type CotizacionPdfPayload = {
  quoteNumber: string;
  issueDate: string;
  validUntil?: string | null;
  status: string;
  clientName?: string | null;
  clientCompany?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  projectName?: string | null;
  scope?: string | null;
  paymentTerms?: string | null;
  deliveryTime?: string | null;
  preparedBy?: string | null;
  preparedRole?: string | null;
  currency: string;
  depositPercent: number;
  note?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  iepsTotal?: number;
  retentionTotal?: number;
  total: number;
  items: CotizacionPdfItem[];
};

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);

const toText = (value?: string | number | null) => (value ? String(value) : '-');

const truncateText = (value: string | null | undefined, maxLength: number) => {
  if (!value) return '-';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
};

const loadLogo = () => {
  const candidates = [
    path.resolve(process.cwd(), '../web/public/logo-nexara.png'),
    path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
    } catch {
      // ignore
    }
  }

  return null;
};

export const generateCotizacionPdf = (payload: CotizacionPdfPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error) => reject(error));

    const colors = {
      navy: '#0B1F3A',
      blue: '#1F6BBA',
      lightBlue: '#E3F2FD',
      softGray: '#F5F7FB',
      text: '#1F2A37',
      muted: '#5B6B7A',
      line: '#D9E2EC',
    };

    const margin = doc.page.margins.left;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - margin * 2;
    const logo = loadLogo();

    const drawHeader = () => {
      doc.save();
      doc.rect(0, 0, pageWidth, 120).fill(colors.lightBlue);
      doc.rect(0, 0, pageWidth, 6).fill(colors.blue);
      doc.restore();

      if (logo) {
        doc.image(logo, margin, 26, { width: 120 });
      }

      doc.fillColor(colors.navy).fontSize(22).font('Helvetica-Bold').text('Cotizacion', margin + 140, 30, {
        width: 240,
      });
      doc.fontSize(11).font('Helvetica').fillColor(colors.muted).text('Propuesta comercial de tecnología', margin + 140, 58, {
        width: 260,
      });

      const rightX = margin + contentWidth - 200;
      doc.fillColor(colors.text).fontSize(10).text(`Folio: ${payload.quoteNumber}`, rightX, 32);
      doc.text(`Emision: ${payload.issueDate}`, rightX, 48);
      if (payload.validUntil) {
        doc.text(`Vigencia: ${payload.validUntil}`, rightX, 64);
      }
      doc.text(`Estado: ${payload.status}`, rightX, 80);
    };

    const drawSectionTitle = (label: string) => {
      doc.moveDown(0.6);
      doc.fillColor(colors.navy).fontSize(12).font('Helvetica-Bold').text(label, margin, doc.y);
      doc.moveDown(0.2);
    };

    const drawInfoCard = (
      x: number,
      y: number,
      width: number,
      lines: Array<{ label: string; value: string }>,
    ) => {
      const padding = 10;
      const labelWidth = 90;
      const valueWidth = width - padding * 2 - labelWidth - 2;
      const rowGap = 6;
      const rowHeights = lines.map((line) => {
        const valueHeight = doc.heightOfString(line.value || '-', { width: valueWidth });
        return Math.max(14, valueHeight);
      });
      const contentHeight = rowHeights.reduce((acc, h) => acc + h, 0) + rowGap * (lines.length - 1);
      const height = padding * 2 + contentHeight;
      doc.save();
      doc.roundedRect(x, y, width, height, 8).fill(colors.softGray);
      doc.restore();

      let cursorY = y + padding;
      lines.forEach((line, index) => {
        const rowHeight = rowHeights[index];
        doc.fillColor(colors.muted).fontSize(9).font('Helvetica').text(line.label, x + padding, cursorY, {
          width: labelWidth,
        });
        doc.fillColor(colors.text).fontSize(10).font('Helvetica').text(line.value || '-', x + padding + labelWidth + 2, cursorY, {
          width: valueWidth,
        });
        cursorY += rowHeight + rowGap;
      });
      return height;
    };

    const drawSummaryBox = (x: number, y: number, width: number) => {
      const padding = 12;
      const rows = [
        ['Subtotal', formatMoney(payload.subtotal, payload.currency)],
        ['Descuento', `-${formatMoney(payload.discountTotal, payload.currency)}`],
        ['IVA', formatMoney(payload.taxTotal, payload.currency)],
        ['IEPS', formatMoney(payload.iepsTotal || 0, payload.currency)],
        ['Retenciones', `-${formatMoney(payload.retentionTotal || 0, payload.currency)}`],
        ['Total', formatMoney(payload.total, payload.currency)],
        ['Anticipo', `${payload.depositPercent}%`],
      ];

      const height = padding * 2 + rows.length * 16 + 10;
      doc.save();
      doc.roundedRect(x, y, width, height, 8).fill(colors.softGray);
      doc.restore();

      doc.fillColor(colors.navy).fontSize(11).font('Helvetica-Bold').text('Resumen financiero', x + padding, y + padding);
      let cursorY = y + padding + 16;
      rows.forEach(([label, value], index) => {
        const isTotal = index === rows.length - 2;
        doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica');
        doc.fillColor(isTotal ? colors.navy : colors.text);
        doc.text(label, x + padding, cursorY, { width: width - padding * 2, continued: false });
        doc.text(value, x + padding, cursorY, { align: 'right', width: width - padding * 2 });
        cursorY += 16;
      });
      return height;
    };

    const drawTableHeader = (y: number, columns: Array<{ label: string; width: number }>) => {
      doc.save();
      doc.rect(margin, y, contentWidth, 24).fill(colors.navy);
      doc.restore();

      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      let x = margin + 6;
      columns.forEach((col) => {
        doc.text(col.label, x, y + 7, { width: col.width - 8 });
        x += col.width;
      });
    };

    const ensureSpace = (height: number, columns: Array<{ label: string; width: number }>) => {
      if (doc.y + height > pageHeight - 60) {
        doc.addPage();
        drawHeader();
        doc.y = 140;
        drawTableHeader(doc.y, columns);
        doc.y += 28;
      }
    };

    doc.font('Helvetica');
    drawHeader();

    doc.y = 140;
    drawSectionTitle('Cliente y proyecto');

    const infoY = doc.y;
    const leftWidth = (contentWidth - 20) * 0.55;
    const rightWidth = contentWidth - leftWidth - 20;

    const clientLines = [
      { label: 'Empresa', value: toText(payload.clientCompany) },
      { label: 'Contacto', value: toText(payload.clientName) },
      { label: 'Email', value: toText(payload.clientEmail) },
      { label: 'Teléfono', value: toText(payload.clientPhone) },
      { label: 'Dirección', value: toText(payload.clientAddress) },
    ];

    const projectLines = [
      { label: 'Proyecto', value: toText(payload.projectName) },
      { label: 'Alcance', value: truncateText(payload.scope, 140) },
      { label: 'Entrega', value: toText(payload.deliveryTime) },
      { label: 'Pago', value: toText(payload.paymentTerms) },
    ];

    const clientHeight = drawInfoCard(margin, infoY, leftWidth, clientLines);
    const projectHeight = drawInfoCard(margin + leftWidth + 20, infoY, rightWidth, projectLines);
    doc.y = infoY + Math.max(clientHeight, projectHeight) + 16;

    drawSectionTitle('Conceptos y partidas');

    const columns = [
      { label: 'Item', width: 34 },
      { label: 'Concepto / Especificacion', width: 155 },
      { label: 'Marca / Modelo', width: 90 },
      { label: 'Unidad', width: 40 },
      { label: 'Cant', width: 35 },
      { label: 'P. Unit', width: 60 },
      { label: 'Imp.', width: 50 },
      { label: 'Total', width: 51 },
    ];

    drawTableHeader(doc.y, columns);
    doc.y += 30;

    payload.items.forEach((item, index) => {
      const laborLine = item.laborHours || item.laborRate
        ? `MO: ${item.laborHours || 0}h x ${formatMoney(item.laborRate || 0, payload.currency)}`
        : null;
      const warrantyLine = item.warrantyMonths ? `Garantia: ${item.warrantyMonths} meses` : null;
      const metaLine = [item.category, item.sku, item.partNumber, item.unit ? `Unidad ${item.unit}` : null]
        .filter(Boolean)
        .join(' · ');
      const conceptText = `${item.name}${item.description ? `\n${item.description}` : ''}${metaLine ? `\n${metaLine}` : ''}${laborLine ? `\n${laborLine}` : ''}${warrantyLine ? `\n${warrantyLine}` : ''}`;
      const brandText = [item.brand, item.model, item.batchReference ? `Lote ${item.batchReference}` : null]
        .filter(Boolean)
        .join('\n');
      const taxText = `IVA ${item.tax || 0}%\nIEPS ${item.ieps || 0}%\nRET ${item.retention || 0}%`;

      const heights = [
        doc.heightOfString(String(index + 1), { width: columns[0].width }),
        doc.heightOfString(conceptText, { width: columns[1].width }),
        doc.heightOfString(brandText || '-', { width: columns[2].width }),
        doc.heightOfString(toText(item.unit), { width: columns[3].width }),
        doc.heightOfString(String(item.qty), { width: columns[4].width }),
        doc.heightOfString(formatMoney(item.unitPrice, payload.currency), { width: columns[5].width }),
        doc.heightOfString(taxText, { width: columns[6].width }),
        doc.heightOfString(formatMoney(item.lineTotal, payload.currency), { width: columns[7].width }),
      ];
      const rowHeight = Math.max(...heights) + 10;

      ensureSpace(rowHeight + 8, columns);

      const rowY = doc.y;
      doc.save();
      if (index % 2 === 0) {
        doc.rect(margin, rowY - 4, contentWidth, rowHeight).fill('#ffffff');
      } else {
        doc.rect(margin, rowY - 4, contentWidth, rowHeight).fill(colors.softGray);
      }
      doc.restore();

      doc.fillColor(colors.text).fontSize(9).font('Helvetica');
      let x = margin + 6;
      doc.text(String(index + 1), x, rowY, { width: columns[0].width - 8 });
      x += columns[0].width;
      doc.text(conceptText, x, rowY, { width: columns[1].width - 8 });
      x += columns[1].width;
      doc.text(brandText || '-', x, rowY, { width: columns[2].width - 8 });
      x += columns[2].width;
      doc.text(toText(item.unit), x, rowY, { width: columns[3].width - 8 });
      x += columns[3].width;
      doc.text(String(item.qty), x, rowY, { width: columns[4].width - 8 });
      x += columns[4].width;
      doc.text(formatMoney(item.unitPrice, payload.currency), x, rowY, { width: columns[5].width - 8 });
      x += columns[5].width;
      doc.text(taxText, x, rowY, { width: columns[6].width - 8 });
      x += columns[6].width;
      doc.font('Helvetica-Bold').text(formatMoney(item.lineTotal, payload.currency), x, rowY, {
        width: columns[7].width - 8,
      });

      doc.y = rowY + rowHeight;
    });

    doc.moveDown();
    const summaryY = doc.y + 6;
    const summaryWidth = 240;
    const summaryHeight = drawSummaryBox(margin + contentWidth - summaryWidth, summaryY, summaryWidth);

    doc.y = summaryY + summaryHeight + 14;
    drawSectionTitle('Términos y notas');
    doc.fillColor(colors.text).fontSize(10).font('Helvetica');
    if (payload.paymentTerms) doc.text(`Términos de pago: ${payload.paymentTerms}`);
    if (payload.deliveryTime) doc.text(`Tiempo de entrega: ${payload.deliveryTime}`);
    if (payload.note) doc.text(`Notas: ${payload.note}`);

    doc.moveDown();
    doc.fillColor(colors.muted).fontSize(9).text(`Preparado por: ${payload.preparedBy || 'Equipo Nexara'} · ${payload.preparedRole || 'Comercial'}`);
    doc.text('Documento confidencial para fines de evaluacion de licitacion.');

    doc.end();
  });
};

