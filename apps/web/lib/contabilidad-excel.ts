import ExcelJS from 'exceljs';

export type ColumnaExcel = {
  key: string;
  header: string;
  tipo?: 'texto' | 'numero' | 'fecha' | 'moneda';
  ancho?: number;
};

export type OpcionesExcelContabilidad = {
  nombreArchivo: string;
  tituloHoja: string;
  empresa?: string | null;
  rango?: { desde?: string; hasta?: string } | null;
  columnas: ColumnaExcel[];
  filas: Record<string, unknown>[];
  /** Índices 0-based de columnas numéricas/moneda con TOTAL (fórmula SUM). */
  columnasConTotal?: number[];
};

function letraColumna(idx: number): string {
  let n = idx;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function aNumero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function descargarExcelContabilidad(opts: OpcionesExcelContabilidad): Promise<void> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'NEXARA Core · Mesa contable';
  libro.created = new Date();

  const hoja = libro.addWorksheet(opts.tituloHoja.slice(0, 31) || 'Datos');
  hoja.columns = opts.columnas.map((c) => ({
    key: c.key,
    width: c.ancho ?? (c.tipo === 'moneda' || c.tipo === 'numero' ? 14 : 22),
  }));

  hoja.addRow([opts.empresa?.trim() || 'NEXARA']);
  const rangoTxt =
    opts.rango?.desde || opts.rango?.hasta
      ? `Rango: ${opts.rango?.desde ?? '…'} – ${opts.rango?.hasta ?? '…'}`
      : 'Sin filtro de fechas';
  hoja.addRow([rangoTxt]);
  hoja.addRow([
    `Generado: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`,
  ]);
  hoja.addRow([]);

  const headerRow = hoja.addRow(opts.columnas.map((c) => c.header));
  headerRow.font = { bold: true };
  const primeraDatos = 6;

  for (const fila of opts.filas) {
    const valores = opts.columnas.map((col) => {
      const raw = fila[col.key];
      if (col.tipo === 'moneda' || col.tipo === 'numero') {
        return aNumero(raw) ?? 0;
      }
      if (raw == null) return '';
      return String(raw);
    });
    const r = hoja.addRow(valores);
    opts.columnas.forEach((col, i) => {
      if (col.tipo === 'moneda') {
        r.getCell(i + 1).numFmt = '#,##0.00';
      } else if (col.tipo === 'numero') {
        r.getCell(i + 1).numFmt = '#,##0.00';
      }
    });
  }

  const ultimaDatos = primeraDatos + Math.max(opts.filas.length, 1) - 1;
  if (opts.filas.length > 0 && opts.columnasConTotal?.length) {
    const totalVals: (string | { formula: string })[] = opts.columnas.map((_, i) =>
      i === 0 ? 'TOTAL' : '',
    );
    for (const idx of opts.columnasConTotal) {
      if (idx < 0 || idx >= opts.columnas.length) continue;
      const col = letraColumna(idx);
      totalVals[idx] = { formula: `SUM(${col}${primeraDatos}:${col}${ultimaDatos})` };
    }
    const totalRow = hoja.addRow(totalVals);
    totalRow.font = { bold: true };
    for (const idx of opts.columnasConTotal) {
      if (opts.columnas[idx]?.tipo === 'moneda' || opts.columnas[idx]?.tipo === 'numero') {
        totalRow.getCell(idx + 1).numFmt = '#,##0.00';
      }
    }
  }

  if (opts.filas.length > 0) {
    hoja.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: ultimaDatos, column: opts.columnas.length },
    };
  }
  hoja.views = [{ state: 'frozen', ySplit: 5 }];

  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${opts.nombreArchivo.replace(/\.xlsx$/i, '')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
