"use client";
import React from "react";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import "@react-pdf-viewer/core/lib/styles/index.css";
import styles from "./PDFViewer.module.css";
import { triggerBlobDownload, triggerFileDownload } from "@/lib/file-download";
import { isCapacitorNative } from "@/lib/capacitor-env";
import { openExternalUrl } from "@/lib/open-external-url";

const HEIGHT_PRESETS: Record<string, string> = {
  "400px": styles.viewerH400,
  "500px": styles.viewerH500,
  "600px": styles.viewerH600,
  "620px": styles.viewerH620,
  "700px": styles.viewerH700,
  "800px": styles.viewerH800,
};

interface PDFViewerProps {
  pdfUrl: string;
  pdfData?: Uint8Array | null;
  fileName?: string;
  height?: string;
  /** El visor crece con el modal (flex); evita PDF cortado en móvil. */
  fillParent?: boolean;
}

export default function PDFViewer({
  pdfUrl,
  pdfData,
  fileName = "Documento.pdf",
  height = "600px",
  fillParent = false,
}: PDFViewerProps) {
  const presetClass = HEIGHT_PRESETS[height];
  const useDynamicHeight = !fillParent && !presetClass;
  const viewerHeightClass = fillParent
    ? `${styles.viewer} ${styles.viewerFill}`
    : `${styles.viewer} ${presetClass ?? styles.viewerDynamic}`;
  const viewerInlineStyle: React.CSSProperties | undefined =
    useDynamicHeight && height ? { height } : undefined;

  const handleDownload = async () => {
    if (pdfData?.length) {
      const blob = new Blob([new Uint8Array(pdfData)], { type: "application/pdf" });
      await triggerBlobDownload(blob, fileName, { mimeType: "application/pdf" });
      return;
    }
    await triggerFileDownload(pdfUrl, fileName, {
      preferOpenOnMobile: true,
      mimeType: "application/pdf",
    });
  };

  const handleOpenExternal = async (e: React.MouseEvent) => {
    const http = /^https?:\/\//i.test(pdfUrl);
    if (!http) {
      e.preventDefault();
      await handleDownload();
      return;
    }
    if (isCapacitorNative()) {
      e.preventDefault();
      await openExternalUrl(pdfUrl);
    }
  };

  const handleErrorOpenExternal = async () => {
    const http = /^https?:\/\//i.test(pdfUrl);
    if (http) {
      await openExternalUrl(pdfUrl);
      return;
    }
    await handleDownload();
  };

  if (!pdfUrl) {
    return (
      <div className={styles.pdfContainer}>
        <div className={styles.noData}>No hay PDF para mostrar</div>
      </div>
    );
  }

  const containerClass = `${styles.pdfContainer}${fillParent ? ` ${styles.pdfContainerFill}` : ""}`;

  return (
    <div className={containerClass}>
      <div className={styles.header}>
        <div className={styles.info}>
          <h3 className={styles.fileName}>📄 {fileName}</h3>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => void handleDownload()}
            title={isCapacitorNative() ? "Guardar o compartir PDF" : "Descargar PDF"}
          >
            {isCapacitorNative() ? "📤 Guardar / compartir" : "📥 Descargar"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={(e) => void handleOpenExternal(e)}
          >
            {isCapacitorNative() ? "🌐 Abrir en navegador" : "🔗 Abrir fuera del visor"}
          </button>
        </div>
      </div>

      <div className={viewerHeightClass} style={viewerInlineStyle}>
        <Worker workerUrl="/pdf.worker.min.js">
          <Viewer
            fileUrl={pdfData || pdfUrl}
            renderError={(error) => (
              <div className={styles.error}>
                No se pudo previsualizar el PDF: {error.message || "error de visor"}
                <div>
                  <button type="button" className={styles.errorOpenBtn} onClick={() => void handleErrorOpenExternal()}>
                    Abrir PDF fuera de la app
                  </button>
                </div>
              </div>
            )}
          />
        </Worker>
      </div>
    </div>
  );
}
