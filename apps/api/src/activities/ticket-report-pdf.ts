import PDFDocument from 'pdfkit';
import fs from 'fs';
import http from 'http';
import https from 'https';
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
  drawSummaryBox,
  drawTableHeader,
  drawTableRow,
  loadNexaraLogo,
  pdfText,
} from '../common/pdf/nexara-pdf-theme';

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
  workType?: string | null;
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
  technicianName?: string | null;
  serviceDate?: string | null;
  clientCompany?: string | null;
  clientPhone?: string | null;
  managerName?: string | null;
  managerRole?: string | null;
  managerSignature?: string | null;
  materialsUsed?: string | null;
  hoursWorked?: string | null;
  workSummary?: string | null;
  observations?: string | null;
  inventorySnapshot?: {
    status?: string | null;
    previousCount?: number | null;
    currentCount?: number | null;
    deltaCount?: number | null;
    completedAt?: Date | null;
    items?: Array<{
      groupName?: string | null;
      sectionName?: string | null;
      equipmentName?: string | null;
      serialBefore?: string | null;
      serialAfter?: string | null;
      modelBefore?: string | null;
      modelAfter?: string | null;
      itemStatus?: string | null;
      compareState?: string | null;
      maintenanceComments?: string | null;
    }>;
  } | null;
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
  return hours <= 0 ? `${mins} min` : `${hours} h ${mins} min`;
};

const loadImage = (filePath: string) => {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  } catch {
    return null;
  }
};

const resolveUploadPath = (fileUrl?: string | null) => {
  if (!fileUrl) return null;
  const raw = fileUrl.trim().replace(/\\+/g, '/').replace(/[?#].*$/, '');
  if (!raw) return null;

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
        // Continue checking other candidate paths.
      }
    }
    return null;
  };

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

const getStaticMapImageUrls = (lat?: number | null, lng?: number | null) => {
  if (!lat || !lng) return [];
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  if (key) {
    return [
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=600x600&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(key)}`,
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&scale=2&size=600x600&maptype=hybrid&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(key)}`,
    ];
  }
  return [
    `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=600x600&markers=${lat},${lng},red-pushpin`,
    `https://static-maps.yandex.ru/1.x/?ll=${lng},${lat}&size=450,450&z=15&l=map&pt=${lng},${lat},pm2rdm`,
  ];
};

const downloadImageBuffer = (imageUrl: string): Promise<Buffer | null> => new Promise((resolve) => {
  try {
    const parsed = new URL(imageUrl);
    const client = parsed.protocol === 'http:' ? http : https;
    const webBaseUrl = (process.env.PUBLIC_WEB_URL || process.env.WEB_URL || 'http://tickets.localhost:3000').replace(/\/+$/, '');
    const request = client.get(imageUrl, {
      headers: {
        'User-Agent': 'NEXARA Ticket Report PDF',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: `${webBaseUrl}/`,
        Origin: webBaseUrl,
      },
    }, (response) => {
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('error', () => resolve(null));
    request.setTimeout(8000, () => {
      request.destroy();
      resolve(null);
    });
  } catch {
    resolve(null);
  }
});

const fetchImageBuffer = async (urls: string[]) => {
  for (const url of urls) {
    const buffer = await downloadImageBuffer(url);
    if (buffer?.length) return buffer;
  }
  return null;
};

const resolveSignatureImage = (value?: string | null) => {
  if (!value?.trim()) return null;
  const raw = value.trim();
  if (/^data:image\//i.test(raw)) {
    const [, base64] = raw.split(',', 2);
    if (!base64) return null;
    try {
      return Buffer.from(base64, 'base64');
    } catch {
      return null;
    }
  }
  return resolveUploadPath(raw);
};

export const generateTicketReportPdf = async (payload: TicketReportPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const accent = PDF_MODULE_ACCENTS.ops;
    const logo = loadNexaraLogo();
    const clientLogoPath = resolveUploadPath(payload.clientLogoUrl);
    const clientLogo = clientLogoPath ? loadImage(clientLogoPath) : null;
    const flowLabel = payload.workType === 'PREVENTIVE_INVENTORY'
      ? 'Mantenimiento e inventario comparativo'
      : 'Ticket por problema';

    const drawHeader = () => {
      drawNexaraHeader(doc, {
        docTitle: 'Reporte de actividad / OT',
        docSubtitle: flowLabel,
        accent,
        logo,
        meta: [
          { label: 'Ticket', value: payload.anNumber },
          { label: 'Cliente', value: pdfText(payload.clientName) },
          { label: 'Tipo', value: pdfText(payload.ticketType) },
          { label: 'Prioridad', value: pdfText(payload.prioridad) },
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
    drawSectionTitle(doc, 'Datos de la sucursal');
    const infoY = doc.y;
    const leftWidth = (contentWidth - 20) * 0.55;
    const rightWidth = contentWidth - leftWidth - 20;
    const branchHeight = drawInfoCard(doc, margin, infoY, leftWidth, [
      { label: 'Sucursal', value: pdfText(payload.branchName) },
      { label: 'No. sucursal', value: pdfText(payload.branchNumber) },
      { label: 'Ciudad/Estado', value: [payload.branchCity, payload.branchState].filter(Boolean).join(', ') || '-' },
      { label: 'Dirección', value: pdfText(payload.branchAddress) },
    ], { labelWidth: 80 });
    const operationHeight = drawInfoCard(doc, margin + leftWidth + 20, infoY, rightWidth, [
      { label: 'Inicio', value: formatDateTime(payload.startedAt) },
      { label: 'Término', value: formatDateTime(payload.finishedAt) },
      { label: 'Duración', value: formatDuration(payload.startedAt, payload.finishedAt) },
      { label: 'Atendió', value: payload.technicianName || payload.responsableName || '-' },
      { label: 'Gerente', value: pdfText(payload.managerName) },
      { label: 'Cargo', value: pdfText(payload.managerRole) },
    ], { labelWidth: 64 });
    if (clientLogo) {
      try {
        doc.image(clientLogo, margin + 8, infoY + branchHeight - 42, { fit: [72, 30] });
      } catch {
        // Keep rendering when a client logo is corrupt.
      }
    }
    doc.y = infoY + Math.max(branchHeight, operationHeight) + 16;

    const slaStatus = payload.finishedAt && payload.dueAt
      ? payload.finishedAt.getTime() <= payload.dueAt.getTime() ? 'En tiempo' : 'Fuera de tiempo'
      : payload.dueAt ? 'En proceso' : '-';
    drawSectionTitle(doc, 'Indicadores');
    const kpiHeight = drawKpiCards(doc, doc.y, [
      { label: 'Estatus', value: pdfText(payload.estatus), accent },
      { label: 'SLA límite', value: formatDateTime(payload.dueAt), accent },
      { label: 'Resultado SLA', value: slaStatus, accent },
    ]);
    doc.y += kpiHeight + 16;

    if (payload.inventorySnapshot) {
      ensurePageSpace(140, 'Inventario comparativo');
      drawSectionTitle(doc, 'Inventario comparativo');
      const inventory = payload.inventorySnapshot;
      const summaryHeight = drawSummaryBox(doc, margin, doc.y, contentWidth, 'Resumen de inventario', [
        ['Estatus inventario', pdfText(inventory.status)],
        ['Equipos previos', String(inventory.previousCount ?? 0)],
        ['Equipos actuales', String(inventory.currentCount ?? 0)],
        ['Diferencia', String(inventory.deltaCount ?? 0)],
        ['Corte', formatDateTime(inventory.completedAt)],
      ], { highlightIndex: 3 });
      doc.y += summaryHeight + 12;

      const items = inventory.items || [];
      if (items.length) {
        const maxRows = 18;
        const columns = [
          { label: '# / Grupo / Equipo', width: 150 },
          { label: 'Serie / Modelo', width: 170 },
          { label: 'Estado / Cambio', width: 95 },
          { label: 'Comentarios', width: 100 },
        ];
        const tableCtx: PdfTableContext = {
          columns,
          headerAccent: PDF_COLORS.navy,
          fontSize: 8,
          onNewPage: () => {
            drawHeader();
          },
        };
        drawTableHeader(doc, doc.y, columns, tableCtx.headerAccent);
        doc.y += 28;
        items.slice(0, maxRows).forEach((item, index) => {
          drawTableRow(doc, [
            `${index + 1}. ${item.groupName || 'GENERAL'}\n${item.sectionName || '-'} · ${item.equipmentName || 'Equipo sin nombre'}`,
            `Serie: ${item.serialBefore || '-'} → ${item.serialAfter || '-'}\nModelo: ${item.modelBefore || '-'} → ${item.modelAfter || '-'}`,
            `${item.itemStatus || '-'}\n${item.compareState || '-'}`,
            pdfText(item.maintenanceComments),
          ], index, tableCtx, { boldColumns: [0] });
        });
        if (items.length > maxRows) {
          doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(8.5)
            .text(`... y ${items.length - maxRows} equipos adicionales en el reporte de inventario detallado.`);
        }
        doc.moveDown(0.5);
      }
    }

    ensurePageSpace(190, 'Resumen operativo');
    drawSectionTitle(doc, 'Resumen operativo');
    const serviceHeight = drawInfoCard(doc, margin, doc.y, contentWidth, [
      { label: 'Empresa', value: payload.clientCompany || payload.clientName || '-' },
      { label: 'Teléfono', value: pdfText(payload.clientPhone) },
      { label: 'Fecha serv.', value: pdfText(payload.serviceDate) },
      { label: 'Horas', value: pdfText(payload.hoursWorked) },
      { label: 'Materiales', value: pdfText(payload.materialsUsed) },
    ]);
    doc.y += serviceHeight + 12;
    drawSectionTitle(doc, 'Trabajo realizado');
    doc.fillColor(PDF_COLORS.text).font('Helvetica').fontSize(10)
      .text(pdfText(payload.workSummary), margin, doc.y, { width: contentWidth });
    drawSectionTitle(doc, 'Observaciones');
    doc.fillColor(PDF_COLORS.text).font('Helvetica').fontSize(10)
      .text(pdfText(payload.observations), margin, doc.y, { width: contentWidth });

    ensurePageSpace(180, 'Conformidad del gerente');
    drawSectionTitle(doc, 'Conformidad del gerente');
    const signatureY = doc.y;
    const detailsHeight = drawInfoCard(doc, margin, signatureY, 220, [
      { label: 'Gerente', value: pdfText(payload.managerName) },
      { label: 'Cargo', value: pdfText(payload.managerRole) },
    ], { labelWidth: 60 });
    const signatureX = margin + 240;
    const signatureWidth = contentWidth - 240;
    const signatureHeight = Math.max(90, detailsHeight);
    doc.save();
    doc.roundedRect(signatureX, signatureY, signatureWidth, signatureHeight, 8).fill(PDF_COLORS.softGray);
    doc.roundedRect(signatureX + 10, signatureY + 10, signatureWidth - 20, signatureHeight - 32, 6).stroke(PDF_COLORS.line);
    doc.restore();
    const signatureImage = resolveSignatureImage(payload.managerSignature);
    if (signatureImage) {
      try {
        doc.image(signatureImage as any, signatureX + 18, signatureY + 18, {
          fit: [signatureWidth - 36, signatureHeight - 48],
          align: 'center',
          valign: 'center',
        });
      } catch {
        doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(9)
          .text('Firma registrada, pero no se pudo renderizar.', signatureX + 18, signatureY + 38, {
            width: signatureWidth - 36,
            align: 'center',
          });
      }
    } else {
      doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(9)
        .text('Sin firma digital adjunta', signatureX + 18, signatureY + 38, {
          width: signatureWidth - 36,
          align: 'center',
        });
    }
    doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(8.5)
      .text('Firma del gerente / representante', signatureX, signatureY + signatureHeight - 16, {
        width: signatureWidth,
        align: 'center',
      });
    doc.y = signatureY + Math.max(detailsHeight, signatureHeight) + 14;

    drawSectionTitle(doc, 'Evidencias');
    const evidenceWidth = 220;
    const evidenceHeight = 164;
    let x = margin;
    let y = doc.y + 10;
    const arrivalCoordinates = payload.evidences.find((evidence) =>
      evidence.tipoEvidencia?.toLowerCase().includes('llegada') && evidence.latitud && evidence.longitud,
    ) || payload.evidences.find((evidence) => evidence.latitud && evidence.longitud);

    const drawEvidences = async () => {
      for (const evidence of payload.evidences) {
        if (y + evidenceHeight + 42 > doc.page.height - 60) {
          addPage('Evidencias');
          x = margin;
          y = doc.y + 10;
        }
        const evidencePath = resolveUploadPath(evidence.archivoUrl);
        const isPdf = evidence.archivoUrl.toLowerCase().endsWith('.pdf');
        const mapForPdf = isPdf
          && /(hoja de servicio|pdf adjunto|pdf)/i.test(evidence.tipoEvidencia || '')
          && arrivalCoordinates;

        if (mapForPdf) {
          const mapBuffer = await fetchImageBuffer(
            getStaticMapImageUrls(arrivalCoordinates.latitud, arrivalCoordinates.longitud),
          );
          if (mapBuffer) {
            doc.image(mapBuffer, x, y, { fit: [evidenceWidth, evidenceHeight], align: 'center', valign: 'center' });
          } else {
            doc.rect(x, y, evidenceWidth, evidenceHeight).fill(PDF_COLORS.softGray);
            doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(9)
              .text('Mapa no disponible', x + 8, y + 60, { width: evidenceWidth - 16, align: 'center' });
          }
        } else if (evidencePath && !isPdf) {
          try {
            doc.image(evidencePath, x, y, { fit: [evidenceWidth, evidenceHeight], align: 'center', valign: 'center' });
          } catch {
            doc.rect(x, y, evidenceWidth, evidenceHeight).stroke(PDF_COLORS.muted);
            doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(9)
              .text('No se pudo cargar', x + 8, y + 60, { width: evidenceWidth - 16, align: 'center' });
          }
        } else {
          doc.rect(x, y, evidenceWidth, evidenceHeight).fill(PDF_COLORS.softGray);
          doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(9)
            .text(isPdf ? 'PDF adjunto' : 'Sin evidencia', x + 8, y + 60, {
              width: evidenceWidth - 16,
              align: 'center',
            });
        }
        doc.fillColor(PDF_COLORS.text).font('Helvetica').fontSize(8.5)
          .text(mapForPdf ? 'Mapa de llegada' : evidence.tipoEvidencia, x, y + evidenceHeight + 6, {
            width: evidenceWidth,
          });
        const mapsUrl = mapForPdf
          ? getMapsUrl(arrivalCoordinates?.latitud, arrivalCoordinates?.longitud)
          : evidence.tipoEvidencia === 'Foto llegada'
            ? getMapsUrl(evidence.latitud, evidence.longitud)
            : null;
        if (mapsUrl) {
          doc.fillColor(accent).font('Helvetica').fontSize(7)
            .text('Ver ubicación de llegada', x, y + evidenceHeight + 20, {
              width: evidenceWidth,
              link: mapsUrl,
              underline: true,
            });
        }
        x += evidenceWidth + 18;
        if (x + evidenceWidth > margin + contentWidth) {
          x = margin;
          y += evidenceHeight + (mapsUrl ? 40 : 30);
        }
      }
      doc.end();
    };

    drawEvidences().catch(reject);
  });
};
