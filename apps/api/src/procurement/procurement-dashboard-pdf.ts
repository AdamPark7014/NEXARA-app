import PDFDocument from 'pdfkit';
import {
  PDF_COLORS,
  PDF_CONTENT_START_Y,
  PDF_MODULE_ACCENTS,
  drawKpiCards,
  drawNexaraFooter,
  drawNexaraHeader,
  drawSectionTitle,
  drawTableHeader,
  drawTableRow,
  loadNexaraLogo,
  pdfMoney,
  pdfTruncate,
  type PdfTableColumn,
  type PdfTableContext,
} from '../common/pdf/nexara-pdf-theme';

export type ProcurementDashboardPayload = {
  fromDate?: string;
  toDate?: string;
  pendingRequisitions: number;
  activePurchaseOrders: number;
  overdueDeliveries: number;
  totalSpend: number;
  topSuppliers: Array<{
    supplierName: string;
    evaluationCount: number;
    avgScore: number;
  }>;
  requisitions: Array<{
    id: number;
    title: string;
    description: string;
    priority: string;
    createdAt: Date;
    status: string;
  }>;
  orders: Array<{
    id: number;
    supplierName: string;
    orderDate: Date;
    expectedDate: Date | null;
    totalAmount: number;
    status: string;
  }>;
};

const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const capitalize = (s: string | null | undefined) => {
  if (!s) return '-';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

export const generateProcurementDashboardPdf = (payload: ProcurementDashboardPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const accent = PDF_MODULE_ACCENTS.warehouse;
    const logo = loadNexaraLogo();
    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const footerNote = 'NEXARA · Compras y abastecimiento — información confidencial.';

    const from = payload.fromDate ? formatDate(payload.fromDate) : '-';
    const to = payload.toDate ? formatDate(payload.toDate) : formatDate(new Date());

    const drawPage = () => {
      drawNexaraHeader(doc, {
        docTitle: 'Compras y abastecimiento',
        docSubtitle: 'Requisiciones, órdenes de compra y proveedores',
        accent,
        logo,
        meta: [
          { label: 'Periodo', value: `${from} - ${to}` },
          { label: 'Generado', value: formatDate(new Date()) },
        ],
      });
      drawNexaraFooter(doc, footerNote);
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
      doc.fillColor(PDF_COLORS.muted).fontSize(9).font('Helvetica-Oblique')
        .text(message, margin + 10, y + 2, { width: contentWidth - 20, align: 'center' });
      doc.y = y + 24;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // PÁGINA 1
    // ═══════════════════════════════════════════════════════════════════════
    doc.font('Helvetica');
    drawPage();

    drawSectionTitle(doc, 'Resumen ejecutivo');
    const kpiY = doc.y;
    const kpiRowHeight = drawKpiCards(doc, kpiY, [
      { label: 'Requisiciones pendientes', value: String(payload.pendingRequisitions), accent },
      { label: 'OC activas', value: String(payload.activePurchaseOrders), accent },
    ]);
    drawKpiCards(doc, kpiY + kpiRowHeight + 12, [
      { label: 'Entregas atrasadas', value: String(payload.overdueDeliveries), accent },
      { label: 'Gasto total', value: pdfMoney(payload.totalSpend), accent },
    ]);
    doc.y = kpiY + kpiRowHeight * 2 + 12 + 18;

    // ── Órdenes de compra (siempre visible como sección principal del reporte)
    ensureSectionSpace(90);
    drawSectionTitle(doc, 'Ordenes de compra');

    const ocCols: PdfTableColumn[] = [
      { label: '#', width: 36 },
      { label: 'Proveedor', width: 160 },
      { label: 'Fecha OC', width: 80 },
      { label: 'F. Entrega', width: 80 },
      { label: 'Monto', width: 95, align: 'right' },
      { label: 'Estatus', width: 64 },
    ];
    const ocCtx: PdfTableContext = { columns: ocCols, onNewPage: drawPage };

    drawTableHeader(doc, doc.y, ocCols);
    doc.y += 28;

    if (payload.orders?.length > 0) {
      payload.orders.forEach((order, i) => {
        drawTableRow(
          doc,
          [
            `#${order.id}`,
            pdfTruncate(order.supplierName, 28),
            formatDate(order.orderDate),
            formatDate(order.expectedDate),
            pdfMoney(order.totalAmount),
            capitalize(order.status),
          ],
          i,
          ocCtx,
          { boldColumns: [4, 5] },
        );
      });
    } else {
      drawEmptyRow('No hay ordenes de compra registradas en el periodo seleccionado.');
    }

    // ── Top proveedores ─────────────────────────────────────────────────────
    if (payload.topSuppliers?.length > 0) {
      ensureSectionSpace(110);
      drawSectionTitle(doc, 'Top proveedores (por evaluacion)');

      const supplierCols: PdfTableColumn[] = [
        { label: 'Proveedor', width: 290 },
        { label: 'Evaluaciones', width: 100 },
        { label: 'Calificacion', width: 125 },
      ];
      const supplierCtx: PdfTableContext = { columns: supplierCols, onNewPage: drawPage };

      drawTableHeader(doc, doc.y, supplierCols);
      doc.y += 28;

      payload.topSuppliers.forEach((s, i) => {
        const score = s.avgScore ?? 0;
        drawTableRow(
          doc,
          [pdfTruncate(s.supplierName, 45), String(s.evaluationCount), `${score.toFixed(1)} / 5.0`],
          i,
          supplierCtx,
          { boldColumns: [2] },
        );
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REQUISICIONES (solo si hay datos)
    // ═══════════════════════════════════════════════════════════════════════
    if (payload.requisitions?.length > 0) {
      ensureSectionSpace(110);
      drawSectionTitle(doc, 'Requisiciones de compra');

      const reqCols: PdfTableColumn[] = [
        { label: '#', width: 36 },
        { label: 'Titulo', width: 200 },
        { label: 'Prioridad', width: 80 },
        { label: 'Estatus', width: 100 },
        { label: 'Fecha', width: 99 },
      ];
      const reqCtx: PdfTableContext = { columns: reqCols, onNewPage: drawPage };

      drawTableHeader(doc, doc.y, reqCols);
      doc.y += 28;

      payload.requisitions.forEach((req, i) => {
        drawTableRow(
          doc,
          [
            `#${req.id}`,
            pdfTruncate(req.title, 38),
            capitalize(req.priority),
            capitalize(req.status),
            formatDate(req.createdAt),
          ],
          i,
          reqCtx,
          { boldColumns: [2, 3] },
        );
      });
    }

    doc.end();
  });
};
