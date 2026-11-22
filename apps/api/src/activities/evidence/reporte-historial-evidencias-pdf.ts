import PDFDocument from 'pdfkit';
import {
  PDF_COLORS,
  PDF_MODULE_ACCENTS,
  drawKpiCards,
  drawNexaraFooterOnEveryPage,
  drawNexaraHeader,
  drawSectionTitle,
  drawTableHeader,
  drawTableRow,
  fuente,
  pdfFechaHora,
  pdfPeriodo,
  type PdfTableContext,
} from '../../common/pdf/nexara-pdf-theme.js';

/**
 * Reporte de evidencias de una persona: el resumen del periodo, la lista de sus tickets y, por cada
 * ticket con archivos, una hoja con las fotos.
 *
 * Tenía su propio encabezado y Helvetica: el título de dos renglones se pintaba sobre el subtítulo,
 * el periodo salía como llega del filtro («2026-11-01 a 2026-11-21»), el nombre de una actividad
 * larga se recortaba y aun así se salía de su renglón, las hojas no llevaban número y cada ticket
 * sin archivos abría una hoja casi en blanco. Ahora usa el encabezado, las tablas y el pie de los
 * demás reportes.
 */

/** Un archivo de evidencia: `ruta` es dónde está en disco, o `null` si no se encontró o es un PDF. */
export type MedioDeEvidencia = { etiqueta: string; tipo: 'imagen' | 'pdf'; ruta: string | null };

export type FilaDeHistorial = {
  fecha: Date | null;
  ticket: string;
  actividad: string;
  responsable: string;
  sucursal: string;
  /** Resultado de la revisión, ya legible: Aprobada, Rechazada o Pendiente. */
  estatus: string;
  /** Prioridad ya legible: Alta, Media o Baja. */
  prioridad: string;
  medios: MedioDeEvidencia[];
};

export type ReporteHistorialEvidencias = {
  /** Días del filtro (`AAAA-MM-DD`), como los pidió la persona. */
  desde?: string | null;
  hasta?: string | null;
  generadoEn: Date;
  aprobadas: number;
  rechazadas: number;
  pendientes: number;
  filas: FilaDeHistorial[];
};

const ACCENT = PDF_MODULE_ACCENTS.ops;
const FECHA_Y_HORA: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };

export function generarReporteHistorialEvidencias(datos: ReporteHistorialEvidencias): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
      info: { Title: 'Reporte de evidencias', Author: 'NEXARA' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    /** Hasta dónde llega el contenido: debajo va el pie. */
    const fondo = doc.page.height - 60;
    const responsable = datos.filas.find((fila) => fila.responsable && fila.responsable !== '-')?.responsable;

    const encabezado = () =>
      drawNexaraHeader(doc, {
        docTitle: 'Reporte de evidencias',
        docSubtitle: 'Tickets con evidencia y el resultado de su revisión',
        accent: ACCENT,
        meta: [
          { label: 'Periodo', value: pdfPeriodo(datos.desde, datos.hasta) },
          { label: 'Generado', value: pdfFechaHora(datos.generadoEn) },
          ...(responsable ? [{ label: 'Responsable', value: responsable }] : []),
        ],
      });

    // ─── Resumen y lista ─────────────────────────────────────────────────────
    encabezado();
    drawSectionTitle(doc, 'Resumen');
    const altoTarjetas = drawKpiCards(doc, doc.y, [
      { label: 'Tickets', value: String(datos.filas.length), accent: ACCENT },
      { label: 'Aprobadas', value: String(datos.aprobadas), accent: '#2F855A' },
      { label: 'Rechazadas', value: String(datos.rechazadas), accent: '#C53030' },
      { label: 'Pendientes', value: String(datos.pendientes), accent: '#B7791F' },
    ]);
    doc.y += altoTarjetas + 18;

    drawSectionTitle(doc, 'Listado de tickets');
    if (!datos.filas.length) {
      doc
        .fillColor(PDF_COLORS.muted)
        .font(fuente(doc, 'texto'))
        .fontSize(10)
        .text('No hay actividades con evidencia en este periodo.', margin, doc.y + 6, { width: contentWidth });
    } else {
      const columns = [
        { label: 'Fecha', width: 112 },
        { label: 'Ticket', width: 62 },
        { label: 'Actividad', width: contentWidth - 112 - 62 - 72 - 56 },
        { label: 'Revisión', width: 72 },
        { label: 'Archivos', width: 56, align: 'center' as const },
      ];
      const ctx: PdfTableContext = {
        columns,
        headerAccent: PDF_COLORS.navy,
        fontSize: 8.5,
        onNewPage: () => {
          encabezado();
          drawSectionTitle(doc, 'Listado de tickets (continuación)');
        },
      };
      drawTableHeader(doc, doc.y, columns);
      doc.y += 30;
      datos.filas.forEach((fila, index) => {
        // El nombre de la actividad va completo: el renglón mide lo que haga falta.
        drawTableRow(
          doc,
          [fila.fecha ? pdfFechaHora(fila.fecha, FECHA_Y_HORA) : '-', fila.ticket, fila.actividad || 'Sin título', fila.estatus, String(fila.medios.length)],
          index,
          ctx,
        );
      });
    }

    // ─── Una hoja por ticket con archivos ────────────────────────────────────
    // Un ticket sin archivos ya está completo en la lista: antes abría una hoja solo para decir que no tenía.
    const conArchivos = datos.filas.filter((fila) => fila.medios.length > 0);
    conArchivos.forEach((fila, numero) => {
      const cabezaDeDetalle = (continuacion: boolean): number => {
        doc.addPage();
        encabezado();
        drawSectionTitle(doc, continuacion ? 'Detalle de evidencias (continuación)' : 'Detalle de evidencias');
        doc
          .fillColor(PDF_COLORS.navy)
          .font(fuente(doc, 'titulo'))
          .fontSize(14)
          .text(`Ticket ${fila.ticket}`, margin, doc.y, { width: contentWidth });
        doc.moveDown(0.2);
        doc.fillColor(PDF_COLORS.muted).font(fuente(doc, 'texto')).fontSize(9);
        // En la continuación basta con saber de qué ticket son las fotos.
        const renglones = continuacion
          ? [`Actividad: ${fila.actividad || '-'}`]
          : [
              `Detalle ${numero + 1} de ${conArchivos.length} · ${fila.fecha ? pdfFechaHora(fila.fecha, FECHA_Y_HORA) : 'Sin fecha'}`,
              `Actividad: ${fila.actividad || '-'}`,
              `Responsable: ${fila.responsable || '-'} · Sucursal: ${fila.sucursal || '-'}`,
              `Revisión: ${fila.estatus} · Prioridad: ${fila.prioridad}`,
            ];
        for (const renglon of renglones) doc.text(renglon, margin, doc.y, { width: contentWidth, lineGap: 1.5 });
        doc.moveDown(0.7);
        doc.fillColor(PDF_COLORS.text).font(fuente(doc, 'semi')).fontSize(10.5).text('Archivos de evidencia', margin, doc.y, { width: contentWidth });
        return doc.y + 8;
      };

      let y = cabezaDeDetalle(false);
      const hueco = 12;
      const anchoTarjeta = (contentWidth - hueco) / 2;
      // Tres filas de dos por hoja: con 150 pt de alto cabían dos y la tercera se iba a otra hoja.
      const altoTarjeta = 136;
      const altoRotulo = 22;
      let columna = 0;

      fila.medios.forEach((medio) => {
        if (columna === 0 && y + altoTarjeta + altoRotulo > fondo) y = cabezaDeDetalle(true);
        const x = columna === 0 ? margin : margin + anchoTarjeta + hueco;

        doc.save();
        doc.roundedRect(x, y, anchoTarjeta, altoTarjeta, 6).fill(PDF_COLORS.softGray);
        doc.restore();

        const aviso = (texto: string) =>
          doc
            .fillColor(PDF_COLORS.muted)
            .font(fuente(doc, 'texto'))
            .fontSize(9)
            .text(texto, x + 8, y + altoTarjeta / 2 - 6, { width: anchoTarjeta - 16, height: 12, align: 'center', ellipsis: true });

        if (medio.tipo === 'pdf') {
          aviso('PDF adjunto');
        } else if (!medio.ruta) {
          aviso('Archivo no disponible');
        } else {
          try {
            doc.image(medio.ruta, x + 4, y + 4, { fit: [anchoTarjeta - 8, altoTarjeta - 8], align: 'center', valign: 'center' });
          } catch {
            aviso('No se pudo cargar la imagen');
          }
        }

        doc
          .fillColor(PDF_COLORS.text)
          .font(fuente(doc, 'semi'))
          .fontSize(8.5)
          .text(medio.etiqueta, x, y + altoTarjeta + 6, { width: anchoTarjeta, height: 11, ellipsis: true });

        if (columna === 0) {
          columna = 1;
        } else {
          columna = 0;
          y += altoTarjeta + altoRotulo + 4;
        }
      });
    });

    drawNexaraFooterOnEveryPage(doc, 'NEXARA · Reporte de evidencias — documento generado automáticamente, información confidencial.');
    doc.end();
  });
}
