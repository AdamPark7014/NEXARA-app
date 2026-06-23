import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import path from 'path';

type InventoryReportInput = {
  snapshot: any;
  items: any[];
};

const toLabel = (value?: string | null) => (value && value.trim() ? value : '-');

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

const ensureSpace = (doc: PDFKit.PDFDocument, minHeight = 90) => {
  if (doc.y + minHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
};

export const generateInventoryReportPdf = ({ snapshot, items }: InventoryReportInput): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    (async () => {
      doc.fontSize(18).fillColor('#0f172a').text('Reporte de Inventario y Mantenimiento', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#475569').text(`Folio: INV-${snapshot.id}`);
      doc.text(`Cliente: ${toLabel(snapshot.client?.name)}`);
      doc.text(`Sucursal: ${toLabel(snapshot.branch?.name)} (${toLabel(snapshot.branch?.branchNumber)})`);
      doc.text(`Estado: ${toLabel(snapshot.status)}`);
      doc.text(`Equipos previos: ${snapshot.previousCount ?? 0}`);
      doc.text(`Equipos actuales: ${snapshot.currentCount ?? 0}`);
      doc.text(`Diferencia: ${snapshot.deltaCount ?? 0}`);
      doc.text(`Actualizado: ${snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString('es-MX') : '-'}`);
      doc.moveDown();

      const groups = new Map<string, any[]>();
      for (const item of items) {
        const group = item.groupName || 'GENERAL';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(item);
      }

      for (const [groupName, groupItems] of groups.entries()) {
        ensureSpace(doc, 40);
        doc.fillColor('#0f6ad6').fontSize(13).text(groupName);
        doc.fillColor('#111').fontSize(9).moveDown(0.25);

        for (const item of groupItems) {
          ensureSpace(doc, 220);
          doc.roundedRect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left * 2, 18, 6).fillOpacity(0.05).fillAndStroke('#0f6ad6', '#93c5fd').fillOpacity(1);
          doc.fillColor('#0f172a').fontSize(10).text(
            `${toLabel(item.sectionName)} · ${toLabel(item.equipmentName)} · Estado: ${toLabel(item.itemStatus)} · Comparativa: ${toLabel(item.compareState)}`,
            doc.page.margins.left + 8,
            doc.y - 14,
          );
          doc.moveDown(0.6);

          doc.fillColor('#334155').fontSize(9).text(`Antes -> Serie: ${toLabel(item.serialBefore)} | Modelo: ${toLabel(item.modelBefore)}`);
          doc.text(`Después -> Serie: ${toLabel(item.serialAfter)} | Modelo: ${toLabel(item.modelAfter)}`);
          if (item.maintenanceActions) doc.text(`Trabajo realizado: ${item.maintenanceActions}`);
          if (item.maintenanceComments) doc.text(`Comentarios técnicos: ${item.maintenanceComments}`);
          if (item.notes) doc.text(`Notas: ${item.notes}`);
          doc.moveDown(0.4);

          const photoEntries = [
            { label: 'Panorámica ANTES', value: item.beforePanoramicPhotoUrl },
            { label: 'Serie/modelo ANTES', value: item.beforeCloseupPhotoUrl },
            { label: 'Panorámica DESPUÉS', value: item.afterPanoramicPhotoUrl },
            { label: 'Serie/modelo DESPUÉS', value: item.afterCloseupPhotoUrl },
            { label: 'Sticker mantenimiento', value: item.maintenanceStickerPhotoUrl },
          ];

          const originY = doc.y;
          const cardWidth = 162;
          const cardHeight = 108;
          const gap = 10;

          for (let index = 0; index < photoEntries.length; index += 1) {
            const row = Math.floor(index / 3);
            const col = index % 3;
            const x = doc.page.margins.left + col * (cardWidth + gap);
            const y = originY + row * (cardHeight + 20);

            if (y + cardHeight + 24 > doc.page.height - doc.page.margins.bottom) {
              doc.addPage();
            }

            const entry = photoEntries[index];
            doc.fontSize(8).fillColor('#475569').text(entry.label, x, y, { width: cardWidth, ellipsis: true });
            doc.roundedRect(x, y + 10, cardWidth, cardHeight, 4).stroke('#cbd5e1');

            const imageBuffer = await resolveImageBuffer(entry.value);
            if (imageBuffer) {
              try {
                doc.image(imageBuffer, x + 2, y + 12, {
                  fit: [cardWidth - 4, cardHeight - 4],
                  align: 'center',
                  valign: 'center',
                });
              } catch {
                doc.fontSize(8).fillColor('#94a3b8').text('Imagen inválida', x + 8, y + 50, { width: cardWidth - 16, align: 'center' });
              }
            } else {
              doc.fontSize(8).fillColor('#94a3b8').text('Sin imagen', x + 8, y + 50, { width: cardWidth - 16, align: 'center' });
            }
          }

          doc.y = originY + Math.ceil(photoEntries.length / 3) * (cardHeight + 20);
          doc.moveDown(0.4);
        }

        doc.moveDown(0.4);
      }

      doc.end();
    })().catch(reject);
  });
};
