import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export type CotizacionPdfItem = {
  category?: string | null;
  name: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  sku?: string | null;
  partNumber?: string | null;
  batchReference?: string | null;
  unit?: string | null;
  qty: number;
  unitPrice: number;
  discount: number;
  tax: number;
  ieps?: number;
  retention?: number;
  laborHours?: number;
  laborRate?: number;
  warrantyMonths?: number;
  deliveryTime?: string | null;
  lineTotal: number;
};

export type CotizacionPdfPayload = {
  quoteNumber: string;
  issueDate: string;
  validUntil?: string | null;
  status: string;
  clientName?: string | null;
  clientCompany?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  projectName?: string | null;
  scope?: string | null;
  paymentTerms?: string | null;
  deliveryTime?: string | null;
  preparedBy?: string | null;
  preparedRole?: string | null;
  currency: string;
  depositPercent: number;
  note?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  iepsTotal?: number;
  retentionTotal?: number;
  total: number;
  items: CotizacionPdfItem[];
};

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);

const toText = (value?: string | number | null) => (value ? String(value) : '—');

const formatDisplayDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: 'Borrador',
    SENT: 'Enviada',
    APPROVED: 'Aprobada',
    REJECTED: 'Rechazada',
    EXPIRED: 'Vencida',
  };
  return map[status] || status;
};

const DEFAULT_EXCLUSIONS = [
  'Obra civil, canalización, postes, bases y demoliciones no descritas en el alcance.',
  'Gestión de permisos municipales, prediales o de terceros no listados.',
  'Consumibles eléctricos fuera de lo especificado (cableado adicional, ductos, breakers).',
  'Equipos o licencias de terceros no incluidos en las partidas.',
  'Servicios fuera de horario laboral estándar, salvo convenio escrito.',
];

const DEFAULT_WARRANTY = [
  'Garantía de equipos conforme a fabricante (mínimo 12 meses salvo especificación por partida).',
  'Garantía de instalación Nexara: 90 días sobre mano de obra realizada por nuestro personal.',
  'No aplica garantía por mal uso, daños por terceros, variaciones eléctricas o falta de mantenimiento.',
];

const DEFAULT_VALIDITY = [
  'Precios sujetos a disponibilidad de inventario del mayorista al momento de confirmar la orden.',
  'Tipo de cambio y costos de importación pueden ajustar precios en partidas USD al confirmar.',
  'La vigencia de esta propuesta aplica solo sobre el alcance y cantidades aquí descritas.',
];

const loadLogo = () => {
  const candidates = [
    path.resolve(process.cwd(), '../web/public/logo-nexara-platform.png'),
    path.resolve(process.cwd(), '../../apps/web/public/logo-nexara-platform.png'),
    path.resolve(process.cwd(), '../web/public/logo-nexara.png'),
    path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'),
    path.resolve(process.cwd(), 'dist/assets/logo-nexara.png'),
    path.resolve(process.cwd(), 'src/assets/logo-nexara.png'),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
    } catch {
      // ignore
    }
  }
  return null;
};

export const generateCotizacionPdf = (payload: CotizacionPdfPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error) => reject(error));

    const colors = {
      navy: '#0B1F3A',
      blue: '#0F766E',
      accent: '#14B8A6',
      light: '#ECFDF8',
      softGray: '#F8FAFC',
      text: '#0F172A',
      muted: '#64748B',
      line: '#E2E8F0',
      white: '#FFFFFF',
    };

    const margin = doc.page.margins.left;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - margin * 2;
    const logo = loadLogo();
    let pageNo = 1;

    const footer = () => {
      const y = pageHeight - 36;
      doc.save();
      doc.moveTo(margin, y - 8).lineTo(margin + contentWidth, y - 8).strokeColor(colors.line).lineWidth(0.6).stroke();
      doc.fillColor(colors.muted).fontSize(8).font('Helvetica');
      doc.text('NEXARA · Propuesta comercial confidencial', margin, y, { width: contentWidth * 0.7 });
      doc.text(`Pág. ${pageNo}`, margin, y, { width: contentWidth, align: 'right' });
      doc.restore();
    };

    const newPage = () => {
      footer();
      doc.addPage();
      pageNo += 1;
    };

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > pageHeight - 56) {
        newPage();
        drawPageChrome();
        doc.y = 58;
      }
    };

    const drawPageChrome = () => {
      doc.save();
      doc.rect(0, 0, pageWidth, 8).fill(colors.blue);
      doc.restore();
    };

    const sectionTitle = (label: string) => {
      ensureSpace(36);
      doc.fillColor(colors.navy).fontSize(12).font('Helvetica-Bold').text(label, margin, doc.y);
      doc
        .moveTo(margin, doc.y + 4)
        .lineTo(margin + 56, doc.y + 4)
        .strokeColor(colors.accent)
        .lineWidth(2)
        .stroke();
      doc.moveDown(0.8);
    };

    const bulletList = (items: string[]) => {
      doc.fillColor(colors.text).fontSize(9.5).font('Helvetica');
      for (const item of items) {
        ensureSpace(28);
        const y = doc.y;
        doc.fillColor(colors.accent).text('•', margin, y, { width: 12 });
        doc.fillColor(colors.text).text(item, margin + 14, y, { width: contentWidth - 14 });
        doc.moveDown(0.35);
      }
    };

    // ── Portada ──────────────────────────────────────────────────────────
    doc.save();
    doc.rect(0, 0, pageWidth, pageHeight).fill(colors.navy);
    doc.rect(0, pageHeight * 0.62, pageWidth, pageHeight * 0.38).fill(colors.blue);
    doc.restore();

    if (logo) {
      try {
        doc.image(logo, margin, 56, { fit: [72, 72] });
      } catch {
        // ignore corrupt logo
      }
    }

    doc.fillColor(colors.white).fontSize(28).font('Helvetica-Bold').text('NEXARA', margin, 150, {
      width: contentWidth,
    });
    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#99F6E4')
      .text('Integración tecnológica · CCTV · Redes · Soporte TI', margin, 186, { width: contentWidth });

    doc
      .fillColor(colors.white)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('Propuesta comercial', margin, 250, { width: contentWidth });

    doc
      .fontSize(14)
      .font('Helvetica')
      .fillColor('#E2E8F0')
      .text(payload.projectName || 'Solución tecnológica a la medida', margin, 284, {
        width: contentWidth * 0.85,
      });

    const coverMetaY = 360;
    doc.fillColor('#99F6E4').fontSize(9).font('Helvetica-Bold').text('FOLIO', margin, coverMetaY);
    doc.fillColor(colors.white).fontSize(16).font('Helvetica-Bold').text(payload.quoteNumber, margin, coverMetaY + 14);

    doc.fillColor('#99F6E4').fontSize(9).font('Helvetica-Bold').text('CLIENTE', margin + 220, coverMetaY);
    doc
      .fillColor(colors.white)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(payload.clientCompany || payload.clientName || 'Cliente', margin + 220, coverMetaY + 14, {
        width: contentWidth - 220,
      });

    doc.fillColor('#99F6E4').fontSize(9).font('Helvetica-Bold').text('EMISIÓN', margin, coverMetaY + 70);
    doc
      .fillColor(colors.white)
      .fontSize(11)
      .font('Helvetica')
      .text(formatDisplayDate(payload.issueDate), margin, coverMetaY + 84);

    doc.fillColor('#99F6E4').fontSize(9).font('Helvetica-Bold').text('VIGENCIA', margin + 220, coverMetaY + 70);
    doc
      .fillColor(colors.white)
      .fontSize(11)
      .font('Helvetica')
      .text(formatDisplayDate(payload.validUntil), margin + 220, coverMetaY + 84);

    doc
      .fillColor(colors.white)
      .fontSize(10)
      .font('Helvetica')
      .text(`Total propuesto: ${formatMoney(payload.total, payload.currency)}`, margin, pageHeight - 120, {
        width: contentWidth,
      });
    doc
      .fontSize(9)
      .fillColor('#CCFBF1')
      .text(
        `Elaboró: ${payload.preparedBy || 'Equipo comercial Nexara'}${payload.preparedRole ? ` · ${payload.preparedRole}` : ''}`,
        margin,
        pageHeight - 98,
        { width: contentWidth },
      );
    doc
      .fontSize(8)
      .fillColor('#99F6E4')
      .text('Documento confidencial. Uso exclusivo del destinatario.', margin, pageHeight - 70, {
        width: contentWidth,
      });

    // ── Página comercial ─────────────────────────────────────────────────
    newPage();
    drawPageChrome();
    doc.y = 36;

    doc.fillColor(colors.navy).fontSize(16).font('Helvetica-Bold').text('Detalle de la propuesta', margin, doc.y);
    doc
      .fillColor(colors.muted)
      .fontSize(9)
      .font('Helvetica')
      .text(`${statusLabel(payload.status)} · ${payload.currency}`, margin, doc.y + 4);
    doc.moveDown(1.2);

    sectionTitle('Cliente y proyecto');

    const cardPad = 10;
    const leftW = (contentWidth - 14) * 0.52;
    const rightW = contentWidth - leftW - 14;
    const infoY = doc.y;

    const drawCard = (
      x: number,
      y: number,
      w: number,
      title: string,
      rows: Array<{ label: string; value: string }>,
    ) => {
      let innerY = y + cardPad + 16;
      const rowHeights = rows.map((r) =>
        Math.max(12, doc.heightOfString(r.value || '—', { width: w - cardPad * 2 - 78 })),
      );
      const h = cardPad * 2 + 16 + rowHeights.reduce((a, b) => a + b + 6, 0);
      doc.save();
      doc.roundedRect(x, y, w, h, 8).fill(colors.softGray);
      doc.restore();
      doc.fillColor(colors.navy).fontSize(10).font('Helvetica-Bold').text(title, x + cardPad, y + cardPad);
      rows.forEach((r, i) => {
        doc.fillColor(colors.muted).fontSize(8).font('Helvetica').text(r.label, x + cardPad, innerY, { width: 72 });
        doc
          .fillColor(colors.text)
          .fontSize(9)
          .font('Helvetica')
          .text(r.value || '—', x + cardPad + 76, innerY, { width: w - cardPad * 2 - 78 });
        innerY += rowHeights[i] + 6;
      });
      return h;
    };

    const h1 = drawCard(margin, infoY, leftW, 'Cliente', [
      { label: 'Empresa', value: toText(payload.clientCompany) },
      { label: 'Contacto', value: toText(payload.clientName) },
      { label: 'Email', value: toText(payload.clientEmail) },
      { label: 'Teléfono', value: toText(payload.clientPhone) },
      { label: 'Dirección', value: toText(payload.clientAddress) },
    ]);
    const h2 = drawCard(margin + leftW + 14, infoY, rightW, 'Proyecto', [
      { label: 'Nombre', value: toText(payload.projectName) },
      { label: 'Alcance', value: toText(payload.scope) },
      { label: 'Entrega', value: toText(payload.deliveryTime) },
      { label: 'Pago', value: toText(payload.paymentTerms) },
      { label: 'Anticipo', value: payload.depositPercent ? `${payload.depositPercent}%` : '—' },
    ]);
    doc.y = infoY + Math.max(h1, h2) + 18;

    if (payload.scope) {
      sectionTitle('Alcance incluido');
      doc.fillColor(colors.text).fontSize(9.5).font('Helvetica').text(payload.scope, margin, doc.y, {
        width: contentWidth,
        align: 'left',
      });
      doc.moveDown(0.8);
    }

    sectionTitle('Conceptos y partidas');

    const columns = [
      { label: '#', width: 22 },
      { label: 'Concepto', width: 188 },
      { label: 'Marca / Modelo', width: 88 },
      { label: 'Cant', width: 32 },
      { label: 'P. Unit', width: 58 },
      { label: 'Imp.', width: 48 },
      { label: 'Total', width: 54 },
    ];

    const drawTableHeader = (y: number) => {
      doc.save();
      doc.roundedRect(margin, y, contentWidth, 22, 4).fill(colors.navy);
      doc.restore();
      doc.fillColor(colors.white).fontSize(8).font('Helvetica-Bold');
      let x = margin + 6;
      columns.forEach((col) => {
        doc.text(col.label, x, y + 7, { width: col.width - 6 });
        x += col.width;
      });
    };

    const ensureTableSpace = (needed: number) => {
      if (doc.y + needed > pageHeight - 56) {
        newPage();
        drawPageChrome();
        doc.y = 48;
        drawTableHeader(doc.y);
        doc.y += 28;
      }
    };

    drawTableHeader(doc.y);
    doc.y += 28;

    payload.items.forEach((item, index) => {
      const laborLine =
        item.laborHours || item.laborRate
          ? `MO: ${item.laborHours || 0}h × ${formatMoney(item.laborRate || 0, payload.currency)}`
          : null;
      const warrantyLine = item.warrantyMonths ? `Garantía: ${item.warrantyMonths} meses` : null;
      const deliveryLine = item.deliveryTime ? `Entrega: ${item.deliveryTime}` : null;
      const metaLine = [item.category, item.sku, item.partNumber].filter(Boolean).join(' · ');
      const conceptText = [
        item.name,
        item.description || null,
        metaLine || null,
        laborLine,
        warrantyLine,
        deliveryLine,
      ]
        .filter(Boolean)
        .join('\n');
      const brandText = [item.brand, item.model].filter(Boolean).join('\n') || '—';
      const taxText = `IVA ${item.tax || 0}%`;

      const heights = [
        doc.heightOfString(String(index + 1), { width: columns[0].width - 6 }),
        doc.heightOfString(conceptText, { width: columns[1].width - 6 }),
        doc.heightOfString(brandText, { width: columns[2].width - 6 }),
        doc.heightOfString(String(item.qty), { width: columns[3].width - 6 }),
        doc.heightOfString(formatMoney(item.unitPrice, payload.currency), { width: columns[4].width - 6 }),
        doc.heightOfString(taxText, { width: columns[5].width - 6 }),
        doc.heightOfString(formatMoney(item.lineTotal, payload.currency), { width: columns[6].width - 6 }),
      ];
      const rowHeight = Math.max(...heights) + 10;
      ensureTableSpace(rowHeight + 6);

      const rowY = doc.y;
      if (index % 2 === 1) {
        doc.save();
        doc.rect(margin, rowY - 3, contentWidth, rowHeight).fill(colors.softGray);
        doc.restore();
      }

      doc.fillColor(colors.text).fontSize(8.5).font('Helvetica');
      let x = margin + 6;
      const cells = [
        String(index + 1),
        conceptText,
        brandText,
        String(item.qty),
        formatMoney(item.unitPrice, payload.currency),
        taxText,
        formatMoney(item.lineTotal, payload.currency),
      ];
      cells.forEach((cell, i) => {
        doc.font(i === 6 ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(cell, x, rowY, { width: columns[i].width - 6 });
        x += columns[i].width;
      });
      doc.y = rowY + rowHeight;
    });

    // Resumen financiero
    ensureSpace(150);
    doc.moveDown(0.6);
    const summaryW = 250;
    const summaryX = margin + contentWidth - summaryW;
    const summaryRows: Array<[string, string, boolean]> = [
      ['Subtotal', formatMoney(payload.subtotal, payload.currency), false],
      ['Descuentos', `− ${formatMoney(payload.discountTotal, payload.currency)}`, false],
      ['IVA', formatMoney(payload.taxTotal, payload.currency), false],
    ];
    if ((payload.iepsTotal || 0) > 0) {
      summaryRows.push(['IEPS', formatMoney(payload.iepsTotal || 0, payload.currency), false]);
    }
    if ((payload.retentionTotal || 0) > 0) {
      summaryRows.push(['Retenciones', `− ${formatMoney(payload.retentionTotal || 0, payload.currency)}`, false]);
    }
    summaryRows.push(['Total', formatMoney(payload.total, payload.currency), true]);
    if (payload.depositPercent > 0) {
      const depositAmt = (payload.total * payload.depositPercent) / 100;
      summaryRows.push([
        `Anticipo ${payload.depositPercent}%`,
        formatMoney(depositAmt, payload.currency),
        false,
      ]);
    }

    const boxH = 18 + summaryRows.length * 16 + 14;
    doc.save();
    doc.roundedRect(summaryX, doc.y, summaryW, boxH, 8).fill(colors.light);
    doc.restore();
    let sy = doc.y + 12;
    doc.fillColor(colors.navy).fontSize(10).font('Helvetica-Bold').text('Resumen financiero', summaryX + 12, sy);
    sy += 18;
    summaryRows.forEach(([label, value, strong]) => {
      doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(strong ? colors.navy : colors.text);
      doc.text(label, summaryX + 12, sy, { width: summaryW - 24 });
      doc.text(value, summaryX + 12, sy, { width: summaryW - 24, align: 'right' });
      sy += 16;
    });
    doc.y = doc.y + boxH + 16;

    // ── Condiciones ──────────────────────────────────────────────────────
    newPage();
    drawPageChrome();
    doc.y = 40;
    doc.fillColor(colors.navy).fontSize(16).font('Helvetica-Bold').text('Condiciones comerciales', margin, doc.y);
    doc.moveDown(1);

    sectionTitle('Vigencia de la propuesta');
    doc
      .fillColor(colors.text)
      .fontSize(9.5)
      .font('Helvetica')
      .text(
        `Esta cotización es válida hasta el ${formatDisplayDate(payload.validUntil)}. ` +
          'Después de esa fecha, precios y disponibilidad pueden cambiar sin previo aviso.',
        margin,
        doc.y,
        { width: contentWidth },
      );
    doc.moveDown(0.5);
    bulletList(DEFAULT_VALIDITY);

    sectionTitle('Términos de pago y entrega');
    if (payload.paymentTerms) {
      doc.fillColor(colors.text).fontSize(9.5).font('Helvetica').text(`Pago: ${payload.paymentTerms}`, {
        width: contentWidth,
      });
      doc.moveDown(0.3);
    }
    if (payload.deliveryTime) {
      doc.fillColor(colors.text).fontSize(9.5).font('Helvetica').text(`Entrega: ${payload.deliveryTime}`, {
        width: contentWidth,
      });
      doc.moveDown(0.3);
    }
    if (payload.depositPercent > 0) {
      doc
        .fillColor(colors.text)
        .fontSize(9.5)
        .font('Helvetica')
        .text(
          `Anticipo solicitado: ${payload.depositPercent}% (${formatMoney(
            (payload.total * payload.depositPercent) / 100,
            payload.currency,
          )}). El saldo se liquida según los términos acordados.`,
          { width: contentWidth },
        );
      doc.moveDown(0.3);
    }

    sectionTitle('Garantías');
    const warrantyFromItems = Array.from(
      new Set(
        payload.items
          .filter((i) => i.warrantyMonths && i.warrantyMonths > 0)
          .map((i) => `${i.name}: ${i.warrantyMonths} meses`),
      ),
    ).slice(0, 8);
    bulletList([...DEFAULT_WARRANTY, ...warrantyFromItems.map((w) => `Partida — ${w}`)]);

    sectionTitle('Exclusiones (fuera de alcance)');
    bulletList(DEFAULT_EXCLUSIONS);

    if (payload.note) {
      sectionTitle('Notas adicionales');
      doc.fillColor(colors.text).fontSize(9.5).font('Helvetica').text(payload.note, {
        width: contentWidth,
      });
      doc.moveDown(0.6);
    }

    sectionTitle('Aceptación');
    doc
      .fillColor(colors.muted)
      .fontSize(9)
      .font('Helvetica')
      .text(
        'Al firmar, el cliente acepta el alcance, precios, vigencia y exclusiones de esta propuesta.',
        { width: contentWidth },
      );
    doc.moveDown(1.4);

    const sigW = (contentWidth - 24) / 2;
    const sigY = doc.y;
    const drawSig = (x: number, title: string, subtitle: string) => {
      doc
        .moveTo(x, sigY + 48)
        .lineTo(x + sigW, sigY + 48)
        .strokeColor(colors.line)
        .lineWidth(1)
        .stroke();
      doc.fillColor(colors.navy).fontSize(9).font('Helvetica-Bold').text(title, x, sigY + 56, { width: sigW });
      doc.fillColor(colors.muted).fontSize(8).font('Helvetica').text(subtitle, x, sigY + 70, { width: sigW });
    };
    drawSig(margin, 'Por Nexara', `${payload.preparedBy || 'Equipo comercial'} · Firma / sello`);
    drawSig(margin + sigW + 24, 'Por el cliente', 'Nombre, cargo y firma de aceptación');

    footer();
    doc.end();
  });
};
