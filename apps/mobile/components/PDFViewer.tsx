'use client';
import React from 'react';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import styles from './PDFViewer.module.css';
import { triggerFileDownload } from '@/lib/file-download';

interface PDFViewerProps {
  pdfUrl: string;
  pdfData?: Uint8Array | null;
  fileName?: string;
  height?: string;
}

export default function PDFViewer({
  pdfUrl,
  pdfData,
  fileName = 'Documento.pdf',
  height = '600px',
}: PDFViewerProps) {
  const viewerHeightClass = {
    '400px': styles.viewerH400,
    '500px': styles.viewerH500,
    '600px': styles.viewerH600,
    '700px': styles.viewerH700,
    '800px': styles.viewerH800,
  }[height] || styles.viewerH600;

  const handleDownload = () => {
    triggerFileDownload(pdfUrl, fileName, { preferOpenOnMobile: true });
  };

  if (!pdfUrl) {
    return (
      <div className={styles.pdfContainer}>
        <div className={styles.noData}>No hay PDF para mostrar</div>
      </div>
    );
  }

  return (
    <div className={styles.pdfContainer}>
      <div className={styles.header}>
        <div className={styles.info}>
          <h3 className={styles.fileName}>📄 {fileName}</h3>
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleDownload}
            title="Descargar PDF"
          >
            📥 Descargar
          </button>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            🔗 Abrir en pestaña nueva
          </a>
        </div>
      </div>

      <div className={`${styles.viewer} ${viewerHeightClass}`}>
        <Worker workerUrl="/pdf.worker.min.js">
          <Viewer
            fileUrl={pdfData || pdfUrl}
            renderError={(error) => (
              <div className={styles.error}>
                No se pudo previsualizar el PDF: {error.message || 'error de visor'}
                <div>
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                    Abrir PDF en una pestaña nueva
                  </a>
                </div>
              </div>
            )}
          />
        </Worker>
      </div>
    </div>
  );
}
