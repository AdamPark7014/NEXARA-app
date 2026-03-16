import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export type TicketEvidence = {
  archivoUrl: string;
  tipoEvidencia: string;
  latitud?: number | null;
  longitud?: number | null;
};

export type TicketReportPayload = {
  anNumber: string;
  titulo?: string | null;
  estatus?: string | null;
  clientName?: string | null;
  clientLogoUrl?: string | null;
  branchName?: string | null;
  branchNumber?: string | null;
  branchCity?: string | null;
  branchState?: string | null;
  branchAddress?: string | null;
  ticketType?: string | null;
  prioridad?: string | null;
  dueAt?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  responsableName?: string | null;
  managerName?: string | null;
  workSummary?: string | null;
  observations?: string | null;
  evidences: TicketEvidence[];
};

const formatDateTime = (value?: Date | null) => {
  if (!value) return '-';
  return value.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (start?: Date | null, end?: Date | null) => {
  if (!start || !end) return '-';
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins} min`;
  return `${hours} h ${mins} min`;
};

const loadLogo = (relativePath: string) => {
  try {
    if (fs.existsSync(relativePath)) {
      return fs.readFileSync(relativePath);
    }
  } catch {
    return null;
  }
  return null;
};

const resolveUploadPath = (fileUrl?: string | null) => {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('/uploads/')) {
    return path.resolve(process.cwd(), `.${fileUrl}`);
  }
  return null;
};

const getMapsUrl = (lat?: number | null, lng?: number | null) => {
  if (!lat || !lng) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
};

export const generateTicketReportPdf = async (payload: TicketReportPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error) => reject(error));

    const colors = {
      navy: '#0B1F3A',
      blue: '#1F6BBA',
      lightBlue: '#E3F2FD',
      softGray: '#F5F7FB',
      text: '#1F2A37',
      muted: '#5B6B7A',
      line: '#D9E2EC',
    };

    const margin = doc.page.margins.left;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - margin * 2;

    const nexaraLogo = loadLogo(path.resolve(process.cwd(), '../web/public/logo-nexara.png'))
      || loadLogo(path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'));
    const clientLogoPath = resolveUploadPath(payload.clientLogoUrl);
    const clientLogo = clientLogoPath ? loadLogo(clientLogoPath) : null;

    const drawHeader = () => {
      doc.save();
      doc.rect(0, 0, pageWidth, 120).fill(colors.lightBlue);
      doc.rect(0, 0, pageWidth, 6).fill(colors.blue);
      doc.restore();

      const logoBox = { x: margin, y: 22, w: 120, h: 64 };
      if (nexaraLogo) {
        doc.image(nexaraLogo, logoBox.x, logoBox.y, { fit: [logoBox.w, logoBox.h] });
      }

      const clientBox = { x: pageWidth - margin - 90, y: 22, w: 90, h: 64 };
      if (clientLogo) {
        doc.image(clientLogo, clientBox.x, clientBox.y, { fit: [clientBox.w, clientBox.h] });
      }

      const infoWidth = 180;
      const infoX = pageWidth - margin - infoWidth;
      const titleX = margin + logoBox.w + 12;
      const titleWidth = infoX - titleX - 12;

      doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(20).text('Reporte de Ticket', titleX, 30, {
        width: Math.max(140, titleWidth),
      });
      doc.fontSize(10).font('Helvetica').fillColor(colors.muted).text('Mantenimiento preventivo/correctivo', titleX, 56, {
        width: Math.max(140, titleWidth),
      });

      doc.fillColor(colors.text).fontSize(9);
      doc.text(`Ticket: ${payload.anNumber}`, infoX, 28, { width: infoWidth, align: 'right' });
      doc.text(`Cliente: ${payload.clientName || '-'}`, infoX, 42, { width: infoWidth, align: 'right' });
      doc.text(`Tipo: ${payload.ticketType || '-'}`, infoX, 56, { width: infoWidth, align: 'right' });
      doc.text(`Prioridad: ${payload.prioridad || '-'}`, infoX, 70, { width: infoWidth, align: 'right' });
    };

    const drawSectionTitle = (label: string) => {
      doc.moveDown(0.6);
      doc.fillColor(colors.navy).fontSize(12).font('Helvetica-Bold').text(label, margin, doc.y);
      doc.moveDown(0.2);
    };

    const drawInfoCard = (
      x: number,
      y: number,
      width: number,
      lines: Array<{ label: string; value: string }>,
    ) => {
      const padding = 10;
      const labelWidth = 80;
      const valueWidth = width - padding * 2 - labelWidth - 2;
      const rowGap = 6;
      const rowHeights = lines.map((line) => {
        const valueHeight = doc.heightOfString(line.value || '-', { width: valueWidth });
        return Math.max(14, valueHeight);
      });
      const contentHeight = rowHeights.reduce((acc, h) => acc + h, 0) + rowGap * (lines.length - 1);
      const height = padding * 2 + contentHeight;
      doc.save();
      doc.roundedRect(x, y, width, height, 8).fill(colors.softGray);
      doc.restore();

      let cursorY = y + padding;
      lines.forEach((line, index) => {
        const rowHeight = rowHeights[index];
        doc.fillColor(colors.muted).fontSize(9).font('Helvetica').text(line.label, x + padding, cursorY, {
          width: labelWidth,
        });
        doc.fillColor(colors.text).fontSize(10).font('Helvetica').text(line.value || '-', x + padding + labelWidth + 2, cursorY, {
          width: valueWidth,
        });
        cursorY += rowHeight + rowGap;
      });
      return height;
    };

    drawHeader();
    doc.y = 140;

    drawSectionTitle('Datos de la sucursal');

    const infoY = doc.y;
    const leftWidth = (contentWidth - 20) * 0.55;
    const rightWidth = contentWidth - leftWidth - 20;

    const branchLines = [
      { label: 'Sucursal', value: payload.branchName || '-' },
      { label: 'No. sucursal', value: payload.branchNumber || '-' },
      { label: 'Ciudad/Estado', value: [payload.branchCity, payload.branchState].filter(Boolean).join(', ') || '-' },
      { label: 'Dirección', value: payload.branchAddress || '-' },
    ];

    const operationLines = [
      { label: 'Inicio', value: formatDateTime(payload.startedAt) },
      { label: 'Término', value: formatDateTime(payload.finishedAt) },
      { label: 'Duración', value: formatDuration(payload.startedAt || null, payload.finishedAt || null) },
      { label: 'Atendió', value: payload.responsableName || '-' },
      { label: 'Gerente', value: payload.managerName || '-' },
    ];

    const branchHeight = drawInfoCard(margin, infoY, leftWidth, branchLines);
    const operationHeight = drawInfoCard(margin + leftWidth + 20, infoY, rightWidth, operationLines);
    doc.y = infoY + Math.max(branchHeight, operationHeight) + 16;

    drawSectionTitle('Indicadores');
    const slaStatus = payload.finishedAt && payload.dueAt
      ? (payload.finishedAt.getTime() <= payload.dueAt.getTime() ? 'En tiempo' : 'Fuera de tiempo')
      : payload.dueAt
        ? 'En proceso'
        : '-';
    const indicatorsLines = [
      { label: 'Estatus', value: payload.estatus || '-' },
      { label: 'SLA limite', value: formatDateTime(payload.dueAt) },
      { label: 'Resultado SLA', value: slaStatus },
    ];
    const indicatorsHeight = drawInfoCard(margin, doc.y, contentWidth, indicatorsLines);
    doc.y += indicatorsHeight + 16;

    drawSectionTitle('Resumen operativo');
    doc.fillColor(colors.navy).fontSize(11).font('Helvetica-Bold').text('Trabajo realizado');
    doc.fillColor(colors.text).fontSize(10).font('Helvetica').text(payload.workSummary || '-', { width: contentWidth });

    doc.moveDown();
    doc.fillColor(colors.navy).fontSize(11).font('Helvetica-Bold').text('Observaciones');
    doc.fillColor(colors.text).fontSize(10).font('Helvetica').text(payload.observations || '-', { width: contentWidth });

    drawSectionTitle('Evidencias');

    const evidenceSize = 150;
    let x = margin;
    let y = doc.y + 10;

    payload.evidences.forEach((evidence) => {
      if (y + evidenceSize + 28 > doc.page.height - 60) {
        doc.addPage();
        drawHeader();
        doc.y = 140;
        drawSectionTitle('Evidencias');
        x = margin;
        y = doc.y + 10;
      }

      const evidencePath = resolveUploadPath(evidence.archivoUrl);
      const isPdf = evidence.archivoUrl.toLowerCase().endsWith('.pdf');

      if (evidencePath && !isPdf) {
        try {
          doc.image(evidencePath, x, y, { width: evidenceSize, height: evidenceSize, fit: [evidenceSize, evidenceSize] });
        } catch {
          doc.rect(x, y, evidenceSize, evidenceSize).stroke(colors.muted);
          doc.fontSize(9).fillColor(colors.muted).text('No se pudo cargar', x + 8, y + 60, { width: evidenceSize - 16, align: 'center' });
        }
      } else {
        doc.rect(x, y, evidenceSize, evidenceSize).fill(colors.softGray);
        doc.fillColor(colors.muted).fontSize(9).text(isPdf ? 'PDF adjunto' : 'Sin evidencia', x + 8, y + 60, { width: evidenceSize - 16, align: 'center' });
      }

      doc.fillColor(colors.text).fontSize(8).text(evidence.tipoEvidencia, x, y + evidenceSize + 4, { width: evidenceSize });

      const mapsUrl = evidence.tipoEvidencia === 'Foto llegada'
        ? getMapsUrl(evidence.latitud, evidence.longitud)
        : null;
      if (mapsUrl) {
        doc.fillColor(colors.blue).fontSize(7).text('Ver ubicación de llegada', x, y + evidenceSize + 16, {
          width: evidenceSize,
          link: mapsUrl,
          underline: true,
        });
      }

      x += evidenceSize + 12;
      if (x + evidenceSize > margin + contentWidth) {
        x = margin;
        y += evidenceSize + (mapsUrl ? 40 : 28);
      }
    });

    doc.end();
  });
};


