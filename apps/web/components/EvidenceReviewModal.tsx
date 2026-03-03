"use client";
import React, { useState } from 'react';
import { useUser } from './UserContext';
import styles from './EvidenceReviewModal.module.css';

interface EvidenceReviewModalProps {
  activityId: number;
  activityNumber: string;
  onClose: () => void;
  onSuccess: () => void;
}

const EvidenceReviewModal: React.FC<EvidenceReviewModalProps> = ({
  activityId,
  activityNumber,
  onClose,
  onSuccess,
}) => {
  const { user } = useUser();
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectedStep, setRejectedStep] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  const steps = [
    { value: 'ENTRY_PHOTO', label: '📸 Paso 1: Foto de Entrada' },
    { value: 'EVIDENCE_PHOTOS', label: '📷 Paso 2: Fotos de Evidencia' },
    { value: 'SERVICE_SHEET_PDF', label: '📄 Paso 3: PDF Hoja de Servicio' },
    { value: 'SERVICE_SHEET_DATA', label: '📝 Paso 4: Plantilla Interna' },
    { value: 'EXIT_PHOTO', label: '🚪 Paso 5: Foto de Salida' },
  ];

  const handleSubmit = async () => {
    if (!user || !action) return;

    if (action === 'reject' && !rejectedStep) {
      setError('Debes seleccionar el paso a rechazar');
      return;
    }

    if (action === 'reject' && !notes.trim()) {
      setError('Las observaciones son obligatorias para rechazar');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint = action === 'approve' ? 'approve' : 'reject';
      const body = action === 'approve' 
        ? { reviewerId: user.id, notes: notes.trim() || undefined }
        : { reviewerId: user.id, rejectedStep, notes: notes.trim() };

      const res = await fetch(buildApiUrl(`activity-evidence/${activityId}/${endpoint}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Error al procesar la revisión');
      }

      // Crear notificación para el usuario
      if (action === 'reject') {
        // TODO: Implementar notificación push
        console.log(`Notificar al usuario sobre rechazo en paso: ${rejectedStep}`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            Revisar Evidencias - {activityNumber}
          </h2>
          <button
            onClick={onClose}
            className={styles.closeButton}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {error && (
            <div className={styles.errorAlert}>
              ❌ {error}
            </div>
          )}

          {!action && (
            <div className={styles.contentGrid}>
              <p className={styles.helperText}>
                Selecciona una acción:
              </p>
              <button
                className={`${styles.actionButton} ${styles.approveAction}`}
                onClick={() => setAction('approve')}
              >
                <span className={styles.emoji}>✅</span>
                Aprobar Evidencias
              </button>
              <button
                className={`${styles.actionButton} ${styles.rejectAction}`}
                onClick={() => setAction('reject')}
              >
                <span className={styles.emoji}>❌</span>
                Rechazar Evidencias
              </button>
            </div>
          )}

          {action === 'approve' && (
            <div className={styles.contentGrid}>
              <div className={`${styles.actionPanel} ${styles.approvePanel}`}>
                <h3 className={`${styles.panelTitle} ${styles.approveTitle}`}>✅ Aprobar Evidencias</h3>
                <p className={styles.panelDescription}>
                  Las evidencias se marcarán como aprobadas y la actividad cambiará a estado "Aprobada".
                </p>
              </div>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>
                  Observaciones (opcional)
                </span>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Comentarios adicionales sobre la aprobación..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>

              <div className={styles.actionsRow}>
                <button
                  className={`button-primary ${styles.flexAction} ${styles.approveButton}`}
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? '⏳ Aprobando...' : 'Confirmar Aprobación'}
                </button>
                <button
                  className="button-secondary"
                  onClick={() => setAction(null)}
                  disabled={loading}
                >
                  Regresar
                </button>
              </div>
            </div>
          )}

          {action === 'reject' && (
            <div className={styles.contentGrid}>
              <div className={`${styles.actionPanel} ${styles.rejectPanel}`}>
                <h3 className={`${styles.panelTitle} ${styles.rejectTitle}`}>❌ Rechazar Evidencias</h3>
                <p className={styles.panelDescription}>
                  Selecciona el paso que debe corregirse. El usuario recibirá una notificación.
                </p>
              </div>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>
                  Selecciona el paso a rechazar *
                </span>
                <select
                  className="input"
                  value={rejectedStep}
                  onChange={(e) => setRejectedStep(e.target.value)}
                  required
                >
                  <option value="">-- Selecciona un paso --</option>
                  {steps.map((step) => (
                    <option key={step.value} value={step.value}>
                      {step.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>
                  Observaciones / Razón del rechazo *
                </span>
                <textarea
                  className="input"
                  rows={5}
                  placeholder="Explica qué debe corregir el usuario en este paso..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required
                />
              </label>

              <div className={styles.actionsRow}>
                <button
                  className={`button-primary ${styles.flexAction} ${styles.rejectButton}`}
                  onClick={handleSubmit}
                  disabled={loading || !rejectedStep || !notes.trim()}
                >
                  {loading ? '⏳ Rechazando...' : 'Confirmar Rechazo'}
                </button>
                <button
                  className="button-secondary"
                  onClick={() => setAction(null)}
                  disabled={loading}
                >
                  Regresar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EvidenceReviewModal;
