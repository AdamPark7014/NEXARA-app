import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import {
  PDF_COLORS,
  PDF_CONTENT_START_Y,
  PDF_MODULE_ACCENTS,
  type PdfTableContext,
  drawInfoCard,
  drawNexaraFooterOnEveryPage,
  drawNexaraHeader,
  drawSectionTitle,
  drawSummaryBox,
  drawTableHeader,
  drawTableRow,
  fuente,
  loadNexaraLogo,
  pdfText,
} from '../common/pdf/nexara-pdf-theme';
import { ETIQUETA_TIPO_TICKET, etiquetaDe } from '../common/excel/etiquetas';

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

const loadImage = (filePath: string) => {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  } catch {
    return null;
  }
};

const resolveLogoPath = (logoUrl?: string | null) => {
  if (!logoUrl?.startsWith('/uploads/')) return null;
  const relative = logoUrl.replace(/^\/uploads\//, '');
  const candidates = [
    path.resolve(process.cwd(), 'uploads', relative),
    path.resolve(process.cwd(), 'apps', 'api', 'uploads', relative),
    path.resolve(process.cwd(), '..', 'uploads', relative),
  ];
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || null;
};

export const generateServiceSheetPdf = async (payload: ServiceSheetPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const accent = PDF_MODULE_ACCENTS.ops;
    const logo = loadNexaraLogo();
    const clientLogoPath = resolveLogoPath(payload.clientLogoUrl);
    const clientLogo = clientLogoPath ? loadImage(clientLogoPath) : null;

    const drawHeader = () => {
      drawNexaraHeader(doc, {
        docTitle: 'Hoja de servicio',
        docSubtitle: 'Mantenimiento preventivo/correctivo',
        accent,
        logo,
        meta: [
          { label: 'Folio', value: payload.anNumber },
          { label: 'Cliente', value: pdfText(payload.clientName) },
          { label: 'Tipo', value: etiquetaDe(ETIQUETA_TIPO_TICKET, payload.ticketType) },
        ],
      });
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
    drawSectionTitle(doc, 'Datos de servicio');
    const infoY = doc.y;
    const leftWidth = (contentWidth - 20) * 0.55;
    const rightWidth = contentWidth - leftWidth - 20;
    const serviceHeight = drawInfoCard(doc, margin, infoY, leftWidth, [
      { label: 'Sucursal', value: pdfText(payload.branchName) },
      { label: 'No. sucursal', value: pdfText(payload.branchNumber) },
      { label: 'Ciudad/Estado', value: [payload.branchCity, payload.branchState].filter(Boolean).join(', ') || '-' },
      { label: 'Dirección', value: pdfText(payload.branchAddress) },
    ], { labelWidth: 80 });
    const scheduleHeight = drawInfoCard(doc, margin + leftWidth + 20, infoY, rightWidth, [
      { label: 'Inicio', value: formatDateTime(payload.startedAt) },
      { label: 'Término', value: formatDateTime(payload.finishedAt) },
      { label: 'Gerente', value: pdfText(payload.managerName) },
      { label: 'Cargo', value: pdfText(payload.managerRole) },
    ], { labelWidth: 58 });
    if (clientLogo) {
      try {
        // Arriba a la derecha, entre la banda y las tarjetas. Antes iba dentro de la primera tarjeta,
        // encima de los rótulos «Ciudad/Estado» y «Dirección».
        doc.image(clientLogo, margin + contentWidth - 96, PDF_CONTENT_START_Y - 14, { fit: [96, 30], align: 'right', valign: 'center' });
      } catch {
        // Keep rendering when a client logo is corrupt.
      }
    }
    doc.y = infoY + Math.max(serviceHeight, scheduleHeight) + 16;

    drawSectionTitle(doc, 'Trabajo realizado');
    doc.fillColor(PDF_COLORS.text).font(fuente(doc, 'texto')).fontSize(10)
      .text(pdfText(payload.workSummary), margin, doc.y, { width: contentWidth });
    doc.y += 8;

    drawSectionTitle(doc, 'Equipos atendidos');
    const equipment = payload.equipmentList || [];
    const columns = [
      { label: '#', width: 24 },
      { label: 'Equipo', width: 140 },
      { label: 'Modelo', width: 100 },
      { label: 'Serie', width: 100 },
      { label: 'Actividad', width: 151 },
    ];
    const tableCtx: PdfTableContext = {
      columns,
      headerAccent: PDF_COLORS.navy,
      fontSize: 9,
      onNewPage: () => {
        drawHeader();
      },
    };
    drawTableHeader(doc, doc.y, columns, tableCtx.headerAccent);
    doc.y += 28;
    if (!equipment.length) {
      doc.fillColor(PDF_COLORS.text).font(fuente(doc, 'texto')).fontSize(10)
        .text('Sin equipos registrados.', margin, doc.y);
      doc.moveDown(0.6);
    } else {
      equipment.forEach((item, index) => {
        drawTableRow(doc, [
          String(index + 1),
          pdfText(item.name),
          pdfText(item.model),
          pdfText(item.serial),
          pdfText(item.action),
        ], index, tableCtx, { boldColumns: [0] });
      });
    }

    doc.y += 6;
    ensurePageSpace(100);
    drawSectionTitle(doc, 'Observaciones');
    doc.fillColor(PDF_COLORS.text).font(fuente(doc, 'texto')).fontSize(10)
      .text(pdfText(payload.observations), margin, doc.y, { width: contentWidth });
    doc.y += 8;

    ensurePageSpace(120);
    drawSectionTitle(doc, 'Firma digital');
    const signatureY = doc.y;
    const signatureHeight = drawInfoCard(doc, margin, signatureY, contentWidth, [
      { label: 'Firmado por', value: pdfText(payload.signedName) },
      { label: 'Gerente', value: pdfText(payload.managerName) },
      { label: 'Cargo', value: pdfText(payload.managerRole) },
    ], { title: 'Conformidad del servicio', labelWidth: 80 });
    doc.y = signatureY + signatureHeight + 12;

    ensurePageSpace(150);
    drawSectionTitle(doc, 'Encuesta de calidad');
    const survey = payload.survey || {};
    const yesNo = (value?: boolean | null) => value === true ? 'Sí' : value === false ? 'No' : '-';
    const surveyHeight = drawSummaryBox(doc, margin, doc.y, contentWidth, 'Evaluación del servicio', [
      ['El ingeniero se identificó', yesNo(survey.engineerIdentified)],
      ['La atención fue amable', yesNo(survey.friendlyAttention)],
      ['Satisfecho con la solución', yesNo(survey.solutionSatisfied)],
      ['Observaciones adicionales', pdfText(survey.notes)],
    ]);
    doc.y += surveyHeight + 8;

    drawNexaraFooterOnEveryPage(doc);
    doc.end();
  });
};
