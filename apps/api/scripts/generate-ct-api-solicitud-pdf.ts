/**
 * PDF mínimo — solo solicitud de credenciales CT-CONNECT.
 * Uso: npx ts-node scripts/generate-ct-api-solicitud-pdf.ts
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve(__dirname, '../../../docs/solicitud-ct-connect-api-nexara.pdf');

const M = 54;
const COLORS = { navy: '#0B1F3A', text: '#1E293B', muted: '#64748B', line: '#CBD5E1' };

const KEYS = [
  { key: 'CT_API_EMAIL', desc: 'Correo registrado en CT-CONNECT' },
  { key: 'CT_API_CLIENTE', desc: 'Número de cliente / distribuidor' },
  { key: 'CT_API_RFC', desc: 'RFC del distribuidor' },
  { key: 'CT_API_ALMACEN', desc: 'Almacén preferido (ej. 14A Puebla)' },
  { key: 'CT_API_BASE_URL', desc: 'URL API (si difiere de api.ctonline.mx)' },
];

function field(doc: PDFKit.PDFDocument, label: string, hint: string) {
  const y = doc.y;
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9.5).text(label, M, y);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(hint, M, y + 12);
  doc.strokeColor(COLORS.line).moveTo(M, y + 34).lineTo(doc.page.width - M, y + 34).stroke();
  doc.y = y + 44;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const doc = new PDFDocument({ size: 'LETTER', margin: M });
  const stream = fs.createWriteStream(OUT);
  doc.pipe(stream);

  doc.rect(0, 0, doc.page.width, 64).fill(COLORS.navy);
  doc.fillColor('#FFF').font('Helvetica-Bold').fontSize(18).text('NEXARA', M, 20);
  doc.font('Helvetica').fontSize(10).text('Solicitud de credenciales CT-CONNECT API', M, 42);

  doc.y = 84;
  doc.fillColor(COLORS.text).fontSize(10).font('Helvetica').text(
    'Estimado asesor CT Online:\n\n' +
      'Ya usamos el catálogo vía FTP. Para enviar pedidos desde nuestro sistema, ' +
      'favor de activar la API y proporcionar los siguientes datos:',
    { align: 'justify', lineGap: 3 },
  );
  doc.moveDown(0.8);

  KEYS.forEach(({ key, desc }) => field(doc, key, desc));

  doc.moveDown(0.6);
  doc.fillColor(COLORS.muted).fontSize(9).text('ventas@nexara.com.mx · sales.nexara.com.mx', { align: 'center' });

  doc.end();
  await new Promise<void>((res, rej) => { stream.on('finish', () => res()); stream.on('error', rej); });
  console.log(`PDF generado: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
