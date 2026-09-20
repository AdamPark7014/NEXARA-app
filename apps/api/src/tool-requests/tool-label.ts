import PDFDocument from 'pdfkit';

export type ToolLabelPayload = {
  codigoInterno: string;
  barcode: string;
  toolName: string;
  model: string;
  serialNumber: string;
};

/** ZPL básico para impresora térmica (50×30 mm aprox.). */
export function buildToolLabelZpl(item: ToolLabelPayload): string {
  const code = (item.barcode || item.codigoInterno || item.serialNumber).slice(0, 40);
  const title = item.toolName.slice(0, 28);
  const model = `${item.model} · ${item.serialNumber}`.slice(0, 36);
  const interno = (item.codigoInterno || '').slice(0, 28);
  return [
    '^XA',
    '^CF0,28',
    `^FO40,30^FD${escapeZpl(title)}^FS`,
    '^CF0,22',
    `^FO40,70^FD${escapeZpl(model)}^FS`,
    `^FO40,100^FD${escapeZpl(interno)}^FS`,
    `^FO40,140^BY2^BCN,80,Y,N,N^FD${escapeZpl(code)}^FS`,
    '^XZ',
  ].join('\n');
}

function escapeZpl(value: string): string {
  return String(value || '').replace(/[\^~]/g, ' ');
}

/** Etiqueta PDF simple (carta partida, una etiqueta). */
export async function buildToolLabelPdf(item: ToolLabelPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [288, 144], margin: 12 }); // 4×2 in
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(11).font('Helvetica-Bold').text(item.toolName || 'Herramienta', { width: 264 });
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').text(`${item.model || '—'} · Serie ${item.serialNumber || '—'}`);
    if (item.codigoInterno) {
      doc.text(`Código: ${item.codigoInterno}`);
    }
    doc.moveDown(0.4);
    const code = item.barcode || item.codigoInterno || item.serialNumber;
    doc.font('Courier-Bold').fontSize(12).text(code, { width: 264, align: 'center' });
    doc.end();
  });
}
