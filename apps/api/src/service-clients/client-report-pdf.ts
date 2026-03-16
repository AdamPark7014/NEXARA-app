import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export type ClientReportActivity = {
  anNumber: string;
  titulo?: string | null;
  estatus?: string | null;
  prioridad?: string | null;
  eficiencia?: string | null;
  ticketType?: string | null;
  branchName?: string | null;
  branchCity?: string | null;
  branchState?: string | null;
  assignedAt?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  durationMin?: number | null;
  responsableName?: string | null;
  evidences?: Array<{ archivoUrl: string; tipoEvidencia: string; latitud?: number | null; longitud?: number | null }>;
};

export type ClientReportPayload = {
  clientName: string;
  clientLogoUrl?: string | null;
  generatedAt: Date;
  totalTickets: number;
  closedTickets: number;
  avgDurationMin?: number | null;
  activities: ClientReportActivity[];
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

const formatDuration = (minutes?: number | null) => {
  if (!minutes || Number.isNaN(minutes)) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
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

const resolveLogoPath = (logoUrl?: string | null) => {
  if (!logoUrl) return null;
  if (logoUrl.startsWith('/uploads/')) {
    return path.resolve(process.cwd(), `.${logoUrl}`);
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

export const generateClientReportPdf = async (payload: ClientReportPayload): Promise<Buffer> => {
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
    const clientLogoPath = resolveLogoPath(payload.clientLogoUrl);
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

      doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(20).text('Reporte de Tickets', titleX, 30, {
        width: Math.max(140, titleWidth),
      });
      doc.fontSize(10).font('Helvetica').fillColor(colors.muted).text('Resumen ejecutivo de atención', titleX, 56, {
        width: Math.max(140, titleWidth),
      });

      doc.fillColor(colors.text).fontSize(9);
      doc.text(`Cliente: ${payload.clientName}`, infoX, 28, { width: infoWidth, align: 'right' });
      doc.text(`Generado: ${formatDateTime(payload.generatedAt)}`, infoX, 42, { width: infoWidth, align: 'right' });
      doc.text(`Total: ${payload.totalTickets}`, infoX, 56, { width: infoWidth, align: 'right' });
      doc.text(`Finalizados: ${payload.closedTickets}`, infoX, 70, { width: infoWidth, align: 'right' });
    };

    const drawSectionTitle = (label: string) => {
      doc.moveDown(0.6);
      doc.fillColor(colors.navy).fontSize(12).font('Helvetica-Bold').text(label, margin, doc.y);
      doc.moveDown(0.2);
    };

    const drawSummaryCard = (x: number, y: number, width: number) => {
      const padding = 12;
      const rows = [
        ['Total tickets', String(payload.totalTickets)],
        ['Finalizados', String(payload.closedTickets)],
        ['Promedio de atención', formatDuration(payload.avgDurationMin)],
      ];

      const height = padding * 2 + rows.length * 18;
      doc.save();
      doc.roundedRect(x, y, width, height, 8).fill(colors.softGray);
      doc.restore();

      let cursorY = y + padding;
      rows.forEach(([label, value]) => {
        doc.fillColor(colors.muted).fontSize(9).text(label, x + padding, cursorY, { width: width - padding * 2 });
        doc.fillColor(colors.text).fontSize(11).font('Helvetica-Bold').text(value, x + padding, cursorY, {
          align: 'right',
          width: width - padding * 2,
        });
        cursorY += 18;
      });
      return height;
    };

    const drawTableHeader = (y: number, columns: Array<{ label: string; width: number }>) => {
      doc.save();
      doc.rect(margin, y, contentWidth, 24).fill(colors.navy);
      doc.restore();
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      let x = margin + 6;
      columns.forEach((col) => {
        doc.text(col.label, x, y + 7, { width: col.width - 8 });
        x += col.width;
      });
    };

    drawHeader();
    doc.y = 140;

    drawSectionTitle('Resumen');
    const summaryHeight = drawSummaryCard(margin, doc.y, contentWidth);
    doc.y += summaryHeight + 16;

    drawSectionTitle('Detalle de tickets');

    const header = ['AN', 'Sucursal', 'Estatus', 'Prioridad', 'Eficiencia', 'Atendió', 'Inicio', 'Cierre', 'Dur.'];
    const baseWidths = [44, 92, 56, 56, 56, 78, 64, 64, 50];
    const totalBaseWidth = baseWidths.reduce((acc, value) => acc + value, 0);
    const scale = contentWidth / totalBaseWidth;
    const colWidths = baseWidths.map((value) => Math.max(40, Math.floor(value * scale)));
    const widthDiff = contentWidth - colWidths.reduce((acc, value) => acc + value, 0);
    colWidths[colWidths.length - 1] += widthDiff;
    const columns = header.map((label, index) => ({ label, width: colWidths[index] }));

    const drawRow = (row: string[], rowIndex: number) => {
      const rowY = doc.y;
      const cellPadding = 4;
      doc.font('Helvetica').fontSize(8).fillColor(colors.text);
      const heights = row.map((value, index) => doc.heightOfString(value, {
        width: colWidths[index] - cellPadding * 2,
        align: 'left',
      }));
      const rowHeight = Math.max(20, ...heights) + cellPadding * 2;

      if (rowIndex % 2 === 1) {
        doc.save();
        doc.rect(margin, rowY, contentWidth, rowHeight).fill(colors.softGray).opacity(0.5);
        doc.restore();
      }

      let x = margin;
      row.forEach((value, index) => {
        doc.save();
        doc.rect(x, rowY, colWidths[index], rowHeight).stroke(colors.line);
        doc.restore();
        doc.text(value, x + cellPadding, rowY + cellPadding - 1, {
          width: colWidths[index] - cellPadding * 2,
          align: 'left',
        });
        x += colWidths[index];
      });
      doc.y = rowY + rowHeight;
    };

    const headerY = doc.y;
    drawTableHeader(headerY, columns);
    doc.save();
    doc.rect(margin, headerY, contentWidth, 24).stroke(colors.line);
    let gridX = margin;
    columns.forEach((col) => {
      doc.rect(gridX, headerY, col.width, 24).stroke(colors.line);
      gridX += col.width;
    });
    doc.restore();
    doc.y = headerY + 26;

    payload.activities.forEach((activity, index) => {
      drawRow([
        activity.anNumber || '-',
        activity.branchName || '-',
        activity.estatus || '-',
        activity.prioridad || '-',
        activity.eficiencia || '-',
        activity.responsableName || '-',
        formatDateTime(activity.startedAt || activity.assignedAt || null),
        formatDateTime(activity.finishedAt || null),
        formatDuration(activity.durationMin),
      ], index);

      if (doc.y > doc.page.height - 120) {
        doc.addPage();
        drawHeader();
        doc.y = 140;
        drawSectionTitle('Detalle de tickets');
        const repeatHeaderY = doc.y;
        drawTableHeader(repeatHeaderY, columns);
        doc.save();
        doc.rect(margin, repeatHeaderY, contentWidth, 24).stroke(colors.line);
        let headerX = margin;
        columns.forEach((col) => {
          doc.rect(headerX, repeatHeaderY, col.width, 24).stroke(colors.line);
          headerX += col.width;
        });
        doc.restore();
        doc.y = repeatHeaderY + 26;
      }
    });

    drawSectionTitle('Evidencias por ticket');
    const thumbSize = 96;
    payload.activities.forEach((activity) => {
      const evidences = activity.evidences || [];
      if (!evidences.length) return;

      if (doc.y > doc.page.height - 140) {
        doc.addPage();
        drawHeader();
        doc.y = 140;
        drawSectionTitle('Evidencias por ticket');
      }

      doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(10).text(`${activity.anNumber} · ${activity.titulo || ''}`, margin, doc.y, {
        width: contentWidth,
      });
      doc.moveDown(0.3);

      let x = margin;
      let y = doc.y;
      evidences.forEach((evidence) => {
        if (y + thumbSize + 24 > doc.page.height - 60) {
          doc.addPage();
          drawHeader();
          doc.y = 140;
          drawSectionTitle('Evidencias por ticket');
          x = margin;
          y = doc.y;
        }

        const evidencePath = resolveUploadPath(evidence.archivoUrl);
        const isPdf = evidence.archivoUrl.toLowerCase().endsWith('.pdf');

        if (evidencePath && !isPdf) {
          try {
            doc.image(evidencePath, x, y, { width: thumbSize, height: thumbSize, fit: [thumbSize, thumbSize] });
          } catch {
            doc.rect(x, y, thumbSize, thumbSize).stroke(colors.muted);
            doc.fontSize(8).fillColor(colors.muted).text('No se pudo cargar', x + 6, y + 40, { width: thumbSize - 12, align: 'center' });
          }
        } else {
          doc.rect(x, y, thumbSize, thumbSize).fill(colors.softGray);
          doc.fillColor(colors.muted).fontSize(8).text(isPdf ? 'PDF adjunto' : 'Sin evidencia', x + 6, y + 40, { width: thumbSize - 12, align: 'center' });
        }

        doc.fillColor(colors.text).fontSize(7).text(evidence.tipoEvidencia, x, y + thumbSize + 4, { width: thumbSize });

        const mapsUrl = evidence.tipoEvidencia === 'Foto llegada'
          ? getMapsUrl(evidence.latitud, evidence.longitud)
          : null;
        if (mapsUrl) {
          doc.fillColor(colors.blue).fontSize(7).text('Ver llegada', x, y + thumbSize + 14, {
            width: thumbSize,
            link: mapsUrl,
            underline: true,
          });
        }

        x += thumbSize + 10;
        if (x + thumbSize > margin + contentWidth) {
          x = margin;
          y += thumbSize + (mapsUrl ? 34 : 22);
        }
      });

      doc.y = y + thumbSize + 26;
    });

    doc.end();
  });
};

