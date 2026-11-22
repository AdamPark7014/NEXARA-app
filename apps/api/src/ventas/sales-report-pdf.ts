import PDFDocument from 'pdfkit';
import {
  PDF_COLORS,
  PDF_CONTENT_START_Y,
  PDF_MODULE_ACCENTS,
  drawKpiCards,
  drawNexaraFooterOnEveryPage,
  drawNexaraHeader,
  drawSectionTitle,
  drawTableHeader,
  drawTableRow,
  fuente,
  loadNexaraLogo,
  pdfMoney,
  type PdfTableColumn,
  type PdfTableContext,
} from '../common/pdf/nexara-pdf-theme';
import {
  ETIQUETA_ESTATUS_PROYECTO_COMERCIAL,
  ETIQUETA_ETAPA_OPORTUNIDAD,
  etiquetaDe,
} from '../common/excel/etiquetas';

/**
 * Logo del reporte: solo HTTPS a un dominio de NEXARA, sin redirecciones y con tope de tamaño. Antes
 * el `logoUrl` del cuerpo llegaba tal cual a `fetch` (SSRF hacia la red interna).
 */
const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || (host !== 'nexara.com.mx' && !host.endsWith('.nexara.com.mx'))) return null;
    const response = await fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) return null;
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
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
    logoBuffer = loadNexaraLogo();
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error) => reject(error));

    const accent = PDF_MODULE_ACCENTS.crm;
    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const footerNote = 'NEXARA · Reporte comercial — información confidencial.';

    const drawPage = () => {
      drawNexaraHeader(doc, {
        docTitle: 'Reporte comercial',
        docSubtitle: 'Indicadores de ventas y crecimiento',
        accent,
        logo: logoBuffer,
        meta: [
          { label: 'Periodo', value: payload.rangeLabel },
          { label: 'Generado', value: formatDateTime(payload.generatedAt) },
        ],
      });
      doc.y = PDF_CONTENT_START_Y;
    };

    const ensureSectionSpace = (minHeight: number) => {
      if (doc.y + minHeight > doc.page.height - 60) {
        doc.addPage();
        drawPage();
      }
    };

    const drawEmptyRow = (message: string) => {
      const y = doc.y;
      doc.save();
      doc.rect(margin, y - 4, contentWidth, 24).fill(PDF_COLORS.softGray);
      doc.restore();
      doc.fillColor(PDF_COLORS.muted).fontSize(9).font(fuente(doc, 'texto')).text(message, margin + 10, y + 2, {
        width: contentWidth - 20,
        align: 'center',
      });
      doc.y = y + 24;
    };

    drawPage();

    drawSectionTitle(doc, 'Resumen');
    const kpiY = doc.y;
    const kpiRowHeight = drawKpiCards(doc, kpiY, [
      { label: 'Pipeline activo', value: pdfMoney(payload.totals.pipelineValue), accent },
      { label: 'Valor esperado', value: pdfMoney(payload.totals.expectedValue), accent },
    ]);
    drawKpiCards(doc, kpiY + kpiRowHeight + 12, [
      { label: 'Margen de proyectos', value: pdfMoney(payload.totals.totalMargin), accent },
      { label: 'Cotizaciones generadas', value: String(payload.totals.quotes), accent },
    ]);
    doc.y = kpiY + kpiRowHeight * 2 + 12 + 18;

    drawSectionTitle(doc, 'Pipeline por etapa');
    const stageColumns: PdfTableColumn[] = [
      { label: 'Etapa', width: contentWidth * 0.4 },
      { label: 'Oportunidades', width: contentWidth * 0.2 },
      { label: 'Valor', width: contentWidth * 0.4, align: 'right' },
    ];
    const stageCtx: PdfTableContext = { columns: stageColumns, onNewPage: drawPage };
    drawTableHeader(doc, doc.y, stageColumns);
    doc.y += 28;
    if (payload.byStage.length === 0) {
      drawEmptyRow('No hay oportunidades en el pipeline para este periodo.');
    } else {
      payload.byStage.forEach((row, index) => {
        drawTableRow(doc, [etiquetaDe(ETIQUETA_ETAPA_OPORTUNIDAD, row.stage), String(row.count), pdfMoney(row.value)], index, stageCtx, {
          boldColumns: [2],
        });
      });
    }

    ensureSectionSpace(110);
    drawSectionTitle(doc, 'Oportunidades de mayor valor');
    const oppColumns: PdfTableColumn[] = [
      { label: 'Oportunidad', width: contentWidth * 0.5 },
      { label: 'Etapa', width: contentWidth * 0.2 },
      { label: 'Valor', width: contentWidth * 0.3, align: 'right' },
    ];
    const oppCtx: PdfTableContext = { columns: oppColumns, onNewPage: drawPage };
    drawTableHeader(doc, doc.y, oppColumns);
    doc.y += 28;
    if (payload.topOpportunities.length === 0) {
      drawEmptyRow('No hay oportunidades destacadas en este periodo.');
    } else {
      payload.topOpportunities.forEach((row, index) => {
        const label = row.clientName ? `${row.title} (${row.clientName})` : row.title;
        drawTableRow(doc, [label, etiquetaDe(ETIQUETA_ETAPA_OPORTUNIDAD, row.stage), pdfMoney(row.value)], index, oppCtx, { boldColumns: [2] });
      });
    }

    ensureSectionSpace(110);
    drawSectionTitle(doc, 'Fuentes de leads');
    const leadColumns: PdfTableColumn[] = [
      { label: 'Fuente', width: contentWidth * 0.7 },
      { label: 'Leads', width: contentWidth * 0.3, align: 'right' },
    ];
    const leadCtx: PdfTableContext = { columns: leadColumns, onNewPage: drawPage };
    drawTableHeader(doc, doc.y, leadColumns);
    doc.y += 28;
    if (payload.byLeadSource.length === 0) {
      drawEmptyRow('Sin fuentes registradas en este periodo.');
    } else {
      payload.byLeadSource.slice(0, 6).forEach((item, index) => {
        drawTableRow(doc, [item.source, String(item.count)], index, leadCtx);
      });
    }

    ensureSectionSpace(110);
    drawSectionTitle(doc, 'Margen por estado de proyecto');
    const marginColumns: PdfTableColumn[] = [
      { label: 'Estado', width: contentWidth * 0.7 },
      { label: 'Margen', width: contentWidth * 0.3, align: 'right' },
    ];
    const marginCtx: PdfTableContext = { columns: marginColumns, onNewPage: drawPage };
    drawTableHeader(doc, doc.y, marginColumns);
    doc.y += 28;
    if (payload.marginByStatus.length === 0) {
      drawEmptyRow('Sin datos de margen por estado.');
    } else {
      payload.marginByStatus.forEach((item, index) => {
        drawTableRow(doc, [etiquetaDe(ETIQUETA_ESTATUS_PROYECTO_COMERCIAL, item.status), pdfMoney(item.margin)], index, marginCtx, { boldColumns: [1] });
      });
    }

    drawNexaraFooterOnEveryPage(doc, footerNote);
    doc.end();
  });
};
