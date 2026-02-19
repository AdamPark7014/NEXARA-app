import PDFDocument from 'pdfkit';

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

export const generateSalesReportPdf = (payload: SalesReportPayload): Promise<Buffer> => {
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
    const contentWidth = pageWidth - margin * 2;

    const drawHeader = () => {
      doc.save();
      doc.rect(0, 0, pageWidth, 110).fill(colors.lightBlue);
      doc.rect(0, 0, pageWidth, 6).fill(colors.blue);
      doc.restore();

      doc.fillColor(colors.navy).fontSize(20).font('Helvetica-Bold').text('Reporte Comercial', margin, 28, {
        width: 280,
      });
      doc.fontSize(10).font('Helvetica').fillColor(colors.muted).text('Indicadores de ventas y crecimiento', margin, 56);

      doc.fillColor(colors.text).fontSize(9);
      doc.text(`Rango: ${payload.rangeLabel}`, margin + 300, 32, { width: 220, align: 'right' });
      doc.text(`Generado: ${formatDateTime(payload.generatedAt)}`, margin + 300, 48, { width: 220, align: 'right' });
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
    doc.y = 130;

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
    payload.byStage.forEach((row) => {
      drawTableRow([row.stage, String(row.count), formatMoney(row.value)], stageColumns);
    });

    drawSectionTitle('Top oportunidades');
    const oppColumns = [
      { label: 'Proyecto', width: contentWidth * 0.5 },
      { label: 'Etapa', width: contentWidth * 0.2 },
      { label: 'Valor', width: contentWidth * 0.3 },
    ];
    drawTableHeader(doc.y, oppColumns);
    doc.y += 26;
    payload.topOpportunities.forEach((row) => {
      const label = row.clientName ? `${row.title} (${row.clientName})` : row.title;
      drawTableRow([label, row.stage, formatMoney(row.value)], oppColumns);
    });

    drawSectionTitle('Fuentes de leads');
    payload.byLeadSource.slice(0, 6).forEach((item) => {
      doc.fillColor(colors.text).fontSize(9).text(`${item.source}: ${item.count}`, margin, doc.y);
      doc.moveDown(0.2);
    });

    drawSectionTitle('Margen por estado de proyecto');
    payload.marginByStatus.forEach((item) => {
      doc.fillColor(colors.text).fontSize(9).text(`${item.status}: ${formatMoney(item.margin)}`, margin, doc.y);
      doc.moveDown(0.2);
    });

    doc.end();
  });
};
