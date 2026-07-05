import { triggerBlobDownload } from "./file-download";

/**
 * Exporta una lista de objetos a CSV y dispara la descarga en el navegador.
 *
 * @param rows    - Array de objetos planos a exportar
 * @param columns - Definición de columnas: { key, label, format? }
 * @param filename - Nombre del archivo sin extensión (se añade .csv)
 */
export function exportToCsv<T extends object>(
  rows: T[],
  columns: { key: keyof T; label: string; format?: (val: T[keyof T], row: T) => string }[],
  filename: string,
): void {
  const header = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(",");

  const body = rows.map((row) =>
    columns
      .map((c) => {
        const raw = row[c.key];
        const val = c.format ? c.format(raw, row) : raw == null ? "" : String(raw);
        return `"${val.replace(/"/g, '""')}"`;
      })
      .join(","),
  );

  const csv = [header, ...body].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  void triggerBlobDownload(blob, `${filename}.csv`, { preferOpenOnMobile: false, mimeType: "text/csv" });
}
