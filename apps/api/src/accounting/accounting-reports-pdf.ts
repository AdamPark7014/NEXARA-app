import PDFDocument from 'pdfkit';
import {
  PDF_CONTENT_START_Y,
  PDF_MODULE_ACCENTS,
  drawKpiCards,
  drawNexaraFooter,
  drawNexaraHeader,
  drawSectionTitle,
  drawSummaryBox,
  drawTableHeader,
  drawTableRow,
  loadNexaraLogo,
  pdfMoney,
  pdfTruncate,
  type PdfTableColumn,
  type PdfTableContext,
} from '../common/pdf/nexara-pdf-theme';

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

export const generateFinancialReportsPdf = (payload: FinancialReportPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    // NO usar bufferPages: true - causa que se creen páginas fantasma
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const accent = PDF_MODULE_ACCENTS.erp;
    const logo = loadNexaraLogo();
    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const footerNote = 'NEXARA · Reportes financieros — información confidencial.';

    const from = payload.fromDate ? formatDate(payload.fromDate) : '-';
    const to = payload.toDate ? formatDate(payload.toDate) : formatDate(new Date());
    const asOf = payload.asOfDate ? formatDate(payload.asOfDate) : formatDate(new Date());

    const drawPage = (docTitle: string, docSubtitle: string) => {
      drawNexaraHeader(doc, {
        docTitle,
        docSubtitle,
        accent,
        logo,
        meta: [
          { label: 'Periodo', value: `${from} - ${to}` },
          { label: 'Corte', value: asOf },
          { label: 'Generado', value: formatDate(new Date()) },
        ],
      });
      drawNexaraFooter(doc, footerNote);
      doc.y = PDF_CONTENT_START_Y;
    };

    const ensureBlockSpace = (needed: number, redraw: () => void) => {
      if (doc.y + needed > doc.page.height - 60) {
        doc.addPage();
        redraw();
      }
    };

    const accountCols: PdfTableColumn[] = [
      { label: 'Código', width: 90 },
      { label: 'Concepto', width: 295 },
      { label: 'Monto', width: 130, align: 'right' },
    ];

    const drawAccountTable = (
      rows: Array<{ code: string; name: string; amount: number }>,
      ctx: PdfTableContext,
    ) => {
      drawTableHeader(doc, doc.y, ctx.columns, ctx.headerAccent);
      doc.y += 28;
      rows.forEach((row, index) => {
        drawTableRow(doc, [row.code, pdfTruncate(row.name, 60), pdfMoney(row.amount)], index, ctx, {
          boldColumns: [2],
        });
      });
    };

    const summaryWidth = 250;

    // ═══════════════════════════════════════════════════════════════════════
    // PÁGINA 1: BALANCE GENERAL
    // ═══════════════════════════════════════════════════════════════════════
    const balancePage = () => drawPage('Balance general', 'Posición financiera al corte');
    doc.font('Helvetica');
    balancePage();

    drawSectionTitle(doc, 'Resumen ejecutivo');
    const kpiY = doc.y;
    const kpiRowHeight = drawKpiCards(doc, kpiY, [
      { label: 'Activos', value: pdfMoney(payload.balanceSheet.totalAssets), accent },
      { label: 'Pasivos', value: pdfMoney(payload.balanceSheet.totalLiabilities), accent },
    ]);
    drawKpiCards(doc, kpiY + kpiRowHeight + 12, [
      { label: 'Capital', value: pdfMoney(payload.balanceSheet.totalEquity), accent },
      { label: 'Utilidad neta', value: pdfMoney(payload.incomeStatement.netIncome), accent },
    ]);
    doc.y = kpiY + kpiRowHeight * 2 + 12 + 18;

    const balanceCtx: PdfTableContext = { columns: accountCols, onNewPage: balancePage };
    const balanceSections = [
      { title: 'Activos', rows: payload.balanceSheet.assets ?? [] },
      { title: 'Pasivos', rows: payload.balanceSheet.liabilities ?? [] },
      { title: 'Capital', rows: payload.balanceSheet.equity ?? [] },
    ];

    balanceSections.forEach((section) => {
      ensureBlockSpace(100, balancePage);
      drawSectionTitle(doc, section.title);
      drawAccountTable(
        section.rows.map((row) => ({ code: row.code, name: row.name, amount: row.balance })),
        balanceCtx,
      );
      doc.y += 6;
    });

    ensureBlockSpace(130, balancePage);
    const balanceSummaryY = doc.y + 6;
    drawSummaryBox(
      doc,
      margin + contentWidth - summaryWidth,
      balanceSummaryY,
      summaryWidth,
      'Resumen del balance',
      [
        ['Total activos', pdfMoney(payload.balanceSheet.totalAssets)],
        ['Total pasivos', pdfMoney(payload.balanceSheet.totalLiabilities)],
        ['Total capital', pdfMoney(payload.balanceSheet.totalEquity)],
        ['Cuadre', payload.balanceSheet.balanceCheck ? 'Cuadrado' : 'No cuadra'],
      ],
      { highlightIndex: 3 },
    );

    // ═══════════════════════════════════════════════════════════════════════
    // PÁGINA 2: ESTADO DE RESULTADOS
    // ═══════════════════════════════════════════════════════════════════════
    const incomePage = () => drawPage('Estado de resultados', 'Ingresos y gastos del periodo');
    doc.addPage();
    incomePage();

    const incomeCtx: PdfTableContext = { columns: accountCols, onNewPage: incomePage };

    drawSectionTitle(doc, 'Ingresos');
    drawAccountTable(
      (payload.incomeStatement.revenue ?? []).map((row) => ({ code: row.code, name: row.name, amount: row.amount })),
      incomeCtx,
    );
    doc.y += 6;

    ensureBlockSpace(100, incomePage);
    drawSectionTitle(doc, 'Gastos');
    drawAccountTable(
      (payload.incomeStatement.expenses ?? []).map((row) => ({ code: row.code, name: row.name, amount: row.amount })),
      incomeCtx,
    );
    doc.y += 6;

    ensureBlockSpace(110, incomePage);
    const incomeSummaryY = doc.y + 6;
    drawSummaryBox(
      doc,
      margin + contentWidth - summaryWidth,
      incomeSummaryY,
      summaryWidth,
      'Resumen del periodo',
      [
        ['Total ingresos', pdfMoney(payload.incomeStatement.totalRevenue)],
        ['Total gastos', pdfMoney(payload.incomeStatement.totalExpenses)],
        ['Utilidad neta', pdfMoney(payload.incomeStatement.netIncome)],
      ],
      { highlightIndex: 2 },
    );

    // ═══════════════════════════════════════════════════════════════════════
    // PÁGINA 3: BALANZA DE COMPROBACIÓN
    // ═══════════════════════════════════════════════════════════════════════
    const trialPage = () => drawPage('Balanza de comprobación', 'Movimientos y saldos por cuenta');
    doc.addPage();
    trialPage();

    const trialCols: PdfTableColumn[] = [
      { label: 'Código', width: 60 },
      { label: 'Cuenta', width: 195 },
      { label: 'Debe', width: 85, align: 'right' },
      { label: 'Haber', width: 85, align: 'right' },
      { label: 'Saldo', width: 90, align: 'right' },
    ];
    const trialCtx: PdfTableContext = { columns: trialCols, onNewPage: trialPage };

    drawSectionTitle(doc, 'Cuentas');
    drawTableHeader(doc, doc.y, trialCols);
    doc.y += 28;

    (payload.trialBalance ?? []).forEach((account, index) => {
      drawTableRow(
        doc,
        [
          account.code,
          pdfTruncate(account.name, 40),
          pdfMoney(account.debit),
          pdfMoney(account.credit),
          pdfMoney(account.balance),
        ],
        index,
        trialCtx,
        { boldColumns: [4] },
      );
    });

    doc.end();
  });
};
