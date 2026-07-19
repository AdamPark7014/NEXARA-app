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

export type EmployeePaymentsReportPayload = {
  title: string;
  periodLabel: string;
  generatedAt: string;
  preparedBy?: string | null;
  currency: string;
  totalPagado: number;
  totalBorrador: number;
  count: number;
  byEmployee: { name: string; total: number; count: number }[];
  rows: Array<{
    id: number;
    empleado: string;
    concepto: string;
    periodo: string;
    monto: number;
    status: string;
  }>;
};

const ACCENT = PDF_MODULE_ACCENTS.erp;

export function generateEmployeePaymentsReportPdf(payload: EmployeePaymentsReportPayload): Promise<Buffer> {
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
        docTitle: payload.title || 'Pagos a empleados',
        docSubtitle: 'Reporte de nómina, bonos y finiquitos',
        accent: ACCENT,
        logo,
        meta: [
          { label: 'Periodo', value: payload.periodLabel },
          { label: 'Generado', value: payload.generatedAt },
          ...(payload.preparedBy ? [{ label: 'Preparado por', value: payload.preparedBy }] : []),
        ],
      });

    header();
    drawSectionTitle(doc, 'Resumen del periodo');
    const kpiHeight = drawKpiCards(doc, doc.y, [
      { label: 'Total pagado', value: pdfMoney(payload.totalPagado, payload.currency), accent: '#2F855A' },
      { label: 'En borrador', value: pdfMoney(payload.totalBorrador, payload.currency), accent: ACCENT },
      { label: 'Registros', value: String(payload.count), accent: PDF_COLORS.blue },
    ]);
    doc.y += kpiHeight + 18;

    drawSectionTitle(doc, 'Top empleados');
    const toLines = (items: { name: string; total: number; count: number }[]) =>
      items.length
        ? items.slice(0, 8).map((it) => ({
            label: `${it.count} reg.`,
            value: `${it.name} — ${pdfMoney(it.total, payload.currency)}`,
          }))
        : [{ label: '—', value: 'Sin datos en el periodo' }];
    const cardH = drawInfoCard(doc, margin, doc.y, contentWidth, toLines(payload.byEmployee), {
      title: 'Por empleado',
      labelWidth: 48,
    });
    doc.y += cardH + 16;

    drawSectionTitle(doc, 'Detalle de pagos');
    const columns = [
      { label: 'ID', width: 34 },
      { label: 'Empleado', width: 120 },
      { label: 'Concepto', width: 130 },
      { label: 'Periodo', width: 110 },
      { label: 'Monto', width: 70, align: 'right' as const },
      { label: 'Estatus', width: 51 },
    ];
    const ctx: PdfTableContext = {
      columns,
      headerAccent: PDF_COLORS.navy,
      onNewPage: () => {
        header();
        drawSectionTitle(doc, 'Detalle de pagos (continuación)');
      },
    };
    drawTableHeader(doc, doc.y, columns);
    doc.y += 30;

    if (!payload.rows.length) {
      doc.fillColor(PDF_COLORS.muted).fontSize(9).font('Helvetica').text('Sin pagos en el periodo.', margin + 6, doc.y);
      doc.y += 18;
    }

    payload.rows.forEach((row, index) => {
      drawTableRow(
        doc,
        [String(row.id), row.empleado, row.concepto, row.periodo, pdfMoney(row.monto, payload.currency), row.status],
        index,
        ctx,
        { boldColumns: [4] },
      );
    });

    const summaryWidth = 240;
    const summaryRows: Array<[string, string]> = [
      ['Total pagado', pdfMoney(payload.totalPagado, payload.currency)],
      ['En borrador', pdfMoney(payload.totalBorrador, payload.currency)],
      ['Registros', String(payload.count)],
    ];
    if (doc.y + 80 > doc.page.height - 60) {
      doc.addPage();
      header();
      doc.y = PDF_CONTENT_START_Y;
    }
    drawSummaryBox(doc, margin + contentWidth - summaryWidth, doc.y + 8, summaryWidth, 'Resumen financiero', summaryRows, {
      highlightIndex: 0,
    });
    drawNexaraFooter(doc, 'NEXARA · Pagos a empleados — documento generado automáticamente, información confidencial.');
    doc.end();
  });
}
