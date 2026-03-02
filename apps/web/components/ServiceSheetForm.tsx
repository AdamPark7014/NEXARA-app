"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from './UserContext';
import PDFViewer from './PDFViewer';

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

  return (
    <div className="card" style={{ display: 'grid', gap: 12, maxWidth: 780, width: '100%' }}>
      <h2 style={{ margin: 0, color: 'var(--primary)' }}>Hoja de servicio</h2>
      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Llena los datos para generar el PDF del ticket.</div>
      <select className="input" value={activityId} onChange={(e) => setActivityId(e.target.value ? Number(e.target.value) : '')}>
        <option value="">Selecciona actividad</option>
        {activities.map((activity) => (
          <option key={activity.id} value={activity.id}>
            {activity.anNumber} - {activity.titulo || 'Sin titulo'}
          </option>
        ))}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <input className="input" placeholder="Gerente / Encargado" value={managerName} onChange={(e) => setManagerName(e.target.value)} />
        <input className="input" placeholder="Cargo" value={managerRole} onChange={(e) => setManagerRole(e.target.value)} />
      </div>
      <textarea className="input" rows={3} placeholder="Trabajo realizado" value={workSummary} onChange={(e) => setWorkSummary(e.target.value)} />
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Equipos atendidos</div>
        {equipmentItems.map((item, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
      <textarea className="input" rows={3} placeholder="Observaciones" value={observations} onChange={(e) => setObservations(e.target.value)} />
      <input className="input" placeholder="Firma digital (nombre)" value={signedName} onChange={(e) => setSignedName(e.target.value)} />
      <div style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 12, border: '1px solid rgba(31,107,186,0.2)', background: 'rgba(31,107,186,0.04)' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Encuesta de calidad</div>
        {[
          { key: 'engineerIdentified', label: 'El ingeniero se identifico' },
          { key: 'friendlyAttention', label: 'La atencion fue amable' },
          { key: 'solutionSatisfied', label: 'Satisfecho con la solucion' },
        ].map((item) => (
          <div key={item.key} style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ minWidth: isMobile ? 0 : 220, color: 'var(--text-secondary)', width: isMobile ? '100%' : 'auto' }}>{item.label}</span>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name={item.key}
                value="si"
                checked={(survey as any)[item.key] === 'si'}
                onChange={() => setSurvey((prev) => ({ ...prev, [item.key]: 'si' }))}
              />
              Si
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
          value={survey.notes}
          onChange={(e) => setSurvey((prev) => ({ ...prev, notes: e.target.value }))}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="button-primary" type="button" onClick={handleSave}>Guardar hoja</button>
        <button className="button-secondary" type="button" onClick={handlePdf}>Ver PDF</button>
        {message && <span style={{ color: message.startsWith('No') ? 'var(--danger)' : 'var(--accent)' }}>{message}</span>}
      </div>

      {/* PDF Viewer Modal */}
      {showPdfViewer && pdfUrl && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setShowPdfViewer(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: '8px',
              maxWidth: '1200px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0 }}>Hoja de Servicio #{activityId}</h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="button-primary" onClick={handleDownloadPdf}>
                  📥 Descargar
                </button>
                <button className="button-secondary" onClick={() => setShowPdfViewer(false)}>
                  ✕ Cerrar
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
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
