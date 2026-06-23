import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export type FinancialReportPayload = {
  fromDate?: string;
  toDate?: string;
  asOfDate?: string;
  trialBalance: Array<{
    code: string;
    name: string;
    type: string;
    debit: number;
    credit: number;
    balance: number;
  }>;
  incomeStatement: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    revenue: Array<{
      code: string;
      name: string;
      amount: number;
    }>;
    expenses: Array<{
      code: string;
      name: string;
      amount: number;
    }>;
  };
  balanceSheet: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balanceCheck: boolean;
    assets: Array<{
      code: string;
      name: string;
      balance: number;
    }>;
    liabilities: Array<{
      code: string;
      name: string;
      balance: number;
    }>;
    equity: Array<{
      code: string;
      name: string;
      balance: number;
    }>;
  };
};

const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value || 0);

const truncate = (text: string | null | undefined, max: number) => {
  if (!text) return '-';
  return text.length <= max ? text : text.slice(0, max - 3) + '...';
};

const loadLogo = (): Buffer | null => {
  const candidates = [
    path.resolve(process.cwd(), '../web/public/logo-nexara.png'),
    path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
    } catch { /* ignore */ }
  }
  return null;
};

export const generateFinancialReportsPdf = (payload: FinancialReportPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    // NO usar bufferPages: true - causa que se creen páginas fantasma
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const colors = {
      navy: '#0B1F3A',
      blue: '#1F6BBA',
      lightBlue: '#E3F2FD',
      softGray: '#F5F7FB',
      text: '#1F2A37',
      muted: '#5B6B7A',
      line: '#D9E2EC',
      success: '#166534',
      successBg: '#DCFCE7',
      warning: '#92400E',
      warningBg: '#FEF3C7',
      danger: '#991B1B',
      dangerBg: '#FEE2E2',
    };

    const margin = 40;
    const pageWidth = 612; // A4 width in points
    const pageHeight = 792; // A4 height in points
    const contentWidth = pageWidth - margin * 2;
    const logo = loadLogo();
    const totalPages = 3; // Siempre son 3 páginas

    const drawHeader = () => {
      doc.save();
      doc.rect(0, 0, pageWidth, 100).fill('#FFFFFF');
      doc.restore();

      if (logo) {
        doc.image(logo, margin, 12, { width: 32, height: 32 });
      }

      const titleX = margin + (logo ? 40 : 0);
      const metaX = titleX + 260;

      doc.fillColor(colors.navy).fontSize(20).font('Helvetica-Bold')
        .text('Reportes Financieros', titleX, 20, { width: 260 });
      doc.fontSize(10).font('Helvetica').fillColor(colors.muted)
        .text('Balance general, estado de resultados y balanza de comprobación', titleX, 46, { width: 260 });

      const from = payload.fromDate ? formatDate(payload.fromDate) : '-';
      const to = payload.toDate ? formatDate(payload.toDate) : formatDate(new Date());
      const asOf = payload.asOfDate ? formatDate(payload.asOfDate) : formatDate(new Date());

      doc.save();
      doc.roundedRect(metaX - 12, 12, 182, 76, 6).fill('#FFFFFF');
      doc.restore();

      doc.fillColor(colors.text).fontSize(9).font('Helvetica-Bold')
        .text('Período (Resultados)', metaX, 20, { width: 150, align: 'left' });
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
        .text(`${from} -`, metaX, 33, { width: 150, align: 'left', lineBreak: true })
        .text(`${to}`, metaX, 45, { width: 150, align: 'left' });

      doc.fillColor(colors.text).fontSize(9).font('Helvetica-Bold')
        .text('Corte (Balance)', metaX + 92, 20, { width: 70, align: 'left' });
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
        .text(asOf, metaX + 92, 33, { width: 70, align: 'left' });

      doc.fillColor(colors.text).fontSize(9).font('Helvetica-Bold')
        .text('Generado', metaX + 92, 58, { width: 70, align: 'left' });
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
        .text(formatDate(new Date()), metaX + 92, 71, { width: 70, align: 'left' });
    };

    const drawSectionTitle = (label: string) => {
      doc.moveDown(0.6);
      doc.fillColor(colors.navy).fontSize(12).font('Helvetica-Bold').text(label, margin, doc.y);
      doc.moveDown(0.2);
    };

    const drawKpiGrid = (y: number) => {
      const cardW = (contentWidth - 10) / 2;
      const cardH = 50;
      const gap = 10;

      const kpis = [
        { label: 'Activos', value: formatMoney(payload.balanceSheet.totalAssets), valueFill: colors.blue, bg: colors.lightBlue },
        { label: 'Pasivos', value: formatMoney(payload.balanceSheet.totalLiabilities), valueFill: colors.danger, bg: colors.dangerBg },
        { label: 'Capital', value: formatMoney(payload.balanceSheet.totalEquity), valueFill: colors.success, bg: colors.successBg },
        { label: 'Utilidad Neta', value: formatMoney(payload.incomeStatement.netIncome), valueFill: payload.incomeStatement.netIncome >= 0 ? colors.success : colors.danger, bg: payload.incomeStatement.netIncome >= 0 ? colors.successBg : colors.dangerBg },
      ];

      kpis.forEach((kpi, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = margin + col * (cardW + gap);
        const cy = y + row * (cardH + gap);

        doc.save();
        doc.roundedRect(x, cy, cardW, cardH, 6).fill(kpi.bg);
        doc.restore();
        doc.fillColor(kpi.valueFill).fontSize(18).font('Helvetica-Bold')
          .text(kpi.value, x + 14, cy + 10, { width: cardW - 28 });
        doc.fillColor(colors.muted).fontSize(9).font('Helvetica')
          .text(kpi.label, x + 14, cy + 32, { width: cardW - 28 });
      });

      return 2 * (cardH + gap) - gap;
    };

    const drawTableHeader = (y: number, cols: Array<{ label: string; width: number }>) => {
      doc.save();
      doc.rect(margin, y - 4, contentWidth, 24).fill(colors.navy);
      doc.restore();

      let x = margin + 6;
      doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
      cols.forEach((col) => {
        doc.text(col.label, x, y, { width: col.width - 8 });
        x += col.width;
      });
    };

    const addFooter = (pageNum: number) => {
      doc.save();
      doc.rect(0, pageHeight - 28, pageWidth, 28).fill(colors.lightBlue);
      doc.restore();
      doc.fillColor(colors.muted).fontSize(8).font('Helvetica')
        .text(
          `NEXARA  |  Reportes Financieros  |  Página ${pageNum} de ${totalPages}  |  Generado: ${new Date().toLocaleString('es-MX')}`,
          margin, pageHeight - 18, { width: contentWidth, align: 'center' },
        );
    };

    // ═══════════════════════════════════════════════════════════════════════
    // PAGE 1: BALANCE GENERAL
    // ═══════════════════════════════════════════════════════════════════════
    drawHeader();
    doc.y = 140;

    drawSectionTitle('Resumen Ejecutivo');
    const kpiGridY = doc.y;
    const kpiGridH = drawKpiGrid(kpiGridY);
    doc.y = kpiGridY + kpiGridH + 18;

    drawSectionTitle('Balance General');
    const bsCols = [
      { label: 'Código', width: 60 },
      { label: 'Concepto', width: 200 },
      { label: 'Monto', width: 90 },
    ];

    doc.fillColor(colors.navy).fontSize(10).font('Helvetica-Bold').text('ACTIVOS', margin, doc.y);
    doc.moveDown(0.3);

    if (payload.balanceSheet.assets?.length > 0) {
      payload.balanceSheet.assets.forEach((asset, idx) => {
        const y = doc.y;
        doc.save();
        if (idx % 2 === 0) {
          doc.rect(margin, y - 4, contentWidth, 16).fill(colors.softGray);
        }
        doc.restore();

        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        let x = margin + 6;
        doc.text(asset.code, x, y, { width: bsCols[0].width - 8 });
        x += bsCols[0].width;
        doc.text(truncate(asset.name, 32), x, y, { width: bsCols[1].width - 8 });
        x += bsCols[1].width;
        doc.text(formatMoney(asset.balance), x, y, { width: bsCols[2].width - 8, align: 'right' });
        doc.moveDown(0.8);
      });
    }

    doc.fillColor(colors.blue).fontSize(10).font('Helvetica-Bold')
      .text(`Total Activos: ${formatMoney(payload.balanceSheet.totalAssets)}`, margin, doc.y, { align: 'right' });
    doc.moveDown(0.5);

    doc.fillColor(colors.navy).fontSize(10).font('Helvetica-Bold').text('PASIVOS', margin, doc.y);
    doc.moveDown(0.3);

    if (payload.balanceSheet.liabilities?.length > 0) {
      payload.balanceSheet.liabilities.forEach((liability, idx) => {
        const y = doc.y;
        doc.save();
        if (idx % 2 === 0) {
          doc.rect(margin, y - 4, contentWidth, 16).fill(colors.softGray);
        }
        doc.restore();

        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        let x = margin + 6;
        doc.text(liability.code, x, y, { width: bsCols[0].width - 8 });
        x += bsCols[0].width;
        doc.text(truncate(liability.name, 32), x, y, { width: bsCols[1].width - 8 });
        x += bsCols[1].width;
        doc.text(formatMoney(liability.balance), x, y, { width: bsCols[2].width - 8, align: 'right' });
        doc.moveDown(0.8);
      });
    }

    doc.fillColor(colors.danger).fontSize(10).font('Helvetica-Bold')
      .text(`Total Pasivos: ${formatMoney(payload.balanceSheet.totalLiabilities)}`, margin, doc.y, { align: 'right' });
    doc.moveDown(0.5);

    doc.fillColor(colors.navy).fontSize(10).font('Helvetica-Bold').text('CAPITAL', margin, doc.y);
    doc.moveDown(0.3);

    if (payload.balanceSheet.equity?.length > 0) {
      payload.balanceSheet.equity.forEach((eq, idx) => {
        const y = doc.y;
        doc.save();
        if (idx % 2 === 0) {
          doc.rect(margin, y - 4, contentWidth, 16).fill(colors.softGray);
        }
        doc.restore();

        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        let x = margin + 6;
        doc.text(eq.code, x, y, { width: bsCols[0].width - 8 });
        x += bsCols[0].width;
        doc.text(truncate(eq.name, 32), x, y, { width: bsCols[1].width - 8 });
        x += bsCols[1].width;
        doc.text(formatMoney(eq.balance), x, y, { width: bsCols[2].width - 8, align: 'right' });
        doc.moveDown(0.8);
      });
    }

    doc.fillColor(colors.success).fontSize(10).font('Helvetica-Bold')
      .text(`Total Capital: ${formatMoney(payload.balanceSheet.totalEquity)}`, margin, doc.y, { align: 'right' });
    doc.moveDown(0.5);

    doc.fillColor(payload.balanceSheet.balanceCheck ? colors.success : colors.danger).fontSize(10).font('Helvetica-Bold')
      .text(`Cuadre: ${payload.balanceSheet.balanceCheck ? '✓ Cuadrado' : '✗ No cuadra'}`, margin, doc.y, { align: 'right' });

    addFooter(1);

    // ═══════════════════════════════════════════════════════════════════════
    // PAGE 2: ESTADO DE RESULTADOS
    // ═══════════════════════════════════════════════════════════════════════
    doc.addPage();
    drawHeader();
    doc.y = 140;

    drawSectionTitle('Estado de Resultados');

    doc.fillColor(colors.navy).fontSize(10).font('Helvetica-Bold').text('INGRESOS', margin, doc.y);
    doc.moveDown(0.3);

    if (payload.incomeStatement.revenue?.length > 0) {
      payload.incomeStatement.revenue.forEach((rev, idx) => {
        const y = doc.y;
        doc.save();
        if (idx % 2 === 0) {
          doc.rect(margin, y - 4, contentWidth, 16).fill(colors.softGray);
        }
        doc.restore();

        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        let x = margin + 6;
        doc.text(rev.code, x, y, { width: bsCols[0].width - 8 });
        x += bsCols[0].width;
        doc.text(truncate(rev.name, 32), x, y, { width: bsCols[1].width - 8 });
        x += bsCols[1].width;
        doc.fillColor(colors.success).text(formatMoney(rev.amount), x, y, { width: bsCols[2].width - 8, align: 'right' });
        doc.moveDown(0.8);
      });
    }

    doc.fillColor(colors.success).fontSize(10).font('Helvetica-Bold')
      .text(`Total Ingresos: ${formatMoney(payload.incomeStatement.totalRevenue)}`, margin, doc.y, { align: 'right' });
    doc.moveDown(0.5);

    doc.fillColor(colors.navy).fontSize(10).font('Helvetica-Bold').text('GASTOS', margin, doc.y);
    doc.moveDown(0.3);

    if (payload.incomeStatement.expenses?.length > 0) {
      payload.incomeStatement.expenses.forEach((exp, idx) => {
        const y = doc.y;
        doc.save();
        if (idx % 2 === 0) {
          doc.rect(margin, y - 4, contentWidth, 16).fill(colors.softGray);
        }
        doc.restore();

        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        let x = margin + 6;
        doc.text(exp.code, x, y, { width: bsCols[0].width - 8 });
        x += bsCols[0].width;
        doc.text(truncate(exp.name, 32), x, y, { width: bsCols[1].width - 8 });
        x += bsCols[1].width;
        doc.fillColor(colors.danger).text(formatMoney(exp.amount), x, y, { width: bsCols[2].width - 8, align: 'right' });
        doc.moveDown(0.8);
      });
    }

    doc.fillColor(colors.danger).fontSize(10).font('Helvetica-Bold')
      .text(`Total Gastos: ${formatMoney(payload.incomeStatement.totalExpenses)}`, margin, doc.y, { align: 'right' });
    doc.moveDown(0.5);

    const netIncomeColor = payload.incomeStatement.netIncome >= 0 ? colors.success : colors.danger;
    doc.fillColor(netIncomeColor).fontSize(12).font('Helvetica-Bold')
      .text(`UTILIDAD NETA: ${formatMoney(payload.incomeStatement.netIncome)}`, margin, doc.y, { align: 'right' });

    addFooter(2);

    // ═══════════════════════════════════════════════════════════════════════
    // PAGE 3: TRIAL BALANCE
    // ═══════════════════════════════════════════════════════════════════════
    doc.addPage();
    drawHeader();
    doc.y = 140;

    drawSectionTitle('Balanza de Comprobación');

    const tbCols = [
      { label: 'Código', width: 50 },
      { label: 'Cuenta', width: 160 },
      { label: 'Debe', width: 70 },
      { label: 'Haber', width: 70 },
      { label: 'Saldo', width: 80 },
    ];

    drawTableHeader(doc.y, tbCols);
    doc.y += 28;

    if (payload.trialBalance?.length > 0) {
      payload.trialBalance.forEach((account, i) => {
        const y = doc.y;

        doc.save();
        if (i % 2 === 0) doc.rect(margin, y - 4, contentWidth, 16).fill(colors.softGray);
        else doc.rect(margin, y - 4, contentWidth, 16).fill('#ffffff');
        doc.restore();

        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        let x = margin + 6;
        doc.text(account.code, x, y, { width: tbCols[0].width - 8 });
        x += tbCols[0].width;
        doc.text(truncate(account.name, 24), x, y, { width: tbCols[1].width - 8 });
        x += tbCols[1].width;
        doc.text(formatMoney(account.debit), x, y, { width: tbCols[2].width - 8, align: 'right' });
        x += tbCols[2].width;
        doc.text(formatMoney(account.credit), x, y, { width: tbCols[3].width - 8, align: 'right' });
        x += tbCols[3].width;
        doc.text(formatMoney(account.balance), x, y, { width: tbCols[4].width - 8, align: 'right' });

        doc.moveDown(0.8);
      });
    }

    addFooter(3);

    doc.end();
  });
};
