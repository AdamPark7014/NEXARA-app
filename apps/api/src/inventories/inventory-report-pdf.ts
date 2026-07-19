import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import path from 'path';
import {
  PDF_COLORS,
  PDF_CONTENT_START_Y,
  PDF_MODULE_ACCENTS,
  drawInfoCard,
  drawKpiCards,
  drawNexaraFooter,
  drawNexaraHeader,
  drawSectionTitle,
  drawTableHeader,
  drawTableRow,
  loadNexaraLogo,
  type PdfTableContext,
} from '../common/pdf/nexara-pdf-theme';

type InventoryReportInput = {
  snapshot: any;
  items: any[];
};

const ACCENT = PDF_MODULE_ACCENTS.warehouse;

const toLabel = (value?: string | null) => (value && String(value).trim() ? String(value) : '-');

const cleanUrl = (value?: string | null) => String(value || '').trim();

const resolveImageBuffer = async (url?: string | null): Promise<Buffer | null> => {
  const value = cleanUrl(url);
  if (!value) return null;

  try {
    if (value.startsWith('data:image')) {
      const base64 = value.split(',')[1] || '';
      return base64 ? Buffer.from(base64, 'base64') : null;
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
      const response = await fetch(value);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    const relative = value.replace(/^\/+/, '');
    const candidates = [
      path.resolve(process.cwd(), relative),
      path.resolve(process.cwd(), 'apps', 'api', relative),
      value,
    ];

    for (const filePath of candidates) {
      try {
        return await fs.readFile(filePath);
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
};

export const generateInventoryReportPdf = ({ snapshot, items }: InventoryReportInput): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    (async () => {
      const margin = doc.page.margins.left;
      const contentWidth = doc.page.width - margin * 2;
      const logo = loadNexaraLogo();

      const header = () =>
        drawNexaraHeader(doc, {
          docTitle: 'Reporte de inventario',
          docSubtitle: 'Inventario y mantenimiento de equipos',
          accent: ACCENT,
          logo,
          meta: [
            { label: 'Folio', value: `INV-${snapshot.id}` },
            { label: 'Estado', value: toLabel(snapshot.status) },
            {
              label: 'Actualizado',
              value: snapshot.updatedAt
                ? new Date(snapshot.updatedAt).toLocaleString('es-MX')
                : '-',
            },
          ],
        });

      header();

      drawSectionTitle(doc, 'Resumen');
      const kpiHeight = drawKpiCards(doc, doc.y, [
        {
          label: 'Equipos previos',
          value: String(snapshot.previousCount ?? 0),
          accent: ACCENT,
        },
        {
          label: 'Equipos actuales',
          value: String(snapshot.currentCount ?? 0),
          accent: ACCENT,
        },
        {
          label: 'Diferencia',
          value: String(snapshot.deltaCount ?? 0),
          accent: ACCENT,
        },
      ]);
      doc.y += kpiHeight + 16;

      const infoY = doc.y;
      const leftWidth = (contentWidth - 20) * 0.55;
      const rightWidth = contentWidth - leftWidth - 20;
      const clientH = drawInfoCard(doc, margin, infoY, leftWidth, [
        { label: 'Cliente', value: toLabel(snapshot.client?.name) },
        { label: 'Sucursal', value: toLabel(snapshot.branch?.name) },
        { label: 'No. sucursal', value: toLabel(snapshot.branch?.branchNumber) },
      ]);
      const metaH = drawInfoCard(doc, margin + leftWidth + 20, infoY, rightWidth, [
        { label: 'Estado', value: toLabel(snapshot.status) },
        { label: 'Folio', value: `INV-${snapshot.id}` },
        {
          label: 'Items',
          value: String(items?.length ?? 0),
        },
      ]);
      doc.y = infoY + Math.max(clientH, metaH) + 16;

      drawSectionTitle(doc, 'Detalle de equipos');

      const columns = [
        { label: 'Sección / Equipo', width: 150 },
        { label: 'Estado', width: 70 },
        { label: 'Comparativa', width: 80 },
        { label: 'Serie (antes→después)', width: 130 },
        { label: 'Modelo', width: contentWidth - 150 - 70 - 80 - 130 },
      ];

      const tableCtx: PdfTableContext = {
        columns,
        headerAccent: PDF_COLORS.navy,
        onNewPage: header,
        fontSize: 8,
      };

      drawTableHeader(doc, doc.y, columns);
      doc.y += 28;

      const list = items ?? [];
      list.forEach((item, index) => {
        const sectionEquip = `${toLabel(item.sectionName)} · ${toLabel(item.equipmentName)}`;
        const serial = `${toLabel(item.serialBefore)} → ${toLabel(item.serialAfter)}`;
        const model = `${toLabel(item.modelBefore)} → ${toLabel(item.modelAfter)}`;
        drawTableRow(
          doc,
          [
            sectionEquip,
            toLabel(item.itemStatus),
            toLabel(item.compareState),
            serial,
            model,
          ],
          index,
          tableCtx,
        );
      });

      if (list.length === 0) {
        doc
          .fillColor(PDF_COLORS.muted)
          .fontSize(10)
          .font('Helvetica')
          .text('Sin equipos registrados en este snapshot.', margin, doc.y);
        doc.moveDown();
      }

      const hasPhotos = list.some(
        (item) =>
          item.beforePanoramicPhotoUrl ||
          item.beforeCloseupPhotoUrl ||
          item.afterPanoramicPhotoUrl ||
          item.afterCloseupPhotoUrl ||
          item.maintenanceStickerPhotoUrl,
      );

      if (hasPhotos) {
        doc.moveDown(0.6);
        drawSectionTitle(doc, 'Evidencia fotográfica');

        for (const item of list) {
          const photoEntries = [
            { label: 'Panorámica ANTES', value: item.beforePanoramicPhotoUrl },
            { label: 'Serie/modelo ANTES', value: item.beforeCloseupPhotoUrl },
            { label: 'Panorámica DESPUÉS', value: item.afterPanoramicPhotoUrl },
            { label: 'Serie/modelo DESPUÉS', value: item.afterCloseupPhotoUrl },
            { label: 'Sticker mantenimiento', value: item.maintenanceStickerPhotoUrl },
          ].filter((e) => cleanUrl(e.value));

          if (photoEntries.length === 0) continue;

          if (doc.y + 40 > doc.page.height - 80) {
            doc.addPage();
            header();
            doc.y = PDF_CONTENT_START_Y;
          }

          doc
            .fillColor(PDF_COLORS.navy)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(
              `${toLabel(item.sectionName)} · ${toLabel(item.equipmentName)}`,
              margin,
              doc.y,
              { width: contentWidth },
            );
          doc.moveDown(0.3);

          if (item.maintenanceActions) {
            doc
              .fillColor(PDF_COLORS.text)
              .fontSize(8)
              .font('Helvetica')
              .text(`Trabajo: ${item.maintenanceActions}`, { width: contentWidth });
          }
          if (item.maintenanceComments) {
            doc
              .fillColor(PDF_COLORS.muted)
              .fontSize(8)
              .font('Helvetica')
              .text(`Comentarios: ${item.maintenanceComments}`, { width: contentWidth });
          }

          const cardWidth = 162;
          const cardHeight = 108;
          const gap = 10;
          const originY = doc.y + 4;

          for (let index = 0; index < photoEntries.length; index += 1) {
            const row = Math.floor(index / 3);
            const col = index % 3;
            let x = margin + col * (cardWidth + gap);
            let y = originY + row * (cardHeight + 20);

            if (y + cardHeight + 24 > doc.page.height - 60) {
              doc.addPage();
              header();
              doc.y = PDF_CONTENT_START_Y;
              x = margin + col * (cardWidth + gap);
              y = PDF_CONTENT_START_Y;
            }

            const entry = photoEntries[index];
            doc
              .fontSize(8)
              .fillColor(PDF_COLORS.muted)
              .font('Helvetica')
              .text(entry.label, x, y, { width: cardWidth, ellipsis: true });

            doc.save();
            doc.roundedRect(x, y + 10, cardWidth, cardHeight, 4).stroke(PDF_COLORS.line);
            doc.restore();

            const imageBuffer = await resolveImageBuffer(entry.value);
            if (imageBuffer) {
              try {
                doc.image(imageBuffer, x + 2, y + 12, {
                  fit: [cardWidth - 4, cardHeight - 4],
                  align: 'center',
                  valign: 'center',
                });
              } catch {
                doc
                  .fontSize(8)
                  .fillColor(PDF_COLORS.muted)
                  .text('Imagen inválida', x + 8, y + 50, {
                    width: cardWidth - 16,
                    align: 'center',
                  });
              }
            } else {
              doc
                .fontSize(8)
                .fillColor(PDF_COLORS.muted)
                .text('Sin imagen', x + 8, y + 50, {
                  width: cardWidth - 16,
                  align: 'center',
                });
            }
          }

          doc.y = originY + Math.ceil(photoEntries.length / 3) * (cardHeight + 20);
          doc.moveDown(0.4);
        }
      }

      drawNexaraFooter(doc, 'NEXARA · Reporte de inventario — información confidencial.');
      doc.end();
    })().catch(reject);
  });
};
