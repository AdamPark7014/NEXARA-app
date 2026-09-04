import PDFDocument from 'pdfkit';
import {
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
  pdfText,
  type PdfTableContext,
} from '../common/pdf/nexara-pdf-theme.js';

export type GoodsReceiptPdfItem = {
  sku?: string | null;
  description: string;
  quantityReceived: number;
  quantityRejected: number;
  lotNumber?: string | null;
  unitPrice?: number | null;
  landedCostAllocated?: number | null;
};

export type GoodsReceiptPdfPayload = {
  receiptNumber: string;
  receiptDate: string;
  notes?: string | null;
  companyName: string;
  warehouseName?: string | null;
  warehouseCode?: string | null;
  poNumber?: string | null;
  supplierName?: string | null;
  receivedByName?: string | null;
  freightCost: number;
  insuranceCost: number;
  customsCost: number;
  otherLandedCost: number;
  items: GoodsReceiptPdfItem[];
};

const ACCENT = PDF_MODULE_ACCENTS.warehouse;

const qtyFmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: 4 }).format(n || 0);

const formatDisplayDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
};

export const generateGoodsReceiptPdf = (payload: GoodsReceiptPdfPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const logo = loadNexaraLogo();

    const header = () =>
      drawNexaraHeader(doc, {
        docTitle: 'Recepción de mercancía',
        docSubtitle: 'Entrada a almacén · Compras / Inventario',
        accent: ACCENT,
        logo,
        meta: [
          { label: 'Folio', value: payload.receiptNumber },
          { label: 'Fecha', value: formatDisplayDate(payload.receiptDate) },
          { label: 'OC', value: pdfText(payload.poNumber) },
        ],
      });

    header();

    const totalLanded =
      (payload.freightCost || 0) +
      (payload.insuranceCost || 0) +
      (payload.customsCost || 0) +
      (payload.otherLandedCost || 0);
    const qtyReceived = payload.items.reduce((s, i) => s + (i.quantityReceived || 0), 0);
    const qtyRejected = payload.items.reduce((s, i) => s + (i.quantityRejected || 0), 0);

    drawSectionTitle(doc, 'Resumen');
    const kpiH = drawKpiCards(doc, doc.y, [
      { label: 'Partidas', value: String(payload.items.length), accent: ACCENT },
      { label: 'Cant. recibida', value: qtyFmt(qtyReceived), accent: ACCENT },
      { label: 'Landed cost', value: pdfMoney(totalLanded), accent: ACCENT },
    ]);
    doc.y += kpiH + 14;

    const infoY = doc.y;
    const leftW = (contentWidth - 16) * 0.55;
    const rightW = contentWidth - leftW - 16;
    const leftH = drawInfoCard(doc, margin, infoY, leftW, [
      { label: 'Empresa', value: pdfText(payload.companyName) },
      { label: 'Proveedor', value: pdfText(payload.supplierName) },
      { label: 'Orden de compra', value: pdfText(payload.poNumber) },
      { label: 'Recibió', value: pdfText(payload.receivedByName) },
    ], { title: 'Origen' });
    const whLabel = [payload.warehouseCode, payload.warehouseName].filter(Boolean).join(' — ') || '—';
    const rightH = drawInfoCard(doc, margin + leftW + 16, infoY, rightW, [
      { label: 'Almacén', value: whLabel },
      { label: 'Fecha recepción', value: formatDisplayDate(payload.receiptDate) },
      { label: 'Rechazado', value: qtyFmt(qtyRejected) },
      { label: 'Notas', value: pdfText(payload.notes) },
    ], { title: 'Destino' });
    doc.y = infoY + Math.max(leftH, rightH) + 14;

    drawSectionTitle(doc, 'Partidas recibidas');

    const columns = [
      { label: 'SKU', width: 70 },
      { label: 'Descripción', width: contentWidth - 70 - 55 - 55 - 70 - 75 },
      { label: 'Recibido', width: 55, align: 'right' as const },
      { label: 'Rechazado', width: 55, align: 'right' as const },
      { label: 'Lote', width: 70 },
      { label: 'Landed', width: 75, align: 'right' as const },
    ];

    const tableCtx: PdfTableContext = {
      columns,
      headerAccent: ACCENT,
      zebra: true,
      fontSize: 8.5,
      onNewPage: (d) => {
        drawNexaraHeader(d, {
          docTitle: 'Recepción de mercancía',
          docSubtitle: `${payload.receiptNumber} (continuación)`,
          accent: ACCENT,
          logo,
          meta: [{ label: 'Folio', value: payload.receiptNumber }],
        });
        drawSectionTitle(d, 'Partidas recibidas');
      },
    };

    drawTableHeader(doc, doc.y, columns, ACCENT);
    doc.y += 28;

    payload.items.forEach((item, index) => {
      drawTableRow(
        doc,
        [
          pdfText(item.sku),
          pdfText(item.description),
          qtyFmt(item.quantityReceived),
          qtyFmt(item.quantityRejected),
          pdfText(item.lotNumber),
          pdfMoney(Number(item.landedCostAllocated || 0)),
        ],
        index,
        tableCtx,
        { boldColumns: [0] },
      );
    });

    if (totalLanded > 0) {
      doc.moveDown(0.8);
      const boxW = 220;
      const boxX = margin + contentWidth - boxW;
      drawSummaryBox(doc, boxX, doc.y, boxW, 'Costos adicionales', [
        ['Flete', pdfMoney(payload.freightCost)],
        ['Seguro', pdfMoney(payload.insuranceCost)],
        ['Aduana', pdfMoney(payload.customsCost)],
        ['Otros', pdfMoney(payload.otherLandedCost)],
        ['Total landed', pdfMoney(totalLanded)],
      ], { highlightIndex: 4 });
    }

    drawNexaraFooter(doc, `NEXARA · Recepción ${payload.receiptNumber} · Documento de almacén`);
    doc.end();
  });
};
