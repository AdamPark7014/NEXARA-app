'use client';
import React, { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import '@react-pdf-viewer/core/lib/styles/index.css';
import styles from './PDFViewer.module.css';

// Cargar Worker y Viewer dinámicamente sin SSR
const Worker = dynamic(
  () => import('@react-pdf-viewer/core').then(mod => mod.Worker),
  { ssr: false, loading: () => <div>Cargando visor PDF...</div> }
);

const Viewer = dynamic(
  () => import('@react-pdf-viewer/core').then(mod => mod.Viewer),
  { ssr: false, loading: () => <div>Cargando documento...</div> }
);

interface PDFViewerProps {
  pdfUrl: string;
  fileName?: string;
  height?: string;
}

export default function PDFViewer({
  pdfUrl,
  fileName = 'Documento.pdf',
  height = '600px',
}: PDFViewerProps) {
  const [error, setError] = useState<string | null>(null);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = fileName;
    link.click();
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

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.viewer} style={{ height }}>
        <Worker workerUrl="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js">
          <Viewer fileUrl={pdfUrl} />
        </Worker>
      </div>
    </div>
  );
}
