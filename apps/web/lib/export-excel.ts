import { triggerBlobDownload } from "./file-download";

// Paleta NEXARA (light theme de globals.scss)
const NX = {
  navy: "FF0B1320",
  teal: "FF15A99D",
  tealSoft: "FFE0F5F3",
  orange: "FFD66533",
  text: "FF0F172A",
  muted: "FF445668",
  zebra: "FFF4FAF9",
  border: "FFCBD5E1",
};

export type ExcelColumn<T extends object> = {
  key: keyof T;
  label: string;
  format?: (val: T[keyof T], row: T) => string;
};

const isCurrencyKey = (key: string) => {
  const k = key.toLowerCase();
  return k.includes("total") || k.includes("monto") || k.includes("precio") ||
    k.includes("amount") || k.includes("cost") || k.includes("importe") || k.includes("valor");
};

/**
 * Exporta una lista de objetos a Excel (.xlsx) con la identidad NEXARA y
 * dispara la descarga en el navegador. Mismo contrato que el viejo exportToCsv
 * (fire-and-forget, no requiere await en el call site).
 *
 * @param rows    - Array de objetos planos a exportar
 * @param columns - Definición de columnas: { key, label, format? }
 * @param filename - Nombre del archivo sin extensión (se añade .xlsx)
 * @param title   - Título opcional del reporte (default: filename legible)
 */
export function exportToExcel<T extends object>(
  rows: T[],
  columns: ExcelColumn<T>[],
  filename: string,
  title?: string,
): void {
  void buildAndDownload(rows, columns, filename, title).catch((err) => {
    console.error("exportToExcel failed:", err);
  });
}

async function buildAndDownload<T extends object>(
  rows: T[],
  columns: ExcelColumn<T>[],
  filename: string,
  title?: string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NEXARA";
  workbook.created = new Date();

  const sheetName = (title || filename).slice(0, 28) || "Reporte";
  const ws = workbook.addWorksheet(sheetName);
  const colCount = Math.max(columns.length, 1);

  // Fila 1: título NEXARA
  const reportTitle = title || filename.replace(/[-_]+/g, " ").toUpperCase();
  const titleRow = ws.getRow(1);
  titleRow.getCell(1).value = `NEXARA · ${reportTitle}`;
  titleRow.height = 30;
  titleRow.getCell(1).font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  for (let c = 1; c <= colCount; c += 1) {
    titleRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NX.navy } };
  }
  if (colCount > 1) ws.mergeCells(1, 1, 1, colCount);

  // Fila 2: metadatos
  const metaRow = ws.getRow(2);
  metaRow.getCell(1).value = `Generado: ${new Date().toLocaleString("es-MX")} · ${rows.length} registro${rows.length === 1 ? "" : "s"}`;
  metaRow.height = 20;
  metaRow.getCell(1).font = { name: "Segoe UI", size: 10, color: { argb: NX.muted } };
  metaRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  for (let c = 1; c <= colCount; c += 1) {
    metaRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NX.tealSoft } };
  }
  if (colCount > 1) ws.mergeCells(2, 1, 2, colCount);

  ws.getRow(3).height = 6;

  // Fila 4: encabezados
  const headerRowIdx = 4;
  const headerRow = ws.getRow(headerRowIdx);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.label;
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NX.teal } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: NX.border } },
      left: { style: "thin", color: { argb: NX.border } },
      bottom: { style: "medium", color: { argb: NX.orange } },
      right: { style: "thin", color: { argb: NX.border } },
    };
  });
  headerRow.height = 24;

  // Datos
  rows.forEach((row, idx) => {
    const excelRow = ws.getRow(headerRowIdx + 1 + idx);
    columns.forEach((col, colIdx) => {
      const raw = row[col.key];
      let value: string | number | boolean | Date | null;
      if (col.format) {
        value = col.format(raw, row);
      } else if (raw == null) {
        value = "";
      } else if (typeof raw === "number" || typeof raw === "boolean" || raw instanceof Date) {
        value = raw as number | boolean | Date;
      } else {
        const num = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
        value = Number.isFinite(num) && isCurrencyKey(String(col.key)) ? num : String(raw);
      }

      const cell = excelRow.getCell(colIdx + 1);
      cell.value = value;
      cell.font = { name: "Segoe UI", size: 10, color: { argb: NX.text } };
      cell.alignment = { vertical: "middle", horizontal: typeof value === "number" ? "right" : "left", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NX.zebra } };
      }
      if (typeof value === "number" && isCurrencyKey(String(col.key))) {
        cell.numFmt = '"$"#,##0.00';
      }
    });
  });

  // Ancho automático aproximado
  columns.forEach((col, i) => {
    let max = col.label.length + 4;
    rows.forEach((row) => {
      const raw = row[col.key];
      const text = col.format ? col.format(raw, row) : raw == null ? "" : String(raw);
      max = Math.max(max, Math.min(46, text.length + 2));
    });
    ws.getColumn(i + 1).width = Math.max(10, max);
  });

  ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx, column: colCount } };
  ws.views = [{ state: "frozen", ySplit: headerRowIdx }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  void triggerBlobDownload(blob, `${filename}.xlsx`, {
    preferOpenOnMobile: false,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
