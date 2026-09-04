/**
 * Smoke: genera un PDF de OC de ejemplo sin DB.
 * Uso: npx tsx scripts/smoke-purchase-order-pdf.ts
 */
import fs from 'fs';
import path from 'path';
import { generatePurchaseOrderPdf } from '../src/procurement/purchase-order-pdf.js';

async function main() {
  const pdf = await generatePurchaseOrderPdf({
    poNumber: 'OC-2026-00042',
    status: 'CONFIRMED',
    orderDate: '2026-09-04',
    expectedDate: '2026-09-18',
    currency: 'MXN',
    paymentTerms: '30 días neto',
    shippingAddress: 'Av. Industrial 1200, Bodega B, Monterrey, N.L.',
    notes: 'Entregar con packing list. Incoterms DAP. Horario de recepción 9:00–16:00.',
    subtotal: 18500,
    taxAmount: 2960,
    totalAmount: 21460,
    company: {
      legalName: 'NEXARA TECNOLOGIA SA DE CV',
      tradeName: 'NEXARA',
      rfc: 'NTE010101AAA',
      fiscalAddress: 'Av. Reforma 100, Col. Centro',
      fiscalPostalCode: '64000',
      contactEmail: 'compras@nexara.com.mx',
      contactPhone: '+52 81 0000 0000',
      websiteUrl: 'nexara.com.mx',
    },
    vendor: {
      name: 'SYSCOM México',
      rfc: 'SYS850101XXX',
      creditoDias: 30,
      leadTimeDias: 5,
      esMayorista: true,
    },
    createdByName: 'Compras NEXARA',
    approvedByName: 'Dirección Administrativa',
    approvedAt: '2026-09-04',
    requisitionNumber: 'REQ-2026-0010',
    items: [
      {
        description: 'NVR 16ch Hikvision DS-7616NI-Q2',
        sku: 'HK-7616-Q2',
        unit: 'PZA',
        quantity: 2,
        unitPrice: 4500,
        taxRate: 16,
        lineTotal: 10440,
      },
      {
        description: 'Cámara IP AcuSense 4MP',
        sku: 'HK-2CD2046',
        unit: 'PZA',
        quantity: 8,
        unitPrice: 1187.5,
        taxRate: 16,
        lineTotal: 11020,
      },
    ],
  });

  const out = path.resolve(process.cwd(), 'tmp-smoke-oc.pdf');
  fs.writeFileSync(out, pdf);
  console.log(`OK ${pdf.length} bytes → ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
