import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

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

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value || 0);

const truncate = (text: string | null | undefined, max: number) => {
  if (!text) return '-';
  return text.length <= max ? text : text.slice(0, max - 3) + '...';
};

const capitalize = (s: string | null | undefined) => {
  if (!s) return '-';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const loadLogo = (): Buffer | null => {
  const candidates = [
    path.resolve(process.cwd(), '../web/public/logo-nexara.png'),
    path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
    } catch { /* ignore */ }
  }
  return null;
};

export const generateProcurementDashboardPdf = (payload: ProcurementDashboardPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const colors = {
      navy: '#0B1F3A',
      blue: '#1F6BBA',
      lightBlue: '#E3F2FD',
      softGray: '#F5F7FB',
      text: '#1F2A37',
      muted: '#5B6B7A',
      line: '#D9E2EC',
      success: '#166534',
      successBg: '#DCFCE7',
      warning: '#92400E',
      warningBg: '#FEF3C7',
      danger: '#991B1B',
      dangerBg: '#FEE2E2',
    };

    const margin = doc.page.margins.left; // 40
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - margin * 2;
    const logo = loadLogo();

    // ── Header (same structure as cotizacion) ──────────────────────────────
    const drawHeader = () => {
      doc.save();
      doc.rect(0, 0, pageWidth, 120).fill(colors.lightBlue);
      doc.rect(0, 0, pageWidth, 6).fill(colors.blue);
      doc.restore();

      if (logo) {
        doc.image(logo, margin, 24, { width: 84 });
      }

      const titleX = margin + 104;
      const metaX = pageWidth - margin - 170;
      doc.fillColor(colors.navy).fontSize(20).font('Helvetica-Bold')
        .text('Reporte de Compras', titleX, 30, { width: 220 });
      doc.fontSize(10).font('Helvetica').fillColor(colors.muted)
        .text('Requisiciones, ordenes de compra y proveedores', titleX, 56, { width: 230 });

      const from = payload.fromDate ? formatDate(payload.fromDate) : '-';
      const to = payload.toDate ? formatDate(payload.toDate) : formatDate(new Date());
      doc.save();
      doc.roundedRect(metaX - 12, 20, 182, 62, 6).fill('#FFFFFF');
      doc.restore();
      doc.fillColor(colors.text).fontSize(9).font('Helvetica-Bold')
        .text('Periodo', metaX, 30, { width: 150, align: 'left' });
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
        .text(`${from} -`, metaX, 43, { width: 150, align: 'left', lineBreak: true })
        .text(`${to}`, metaX, 55, { width: 150, align: 'left' });
      doc.fillColor(colors.text).fontSize(9).font('Helvetica-Bold')
        .text('Generado', metaX + 92, 30, { width: 64, align: 'left' });
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
        .text(formatDate(new Date()), metaX + 92, 43, { width: 64, align: 'left' });
    };

    // ── Section title ──────────────────────────────────────────────────────
    const drawSectionTitle = (label: string) => {
      doc.moveDown(0.6);
      doc.fillColor(colors.navy).fontSize(12).font('Helvetica-Bold').text(label, margin, doc.y);
      doc.moveDown(0.2);
    };

    // ── Table header (navy bar) ────────────────────────────────────────────
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

    const drawEmptyRow = (message: string) => {
      const y = doc.y;
      doc.save();
      doc.rect(margin, y - 4, contentWidth, 24).fill(colors.softGray);
      doc.restore();
      doc.fillColor(colors.muted).fontSize(9).font('Helvetica-Oblique')
        .text(message, margin + 10, y + 2, { width: contentWidth - 20, align: 'center' });
      doc.y = y + 24;
    };

    // ── Ensure space before a row, add page if needed ──────────────────────
    const ensureSpace = (height: number, columns: Array<{ label: string; width: number }>) => {
      if (doc.y + height > pageHeight - 50) {
        doc.addPage();
        drawHeader();
        doc.y = 140;
        drawTableHeader(doc.y, columns);
        doc.y += 28;
      }
    };

    // ── KPI summary box (2x2 grid) ─────────────────────────────────────────
    const drawKpiGrid = (y: number) => {
      const cardW = (contentWidth - 12) / 2;
      const cardH = 64;
      const gap = 12;

      const kpis = [
        { label: 'Requisiciones pendientes', value: String(payload.pendingRequisitions), valueFill: colors.warning, bg: colors.warningBg },
        { label: 'OC activas', value: String(payload.activePurchaseOrders), valueFill: colors.blue, bg: colors.lightBlue },
        { label: 'Entregas atrasadas', value: String(payload.overdueDeliveries), valueFill: colors.danger, bg: colors.dangerBg },
        { label: 'Gasto total', value: formatMoney(payload.totalSpend), valueFill: colors.navy, bg: colors.softGray },
      ];

      kpis.forEach((kpi, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = margin + col * (cardW + gap);
        const cy = y + row * (cardH + gap);

        doc.save();
        doc.roundedRect(x, cy, cardW, cardH, 6).fill(kpi.bg);
        doc.restore();
        doc.fillColor(kpi.valueFill).fontSize(22).font('Helvetica-Bold')
          .text(kpi.value, x + 14, cy + 10, { width: cardW - 28 });
        doc.fillColor(colors.muted).fontSize(9).font('Helvetica')
          .text(kpi.label, x + 14, cy + 38, { width: cardW - 28 });
      });

      return 2 * (cardH + gap) - gap; // total height of grid
    };

    // ═══════════════════════════════════════════════════════════════════════
    // PAGE 1
    // ═══════════════════════════════════════════════════════════════════════
    doc.font('Helvetica');
    drawHeader();
    doc.y = 140;

    drawSectionTitle('Resumen ejecutivo');
    const kpiGridY = doc.y;
    const kpiGridH = drawKpiGrid(kpiGridY);
    doc.y = kpiGridY + kpiGridH + 18;

    // ── Ordenes de compra (siempre visible como seccion principal del reporte)
    drawSectionTitle('Ordenes de compra');

    const ocCols = [
      { label: '#', width: 36 },
      { label: 'Proveedor', width: 160 },
      { label: 'Fecha OC', width: 80 },
      { label: 'F. Entrega', width: 80 },
      { label: 'Monto', width: 95 },
      { label: 'Estatus', width: 64 },
    ];

    drawTableHeader(doc.y, ocCols);
    doc.y += 28;

    if (payload.orders?.length > 0) {
      payload.orders.forEach((order, i) => {
        const rowH = 20;
        ensureSpace(rowH + 4, ocCols);
        const y = doc.y;

        doc.save();
        if (i % 2 === 0) doc.rect(margin, y - 4, contentWidth, rowH).fill(colors.softGray);
        else doc.rect(margin, y - 4, contentWidth, rowH).fill('#ffffff');
        doc.restore();

        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        let x = margin + 6;
        doc.text(`#${order.id}`, x, y, { width: ocCols[0].width - 8 });
        x += ocCols[0].width;
        doc.text(truncate(order.supplierName, 28), x, y, { width: ocCols[1].width - 8 });
        x += ocCols[1].width;
        doc.text(formatDate(order.orderDate), x, y, { width: ocCols[2].width - 8 });
        x += ocCols[2].width;
        doc.text(formatDate(order.expectedDate), x, y, { width: ocCols[3].width - 8 });
        x += ocCols[3].width;
        doc.fillColor(colors.navy).font('Helvetica-Bold')
          .text(formatMoney(order.totalAmount), x, y, { width: ocCols[4].width - 8 });
        x += ocCols[4].width;
        doc.fillColor(colors.blue).font('Helvetica-Bold')
          .text(capitalize(order.status), x, y, { width: ocCols[5].width - 8 });

        doc.y = y + rowH;
      });
    } else {
      drawEmptyRow('No hay ordenes de compra registradas en el periodo seleccionado.');
    }

    // ── Top Suppliers ──────────────────────────────────────────────────────
    if (payload.topSuppliers?.length > 0) {
      drawSectionTitle('Top proveedores (por evaluacion)');

      const supplierCols = [
        { label: 'Proveedor', width: 290 },
        { label: 'Evaluaciones', width: 100 },
        { label: 'Calificacion', width: 125 },
      ];

      drawTableHeader(doc.y, supplierCols);
      doc.y += 28;

      payload.topSuppliers.forEach((s, i) => {
        const rowH = 20;
        const y = doc.y;
        doc.save();
        if (i % 2 === 0) doc.rect(margin, y - 4, contentWidth, rowH).fill(colors.softGray);
        else doc.rect(margin, y - 4, contentWidth, rowH).fill('#ffffff');
        doc.restore();

        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        let x = margin + 6;
        doc.text(truncate(s.supplierName, 45), x, y, { width: supplierCols[0].width - 8 });
        x += supplierCols[0].width;
        doc.text(String(s.evaluationCount), x, y, { width: supplierCols[1].width - 8 });
        x += supplierCols[1].width;

        const score = s.avgScore ?? 0;
        const scoreColor = score >= 4 ? colors.success : score >= 3 ? colors.warning : colors.danger;
        doc.fillColor(scoreColor).font('Helvetica-Bold')
          .text(`${score.toFixed(1)} / 5.0`, x, y, { width: supplierCols[2].width - 8 });

        doc.y = y + rowH;
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REQUISICIONES
    // ═══════════════════════════════════════════════════════════════════════
    doc.addPage();
    drawHeader();
    doc.y = 140;

    drawSectionTitle('Requisiciones de compra');

    const reqCols = [
      { label: '#', width: 36 },
      { label: 'Titulo', width: 200 },
      { label: 'Prioridad', width: 80 },
      { label: 'Estatus', width: 100 },
      { label: 'Fecha', width: 99 },
    ];

    drawTableHeader(doc.y, reqCols);
    doc.y += 28;

    if (payload.requisitions?.length > 0) {
      payload.requisitions.forEach((req, i) => {
        const rowH = 20;
        ensureSpace(rowH + 4, reqCols);
        const y = doc.y;

        doc.save();
        if (i % 2 === 0) doc.rect(margin, y - 4, contentWidth, rowH).fill(colors.softGray);
        else doc.rect(margin, y - 4, contentWidth, rowH).fill('#ffffff');
        doc.restore();

        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        let x = margin + 6;
        doc.text(`#${req.id}`, x, y, { width: reqCols[0].width - 8 });
        x += reqCols[0].width;
        doc.text(truncate(req.title, 38), x, y, { width: reqCols[1].width - 8 });
        x += reqCols[1].width;

        const priorityColor = req.priority?.toUpperCase() === 'ALTA' ? colors.danger
          : req.priority?.toUpperCase() === 'BAJA' ? colors.success
          : colors.warning;
        doc.fillColor(priorityColor).font('Helvetica-Bold')
          .text(capitalize(req.priority), x, y, { width: reqCols[2].width - 8 });
        x += reqCols[2].width;

        doc.fillColor(colors.blue).font('Helvetica-Bold')
          .text(capitalize(req.status), x, y, { width: reqCols[3].width - 8 });
        x += reqCols[3].width;

        doc.fillColor(colors.muted).font('Helvetica')
          .text(formatDate(req.createdAt), x, y, { width: reqCols[4].width - 8 });

        doc.y = y + rowH;
      });
    } else {
      drawEmptyRow('No hay requisiciones de compra registradas en el periodo seleccionado.');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FOOTER on every page
    // ═══════════════════════════════════════════════════════════════════════
    const pageCount = (doc as any).bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.save();
      doc.rect(0, pageHeight - 28, pageWidth, 28).fill(colors.lightBlue);
      doc.restore();
      doc.fillColor(colors.muted).fontSize(8).font('Helvetica')
        .text(
          `NEXARA  |  Reporte de Compras  |  Pagina ${i + 1} de ${pageCount}  |  Generado: ${new Date().toLocaleString('es-MX')}`,
          margin, pageHeight - 18, { width: contentWidth, align: 'center' },
        );
    }

    doc.end();
  });
};
