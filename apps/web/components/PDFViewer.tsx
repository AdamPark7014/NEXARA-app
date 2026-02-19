import React, { useState, useRef } from 'react';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import styles from './PDFViewer.module.css';

interface PDFViewerProps {
  pdfUrl: string;
  fileName?: string;
  editable?: boolean;
  onSaveNewVersion?: (newPdfUrl: string, versionLabel: string) => Promise<void>;
  versions?: Array<{ id: number; versionLabel: string; createdAt: string; pdfUrl: string }>;
}

export default function PDFViewerComponent({
  pdfUrl,
  fileName,
  editable = false,
  onSaveNewVersion,
  versions = [],
}: PDFViewerProps) {
  const [currentPdfUrl, setCurrentPdfUrl] = useState(pdfUrl);
  const [showVersions, setShowVersions] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEditClick = () => {
    if (editMode) {
      // Cancel edit mode
      setCurrentPdfUrl(pdfUrl);
      setEditMode(false);
    } else {
      setEditMode(true);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      setError('Solo se permiten archivos PDF');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setCurrentPdfUrl(url);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveVersion = async () => {
    if (!onSaveNewVersion || !editMode) return;

    setSaving(true);
    setError(null);
    try {
      // In a real app, you would upload the file and get a URL
      // For now, we'll just use the current URL
      await onSaveNewVersion(currentPdfUrl, `v${new Date().toISOString().slice(0, 10)}`);
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar versión');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadVersion = (versionUrl: string) => {
    setCurrentPdfUrl(versionUrl);
    setShowVersions(false);
  };

  return (
    <div className={styles.pdfContainer}>
      <div className={styles.header}>
        <div className={styles.info}>
          <h3 className={styles.fileName}>{fileName || 'PDF'}</h3>
          <p className={styles.meta}>{versions.length} versión{versions.length !== 1 ? 'es' : ''}</p>
        </div>

        <div className={styles.actions}>
          {editable && (
            <>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={handleEditClick}
                disabled={saving}
              >
                {editMode ? 'Cancelar edición' : 'Editar PDF'}
              </button>

              {editMode && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileSelect}
                    className={styles.hiddenInput}
                  />
                  <button
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Reemplazar PDF
                  </button>

                  <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={handleSaveVersion}
                    disabled={saving}
                  >
                    {saving ? 'Guardando...' : 'Guardar versión'}
                  </button>
                </>
              )}
            </>
          )}

          {versions.length > 0 && (
            <div className={styles.versionDropdown}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setShowVersions(!showVersions)}
              >
                📋 Versiones ({versions.length})
              </button>

              {showVersions && (
                <div className={styles.versionsList}>
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      className={styles.versionItem}
                      onClick={() => handleLoadVersion(version.pdfUrl)}
                    >
                      <span className={styles.versionLabel}>{version.versionLabel}</span>
                      <span className={styles.versionDate}>
                        {new Date(version.createdAt).toLocaleDateString('es-MX')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.viewer}>
        {currentPdfUrl && (
          <Worker workerUrl="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js">
            <Viewer fileUrl={currentPdfUrl} />
          </Worker>
        )}
      </div>

      {editMode && (
        <div className={styles.editNotice}>
          ⚠️ Modo edición activado. Selecciona un nuevo PDF o haz cambios y guarda como nueva versión.
        </div>
      )}
    </div>
  );
}
