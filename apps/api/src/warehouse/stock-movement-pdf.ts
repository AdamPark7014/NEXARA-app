import PDFDocument from 'pdfkit';
import {
  PDF_MODULE_ACCENTS,
  drawInfoCard,
  drawKpiCards,
  drawNexaraFooter,
  drawNexaraHeader,
  drawSectionTitle,
  drawTableHeader,
  drawTableRow,
  loadNexaraLogo,
  pdfMoney,
  pdfText,
  type PdfTableContext,
} from '../common/pdf/nexara-pdf-theme.js';

export type StockMovementPdfRow = {
  movementNumber: string;
  type: string;
  typeLabel: string;
  sku?: string | null;
  productName?: string | null;
  fromWarehouse?: string | null;
  toWarehouse?: string | null;
  quantity: number;
  balanceLabel?: string | null;
  documentLabel?: string | null;
  reference?: string | null;
  notes?: string | null;
  unitCost?: number | null;
  totalCost?: number | null;
  createdAt: string;
  createdByName?: string | null;
};

export type StockMovementsPdfPayload = {
  title: string;
  subtitle?: string;
  companyName: string;
  generatedAt: string;
  filters?: Array<{ label: string; value: string }>;
  productSku?: string | null;
  productName?: string | null;
  rows: StockMovementPdfRow[];
};

const ACCENT = PDF_MODULE_ACCENTS.warehouse;

const TYPE_LABELS: Record<string, string> = {
  RECEIPT: 'Entrada',
  DISPATCH: 'Salida',
  TRANSFER: 'Traspaso',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
  SCRAP: 'Merma',
  PRODUCTION_IN: 'Prod. entrada',
  PRODUCTION_OUT: 'Prod. salida',
};

export const stockMovementTypeLabel = (type: string) => TYPE_LABELS[type] ?? type;

const qtyFmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: 4 }).format(n || 0);

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const warehouseRoute = (row: StockMovementPdfRow) => {
  const from = row.fromWarehouse?.trim() || '—';
  const to = row.toWarehouse?.trim() || '—';
  return `${from} → ${to}`;
};

export const generateStockMovementsPdf = (payload: StockMovementsPdfPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const logo = loadNexaraLogo();

    const headerMeta = [
      { label: 'Empresa', value: pdfText(payload.companyName) },
      { label: 'Generado', value: formatDateTime(payload.generatedAt) },
      { label: 'Movimientos', value: String(payload.rows.length) },
    ];
    if (payload.productSku) {
      headerMeta.splice(1, 0, { label: 'SKU', value: pdfText(payload.productSku) });
    }

    const header = () =>
      drawNexaraHeader(doc, {
        docTitle: payload.title,
        docSubtitle: payload.subtitle ?? 'Kardex / movimientos de inventario',
        accent: ACCENT,
        logo,
        meta: headerMeta.slice(0, 5),
      });

    header();

    const totalQty = payload.rows.reduce((s, r) => s + (r.quantity || 0), 0);
    const totalCost = payload.rows.reduce((s, r) => s + Number(r.totalCost || 0), 0);
    const transfers = payload.rows.filter((r) => r.type === 'TRANSFER').length;
    const adjustments = payload.rows.filter((r) => r.type === 'ADJUSTMENT').length;

    drawSectionTitle(doc, 'Resumen');
    const kpiH = drawKpiCards(doc, doc.y, [
      { label: 'Registros', value: String(payload.rows.length), accent: ACCENT },
      { label: 'Cantidad movida', value: qtyFmt(totalQty), accent: ACCENT },
      { label: 'Traspasos', value: String(transfers), accent: ACCENT },
      { label: 'Ajustes', value: String(adjustments), accent: ACCENT },
      { label: 'Costo total', value: pdfMoney(totalCost), accent: ACCENT },
    ]);
    doc.y += kpiH + 12;

    if (payload.productName || (payload.filters && payload.filters.length)) {
      const infoY = doc.y;
      const lines: Array<{ label: string; value: string }> = [];
      if (payload.productName) {
        lines.push({ label: 'Producto', value: pdfText(payload.productName) });
      }
      for (const f of payload.filters ?? []) {
        lines.push({ label: f.label, value: f.value });
      }
      if (lines.length) {
        const h = drawInfoCard(doc, margin, infoY, contentWidth, lines, { title: 'Filtros aplicados' });
        doc.y = infoY + h + 12;
      }
    }

    drawSectionTitle(doc, 'Detalle de movimientos');

    const columns = [
      { label: 'Folio', width: 72 },
      { label: 'Tipo', width: 68 },
      { label: 'SKU', width: 64 },
      { label: 'Producto', width: 120 },
      { label: 'Almacén', width: 110 },
      { label: 'Cant.', width: 48, align: 'right' as const },
      { label: 'Saldo', width: 70 },
      { label: 'Referencia', width: 90 },
      { label: 'Usuario', width: 70 },
      { label: 'Fecha/hora', width: contentWidth - 72 - 68 - 64 - 120 - 110 - 48 - 70 - 90 - 70 },
    ];

    const tableCtx: PdfTableContext = {
      columns,
      headerAccent: ACCENT,
      zebra: true,
      fontSize: 7.5,
      onNewPage: (d) => {
        drawNexaraHeader(d, {
          docTitle: payload.title,
          docSubtitle: 'continuación',
          accent: ACCENT,
          logo,
          meta: [{ label: 'Registros', value: String(payload.rows.length) }],
        });
        drawSectionTitle(d, 'Detalle de movimientos');
      },
    };

    drawTableHeader(doc, doc.y, columns, ACCENT);
    doc.y += 28;

    if (!payload.rows.length) {
      doc.fillColor('#5B6B7A').fontSize(10).font('Helvetica')
        .text('Sin movimientos en el periodo o filtros seleccionados.', margin, doc.y + 8);
    } else {
      payload.rows.forEach((row, index) => {
        drawTableRow(
          doc,
          [
            pdfText(row.movementNumber),
            pdfText(row.typeLabel || stockMovementTypeLabel(row.type)),
            pdfText(row.sku),
            pdfText(row.productName),
            warehouseRoute(row),
            qtyFmt(row.quantity),
            pdfText(row.balanceLabel),
            pdfText(row.documentLabel || row.reference),
            pdfText(row.createdByName),
            formatDateTime(row.createdAt),
          ],
          index,
          tableCtx,
          { boldColumns: [0, 2] },
        );
      });
    }

    drawNexaraFooter(doc, 'NEXARA · Kardex de inventario · Documento confidencial');
    doc.end();
  });
};

/** Vale / comprobante de un solo movimiento (traspaso, ajuste, entrada…). */
export const generateStockMovementSlipPdf = (row: StockMovementPdfRow & {
  companyName: string;
  notes?: string | null;
}): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const logo = loadNexaraLogo();
    const typeLabel = row.typeLabel || stockMovementTypeLabel(row.type);

    drawNexaraHeader(doc, {
      docTitle: `Comprobante · ${typeLabel}`,
      docSubtitle: 'Movimiento de inventario',
      accent: ACCENT,
      logo,
      meta: [
        { label: 'Folio', value: row.movementNumber },
        { label: 'Fecha', value: formatDateTime(row.createdAt) },
        { label: 'Usuario', value: pdfText(row.createdByName) },
      ],
    });

    drawSectionTitle(doc, 'Detalle');
    const infoY = doc.y;
    const leftW = (contentWidth - 16) * 0.55;
    const rightW = contentWidth - leftW - 16;
    const leftH = drawInfoCard(doc, margin, infoY, leftW, [
      { label: 'SKU', value: pdfText(row.sku) },
      { label: 'Producto', value: pdfText(row.productName) },
      { label: 'Cantidad', value: qtyFmt(row.quantity) },
      { label: 'Saldo', value: pdfText(row.balanceLabel) },
    ], { title: 'Producto' });
    const rightH = drawInfoCard(doc, margin + leftW + 16, infoY, rightW, [
      { label: 'Origen', value: pdfText(row.fromWarehouse) },
      { label: 'Destino', value: pdfText(row.toWarehouse) },
      { label: 'Referencia', value: pdfText(row.documentLabel || row.reference) },
      { label: 'Costo', value: pdfMoney(Number(row.totalCost || 0)) },
    ], { title: 'Almacén / documento' });
    doc.y = infoY + Math.max(leftH, rightH) + 14;

    if (row.notes) {
      drawSectionTitle(doc, 'Notas');
      doc.fillColor('#1F2A37').fontSize(10).font('Helvetica').text(row.notes, margin, doc.y, {
        width: contentWidth,
      });
    }

    drawNexaraFooter(doc, `NEXARA · ${row.companyName} · ${row.movementNumber}`);
    doc.end();
  });
};
