import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
};

const loadLocalLogo = (): Buffer | null => {
  const candidates = [
    path.resolve(process.cwd(), '../web/public/logo-nexara.png'),
    path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
    } catch {
      // ignore
    }
  }

  return null;
};

export type SalesReportTotals = {
  leads: number;
  opportunities: number;
  won: number;
  lost: number;
  pipelineValue: number;
  expectedValue: number;
  projects: number;
  totalMargin: number;
  quotes: number;
  clients: number;
};

export type SalesReportPayload = {
  generatedAt: Date;
  rangeLabel: string;
  totals: SalesReportTotals;
  byStage: Array<{ stage: string; count: number; value: number }>;
  byLeadSource: Array<{ source: string; count: number }>;
  marginByStatus: Array<{ status: string; margin: number }>;
  topOpportunities: Array<{ title: string; value: number; stage: string; probability: number; clientName?: string | null }>;
  logoUrl?: string;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatDateTime = (value?: Date | null) => {
  if (!value) return '-';
  return value.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const generateSalesReportPdf = async (payload: SalesReportPayload): Promise<Buffer> => {
  // Fetch logo if provided
  let logoBuffer: Buffer | null = null;
  if (payload.logoUrl) {
    logoBuffer = await fetchImageBuffer(payload.logoUrl);
  }
  if (!logoBuffer) {
    logoBuffer = loadLocalLogo();
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
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

    const drawHeader = () => {
      doc.save();
      doc.rect(0, 0, pageWidth, 120).fill(colors.lightBlue);
      doc.rect(0, 0, pageWidth, 6).fill(colors.blue);
      doc.restore();

      // Draw logo if available
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, margin, 24, { width: 84 });
        } catch {
          // Silently fail if logo cannot be rendered
        }
      }

      const titleX = logoBuffer ? margin + 104 : margin;
      const metaX = pageWidth - margin - 176;

      doc.fillColor(colors.navy).fontSize(20).font('Helvetica-Bold').text('Reporte Comercial', titleX, 30, {
        width: 220,
      });
      doc.fontSize(10).font('Helvetica').fillColor(colors.muted).text('Indicadores de ventas y crecimiento', titleX, 56, {
        width: 230,
      });

      doc.save();
      doc.roundedRect(metaX - 12, 20, 182, 62, 6).fill('#FFFFFF');
      doc.restore();

      doc.fillColor(colors.text).fontSize(9).font('Helvetica-Bold').text('Periodo', metaX, 30, { width: 72 });
      doc.fillColor(colors.text).fontSize(10).font('Helvetica').text(payload.rangeLabel, metaX, 43, { width: 88 });
      doc.fillColor(colors.text).fontSize(9).font('Helvetica-Bold').text('Generado', metaX + 94, 30, { width: 70 });
      doc.fillColor(colors.text).fontSize(10).font('Helvetica').text(formatDateTime(payload.generatedAt), metaX + 94, 43, {
        width: 70,
      });
    };

    const drawSectionTitle = (label: string) => {
      doc.moveDown(0.6);
      doc.fillColor(colors.navy).fontSize(12).font('Helvetica-Bold').text(label, margin, doc.y);
      doc.moveDown(0.2);
    };

    const drawKpiCard = (x: number, y: number, width: number, label: string, value: string) => {
      doc.save();
      doc.roundedRect(x, y, width, 48, 8).fill(colors.softGray);
      doc.restore();
      doc.fillColor(colors.muted).fontSize(9).text(label, x + 10, y + 8, { width: width - 20 });
      doc.fillColor(colors.text).fontSize(12).font('Helvetica-Bold').text(value, x + 10, y + 22, { width: width - 20 });
    };

    const drawTableHeader = (y: number, columns: Array<{ label: string; width: number }>) => {
      doc.save();
      doc.rect(margin, y, contentWidth, 22).fill(colors.navy);
      doc.restore();
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      let x = margin + 6;
      columns.forEach((col) => {
        doc.text(col.label, x, y + 6, { width: col.width - 8 });
        x += col.width;
      });
    };

    const ensureSpace = (height: number, columns: Array<{ label: string; width: number }>) => {
      if (doc.y + height > pageHeight - 56) {
        doc.addPage();
        drawHeader();
        doc.y = 140;
        drawTableHeader(doc.y, columns);
        doc.y += 26;
      }
    };

    const drawEmptyRow = (message: string) => {
      const y = doc.y;
      doc.save();
      doc.rect(margin, y - 4, contentWidth, 24).fill(colors.softGray);
      doc.restore();
      doc.fillColor(colors.muted).fontSize(9).font('Helvetica-Oblique').text(message, margin + 10, y + 2, {
        width: contentWidth - 20,
        align: 'center',
      });
      doc.y = y + 24;
    };

    const drawTableRow = (row: string[], columns: Array<{ width: number }>) => {
      const rowY = doc.y;
      const cellPadding = 4;
      doc.font('Helvetica').fontSize(8).fillColor(colors.text);
      const heights = row.map((value, index) => doc.heightOfString(value, {
        width: columns[index].width - cellPadding * 2,
        align: 'left',
      }));
      const rowHeight = Math.max(18, ...heights) + cellPadding * 2;
      let x = margin + 6;
      row.forEach((value, index) => {
        doc.text(value, x, rowY + cellPadding, {
          width: columns[index].width - cellPadding * 2,
          align: 'left',
        });
        x += columns[index].width;
      });
      doc.y = rowY + rowHeight;
      doc.moveTo(margin, doc.y).lineTo(margin + contentWidth, doc.y).strokeColor(colors.line).stroke();
    };

    drawHeader();
    doc.y = 140;

    drawSectionTitle('Resumen');
    const cardWidth = (contentWidth - 16) / 2;
    const cardY = doc.y;
    drawKpiCard(margin, cardY, cardWidth, 'Pipeline activo', formatMoney(payload.totals.pipelineValue));
    drawKpiCard(margin + cardWidth + 16, cardY, cardWidth, 'Valor esperado', formatMoney(payload.totals.expectedValue));
    drawKpiCard(margin, cardY + 56, cardWidth, 'Margen proyectos', formatMoney(payload.totals.totalMargin));
    drawKpiCard(margin + cardWidth + 16, cardY + 56, cardWidth, 'Cotizaciones generadas', String(payload.totals.quotes));
    doc.y = cardY + 120;

    drawSectionTitle('Pipeline por etapa');
    const stageColumns = [
      { label: 'Etapa', width: contentWidth * 0.4 },
      { label: 'Oportunidades', width: contentWidth * 0.2 },
      { label: 'Valor', width: contentWidth * 0.4 },
    ];
    drawTableHeader(doc.y, stageColumns);
    doc.y += 26;
    if (payload.byStage.length === 0) {
      drawEmptyRow('No hay datos de pipeline por etapa para este periodo.');
    } else {
      payload.byStage.forEach((row) => {
        ensureSpace(24, stageColumns);
        drawTableRow([row.stage, String(row.count), formatMoney(row.value)], stageColumns);
      });
    }

    drawSectionTitle('Top oportunidades');
    const oppColumns = [
      { label: 'Proyecto', width: contentWidth * 0.5 },
      { label: 'Etapa', width: contentWidth * 0.2 },
      { label: 'Valor', width: contentWidth * 0.3 },
    ];
    drawTableHeader(doc.y, oppColumns);
    doc.y += 26;
    if (payload.topOpportunities.length === 0) {
      drawEmptyRow('No hay oportunidades destacadas en este periodo.');
    } else {
      payload.topOpportunities.forEach((row) => {
        ensureSpace(24, oppColumns);
        const label = row.clientName ? `${row.title} (${row.clientName})` : row.title;
        drawTableRow([label, row.stage, formatMoney(row.value)], oppColumns);
      });
    }

    drawSectionTitle('Fuentes de leads');
    if (payload.byLeadSource.length === 0) {
      doc.fillColor(colors.muted).fontSize(9).font('Helvetica-Oblique').text('Sin fuentes registradas en este periodo.', margin, doc.y);
      doc.moveDown(0.4);
    } else {
      payload.byLeadSource.slice(0, 6).forEach((item) => {
        doc.fillColor(colors.text).fontSize(9).font('Helvetica').text(`${item.source}: ${item.count}`, margin, doc.y);
        doc.moveDown(0.2);
      });
    }

    drawSectionTitle('Margen por estado de proyecto');
    if (payload.marginByStatus.length === 0) {
      doc.fillColor(colors.muted).fontSize(9).font('Helvetica-Oblique').text('Sin datos de margen por estado.', margin, doc.y);
      doc.moveDown(0.3);
    } else {
      payload.marginByStatus.forEach((item) => {
        doc.fillColor(colors.text).fontSize(9).font('Helvetica').text(`${item.status}: ${formatMoney(item.margin)}`, margin, doc.y);
        doc.moveDown(0.2);
      });
    }

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      doc.switchToPage(i);
      const footerY = pageHeight - doc.page.margins.bottom - 12;
      doc.fillColor(colors.muted).fontSize(8).font('Helvetica').text(
        `NEXARA · Reporte Comercial · Pagina ${i + 1} de ${pages.count}`,
        margin,
        footerY,
        { width: contentWidth, align: 'center' },
      );
    }

    doc.end();
  });
};
