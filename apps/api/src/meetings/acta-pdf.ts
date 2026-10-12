import PDFDocument from 'pdfkit';
import {
  PDF_COLORS,
  PDF_CONTENT_START_Y,
  PDF_MODULE_ACCENTS,
  type PdfTableContext,
  drawInfoCard,
  drawNexaraFooter,
  drawNexaraHeader,
  drawSectionTitle,
  drawTableHeader,
  drawTableRow,
  fuente,
  loadNexaraLogo,
  pdfText,
} from '../common/pdf/nexara-pdf-theme';
import { MEETING_DEFAULTS, type MeetingType } from './meeting-rhythm.js';

type Persona = { nombre?: string | null } | null | undefined;

export type ActaPdfPayload = {
  id: number;
  tipo: string;
  titulo: string;
  fecha: Date;
  horaInicio?: string | null;
  estado: string;
  agenda?: string | null;
  notas?: string | null;
  realizadaAt?: Date | null;
  facilitador?: Persona;
  asistentes: Array<{ asistio: boolean; user?: Persona }>;
  acuerdos: Array<{
    tipo: string;
    descripcion: string;
    estado: string;
    fechaCompromiso?: Date | null;
    responsable?: Persona;
    activity?: { anNumber?: string | null } | null;
  }>;
  transcripcion?: string | null;
};

const ESTADO_REUNION: Record<string, string> = { PROGRAMADA: 'Programada', REALIZADA: 'Realizada', CANCELADA: 'Cancelada' };
const TIPO_ACUERDO: Record<string, string> = { ACUERDO: 'Acuerdo', LECCION: 'Lección', RIESGO: 'Riesgo' };
const ESTADO_ACUERDO: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  CUMPLIDO: 'Cumplido',
  CANCELADO: 'Cancelado',
};

/** `fecha` es @db.Date: llega a medianoche UTC y en CDMX se vería un día antes. */
const fechaCorta = (d?: Date | null) =>
  d ? d.toLocaleDateString('es-MX', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const fechaHora = (d?: Date | null) =>
  d
    ? d.toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

export const nombreArchivoActa = (r: { id: number; fecha: Date; titulo: string }) => {
  const dia = r.fecha.toISOString().slice(0, 10);
  const slug = r.titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `acta-${dia}-${slug || r.id}.pdf`;
};

/** Acta de una reunión: datos, asistencia, agenda, minuta, acuerdos y, al final, la transcripción. */
export const generarActaPdf = (r: ActaPdfPayload): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const ancho = doc.page.width - margin * 2;
    const acento = PDF_MODULE_ACCENTS.erp;
    const logo = loadNexaraLogo();
    const limite = () => doc.page.height - 60;

    const encabezado = () => {
      drawNexaraHeader(doc, {
        docTitle: 'Acta de reunión',
        docSubtitle: MEETING_DEFAULTS[r.tipo as MeetingType]?.titulo ?? r.tipo,
        accent: acento,
        logo,
        meta: [
          { label: 'Reunión', value: `#${r.id}` },
          { label: 'Fecha', value: fechaCorta(r.fecha) },
          { label: 'Estado', value: ESTADO_REUNION[r.estado] ?? r.estado },
        ],
      });
      doc.y = PDF_CONTENT_START_Y;
    };
    const paginaNueva = (seccion?: string) => {
      doc.addPage();
      encabezado();
      if (seccion) drawSectionTitle(doc, seccion);
    };
    const asegurar = (alto: number, seccion?: string) => {
      if (doc.y + alto > limite()) paginaNueva(seccion);
    };
    const parrafo = (texto: string, seccion: string) => {
      doc.fillColor(PDF_COLORS.text).font(fuente(doc, 'texto')).fontSize(10);
      for (const linea of texto.replace(/\r/g, '').split('\n')) {
        const alto = doc.heightOfString(linea || ' ', { width: ancho });
        asegurar(alto + 2, seccion);
        doc.fillColor(PDF_COLORS.text).font(fuente(doc, 'texto')).fontSize(10);
        doc.text(linea || ' ', margin, doc.y, { width: ancho });
      }
    };

    encabezado();

    doc.fillColor(PDF_COLORS.navy).font(fuente(doc, 'titulo')).fontSize(15).text(r.titulo, margin, doc.y, { width: ancho });
    doc.moveDown(0.4);

    const presentes = r.asistentes.filter((a) => a.asistio).length;
    const alto = drawInfoCard(doc, margin, doc.y, ancho, [
      { label: 'Fecha y hora', value: `${fechaCorta(r.fecha)}${r.horaInicio ? ` · ${r.horaInicio}` : ''}` },
      { label: 'Conduce', value: pdfText(r.facilitador?.nombre) },
      { label: 'Realizada', value: fechaHora(r.realizadaAt) },
      { label: 'Asistencia', value: r.asistentes.length ? `${presentes} de ${r.asistentes.length} convocados` : '-' },
    ]);
    doc.y += alto + 8;

    if (r.asistentes.length) {
      drawSectionTitle(doc, 'Convocados');
      const lista = r.asistentes
        .map((a) => `${pdfText(a.user?.nombre)}${a.asistio ? '' : ' (no asistió)'}`)
        .join(' · ');
      parrafo(lista, 'Convocados');
    }

    if (r.agenda?.trim()) {
      asegurar(60, 'Agenda');
      drawSectionTitle(doc, 'Agenda');
      parrafo(r.agenda.trim(), 'Agenda');
    }

    asegurar(60, 'Minuta');
    drawSectionTitle(doc, 'Minuta');
    if (r.notas?.trim()) {
      parrafo(r.notas.trim(), 'Minuta');
    } else {
      doc.fillColor(PDF_COLORS.muted).font(fuente(doc, 'texto')).fontSize(10).text('Sin minuta guardada.', margin, doc.y);
    }

    asegurar(90, 'Acuerdos, lecciones y riesgos');
    drawSectionTitle(doc, `Acuerdos, lecciones y riesgos · ${r.acuerdos.length}`);
    if (r.acuerdos.length) {
      const columnas = [
        { label: 'Tipo', width: 62 },
        { label: 'Descripción', width: ancho - 62 - 110 - 70 - 68 },
        { label: 'Responsable', width: 110 },
        { label: 'Compromiso', width: 70 },
        { label: 'Estado', width: 68 },
      ];
      const ctx: PdfTableContext = { columns: columnas, headerAccent: PDF_COLORS.navy, fontSize: 9, onNewPage: () => encabezado() };
      drawTableHeader(doc, doc.y, columnas, ctx.headerAccent);
      doc.y += 28;
      r.acuerdos.forEach((a, i) => {
        const servicio = a.activity?.anNumber ? `\nServicio ${a.activity.anNumber}` : '';
        drawTableRow(
          doc,
          [
            TIPO_ACUERDO[a.tipo] ?? a.tipo,
            `${a.descripcion}${servicio}`,
            pdfText(a.responsable?.nombre),
            fechaCorta(a.fechaCompromiso),
            ESTADO_ACUERDO[a.estado] ?? a.estado,
          ],
          i,
          ctx,
          { boldColumns: [0] },
        );
      });
    } else {
      doc.fillColor(PDF_COLORS.muted).font(fuente(doc, 'texto')).fontSize(10).text('Sin acuerdos registrados.', margin, doc.y);
    }

    if (r.transcripcion?.trim()) {
      paginaNueva('Transcripción de la grabación');
      parrafo(r.transcripcion.trim(), 'Transcripción de la grabación');
    }

    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(paginas.start + i);
      drawNexaraFooter(doc, `NEXARA · Acta de reunión #${r.id} · página ${i + 1} de ${paginas.count}`);
    }
    doc.end();
  });
