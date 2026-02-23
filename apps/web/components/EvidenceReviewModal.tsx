"use client";
import React, { useState } from 'react';
import { useUser } from './UserContext';

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
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: 12,
          maxWidth: 600,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, color: 'var(--primary)' }}>
            Revisar Evidencias - {activityNumber}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: 0,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {error && (
            <div
              style={{
                padding: 12,
                backgroundColor: '#fee',
                color: '#c00',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              ❌ {error}
            </div>
          )}

          {!action && (
            <div style={{ display: 'grid', gap: 16 }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                Selecciona una acción:
              </p>
              <button
                className="button-primary"
                onClick={() => setAction('approve')}
                style={{
                  padding: '16px 24px',
                  fontSize: 16,
                  backgroundColor: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 24 }}>✅</span>
                Aprobar Evidencias
              </button>
              <button
                className="button-primary"
                onClick={() => setAction('reject')}
                style={{
                  padding: '16px 24px',
                  fontSize: 16,
                  backgroundColor: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 24 }}>❌</span>
                Rechazar Evidencias
              </button>
            </div>
          )}

          {action === 'approve' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div
                style={{
                  padding: 16,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  borderRadius: 8,
                  border: '2px solid #10b981',
                }}
              >
                <h3 style={{ margin: '0 0 8px 0', color: '#10b981' }}>✅ Aprobar Evidencias</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
                  Las evidencias se marcarán como aprobadas y la actividad cambiará a estado "Aprobada".
                </p>
              </div>

              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
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

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  className="button-primary"
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{ flex: 1, backgroundColor: '#10b981' }}
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
            <div style={{ display: 'grid', gap: 16 }}>
              <div
                style={{
                  padding: 16,
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: 8,
                  border: '2px solid #ef4444',
                }}
              >
                <h3 style={{ margin: '0 0 8px 0', color: '#ef4444' }}>❌ Rechazar Evidencias</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
                  Selecciona el paso que debe corregirse. El usuario recibirá una notificación.
                </p>
              </div>

              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
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

              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
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

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  className="button-primary"
                  onClick={handleSubmit}
                  disabled={loading || !rejectedStep || !notes.trim()}
                  style={{ flex: 1, backgroundColor: '#ef4444' }}
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
