import PDFDocument from 'pdfkit';
import {
  PDF_COLORS,
  PDF_CONTENT_START_Y,
  PDF_MODULE_ACCENTS,
  drawInfoCard,
  drawNexaraFooter,
  drawNexaraHeader,
  drawSectionTitle,
  drawSummaryBox,
  drawTableHeader,
  drawTableRow,
  loadNexaraLogo,
  pdfMoney,
  pdfText,
  type PdfTableContext,
} from '../common/pdf/nexara-pdf-theme';

export type ContractPdfPayload = {
  contractNumber: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  frequencyMonths?: number | null;
  status: string;
  clientName?: string | null;
  clientRfc?: string | null;
  clientAddress?: string | null;
  monthlyAmount: number;
  scope?: string | null;
  slaResponseHours?: number | null;
  slaResolutionHours?: number | null;
  visits?: Array<{ scheduledDate: string; description?: string | null; status: string }>;
  companyName?: string;
  companyRfc?: string;
};

const ACCENT = PDF_MODULE_ACCENTS.maintenance;

const fmtDate = (s?: string | null) =>
  s
    ? new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    : '-';

export async function generateContractPdf(payload: ContractPdfPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
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
          docTitle: 'Contrato de mantenimiento',
          docSubtitle: payload.title,
          accent: ACCENT,
          logo,
          meta: [
            { label: 'No. contrato', value: pdfText(payload.contractNumber) },
            { label: 'Inicio', value: fmtDate(payload.startDate) },
            { label: 'Estatus', value: pdfText(payload.status) },
          ],
        });

      header();

      drawSectionTitle(doc, 'Cliente y contrato');

      const infoY = doc.y;
      const leftWidth = (contentWidth - 20) * 0.55;
      const rightWidth = contentWidth - leftWidth - 20;

      const clientHeight = drawInfoCard(doc, margin, infoY, leftWidth, [
        { label: 'Nombre', value: pdfText(payload.clientName) },
        { label: 'RFC', value: pdfText(payload.clientRfc) },
        { label: 'Domicilio', value: pdfText(payload.clientAddress) },
      ]);

      const contractHeight = drawInfoCard(doc, margin + leftWidth + 20, infoY, rightWidth, [
        { label: 'Objeto', value: pdfText(payload.title) },
        { label: 'Alcance', value: pdfText(payload.scope) },
        { label: 'Empresa', value: pdfText(payload.companyName || 'NEXARA') },
        { label: 'RFC emp.', value: pdfText(payload.companyRfc) },
      ]);

      doc.y = infoY + Math.max(clientHeight, contractHeight) + 16;

      if (payload.slaResponseHours || payload.slaResolutionHours) {
        drawSectionTitle(doc, 'Niveles de servicio (SLA)');
        const slaY = doc.y;
        const slaHeight = drawInfoCard(doc, margin, slaY, contentWidth, [
          {
            label: 'Respuesta',
            value: payload.slaResponseHours ? `${payload.slaResponseHours} h` : '-',
          },
          {
            label: 'Resolución',
            value: payload.slaResolutionHours ? `${payload.slaResolutionHours} h` : '-',
          },
        ]);
        doc.y = slaY + slaHeight + 16;
      }

      const visits = payload.visits ?? [];
      if (visits.length > 0) {
        drawSectionTitle(doc, 'Calendario de visitas');

        const columns = [
          { label: 'Fecha', width: 160 },
          { label: 'Descripción', width: 260 },
          { label: 'Estatus', width: contentWidth - 160 - 260 },
        ];

        const tableCtx: PdfTableContext = {
          columns,
          headerAccent: PDF_COLORS.navy,
          onNewPage: header,
        };

        drawTableHeader(doc, doc.y, columns);
        doc.y += 28;

        visits.forEach((visit, index) => {
          drawTableRow(
            doc,
            [
              fmtDate(visit.scheduledDate),
              pdfText(visit.description || 'Visita preventiva'),
              pdfText(visit.status),
            ],
            index,
            tableCtx,
          );
        });

        doc.moveDown(0.8);
      }

      const summaryWidth = 260;
      const summaryY = doc.y + 6;
      if (summaryY + 100 > doc.page.height - 80) {
        doc.addPage();
        header();
        doc.y = PDF_CONTENT_START_Y;
      }

      const summaryBoxY = doc.y + 6;
      const summaryHeight = drawSummaryBox(
        doc,
        margin + contentWidth - summaryWidth,
        summaryBoxY,
        summaryWidth,
        'Resumen financiero',
        [
          ['Monto mensual', pdfMoney(payload.monthlyAmount)],
          [
            'Frecuencia',
            payload.frequencyMonths ? `Cada ${payload.frequencyMonths} mes(es)` : 'A demanda',
          ],
          ['Vigencia', `${fmtDate(payload.startDate)} — ${fmtDate(payload.endDate)}`],
        ],
        { highlightIndex: 0 },
      );
      doc.y = summaryBoxY + summaryHeight + 28;

      if (doc.y + 60 > doc.page.height - 60) {
        doc.addPage();
        header();
        doc.y = PDF_CONTENT_START_Y;
      }

      drawSectionTitle(doc, 'Firmas');
      const sigY = doc.y + 24;
      const colWidth = (contentWidth - 40) / 2;

      doc
        .strokeColor(PDF_COLORS.line)
        .moveTo(margin, sigY)
        .lineTo(margin + colWidth, sigY)
        .stroke();
      doc
        .fillColor(PDF_COLORS.muted)
        .fontSize(10)
        .font('Helvetica')
        .text('Cliente', margin, sigY + 8, { width: colWidth, align: 'center' });

      const rightX = margin + colWidth + 40;
      doc
        .strokeColor(PDF_COLORS.line)
        .moveTo(rightX, sigY)
        .lineTo(rightX + colWidth, sigY)
        .stroke();
      doc
        .fillColor(PDF_COLORS.muted)
        .fontSize(10)
        .font('Helvetica')
        .text('NEXARA', rightX, sigY + 8, { width: colWidth, align: 'center' });

      drawNexaraFooter(doc, 'NEXARA · Contrato de mantenimiento — información confidencial.');
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
