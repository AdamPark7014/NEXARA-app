import PDFDocument from 'pdfkit';

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

const fmtMxn = (n: number) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

export async function generateContractPdf(payload: ContractPdfPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).fillColor('#0ea5e9').text(payload.companyName || 'NEXARA Tech', { align: 'right' });
      doc.fontSize(9).fillColor('#6b7280').text(`RFC: ${payload.companyRfc || ''}`, { align: 'right' });
      doc.moveDown(2);

      doc.fontSize(16).fillColor('#000').text('CONTRATO DE MANTENIMIENTO', { align: 'center' });
      doc.fontSize(10).fillColor('#6b7280').text(`No. ${payload.contractNumber}`, { align: 'center' });
      doc.moveDown(1);

      // Cliente
      doc.fontSize(11).fillColor('#000').text('CLIENTE', { underline: true });
      doc.fontSize(10).fillColor('#374151');
      doc.text(`Nombre: ${payload.clientName || '—'}`);
      if (payload.clientRfc) doc.text(`RFC: ${payload.clientRfc}`);
      if (payload.clientAddress) doc.text(`Domicilio: ${payload.clientAddress}`);
      doc.moveDown(0.5);

      // Objeto
      doc.fontSize(11).fillColor('#000').text('OBJETO DEL CONTRATO', { underline: true });
      doc.fontSize(10).fillColor('#374151').text(payload.title);
      if (payload.scope) {
        doc.moveDown(0.3);
        doc.text(`Alcance: ${payload.scope}`, { width: 500 });
      }
      doc.moveDown(0.5);

      // Vigencia
      doc.fontSize(11).fillColor('#000').text('VIGENCIA Y FRECUENCIA', { underline: true });
      doc.fontSize(10).fillColor('#374151');
      doc.text(`Inicio: ${fmtDate(payload.startDate)}`);
      doc.text(`Fin: ${fmtDate(payload.endDate)}`);
      doc.text(`Frecuencia de visitas: ${payload.frequencyMonths ? `Cada ${payload.frequencyMonths} mes(es)` : 'A demanda'}`);
      doc.moveDown(0.5);

      // SLA
      if (payload.slaResponseHours || payload.slaResolutionHours) {
        doc.fontSize(11).fillColor('#000').text('NIVELES DE SERVICIO (SLA)', { underline: true });
        doc.fontSize(10).fillColor('#374151');
        if (payload.slaResponseHours) doc.text(`Tiempo de respuesta: ${payload.slaResponseHours} h`);
        if (payload.slaResolutionHours) doc.text(`Tiempo de resolución: ${payload.slaResolutionHours} h`);
        doc.moveDown(0.5);
      }

      // Monto
      doc.fontSize(11).fillColor('#000').text('CONTRAPRESTACIÓN', { underline: true });
      doc.fontSize(10).fillColor('#374151');
      doc.text(`Monto mensual: ${fmtMxn(payload.monthlyAmount)}`);
      doc.text(`Estatus: ${payload.status}`);
      doc.moveDown(0.5);

      // Visitas programadas
      if (payload.visits && payload.visits.length > 0) {
        doc.fontSize(11).fillColor('#000').text('CALENDARIO DE VISITAS', { underline: true });
        doc.fontSize(9).fillColor('#374151');
        payload.visits.slice(0, 12).forEach((v, idx) => {
          doc.text(`${idx + 1}. ${fmtDate(v.scheduledDate)} — ${v.description || 'Visita preventiva'} [${v.status}]`);
        });
        doc.moveDown(0.5);
      }

      // Firmas
      doc.moveDown(2);
      const sigY = doc.y;
      doc.fontSize(10).fillColor('#000');
      doc.text('______________________________', 70, sigY);
      doc.text('Cliente', 70, sigY + 14, { width: 200, align: 'center' });
      doc.text('______________________________', 330, sigY);
      doc.text(payload.companyName || 'NEXARA Tech', 330, sigY + 14, { width: 200, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
