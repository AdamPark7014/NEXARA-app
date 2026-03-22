import PDFDocument from 'pdfkit';

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

const formatDate = (date: string | Date) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
};

const getPriorityColor = (priority: string) => {
  switch (priority?.toUpperCase()) {
    case 'ALTA': return '#EF4444';
    case 'NORMAL': return '#F59E0B';
    case 'BAJA': return '#10B981';
    default: return '#6B7280';
  }
};

const getStatusColor = (status: string) => {
  const s = status?.toUpperCase();
  if (s === 'PENDIENTE' || s === 'PENDING') return '#F59E0B';
  if (s === 'APROBADA' || s === 'APPROVED') return '#10B981';
  if (s === 'RECHAZADA' || s === 'REJECTED') return '#EF4444';
  return '#6B7280';
};

export const generateProcurementDashboardPdf = async (payload: ProcurementDashboardPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 30, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error) => reject(error));

    const colors = {
      primary: '#0f7bff',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      gray: '#6b7280',
      lightGray: '#f3f4f6',
      darkGray: '#1f2937',
      border: '#e5e7eb',
    };

    // Header
    doc.fontSize(24).font('Helvetica-Bold').fillColor(colors.primary);
    doc.text('📦 REPORTE DE COMPRAS Y REQUISICIONES', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor(colors.gray);
    doc.text(`Período: ${payload.fromDate} al ${payload.toDate}`, { align: 'center' });
    doc.moveDown(0.5);

    // KPI Cards
    doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.darkGray);
    doc.text('RESUMEN EJECUTIVO');
    doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).stroke(colors.border);
    doc.moveDown(0.3);

    const stats = [
      { label: 'Requisiciones Pendientes', value: payload.pendingRequisitions, color: colors.warning },
      { label: 'OC Activas', value: payload.activePurchaseOrders, color: colors.success },
      { label: 'Entregas Atrasadas', value: payload.overdueDeliveries, color: colors.danger },
      { label: 'Gasto Total', value: formatCurrency(payload.totalSpend), color: colors.primary },
    ];

    doc.fontSize(10);
    stats.forEach((stat, i) => {
      if (i > 0 && i % 2 === 0) doc.moveDown(0.5);
      const x = i % 2 === 0 ? 30 : doc.page.width / 2;
      const y = doc.y;
      doc.fillColor(stat.color).font('Helvetica-Bold').fontSize(16);
      doc.text(String(stat.value), x, y, { width: doc.page.width / 2 - 60 });
      doc.font('Helvetica').fontSize(9).fillColor(colors.gray);
      doc.text(stat.label, x, y + 20, { width: doc.page.width / 2 - 60 });
      if (i % 2 === 1) doc.moveDown(1.5);
    });

    doc.moveDown(0.5);

    // Top Suppliers
    if (payload.topSuppliers && payload.topSuppliers.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.darkGray);
      doc.text('TOP PROVEEDORES');
      doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).stroke(colors.border);
      doc.moveDown(0.3);

      const supplierTableTop = doc.y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
      doc.fillColor(colors.primary).rect(30, supplierTableTop, doc.page.width - 60, 20).fill();
      doc.fillColor('#fff');
      doc.text('Proveedor', 40, supplierTableTop + 5);
      doc.text('Evaluaciones', 280, supplierTableTop + 5);
      doc.text('Calificación', 350, supplierTableTop + 5);

      doc.moveDown(1.2);
      doc.font('Helvetica').fontSize(9).fillColor(colors.darkGray);

      payload.topSuppliers.forEach((supplier, index) => {
        const rowY = doc.y;
        if (index % 2 === 0) {
          doc.fillColor(colors.lightGray).rect(30, rowY - 3, doc.page.width - 60, 18).fill();
        }
        doc.fillColor(colors.darkGray);
        doc.text(supplier.supplierName || 'N/A', 40, rowY);
        doc.text(String(supplier.evaluationCount), 280, rowY);
        doc.fillColor(supplier.avgScore >= 4 ? colors.success : supplier.avgScore >= 3 ? colors.warning : colors.danger);
        doc.font('Helvetica-Bold');
        doc.text(`⭐ ${supplier.avgScore.toFixed(1)}`, 350, rowY);
        doc.font('Helvetica').fillColor(colors.darkGray);
        doc.moveDown(1);
      });
      doc.moveDown(0.5);
    }

    // Requisiciones
    if (payload.requisitions && payload.requisitions.length > 0) {
      doc.addPage();
      doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.darkGray);
      doc.text('REQUISICIONES DE COMPRA');
      doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).stroke(colors.border);
      doc.moveDown(0.3);

      const reqTableTop = doc.y;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
      doc.fillColor(colors.primary).rect(30, reqTableTop, doc.page.width - 60, 18).fill();
      doc.fillColor('#fff');
      doc.text('ID', 40, reqTableTop + 4);
      doc.text('Título', 65, reqTableTop + 4);
      doc.text('Prioridad', 200, reqTableTop + 4);
      doc.text('Estatus', 270, reqTableTop + 4);
      doc.text('Fecha', 320, reqTableTop + 4);

      doc.font('Helvetica').fontSize(8).fillColor(colors.darkGray);
      doc.moveDown(1.3);

      payload.requisitions.forEach((req, index) => {
        if (doc.y > doc.page.height - 40) {
          doc.addPage();
        }
        const rowY = doc.y;
        if (index % 2 === 0) {
          doc.fillColor(colors.lightGray).rect(30, rowY - 3, doc.page.width - 60, 16).fill();
        }
        doc.fillColor(colors.darkGray);
        doc.text(`#${req.id}`, 40, rowY);
        doc.text(req.title.substring(0, 30), 65, rowY);
        doc.fillColor(getPriorityColor(req.priority)).font('Helvetica-Bold');
        doc.text(req.priority || 'N/A', 200, rowY);
        doc.fillColor(getStatusColor(req.status)).font('Helvetica-Bold');
        doc.text(req.status || 'N/A', 270, rowY);
        doc.fillColor(colors.gray).font('Helvetica');
        doc.text(formatDate(req.createdAt), 320, rowY);
        doc.moveDown(1);
      });
      doc.moveDown(0.5);
    }

    // Órdenes de Compra
    if (payload.orders && payload.orders.length > 0) {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }
      doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.darkGray);
      doc.text('ÓRDENES DE COMPRA');
      doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).stroke(colors.border);
      doc.moveDown(0.3);

      const ocTableTop = doc.y;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
      doc.fillColor(colors.primary).rect(30, ocTableTop, doc.page.width - 60, 18).fill();
      doc.fillColor('#fff');
      doc.text('ID', 40, ocTableTop + 4);
      doc.text('Proveedor', 65, ocTableTop + 4);
      doc.text('Fecha OC', 200, ocTableTop + 4);
      doc.text('Monto', 280, ocTableTop + 4);
      doc.text('Estatus', 340, ocTableTop + 4);

      doc.font('Helvetica').fontSize(8).fillColor(colors.darkGray);
      doc.moveDown(1.3);

      payload.orders.forEach((order, index) => {
        if (doc.y > doc.page.height - 40) {
          doc.addPage();
        }
        const rowY = doc.y;
        if (index % 2 === 0) {
          doc.fillColor(colors.lightGray).rect(30, rowY - 3, doc.page.width - 60, 16).fill();
        }
        doc.fillColor(colors.darkGray);
        doc.text(`#${order.id}`, 40, rowY);
        doc.text(order.supplierName || 'N/A', 65, rowY, { width: 130 });
        doc.text(formatDate(order.orderDate), 200, rowY);
        doc.font('Helvetica-Bold').fillColor(colors.primary);
        doc.text(formatCurrency(order.totalAmount), 280, rowY);
        doc.fillColor(getStatusColor(order.status)).font('Helvetica-Bold');
        doc.text(order.status || 'N/A', 340, rowY);
        doc.font('Helvetica').fillColor(colors.darkGray);
        doc.moveDown(1);
      });
    }

    // Footer
    doc.fontSize(8).fillColor(colors.gray);
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.text(`Página ${i + 1} de ${pageCount}`, 30, doc.page.height - 30, { align: 'center' });
      doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 30, doc.page.height - 18, { align: 'center' });
    }

    doc.end();
  });
};
