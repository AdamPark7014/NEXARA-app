import PDFDocument from 'pdfkit';
import {
  PDF_COLORS,
  PDF_CONTENT_START_Y,
  PDF_MODULE_ACCENTS,
  drawInfoCard,
  drawKpiCards,
  drawNexaraFooter,
  drawNexaraHeader,
  drawSectionTitle,
  drawSummaryBox,
  drawTableHeader,
  drawTableRow,
  loadNexaraLogo,
  pdfMoney,
  type PdfTableContext,
} from '../common/pdf/nexara-pdf-theme';

export type ViaticsReportRow = {
  id: number;
  fecha: string;
  solicitante: string;
  proyecto: string;
  categoria: string;
  monto: number;
  estatus: string;
  contabilidadRef: string;
  motivo: string;
};

export type ViaticsReportPayload = {
  title: string;
  periodLabel: string;
  generatedAt: string;
  preparedBy?: string | null;
  currency: string;
  totalSolicitado: number;
  totalAprobado: number;
  totalPagado: number;
  byProject: { name: string; total: number; count: number }[];
  byPerson: { name: string; total: number; count: number }[];
  byCategory: { name: string; total: number; count: number }[];
  rows: ViaticsReportRow[];
};

const ACCENT = PDF_MODULE_ACCENTS.viatics;

export function generateViaticsReportPdf(payload: ViaticsReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const logo = loadNexaraLogo();

    const header = () =>
      drawNexaraHeader(doc, {
        docTitle: payload.title || 'Control de viáticos',
        docSubtitle: 'Reporte financiero de gastos de viaje',
        accent: ACCENT,
        logo,
        meta: [
          { label: 'Periodo', value: payload.periodLabel },
          { label: 'Generado', value: payload.generatedAt },
          ...(payload.preparedBy ? [{ label: 'Preparado por', value: payload.preparedBy }] : []),
        ],
      });

    header();

    // ── KPIs ─────────────────────────────────────────────────
    drawSectionTitle(doc, 'Resumen del periodo');
    const kpiHeight = drawKpiCards(doc, doc.y, [
      { label: 'Total solicitado', value: pdfMoney(payload.totalSolicitado, payload.currency), accent: ACCENT },
      { label: 'Aprobado', value: pdfMoney(payload.totalAprobado, payload.currency), accent: '#2F855A' },
      { label: 'Pagado', value: pdfMoney(payload.totalPagado, payload.currency), accent: PDF_COLORS.blue },
    ]);
    doc.y += kpiHeight + 18;

    // ── Desgloses en tarjetas (proyecto / persona / categoría) ─
    drawSectionTitle(doc, 'Desglose de gasto');

    const toLines = (items: { name: string; total: number; count: number }[]) =>
      items.length
        ? items.slice(0, 6).map((it) => ({
            label: `${it.count} reg.`,
            value: `${it.name} — ${pdfMoney(it.total, payload.currency)}`,
          }))
        : [{ label: '—', value: 'Sin datos en el periodo' }];

    const gap = 14;
    const cardWidth = (contentWidth - gap * 2) / 3;
    const breakdownY = doc.y;
    const h1 = drawInfoCard(doc, margin, breakdownY, cardWidth, toLines(payload.byProject), {
      title: 'Por proyecto',
      labelWidth: 40,
    });
    const h2 = drawInfoCard(doc, margin + cardWidth + gap, breakdownY, cardWidth, toLines(payload.byPerson), {
      title: 'Por persona',
      labelWidth: 40,
    });
    const h3 = drawInfoCard(doc, margin + (cardWidth + gap) * 2, breakdownY, cardWidth, toLines(payload.byCategory), {
      title: 'Por categoría',
      labelWidth: 40,
    });
    doc.y = breakdownY + Math.max(h1, h2, h3) + 16;

    // ── Tabla de detalle ─────────────────────────────────────
    drawSectionTitle(doc, 'Detalle de solicitudes');

    const columns = [
      { label: 'ID', width: 34 },
      { label: 'Fecha', width: 62 },
      { label: 'Solicitante', width: 105 },
      { label: 'Proyecto / Motivo', width: 130 },
      { label: 'Categoría', width: 70 },
      { label: 'Monto', width: 62, align: 'right' as const },
      { label: 'Estatus', width: 52 },
    ];
    const ctx: PdfTableContext = {
      columns,
      headerAccent: PDF_COLORS.navy,
      onNewPage: () => {
        header();
        drawSectionTitle(doc, 'Detalle de solicitudes (continuación)');
      },
    };

    drawTableHeader(doc, doc.y, columns);
    doc.y += 30;

    if (!payload.rows.length) {
      doc.fillColor(PDF_COLORS.muted).fontSize(9).font('Helvetica').text('Sin solicitudes en el periodo.', margin + 6, doc.y);
      doc.y += 18;
    }

    payload.rows.forEach((row, index) => {
      const proyectoMotivo = [row.proyecto, row.motivo].filter((v) => v && v !== '-').join(' · ');
      drawTableRow(
        doc,
        [
          String(row.id),
          row.fecha,
          row.solicitante,
          proyectoMotivo || '-',
          row.categoria,
          pdfMoney(row.monto, payload.currency),
          row.estatus,
        ],
        index,
        ctx,
        { boldColumns: [5] },
      );
    });

    // ── Resumen financiero al pie (como cotizaciones) ────────
    const summaryWidth = 240;
    const summaryRows: Array<[string, string]> = [
      ['Total solicitado', pdfMoney(payload.totalSolicitado, payload.currency)],
      ['Aprobado', pdfMoney(payload.totalAprobado, payload.currency)],
      ['Pagado', pdfMoney(payload.totalPagado, payload.currency)],
      ['Pendiente por pagar', pdfMoney(Math.max(0, payload.totalAprobado - payload.totalPagado), payload.currency)],
    ];
    const summaryHeight = 12 * 2 + summaryRows.length * 16 + 10;
    if (doc.y + summaryHeight + 40 > doc.page.height - 60) {
      doc.addPage();
      header();
      doc.y = PDF_CONTENT_START_Y;
    }
    const summaryY = doc.y + 8;
    drawSummaryBox(doc, margin + contentWidth - summaryWidth, summaryY, summaryWidth, 'Resumen financiero', summaryRows, {
      highlightIndex: summaryRows.length - 1,
    });

    drawNexaraFooter(doc, 'NEXARA · Control de viáticos — documento generado automáticamente, información confidencial.');

    doc.end();
  });
}
