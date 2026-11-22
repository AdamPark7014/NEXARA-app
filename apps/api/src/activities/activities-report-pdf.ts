import PDFDocument from 'pdfkit';
import {
  PDF_COLORS,
  PDF_MODULE_ACCENTS,
  drawInfoCard,
  drawKpiCards,
  drawNexaraFooterOnEveryPage,
  drawNexaraHeader,
  drawSectionTitle,
  drawTableHeader,
  drawTableRow,
  fuente,
  loadNexaraLogo,
  pdfText,
  type PdfTableContext,
} from '../common/pdf/nexara-pdf-theme';
import { ETIQUETA_ESTATUS_ACTIVIDAD, ETIQUETA_PRIORIDAD, etiquetaDe } from '../common/excel/etiquetas';

export type ActivitiesReportRow = {
  an: string;
  fecha: string;
  titulo: string;
  cliente: string;
  responsable: string;
  estatus: string;
  prioridad: string;
};

export type ActivitiesReportPayload = {
  title: string;
  periodLabel: string;
  generatedAt: string;
  preparedBy?: string | null;
  total: number;
  abiertas: number;
  enProceso: number;
  finalizadas: number;
  byStatus: { name: string; count: number }[];
  byPriority: { name: string; count: number }[];
  rows: ActivitiesReportRow[];
};

const ACCENT = PDF_MODULE_ACCENTS.ops;

export function generateActivitiesReportPdf(payload: ActivitiesReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const logo = loadNexaraLogo();

    const header = () =>
      drawNexaraHeader(doc, {
        docTitle: payload.title || 'Reporte de actividades',
        docSubtitle: 'Actividades asignadas en el periodo',
        accent: ACCENT,
        logo,
        meta: [
          { label: 'Periodo', value: payload.periodLabel },
          { label: 'Generado', value: payload.generatedAt },
          ...(payload.preparedBy ? [{ label: 'Preparado por', value: payload.preparedBy }] : []),
        ],
      });

    header();

    drawSectionTitle(doc, 'Resumen operativo');
    const kpiHeight = drawKpiCards(doc, doc.y, [
      { label: 'Actividades', value: String(payload.total), accent: ACCENT },
      { label: 'Por atender', value: String(payload.abiertas), accent: '#B7791F' },
      { label: 'En proceso', value: String(payload.enProceso), accent: PDF_COLORS.blue },
      { label: 'Finalizadas', value: String(payload.finalizadas), accent: '#2F855A' },
    ]);
    doc.y += kpiHeight + 18;

    drawSectionTitle(doc, 'Distribución');
    const toLines = (items: { name: string; count: number }[]) =>
      items.length
        ? items.slice(0, 8).map((it) => ({
            label: `${it.count}`,
            value: it.name,
          }))
        : [{ label: '—', value: 'Sin datos en el periodo' }];

    // El mismo estatus escrito de dos formas («En Proceso», «EN_PROCESO») es un solo renglón.
    const juntar = (items: { name: string; count: number }[], mapa: Record<string, string>) => {
      const suma = new Map<string, number>();
      for (const it of items) {
        const nombre = etiquetaDe(mapa, it.name);
        suma.set(nombre, (suma.get(nombre) ?? 0) + it.count);
      }
      return [...suma.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    };

    const gap = 14;
    const cardWidth = (contentWidth - gap) / 2;
    const breakdownY = doc.y;
    const h1 = drawInfoCard(doc, margin, breakdownY, cardWidth, toLines(juntar(payload.byStatus, ETIQUETA_ESTATUS_ACTIVIDAD)), {
      title: 'Por estatus',
      labelWidth: 36,
    });
    const h2 = drawInfoCard(doc, margin + cardWidth + gap, breakdownY, cardWidth, toLines(juntar(payload.byPriority, ETIQUETA_PRIORIDAD)), {
      title: 'Por prioridad',
      labelWidth: 36,
    });
    doc.y = breakdownY + Math.max(h1, h2) + 16;

    drawSectionTitle(doc, 'Detalle de actividades');

    const columns = [
      { label: 'Folio', width: 70 },
      { label: 'Fecha', width: 70 },
      { label: 'Título', width: 232 },
      { label: 'Cliente', width: 120 },
      { label: 'Responsable', width: 110 },
      { label: 'Estatus', width: 90 },
      { label: 'Prioridad', width: 70 },
    ];
    const ctx: PdfTableContext = {
      columns,
      headerAccent: PDF_COLORS.navy,
      onNewPage: () => {
        header();
        drawSectionTitle(doc, 'Detalle de actividades (continuación)');
      },
    };

    drawTableHeader(doc, doc.y, columns);
    doc.y += 30;

    if (!payload.rows.length) {
      doc
        .fillColor(PDF_COLORS.muted)
        .fontSize(9)
        .font(fuente(doc, 'texto'))
        .text('Sin actividades en el periodo.', margin + 6, doc.y);
      doc.y += 18;
    }

    payload.rows.forEach((row, index) => {
      drawTableRow(
        doc,
        [
          pdfText(row.an),
          pdfText(row.fecha),
          pdfText(row.titulo),
          pdfText(row.cliente),
          pdfText(row.responsable),
          etiquetaDe(ETIQUETA_ESTATUS_ACTIVIDAD, row.estatus),
          etiquetaDe(ETIQUETA_PRIORIDAD, row.prioridad),
        ],
        index,
        ctx,
      );
    });

    // El pie va en cada hoja: ya no se abre una hoja en blanco solo para ponerlo.
    drawNexaraFooterOnEveryPage(
      doc,
      'NEXARA · Reporte de actividades — documento generado automáticamente, información confidencial.',
    );

    doc.end();
  });
}
