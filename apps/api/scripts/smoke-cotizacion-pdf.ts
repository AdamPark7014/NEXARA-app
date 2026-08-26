import fs from 'fs';
import path from 'path';
import { generateCotizacionPdf } from '../src/cotizaciones/cotizacion-pdf';

const sampleItems = Array.from({ length: 18 }, (_, i) => ({
  name: `Cámara IP domo 4MP PoE modelo ${i + 1}`,
  description: 'Incluye lente 2.8mm, IR 30m, carcasa IP67 y accesorios de montaje en pared.',
  brand: 'Hikvision',
  model: `DS-2CD2143G2-I${String(i + 1).padStart(2, '0')}`,
  sku: `HIK-DOME-4MP-${1000 + i}`,
  qty: i % 3 === 0 ? 12 : 4,
  unitPrice: 2890 + i * 120,
  discount: 0,
  tax: 16,
  lineTotal: (i % 3 === 0 ? 12 : 4) * (2890 + i * 120) * 1.16,
}));

async function main() {
  const pdf = await generateCotizacionPdf({
    quoteNumber: 'COT-2026-0042',
    issueDate: '2026-08-22',
    validUntil: '2026-09-22',
    status: 'SENT',
    clientName: 'Ing. Carlos Mendoza',
    clientCompany: 'Grupo Industrial del Norte SA de CV',
    clientEmail: 'compras@ginorte.mx',
    clientPhone: '+52 81 8000 1234',
    clientAddress: 'Av. Constitución 1200, Col. Centro, Monterrey, N.L. CP 64000',
    projectName: 'Sistema de videovigilancia planta baja y accesos',
    scope: 'Suministro, instalación y puesta en marcha de 18 cámaras IP con NVR y cableado estructurado.',
    paymentTerms: '50% anticipo, 50% contra entrega',
    deliveryTime: '15 días hábiles',
    preparedBy: 'María López',
    preparedRole: 'Ejecutiva comercial',
    currency: 'MXN',
    depositPercent: 50,
    note: 'Precios en MXN. Instalación en horario laboral. No incluye obra civil.',
    subtotal: sampleItems.reduce((s, i) => s + i.qty * i.unitPrice, 0),
    discountTotal: 0,
    taxTotal: sampleItems.reduce((s, i) => s + i.qty * i.unitPrice * 0.16, 0),
    total: sampleItems.reduce((s, i) => s + i.lineTotal, 0),
    items: sampleItems,
  });

  const out = path.resolve(__dirname, '../../tmp/cotizacion-smoke.pdf');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, pdf);
  console.log(`PDF generado: ${out} (${pdf.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
