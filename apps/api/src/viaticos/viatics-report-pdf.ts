import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

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

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);

const loadLogo = () => {
  const candidates = [
    path.resolve(process.cwd(), '../web/public/logo-nexara.png'),
    path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'),
    path.resolve(process.cwd(), 'apps/web/public/logo-nexara.png'),
    path.resolve(process.cwd(), 'src/assets/logo-nexara.png'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
    } catch {
      /* next */
    }
  }
  return null;
};

export function generateViaticsReportPdf(payload: ViaticsReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const logo = loadLogo();
    if (logo) {
      try {
        doc.image(logo, 48, 40, { width: 110 });
      } catch {
        /* skip */
      }
    }

    doc
      .fontSize(16)
      .fillColor('#0f1c2e')
      .text(payload.title, 48, logo ? 56 : 48, { align: 'right' });
    doc
      .fontSize(10)
      .fillColor('#667085')
      .text(payload.periodLabel, { align: 'right' })
      .text(`Generado: ${payload.generatedAt}`, { align: 'right' });
    if (payload.preparedBy) {
      doc.text(`Preparado por: ${payload.preparedBy}`, { align: 'right' });
    }

    doc.moveDown(2);
    doc
      .moveTo(48, doc.y)
      .lineTo(564, doc.y)
      .strokeColor('#e6ebf0')
      .stroke();
    doc.moveDown(1);

    const kpiY = doc.y;
    const box = (x: number, label: string, value: string) => {
      doc.roundedRect(x, kpiY, 160, 52, 6).fillAndStroke('#f4f6f8', '#e6ebf0');
      doc.fillColor('#667085').fontSize(8).text(label, x + 10, kpiY + 10, { width: 140 });
      doc.fillColor('#0f1c2e').fontSize(12).text(value, x + 10, kpiY + 26, { width: 140 });
    };
    box(48, 'Total solicitado', formatMoney(payload.totalSolicitado, payload.currency));
    box(220, 'Aprobado', formatMoney(payload.totalAprobado, payload.currency));
    box(392, 'Pagado', formatMoney(payload.totalPagado, payload.currency));
    doc.y = kpiY + 68;

    const section = (title: string, items: { name: string; total: number; count: number }[]) => {
      doc.fillColor('#0f1c2e').fontSize(11).text(title);
      doc.moveDown(0.4);
      if (!items.length) {
        doc.fillColor('#98a2b3').fontSize(9).text('Sin datos en el periodo.');
        doc.moveDown(0.8);
        return;
      }
      for (const item of items.slice(0, 8)) {
        doc
          .fillColor('#344054')
          .fontSize(9)
          .text(
            `${item.name}  ·  ${item.count} reg.  ·  ${formatMoney(item.total, payload.currency)}`,
            { width: 500 },
          );
      }
      doc.moveDown(0.9);
    };

    section('Gasto por proyecto', payload.byProject);
    section('Gasto por persona', payload.byPerson);
    section('Gasto por categoría', payload.byCategory);

    doc.fillColor('#0f1c2e').fontSize(11).text('Detalle de solicitudes');
    doc.moveDown(0.5);

    const headerY = doc.y;
    doc.fillColor('#667085').fontSize(8);
    doc.text('ID', 48, headerY, { width: 28 });
    doc.text('Fecha', 78, headerY, { width: 58 });
    doc.text('Solicitante', 138, headerY, { width: 90 });
    doc.text('Proyecto', 230, headerY, { width: 90 });
    doc.text('Cat.', 322, headerY, { width: 60 });
    doc.text('Monto', 384, headerY, { width: 70 });
    doc.text('Estatus', 456, headerY, { width: 60 });
    doc.y = headerY + 14;
    doc.moveTo(48, doc.y).lineTo(564, doc.y).strokeColor('#e6ebf0').stroke();
    doc.moveDown(0.3);

    for (const row of payload.rows.slice(0, 40)) {
      if (doc.y > 720) {
        doc.addPage();
      }
      const y = doc.y;
      doc.fillColor('#0f1c2e').fontSize(8);
      doc.text(String(row.id), 48, y, { width: 28 });
      doc.text(row.fecha, 78, y, { width: 58 });
      doc.text(row.solicitante.slice(0, 22), 138, y, { width: 90 });
      doc.text(row.proyecto.slice(0, 22), 230, y, { width: 90 });
      doc.text(row.categoria.slice(0, 12), 322, y, { width: 60 });
      doc.text(formatMoney(row.monto, payload.currency), 384, y, { width: 70 });
      doc.text(row.estatus.slice(0, 12), 456, y, { width: 60 });
      doc.y = y + 14;
    }

    doc
      .fontSize(8)
      .fillColor('#98a2b3')
      .text(
        'NEXARA · Control de viáticos — documento generado automáticamente.',
        48,
        740,
        { align: 'center', width: 516 },
      );

    doc.end();
  });
}
