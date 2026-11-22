import PDFDocument from 'pdfkit';
import {
  PDF_COLORS,
  PDF_MODULE_ACCENTS,
  drawInfoCard,
  drawNexaraFooterOnEveryPage,
  drawNexaraHeader,
  drawSectionTitle,
  drawSummaryBox,
  drawTableHeader,
  drawTableRow,
  fuente,
  loadNexaraLogo,
  pdfFecha,
  pdfMoney,
  pdfText,
  type PdfTableContext,
} from '../common/pdf/nexara-pdf-theme';

export interface SalesOrderPayload {
  orderId: string;
  orderDate: Date;
  projectName: string;
  clientName?: string;
  clientCompany?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  budget: number;
  costProducts: number;
  costViaticos: number;
  costOperativo: number;
  margin: number;
  deliveryDate?: Date;
  paymentTerms?: string;
  preparedBy?: string;
  preparedRole?: string;
  quoteNumber?: string;
  quoteSummary?: string;
}

const ACCENT = PDF_MODULE_ACCENTS.crm;

const fmtDate = (value?: Date | null) => pdfFecha(value);

/**
 * La orden de venta que se guarda al cerrar un proyecto.
 *
 * Devolvía el búfer en la misma pasada en que cerraba el documento, antes de que PDFKit hubiera escrito
 * nada: el archivo quedaba guardado en blanco, con 0 bytes. Ahora espera a que el documento termine.
 */
export const generateSalesOrderPdf = (payload: SalesOrderPayload): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const buffers: Buffer[] = [];

    doc.on('data', (data) => buffers.push(data));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const logo = loadNexaraLogo();

    const header = () =>
      drawNexaraHeader(doc, {
        docTitle: 'Orden de venta',
        docSubtitle: 'Documento comercial de cierre de proyecto',
        accent: ACCENT,
        logo,
        meta: [
          { label: 'Folio', value: pdfText(payload.orderId) },
          { label: 'Fecha', value: fmtDate(payload.orderDate) },
          ...(payload.quoteNumber
            ? [{ label: 'Cotización', value: pdfText(payload.quoteNumber) }]
            : []),
        ],
      });

    header();

    drawSectionTitle(doc, 'Cliente y proyecto');

    const infoY = doc.y;
    const leftWidth = (contentWidth - 20) * 0.55;
    const rightWidth = contentWidth - leftWidth - 20;

    const clientHeight = drawInfoCard(doc, margin, infoY, leftWidth, [
      { label: 'Empresa', value: pdfText(payload.clientCompany) },
      { label: 'Contacto', value: pdfText(payload.clientName) },
      { label: 'Correo', value: pdfText(payload.clientEmail) },
      { label: 'Teléfono', value: pdfText(payload.clientPhone) },
      { label: 'Dirección', value: pdfText(payload.clientAddress) },
    ]);

    const projectHeight = drawInfoCard(doc, margin + leftWidth + 20, infoY, rightWidth, [
      { label: 'Proyecto', value: pdfText(payload.projectName) },
      { label: 'Entrega', value: fmtDate(payload.deliveryDate) },
      { label: 'Pago', value: pdfText(payload.paymentTerms) },
      { label: 'Cotización', value: pdfText(payload.quoteNumber) },
    ]);

    doc.y = infoY + Math.max(clientHeight, projectHeight) + 16;

    drawSectionTitle(doc, 'Conceptos y partidas');

    const columns = [
      { label: 'Concepto', width: 280 },
      { label: 'Importe', width: contentWidth - 280, align: 'right' as const },
    ];

    const tableCtx: PdfTableContext = {
      columns,
      headerAccent: PDF_COLORS.navy,
      onNewPage: header,
    };

    drawTableHeader(doc, doc.y, columns);
    doc.y += 28;

    const lineItems: Array<[string, number]> = [
      ['Presupuesto total', Number(payload.budget)],
      ['Costo de productos', Number(payload.costProducts)],
      ['Costo de viáticos', Number(payload.costViaticos)],
      ['Costo operativo', Number(payload.costOperativo)],
    ];

    lineItems.forEach(([label, amount], index) => {
      drawTableRow(doc, [label, pdfMoney(amount)], index, tableCtx, {
        boldColumns: index === 0 ? [0, 1] : [1],
      });
    });

    doc.moveDown(0.8);

    const summaryWidth = 240;
    const summaryY = doc.y + 6;
    const summaryHeight = drawSummaryBox(
      doc,
      margin + contentWidth - summaryWidth,
      summaryY,
      summaryWidth,
      'Resumen financiero',
      [
        ['Presupuesto', pdfMoney(Number(payload.budget))],
        ['Costo de productos', pdfMoney(Number(payload.costProducts))],
        ['Costo de viáticos', pdfMoney(Number(payload.costViaticos))],
        ['Costo operativo', pdfMoney(Number(payload.costOperativo))],
        ['Margen libre', pdfMoney(Number(payload.margin))],
      ],
      { highlightIndex: 4 },
    );

    doc.y = summaryY + summaryHeight + 14;

    if (payload.quoteSummary || payload.paymentTerms || payload.preparedBy) {
      drawSectionTitle(doc, 'Términos y notas');
      doc.fillColor(PDF_COLORS.text).fontSize(10).font(fuente(doc, 'texto'));
      if (payload.paymentTerms) doc.text(`Términos de pago: ${payload.paymentTerms}`, margin, doc.y, { width: contentWidth });
      if (payload.quoteSummary) doc.text(`Resumen de la cotización: ${payload.quoteSummary}`, margin, doc.y, { width: contentWidth });
      if (payload.preparedBy) {
        doc
          .fillColor(PDF_COLORS.muted)
          .fontSize(9)
          .text(
            `Preparado por: ${payload.preparedBy}${payload.preparedRole ? ` · ${payload.preparedRole}` : ''}`,
          );
      }
    }

    drawNexaraFooterOnEveryPage(doc, 'NEXARA · Orden de venta — información confidencial.');
    doc.end();
  });
