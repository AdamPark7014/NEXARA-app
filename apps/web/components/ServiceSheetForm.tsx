"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useUser } from './UserContext';
import PDFViewer from './PDFViewer';
import styles from './ServiceSheetForm.module.css';

interface ActivityOption {
  id: number;
  anNumber: string;
  titulo?: string;
}

export default function ServiceSheetForm() {
  const [isMobile, setIsMobile] = useState(false);
  const { user } = useUser();
  const [activityId, setActivityId] = useState<number | ''>('');
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [managerName, setManagerName] = useState('');
  const [managerRole, setManagerRole] = useState('');
  const [workSummary, setWorkSummary] = useState('');
  const [equipmentItems, setEquipmentItems] = useState<Array<{ name: string; model: string; serial: string; action: string }>>([
    { name: '', model: '', serial: '', action: '' },
  ]);
  const [observations, setObservations] = useState('');
  const [signedName, setSignedName] = useState('');
  const [survey, setSurvey] = useState({
    engineerIdentified: '',
    friendlyAttention: '',
    solutionSatisfied: '',
    notes: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const pdfModalRef = useRef<HTMLDivElement | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl('activities'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setActivities(Array.isArray(data) ? data : []))
      .catch(() => setActivities([]));
  }, [user?.token]);

  const handleSave = async () => {
    if (!user?.token || !activityId) return;
    setMessage(null);

    const equipmentJson = equipmentItems
      .map((item) => ({
        name: item.name.trim(),
        model: item.model.trim(),
        serial: item.serial.trim(),
        action: item.action.trim(),
      }))
      .filter((item) => Object.values(item).some(Boolean));

    const parseSurvey = (value: string) => {
      if (value === 'si') return true;
      if (value === 'no') return false;
      return null;
    };

    const surveyPayload = {
      engineerIdentified: parseSurvey(survey.engineerIdentified),
      friendlyAttention: parseSurvey(survey.friendlyAttention),
      solutionSatisfied: parseSurvey(survey.solutionSatisfied),
      notes: survey.notes.trim() || null,
    };

    const res = await fetch(buildApiUrl(`service-sheets/${activityId}`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        managerName,
        managerRole,
        workSummary,
        equipmentList: equipmentJson.length ? equipmentJson : null,
        observations,
        signedName,
        survey: surveyPayload,
      }),
    });

    if (!res.ok) {
      setMessage('No se pudo guardar la hoja de servicio');
      return;
    }

    setMessage('Hoja de servicio guardada');
  };

  const handlePdf = async () => {
    if (!user?.token || !activityId) return;
    const res = await fetch(buildApiUrl(`service-sheets/${activityId}/pdf`), {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!res.ok) {
      setMessage('No se pudo generar el PDF');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setPdfUrl(url);
    setShowPdfViewer(true);
  };

  const handleDownloadPdf = () => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `hoja-servicio-${activityId}.pdf`;
    link.click();
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!showPdfViewer) return;

    const modal = pdfModalRef.current;
    if (!modal) return;

    const getFocusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);

    const initialFocusable = getFocusable();
    initialFocusable[0]?.focus();

    const handleModalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowPdfViewer(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === first || !modal.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeElement || activeElement === last || !modal.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    modal.addEventListener('keydown', handleModalKeyDown);
    return () => modal.removeEventListener('keydown', handleModalKeyDown);
  }, [showPdfViewer]);

  return (
    <div className={`card ${styles.formCard}`}>
      <h2 className={styles.title}>Hoja de servicio</h2>
      <div className={styles.subtitle}>Llena los datos para generar el PDF del ticket.</div>
      <select className="input" aria-label="Seleccionar actividad" value={activityId} onChange={(e) => setActivityId(e.target.value ? Number(e.target.value) : '')}>
        <option value="">Selecciona actividad</option>
        {activities.map((activity) => (
          <option key={activity.id} value={activity.id}>
            {activity.anNumber} - {activity.titulo || 'Sin titulo'}
          </option>
        ))}
      </select>
      <div className={`${styles.topGrid} ${isMobile ? styles.topGridMobile : ''}`}>
        <input className="input" placeholder="Gerente / Encargado" aria-label="Gerente o encargado" value={managerName} onChange={(e) => setManagerName(e.target.value)} />
        <input className="input" placeholder="Cargo" aria-label="Cargo del gerente o encargado" value={managerRole} onChange={(e) => setManagerRole(e.target.value)} />
      </div>
      <textarea className="input" rows={3} placeholder="Trabajo realizado" aria-label="Trabajo realizado" value={workSummary} onChange={(e) => setWorkSummary(e.target.value)} />
      <div className={styles.equipmentSection}>
        <div className={styles.sectionTitle}>Equipos atendidos</div>
        {equipmentItems.map((item, index) => (
          <div key={index} className={`${styles.equipmentRow} ${isMobile ? styles.equipmentRowMobile : ''}`}>
            <input
              className="input"
              placeholder="Equipo"
              value={item.name}
              onChange={(e) => {
                const next = [...equipmentItems];
                next[index] = { ...next[index], name: e.target.value };
                setEquipmentItems(next);
              }}
            />
            <input
              className="input"
              placeholder="Modelo"
              value={item.model}
              onChange={(e) => {
                const next = [...equipmentItems];
                next[index] = { ...next[index], model: e.target.value };
                setEquipmentItems(next);
              }}
            />
            <input
              className="input"
              placeholder="Serie"
              value={item.serial}
              onChange={(e) => {
                const next = [...equipmentItems];
                next[index] = { ...next[index], serial: e.target.value };
                setEquipmentItems(next);
              }}
            />
            <input
              className="input"
              placeholder="Actividad realizada"
              value={item.action}
              onChange={(e) => {
                const next = [...equipmentItems];
                next[index] = { ...next[index], action: e.target.value };
                setEquipmentItems(next);
              }}
            />
          </div>
        ))}
        <div className={styles.equipmentActions}>
          <button
            className="button-secondary"
            type="button"
            onClick={() => setEquipmentItems((prev) => [...prev, { name: '', model: '', serial: '', action: '' }])}
          >
            Agregar equipo
          </button>
          {equipmentItems.length > 1 && (
            <button
              className="button-secondary"
              type="button"
              onClick={() => setEquipmentItems((prev) => prev.slice(0, -1))}
            >
              Quitar ultimo
            </button>
          )}
        </div>
      </div>
      <textarea className="input" rows={3} placeholder="Observaciones" aria-label="Observaciones" value={observations} onChange={(e) => setObservations(e.target.value)} />
      <input className="input" placeholder="Firma digital (nombre)" aria-label="Firma digital nombre" value={signedName} onChange={(e) => setSignedName(e.target.value)} />
      <div className={styles.surveySection}>
        <div className={styles.sectionTitle}>Encuesta de calidad</div>
        {[
          { key: 'engineerIdentified', label: 'El ingeniero se identifico' },
          { key: 'friendlyAttention', label: 'La atencion fue amable' },
          { key: 'solutionSatisfied', label: 'Satisfecho con la solucion' },
        ].map((item) => (
          <div key={item.key} className={styles.questionRow}>
            <span className={`${styles.questionText} ${isMobile ? styles.questionTextMobile : ''}`}>{item.label}</span>
            <label className={styles.inlineLabel}>
              <input
                type="radio"
                name={item.key}
                value="si"
                checked={(survey as any)[item.key] === 'si'}
                onChange={() => setSurvey((prev) => ({ ...prev, [item.key]: 'si' }))}
              />
              Si
            </label>
            <label className={styles.inlineLabel}>
              <input
                type="radio"
                name={item.key}
                value="no"
                checked={(survey as any)[item.key] === 'no'}
                onChange={() => setSurvey((prev) => ({ ...prev, [item.key]: 'no' }))}
              />
              No
            </label>
          </div>
        ))}
        <textarea
          className="input"
          rows={2}
          placeholder="Observaciones adicionales"
          aria-label="Observaciones adicionales de encuesta"
          value={survey.notes}
          onChange={(e) => setSurvey((prev) => ({ ...prev, notes: e.target.value }))}
        />
      </div>
      <div className={styles.formActions}>
        <button className="button-primary" type="button" onClick={handleSave}>Guardar hoja</button>
        <button className="button-secondary" type="button" onClick={handlePdf}>Ver PDF</button>
        {message && <span className={message.startsWith('No') ? styles.messageError : styles.messageSuccess}>{message}</span>}
      </div>

      {/* PDF Viewer Modal */}
      {showPdfViewer && pdfUrl && (
        <div className={styles.modalOverlay} onClick={() => setShowPdfViewer(false)} aria-hidden="true">
          <div
            ref={pdfModalRef}
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Hoja de servicio ${activityId} en PDF`}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Hoja de Servicio #{activityId}</h3>
              <div className={styles.modalActions}>
                <button type="button" className="button-primary" onClick={handleDownloadPdf}>
                  📥 Descargar
                </button>
                <button type="button" className="button-secondary" onClick={() => setShowPdfViewer(false)}>
                  ✕ Cerrar
                </button>
              </div>
            </div>
            <div className={styles.viewerWrap}>
              <PDFViewer 
                pdfUrl={pdfUrl} 
                fileName={`hoja-servicio-${activityId}.pdf`}
                height="calc(90vh - 80px)"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
