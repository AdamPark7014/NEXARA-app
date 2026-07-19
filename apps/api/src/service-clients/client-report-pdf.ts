import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import {
  PDF_COLORS,
  PDF_CONTENT_START_Y,
  PDF_MODULE_ACCENTS,
  type PdfTableContext,
  drawInfoCard,
  drawKpiCards,
  drawNexaraFooter,
  drawNexaraHeader,
  drawSectionTitle,
  drawTableHeader,
  drawTableRow,
  loadNexaraLogo,
  pdfText,
} from '../common/pdf/nexara-pdf-theme';

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
  return hours <= 0 ? `${mins} min` : `${hours} h ${mins} min`;
};

const formatTicketType = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '-';
  if (normalized === 'PREVENTIVE_INVENTORY') return 'Mantenimiento e inventario';
  if (normalized === 'ISSUE') return 'Ticket por problema';
  return value || '-';
};

const loadImage = (filePath: string) => {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  } catch {
    return null;
  }
};

const resolveExistingUpload = (relativeUploadPath: string) => {
  const cleaned = relativeUploadPath.replace(/^\/+/, '');
  const candidates = [
    path.resolve(process.cwd(), 'uploads', cleaned),
    path.resolve(process.cwd(), 'apps', 'api', 'uploads', cleaned),
    path.resolve(process.cwd(), '..', 'uploads', cleaned),
    path.resolve(process.cwd(), '..', '..', 'uploads', cleaned),
    path.resolve(process.cwd(), '..', '..', '..', 'uploads', cleaned),
    path.resolve(__dirname, '..', '..', 'uploads', cleaned),
    path.resolve(__dirname, '..', '..', '..', 'uploads', cleaned),
    path.resolve(__dirname, '..', '..', '..', '..', 'uploads', cleaned),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Continue checking remaining candidate paths.
    }
  }
  return null;
};

const resolveUploadPath = (fileUrl?: string | null) => {
  if (!fileUrl) return null;
  const raw = fileUrl.trim().replace(/\\+/g, '/').replace(/[?#].*$/, '');
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return resolveExistingUpload(raw.replace(/^\/uploads\//, ''));
  if (raw.startsWith('/api/uploads/')) return resolveExistingUpload(raw.replace(/^\/api\/uploads\//, ''));
  if (raw.startsWith('/activities/')) return resolveExistingUpload(raw.replace(/^\//, ''));
  if (raw.startsWith('activities/')) return resolveExistingUpload(raw);
  if (/^https?:\/\//i.test(raw)) {
    try {
      const pathname = new URL(raw).pathname;
      if (pathname.startsWith('/uploads/')) return resolveExistingUpload(pathname.replace(/^\/uploads\//, ''));
      if (pathname.startsWith('/activities/')) return resolveExistingUpload(pathname.replace(/^\//, ''));
    } catch {
      return null;
    }
  }
  return null;
};

const getMapsUrl = (lat?: number | null, lng?: number | null) =>
  lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;

export const generateClientReportPdf = async (payload: ClientReportPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const accent = PDF_MODULE_ACCENTS.maintenance;
    const logo = loadNexaraLogo();
    const clientLogoPath = resolveUploadPath(payload.clientLogoUrl);
    const clientLogo = clientLogoPath ? loadImage(clientLogoPath) : null;

    const drawHeader = () => {
      drawNexaraHeader(doc, {
        docTitle: 'Reporte de tickets',
        docSubtitle: 'Resumen ejecutivo de atención',
        accent,
        logo,
        meta: [
          { label: 'Cliente', value: payload.clientName },
          { label: 'Generado', value: formatDateTime(payload.generatedAt) },
          { label: 'Total', value: String(payload.totalTickets) },
          { label: 'Finalizados', value: String(payload.closedTickets) },
        ],
      });
      drawNexaraFooter(doc);
      doc.y = PDF_CONTENT_START_Y;
    };

    const addPage = (section?: string) => {
      doc.addPage();
      drawHeader();
      if (section) drawSectionTitle(doc, section);
    };

    const ensurePageSpace = (height: number, section?: string) => {
      if (doc.y + height > doc.page.height - 60) addPage(section);
    };

    drawHeader();
    drawSectionTitle(doc, 'Resumen');
    const summaryY = doc.y;
    if (clientLogo) {
      try {
        doc.image(clientLogo, margin, summaryY, { fit: [86, 46] });
        doc.y = summaryY + 52;
      } catch {
        // Keep rendering when a client logo is corrupt.
      }
    }
    const kpiY = doc.y;
    const kpiHeight = drawKpiCards(doc, kpiY, [
      { label: 'Total tickets', value: String(payload.totalTickets), accent },
      { label: 'Finalizados', value: String(payload.closedTickets), accent },
      { label: 'Promedio de atención', value: formatDuration(payload.avgDurationMin), accent },
    ]);
    doc.y = kpiY + kpiHeight + 16;

    drawSectionTitle(doc, 'Detalle de tickets');
    const header = ['AN', 'Sucursal', 'Estatus', 'Prioridad', 'Eficiencia', 'Atendió', 'Inicio', 'Cierre', 'Dur.'];
    const baseWidths = [44, 92, 56, 56, 56, 78, 64, 64, 50];
    const totalBaseWidth = baseWidths.reduce((acc, value) => acc + value, 0);
    const scale = contentWidth / totalBaseWidth;
    const widths = baseWidths.map((value) => Math.max(40, Math.floor(value * scale)));
    widths[widths.length - 1] += contentWidth - widths.reduce((acc, value) => acc + value, 0);
    const columns = header.map((label, index) => ({ label, width: widths[index] }));
    const tableCtx: PdfTableContext = {
      columns,
      fontSize: 7.5,
      headerAccent: PDF_COLORS.navy,
      onNewPage: () => {
        drawHeader();
      },
    };
    drawTableHeader(doc, doc.y, columns, tableCtx.headerAccent);
    doc.y += 28;
    payload.activities.forEach((activity, index) => {
      drawTableRow(doc, [
        activity.anNumber || '-',
        activity.branchName || '-',
        activity.estatus || '-',
        activity.prioridad || '-',
        activity.eficiencia || '-',
        activity.responsableName || '-',
        formatDateTime(activity.startedAt || activity.assignedAt),
        formatDateTime(activity.finishedAt),
        formatDuration(activity.durationMin),
      ], index, tableCtx, { boldColumns: [0] });
    });

    ensurePageSpace(120, 'Detalle completo por ticket');
    drawSectionTitle(doc, 'Detalle completo por ticket');
    payload.activities.forEach((activity) => {
      ensurePageSpace(130, 'Detalle completo por ticket');
      const height = drawInfoCard(doc, margin, doc.y, contentWidth, [
        { label: 'Ticket', value: `${activity.anNumber || '-'} · ${activity.titulo || 'Sin titulo'}` },
        { label: 'Flujo', value: formatTicketType(activity.ticketType) },
        { label: 'Estado', value: `${activity.estatus || '-'} · Prioridad: ${activity.prioridad || '-'}` },
        {
          label: 'Sucursal',
          value: `${activity.branchName || '-'}${activity.branchCity ? ` · ${activity.branchCity}` : ''}${activity.branchState ? `, ${activity.branchState}` : ''}`,
        },
        {
          label: 'Atendió',
          value: `${activity.responsableName || '-'} · Inicio: ${formatDateTime(activity.startedAt || activity.assignedAt)} · Cierre: ${formatDateTime(activity.finishedAt)}`,
        },
        { label: 'Resultado', value: `Duración: ${formatDuration(activity.durationMin)} · Eficiencia: ${activity.eficiencia || '-'}` },
      ], { title: activity.anNumber || 'Ticket', labelWidth: 68 });
      doc.y += height + 10;
    });

    ensurePageSpace(160, 'Evidencias por ticket');
    drawSectionTitle(doc, 'Evidencias por ticket');
    const tileWidth = 160;
    const tileHeight = 120;
    const tileGap = 10;
    const captionHeight = 26;
    const tileColumns = Math.max(1, Math.floor((contentWidth + tileGap) / (tileWidth + tileGap)));

    payload.activities.forEach((activity) => {
      const evidences = activity.evidences || [];
      if (!evidences.length) return;
      ensurePageSpace(160, 'Evidencias por ticket');
      doc.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(10)
        .text(`${activity.anNumber} · ${activity.titulo || ''}`, margin, doc.y, { width: contentWidth });
      doc.moveDown(0.3);
      let x = margin;
      let y = doc.y;
      let col = 0;

      evidences.forEach((evidence) => {
        if (y + tileHeight + captionHeight > doc.page.height - 60) {
          addPage('Evidencias por ticket');
          doc.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(10)
            .text(`${activity.anNumber} · ${activity.titulo || ''}`, margin, doc.y, { width: contentWidth });
          doc.moveDown(0.3);
          x = margin;
          y = doc.y;
          col = 0;
        }
        const evidencePath = resolveUploadPath(evidence.archivoUrl);
        const isPdf = evidence.archivoUrl.toLowerCase().endsWith('.pdf');
        if (evidencePath && !isPdf) {
          try {
            doc.image(evidencePath, x, y, { fit: [tileWidth, tileHeight], align: 'center', valign: 'center' });
            doc.rect(x, y, tileWidth, tileHeight).stroke(PDF_COLORS.line);
          } catch {
            doc.rect(x, y, tileWidth, tileHeight).stroke(PDF_COLORS.muted);
            doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(8)
              .text('No se pudo cargar', x + 6, y + 54, { width: tileWidth - 12, align: 'center' });
          }
        } else {
          doc.rect(x, y, tileWidth, tileHeight).fill(PDF_COLORS.softGray);
          doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(8)
            .text(isPdf ? 'PDF adjunto' : 'Sin evidencia', x + 6, y + 54, {
              width: tileWidth - 12,
              align: 'center',
            });
        }
        doc.fillColor(PDF_COLORS.text).font('Helvetica').fontSize(7)
          .text(pdfText(evidence.tipoEvidencia), x, y + tileHeight + 4, { width: tileWidth });
        const mapsUrl = evidence.tipoEvidencia === 'Foto llegada'
          ? getMapsUrl(evidence.latitud, evidence.longitud)
          : null;
        if (mapsUrl) {
          doc.fillColor(accent).font('Helvetica').fontSize(7).text('Ver llegada', x, y + tileHeight + 14, {
            width: tileWidth,
            link: mapsUrl,
            underline: true,
          });
        }
        col += 1;
        if (col >= tileColumns) {
          col = 0;
          x = margin;
          y += tileHeight + captionHeight;
        } else {
          x += tileWidth + tileGap;
        }
      });
      if (col > 0) y += tileHeight + captionHeight;
      doc.y = y + 8;
    });

    doc.end();
  });
};
