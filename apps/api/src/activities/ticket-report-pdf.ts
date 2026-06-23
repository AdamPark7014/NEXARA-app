import PDFDocument from 'pdfkit';
import fs from 'fs';
import http from 'http';
import https from 'https';
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
  const raw = fileUrl.trim();
  if (!raw) return null;

  const sanitizedRaw = raw
    .replace(/\\+/g, '/')
    .replace(/[?#].*$/, '')
    .trim();

  if (!sanitizedRaw) return null;

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
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // Continue checking other candidate paths.
      }
    }

    return null;
  };

  if (sanitizedRaw.startsWith('/uploads/')) {
    return resolveExistingUpload(sanitizedRaw.replace(/^\/uploads\//, ''));
  }

  if (sanitizedRaw.startsWith('/activities/')) {
    return resolveExistingUpload(sanitizedRaw.replace(/^\//, ''));
  }

  if (sanitizedRaw.startsWith('activities/')) {
    return resolveExistingUpload(sanitizedRaw);
  }

  if (/^https?:\/\//i.test(sanitizedRaw)) {
    try {
      const parsed = new URL(sanitizedRaw);
      if (parsed.pathname.startsWith('/uploads/')) {
        return resolveExistingUpload(parsed.pathname.replace(/^\/uploads\//, ''));
      }
      if (parsed.pathname.startsWith('/activities/')) {
        return resolveExistingUpload(parsed.pathname.replace(/^\//, ''));
      }
    } catch {
      return null;
    }
  }

  if (sanitizedRaw.startsWith('/api/uploads/')) {
    return resolveExistingUpload(sanitizedRaw.replace(/^\/api\/uploads\//, ''));
  }

  return null;
};

const getMapsUrl = (lat?: number | null, lng?: number | null) => {
  if (!lat || !lng) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
};

const getStaticMapImageUrls = (lat?: number | null, lng?: number | null) => {
  if (!lat || !lng) return [];
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const urls: string[] = [];
  if (googleMapsApiKey) {
    urls.push(`https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=600x600&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(googleMapsApiKey)}`);
    urls.push(`https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&scale=2&size=600x600&maptype=hybrid&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(googleMapsApiKey)}`);
    return urls;
  }
  urls.push(`https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=600x600&markers=${lat},${lng},red-pushpin`);
  urls.push(`https://static-maps.yandex.ru/1.x/?ll=${lng},${lat}&size=450,450&z=15&l=map&pt=${lng},${lat},pm2rdm`);
  return urls;
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

const fetchImageBuffer = async (imageUrls: string[]) => {
  for (const imageUrl of imageUrls) {
    const buffer = await downloadImageBuffer(imageUrl);
    if (buffer && buffer.length > 0) {
      return buffer;
    }
  }
  return null;
};

const resolveSignatureImage = (value?: string | null) => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
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
      doc.rect(0, 0, pageWidth, 126).fill(colors.lightBlue);
      doc.rect(0, 0, pageWidth, 6).fill(colors.blue);
      doc.restore();

      const logoBox = { x: margin, y: 22, w: 120, h: 64 };
      if (nexaraLogo) {
        doc.image(nexaraLogo, logoBox.x, logoBox.y, { fit: [logoBox.w, logoBox.h] });
      }

      const infoWidth = 200;
      const infoX = pageWidth - margin - infoWidth;
      const infoY = 16;
      const infoHeight = 94;

      doc.save();
      doc.fillOpacity(0.92);
      doc.roundedRect(infoX, infoY, infoWidth, infoHeight, 8).fill('#ffffff');
      doc.restore();

      const titleX = margin + logoBox.w + 12;
      const titleRightLimit = infoX - 14;
      const titleWidth = Math.max(170, titleRightLimit - titleX);

      doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(20).text('Reporte de Ticket', titleX, 30, {
        width: titleWidth,
      });
      const flowLabel = payload.workType === 'PREVENTIVE_INVENTORY'
        ? 'Mantenimiento e inventario comparativo'
        : 'Ticket por problema';
      doc.fontSize(10).font('Helvetica').fillColor(colors.muted).text(flowLabel, titleX, 58, {
        width: titleWidth,
      });

      if (clientLogo) {
        const clientBox = { x: infoX + 8, y: infoY + 8, w: 44, h: 34 };
        doc.save();
        doc.roundedRect(clientBox.x - 2, clientBox.y - 2, clientBox.w + 4, clientBox.h + 4, 5).fill('#ffffff');
        doc.restore();
        doc.image(clientLogo, clientBox.x, clientBox.y, {
          fit: [clientBox.w, clientBox.h],
          align: 'center',
          valign: 'center',
        });
      }

      doc.fillColor(colors.text).fontSize(9);
      const metaX = infoX + 56;
      const metaWidth = infoWidth - 64;
      doc.text(`Ticket: ${payload.anNumber}`, metaX, infoY + 10, { width: metaWidth, align: 'left' });
      doc.text(`Cliente: ${payload.clientName || '-'}`, metaX, infoY + 26, { width: metaWidth, align: 'left' });
      doc.text(`Tipo: ${payload.ticketType || '-'}`, metaX, infoY + 42, { width: metaWidth, align: 'left' });
      doc.text(`Prioridad: ${payload.prioridad || '-'}`, metaX, infoY + 58, { width: metaWidth, align: 'left' });
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
      { label: 'Atendió', value: payload.technicianName || payload.responsableName || '-' },
      { label: 'Gerente', value: payload.managerName || '-' },
      { label: 'Cargo', value: payload.managerRole || '-' },
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

    if (payload.inventorySnapshot) {
      drawSectionTitle('Inventario comparativo');

      const inventory = payload.inventorySnapshot;
      const inventorySummary = [
        { label: 'Estatus inventario', value: inventory.status || '-' },
        { label: 'Equipos previos', value: String(inventory.previousCount ?? 0) },
        { label: 'Equipos actuales', value: String(inventory.currentCount ?? 0) },
        { label: 'Diferencia', value: String(inventory.deltaCount ?? 0) },
        { label: 'Corte', value: formatDateTime(inventory.completedAt || null) },
      ];

      const inventoryHeight = drawInfoCard(margin, doc.y, contentWidth, inventorySummary);
      doc.y += inventoryHeight + 10;

      const items = inventory.items || [];
      if (items.length > 0) {
        doc.fillColor(colors.navy).fontSize(11).font('Helvetica-Bold').text('Detalle técnico de equipos');
        doc.moveDown(0.3);
        doc.fillColor(colors.muted).fontSize(9).font('Helvetica')
          .text(`Total equipos capturados: ${items.length}`);
        doc.moveDown(0.3);

        const maxRows = 18;
        items.slice(0, maxRows).forEach((item, index) => {
          if (doc.y + 42 > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            drawHeader();
            doc.y = 140;
            drawSectionTitle('Inventario comparativo (continuación)');
          }

          const lineA = `${index + 1}. ${item.groupName || 'GENERAL'} · ${item.sectionName || '-'} · ${item.equipmentName || 'Equipo sin nombre'}`;
          const lineB = `Serie: ${item.serialBefore || '-'} -> ${item.serialAfter || '-'} | Modelo: ${item.modelBefore || '-'} -> ${item.modelAfter || '-'} | Estado: ${item.itemStatus || '-'} | Cambio: ${item.compareState || '-'}`;
          doc.fillColor(colors.text).fontSize(8.8).font('Helvetica-Bold').text(lineA, margin, doc.y, { width: contentWidth });
          doc.fillColor(colors.text).fontSize(8.4).font('Helvetica').text(lineB, margin, doc.y + 1, { width: contentWidth });
          if (item.maintenanceComments) {
            doc.fillColor(colors.muted).fontSize(8).text(`Nota: ${item.maintenanceComments}`, margin, doc.y + 1, { width: contentWidth });
          }
          doc.moveDown(0.35);
        });

        if (items.length > maxRows) {
          doc.fillColor(colors.muted).fontSize(8.5).font('Helvetica')
            .text(`... y ${items.length - maxRows} equipos adicionales en el reporte de inventario detallado.`);
        }
        doc.moveDown(0.5);
      }
    }

    drawSectionTitle('Resumen operativo');
    const serviceDetailsHeight = drawInfoCard(margin, doc.y, contentWidth, [
      { label: 'Empresa', value: payload.clientCompany || payload.clientName || '-' },
      { label: 'Teléfono', value: payload.clientPhone || '-' },
      { label: 'Fecha serv.', value: payload.serviceDate || '-' },
      { label: 'Horas', value: payload.hoursWorked || '-' },
      { label: 'Materiales', value: payload.materialsUsed || '-' },
    ]);
    doc.y += serviceDetailsHeight + 12;

    doc.fillColor(colors.navy).fontSize(11).font('Helvetica-Bold').text('Trabajo realizado');
    doc.fillColor(colors.text).fontSize(10).font('Helvetica').text(payload.workSummary || '-', { width: contentWidth });

    doc.moveDown();
    doc.fillColor(colors.navy).fontSize(11).font('Helvetica-Bold').text('Observaciones');
    doc.fillColor(colors.text).fontSize(10).font('Helvetica').text(payload.observations || '-', { width: contentWidth });

    drawSectionTitle('Conformidad del gerente');
    const signatureCardY = doc.y;
    const signatureCardHeight = 122;
    doc.save();
    doc.roundedRect(margin, signatureCardY, contentWidth, signatureCardHeight, 8).fill(colors.softGray);
    doc.restore();

    drawInfoCard(margin + 10, signatureCardY + 10, 220, [
      { label: 'Gerente', value: payload.managerName || '-' },
      { label: 'Cargo', value: payload.managerRole || '-' },
    ]);

    const signatureBoxX = margin + 250;
    const signatureBoxY = signatureCardY + 14;
    const signatureBoxWidth = contentWidth - 260;
    const signatureBoxHeight = 76;
    doc.save();
    doc.roundedRect(signatureBoxX, signatureBoxY, signatureBoxWidth, signatureBoxHeight, 8).stroke(colors.line);
    doc.restore();

    const signatureImage = resolveSignatureImage(payload.managerSignature);
    if (signatureImage) {
      try {
        doc.image(signatureImage as any, signatureBoxX + 8, signatureBoxY + 8, {
          fit: [signatureBoxWidth - 16, signatureBoxHeight - 16],
          align: 'center',
          valign: 'center',
        });
      } catch {
        doc.fillColor(colors.muted).fontSize(9).text('Firma registrada, pero no se pudo renderizar.', signatureBoxX + 10, signatureBoxY + 28, {
          width: signatureBoxWidth - 20,
          align: 'center',
        });
      }
    } else {
      doc.fillColor(colors.muted).fontSize(9).text('Sin firma digital adjunta', signatureBoxX + 10, signatureBoxY + 28, {
        width: signatureBoxWidth - 20,
        align: 'center',
      });
    }
    doc.fillColor(colors.muted).fontSize(8.5).text('Firma del gerente / representante', signatureBoxX, signatureBoxY + signatureBoxHeight + 6, {
      width: signatureBoxWidth,
      align: 'center',
    });
    doc.y = signatureCardY + signatureCardHeight + 14;

    drawSectionTitle('Evidencias');

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
        doc.addPage();
        drawHeader();
        doc.y = 140;
        drawSectionTitle('Evidencias');
        x = margin;
        y = doc.y + 10;
      }

      const evidencePath = resolveUploadPath(evidence.archivoUrl);
      const isPdf = evidence.archivoUrl.toLowerCase().endsWith('.pdf');
      const mapForPdf = isPdf
        && /(hoja de servicio|pdf adjunto|pdf)/i.test(evidence.tipoEvidencia || '')
        && arrivalCoordinates;

      if (mapForPdf) {
        const mapImageUrls = getStaticMapImageUrls(arrivalCoordinates.latitud, arrivalCoordinates.longitud);
        const mapBuffer = await fetchImageBuffer(mapImageUrls);
        if (mapBuffer) {
          doc.image(mapBuffer, x, y, { fit: [evidenceWidth, evidenceHeight], align: 'center', valign: 'center' });
        } else {
          doc.rect(x, y, evidenceWidth, evidenceHeight).fill(colors.softGray);
          doc.fillColor(colors.muted).fontSize(9).text('Mapa no disponible', x + 8, y + 60, { width: evidenceWidth - 16, align: 'center' });
        }
      } else if (evidencePath && !isPdf) {
        try {
          doc.image(evidencePath, x, y, { fit: [evidenceWidth, evidenceHeight], align: 'center', valign: 'center' });
        } catch {
          doc.rect(x, y, evidenceWidth, evidenceHeight).stroke(colors.muted);
          doc.fontSize(9).fillColor(colors.muted).text('No se pudo cargar', x + 8, y + 60, { width: evidenceWidth - 16, align: 'center' });
        }
      } else {
        doc.rect(x, y, evidenceWidth, evidenceHeight).fill(colors.softGray);
        doc.fillColor(colors.muted).fontSize(9).text(isPdf ? 'PDF adjunto' : 'Sin evidencia', x + 8, y + 60, { width: evidenceWidth - 16, align: 'center' });
      }

      doc.fillColor(colors.text).fontSize(8.5).text(mapForPdf ? 'Mapa de llegada' : evidence.tipoEvidencia, x, y + evidenceHeight + 6, { width: evidenceWidth });

      const mapsUrl = mapForPdf
        ? getMapsUrl(arrivalCoordinates?.latitud, arrivalCoordinates?.longitud)
        : evidence.tipoEvidencia === 'Foto llegada'
          ? getMapsUrl(evidence.latitud, evidence.longitud)
          : null;
      if (mapsUrl) {
        doc.fillColor(colors.blue).fontSize(7).text('Ver ubicación de llegada', x, y + evidenceHeight + 20, {
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

    drawEvidences().catch((error) => reject(error));
  });
};


