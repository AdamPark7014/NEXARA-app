import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export type ServiceSheetPayload = {
  anNumber: string;
  clientName?: string | null;
  clientLogoUrl?: string | null;
  branchName?: string | null;
  branchNumber?: string | null;
  branchCity?: string | null;
  branchState?: string | null;
  branchAddress?: string | null;
  ticketType?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  managerName?: string | null;
  managerRole?: string | null;
  workSummary?: string | null;
  equipmentList?: Array<{ name?: string; model?: string; serial?: string; action?: string }>;
  observations?: string | null;
  signedName?: string | null;
  survey?: {
    engineerIdentified?: boolean | null;
    friendlyAttention?: boolean | null;
    solutionSatisfied?: boolean | null;
    notes?: string | null;
  } | null;
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

export const generateServiceSheetPdf = async (payload: ServiceSheetPayload): Promise<Buffer> => {
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

      doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(20).text('Hoja de Servicio', titleX, 30, {
        width: Math.max(140, titleWidth),
      });
      doc.fontSize(10).font('Helvetica').fillColor(colors.muted).text('Mantenimiento preventivo/correctivo', titleX, 56, {
        width: Math.max(140, titleWidth),
      });

      doc.fillColor(colors.text).fontSize(9);
      doc.text(`Ticket: ${payload.anNumber}`, infoX, 28, { width: infoWidth, align: 'right' });
      doc.text(`Cliente: ${payload.clientName || '-'}`, infoX, 42, { width: infoWidth, align: 'right' });
      doc.text(`Tipo: ${payload.ticketType || '-'}`, infoX, 56, { width: infoWidth, align: 'right' });
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

    drawSectionTitle('Datos de servicio');

    const infoY = doc.y;
    const leftWidth = (contentWidth - 20) * 0.55;
    const rightWidth = contentWidth - leftWidth - 20;

    const serviceLines = [
      { label: 'Sucursal', value: payload.branchName || '-' },
      { label: 'No. sucursal', value: payload.branchNumber || '-' },
      { label: 'Ciudad/Estado', value: [payload.branchCity, payload.branchState].filter(Boolean).join(', ') || '-' },
      { label: 'Dirección', value: payload.branchAddress || '-' },
    ];

    const scheduleLines = [
      { label: 'Inicio', value: formatDateTime(payload.startedAt) },
      { label: 'Termino', value: formatDateTime(payload.finishedAt) },
      { label: 'Gerente', value: payload.managerName || '-' },
      { label: 'Cargo', value: payload.managerRole || '-' },
    ];

    const serviceHeight = drawInfoCard(margin, infoY, leftWidth, serviceLines);
    const scheduleHeight = drawInfoCard(margin + leftWidth + 20, infoY, rightWidth, scheduleLines);
    doc.y = infoY + Math.max(serviceHeight, scheduleHeight) + 16;

    drawSectionTitle('Trabajo realizado');
    doc.fillColor(colors.text).fontSize(10).text(payload.workSummary || '-', {
      width: contentWidth,
    });

    drawSectionTitle('Equipos atendidos');
    const equipment = payload.equipmentList || [];
    const columns = [
      { label: '#', width: 24 },
      { label: 'Equipo', width: 150 },
      { label: 'Modelo', width: 110 },
      { label: 'Serie', width: 110 },
      { label: 'Actividad', width: 160 },
    ];
    drawTableHeader(doc.y, columns);
    doc.y += 28;
    if (equipment.length === 0) {
      doc.fillColor(colors.text).fontSize(10).text('Sin equipos registrados.', margin, doc.y);
      doc.moveDown(0.6);
    } else {
      equipment.forEach((item, index) => {
        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        const row = [
          String(index + 1),
          item.name || '-',
          item.model || '-',
          item.serial || '-',
          item.action || '-',
        ];
        const cellPaddingY = 4;
        const heights = row.map((value, colIndex) => doc.heightOfString(value, {
          width: columns[colIndex].width - 6,
          align: 'left',
        }));
        const rowHeight = Math.max(16, ...heights) + cellPaddingY * 2;

        if (index % 2 === 1) {
          doc.save();
          doc.rect(margin, doc.y - 2, contentWidth, rowHeight).fill(colors.softGray).opacity(0.6);
          doc.restore();
        }

        let x = margin + 3;
        row.forEach((value, colIndex) => {
          doc.text(value, x, doc.y + cellPaddingY - 1, { width: columns[colIndex].width - 6, align: 'left' });
          x += columns[colIndex].width;
        });
        doc.y += rowHeight;
      });
    }

    drawSectionTitle('Observaciones');
    doc.fillColor(colors.text).fontSize(10).text(payload.observations || '-', { width: contentWidth });

    drawSectionTitle('Firma digital');
    doc.fillColor(colors.text).fontSize(10).text(`Firmado por: ${payload.signedName || '-'}`);

    drawSectionTitle('Encuesta de calidad');
    const survey = payload.survey || {};
    const yesNo = (value?: boolean | null) => (value === true ? 'Si' : value === false ? 'No' : '-');
    const surveyRows = [
      ['Ingeniero se identifico', yesNo(survey.engineerIdentified)],
      ['Atención fue amable', yesNo(survey.friendlyAttention)],
      ['Satisfecho con la solución', yesNo(survey.solutionSatisfied)],
    ];
    surveyRows.forEach(([label, value]) => {
      doc.fillColor(colors.muted).fontSize(9).text(label, margin, doc.y, { width: 170 });
      doc.fillColor(colors.text).fontSize(10).text(value, margin + 180, doc.y, { width: contentWidth - 180 });
      doc.moveDown(0.3);
    });
    doc.fillColor(colors.muted).fontSize(9).text('Observaciones adicionales', margin, doc.y, { width: 170 });
    doc.fillColor(colors.text).fontSize(10).text(survey.notes || '-', margin + 180, doc.y, { width: contentWidth - 180 });

    doc.end();
  });
};

