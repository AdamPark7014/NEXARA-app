"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { EVIDENCE_STEP_ORDER, evidenceStepLabel } from "@/lib/evidence-lock";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
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
  const [rejectedSteps, setRejectedSteps] = useState<string[]>([]);
  const [resetFullFlow, setResetFullFlow] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = EVIDENCE_STEP_ORDER.map((value) => ({
    value,
    label: evidenceStepLabel(value),
  }));

  useEffect(() => {
    if (!user) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, {
      auth: { token: user.token },
      transports: ['websocket', 'polling'],
    });

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const relevantModels = new Set(['activityevidence', 'activity']);

    const onEntityUpdated = (event: { model?: string; entityId?: number | string }) => {
      const normalizedModel = event?.model?.toLowerCase();
      if (!normalizedModel || !relevantModels.has(normalizedModel)) return;
      if (event.entityId !== undefined && Number(event.entityId) !== activityId) return;

      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        onSuccess();
      }, 350);
    };

    socket.on('entity:updated', onEntityUpdated);

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      socket.off('entity:updated', onEntityUpdated);
      socket.disconnect();
    };
  }, [activityId, onSuccess, user]);

  const toggleStep = (step: string) => {
    setResetFullFlow(false);
    setRejectedSteps((prev) =>
      prev.includes(step) ? prev.filter((s) => s !== step) : [...prev, step],
    );
  };

  const handleSubmit = async () => {
    if (!user || !action) return;

    if (action === 'reject' && !resetFullFlow && rejectedSteps.length === 0) {
      setError('Debes seleccionar al menos un paso a rechazar');
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
        : {
            reviewerId: user.id,
            notes: notes.trim(),
            ...(resetFullFlow
              ? { resetFullFlow: true }
              : { rejectedSteps }),
          };

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
                  Las evidencias se marcarán como aprobadas y la actividad cambiará a estado &quot;Aprobada&quot;.
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
                  Selecciona uno o varios pasos a corregir, o indica que el técnico debe rehacer todo el flujo desde cero.
                </p>
              </div>

              <label className={styles.fieldGroup} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={resetFullFlow}
                  onChange={(e) => {
                    setResetFullFlow(e.target.checked);
                    if (e.target.checked) setRejectedSteps([]);
                  }}
                />
                <span className={styles.fieldLabel} style={{ margin: 0 }}>
                  Rehacer todo desde cero (borrar evidencias y volver al paso 1)
                </span>
              </label>

              {!resetFullFlow && (
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>
                    Pasos a corregir *
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {steps.map((step) => (
                      <label key={step.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={rejectedSteps.includes(step.value)}
                          onChange={() => toggleStep(step.value)}
                        />
                        {step.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>
                  Observaciones / Razón del rechazo *
                </span>
                <textarea
                  className="input"
                  rows={5}
                  placeholder="Explica qué debe corregir el usuario..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required
                />
              </label>

              <div className={styles.actionsRow}>
                <button
                  className={`button-primary ${styles.flexAction} ${styles.rejectButton}`}
                  onClick={handleSubmit}
                  disabled={loading || !notes.trim() || (!resetFullFlow && rejectedSteps.length === 0)}
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
