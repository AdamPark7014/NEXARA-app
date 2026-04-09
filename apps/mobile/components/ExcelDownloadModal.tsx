  "use client";

import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { isCapacitorNative } from "@/lib/capacitor-env";
import styles from "./ExcelDownloadModal.module.css";

type PreviewRow = (string | number | boolean | null | undefined)[];

type ExcelDownloadModalProps = {
  isOpen: boolean;
  fileName: string;
  excelBlob?: Blob | null;
  isPreparing?: boolean;
  onClose: () => void;
  onDownload: () => void;
};

const MAX_PREVIEW_ROWS = 10;
const MAX_PREVIEW_COLS = 8;

export default function ExcelDownloadModal({
  isOpen,
  fileName,
  excelBlob,
  isPreparing = false,
  onClose,
  onDownload,
}: ExcelDownloadModalProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    if (!isOpen || !excelBlob) {
      setHeaders([]);
      setRows([]);
      return;
    }
    setParsing(true);
    excelBlob
      .arrayBuffer()
      .then((buf) => {
        const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
        if (!data.length) { setParsing(false); return; }
        const h = ((data[0] as unknown[]) || []).slice(0, MAX_PREVIEW_COLS).map(String);
        const r = data.slice(1, MAX_PREVIEW_ROWS + 1).map(
          (row) => (row as PreviewRow).slice(0, MAX_PREVIEW_COLS)
        );
        setHeaders(h);
        setRows(r);
        setParsing(false);
      })
      .catch(() => setParsing(false));
  }, [isOpen, excelBlob]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Vista previa Excel">
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.xlsxIcon}>📊</span>
          <div>
            <h3 className={styles.title}>Vista previa — Excel</h3>
            <p className={styles.subtitle}>{fileName}</p>
          </div>
        </div>

        <div className={styles.previewWrap}>
          {parsing ? (
            <p className={styles.loadingText}>Generando vista previa…</p>
          ) : headers.length > 0 ? (
            <>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {headers.map((h, i) => <th key={i}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri}>
                        {headers.map((_, ci) => (
                          <td key={ci}>{row[ci] != null ? String(row[ci]) : ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.previewNote}>Mostrando hasta {MAX_PREVIEW_ROWS} filas · {MAX_PREVIEW_COLS} columnas</p>
            </>
          ) : (
            <p className={styles.loadingText}>Sin datos para previsualizar.</p>
          )}
        </div>

        <div className={styles.actions}>
          <button type="button" className="button-secondary" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="button-primary" onClick={onDownload} disabled={isPreparing}>
            {isPreparing ? "Preparando…" : isCapacitorNative() ? "Guardar / compartir" : "Descargar"}
          </button>
        </div>
      </div>
    </div>
  );
}
