"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from './UserContext';

interface ActivityOption {
  id: number;
  anNumber: string;
  titulo?: string;
}

const EvidenceUploader = ({ actividadId }: { actividadId?: number }) => {
  const { user } = useUser();
  const [files, setFiles] = useState<{ file: File; url: string; kind: 'image' | 'pdf' }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [tipo, setTipo] = useState('Hoja de Servicio');
  const [comentarios, setComentarios] = useState('');
  const [actividadSeleccionada, setActividadSeleccionada] = useState<number | ''>(actividadId || '');
  const [actividades, setActividades] = useState<ActivityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/\.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  useEffect(() => {
    if (!user?.token || actividadId) return;
    fetch(buildApiUrl('activities'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setActividades(Array.isArray(data) ? data : []))
      .catch(() => setActividades([]));
  }, [user?.token, actividadId]);

  useEffect(() => () => {
    files.forEach((entry) => URL.revokeObjectURL(entry.url));
  }, [files]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || !user) return;
    const actividadIdFinal = actividadId || actividadSeleccionada;
    if (!actividadIdFinal) return;
    setLocationError(null);
    setSubmitError(null);
    setStatusMsg(null);
    setLoading(true);
    const formData = new FormData();
    files.forEach((entry) => formData.append('files', entry.file));
    formData.append('tipoEvidencia', tipo);
    formData.append('actividadId', String(actividadIdFinal));
    formData.append('comentarios', comentarios);

    if (tipo === 'Foto llegada') {
      if (!navigator.geolocation) {
        setLocationError('Tu navegador no soporta geolocalizacion.');
        setLoading(false);
        return;
      }
      try {
        const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            () => reject(new Error('No se pudo obtener la ubicacion')),
            { enableHighAccuracy: true, timeout: 15000 }
          );
        });
        formData.append('latitud', String(coords.latitude));
        formData.append('longitud', String(coords.longitude));
      } catch {
        setLocationError('No se pudo obtener la ubicacion.');
        setLoading(false);
        return;
      }
    }
    const res = await fetch(buildApiUrl('evidences'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSubmitError(data.message || 'No se pudo subir la evidencia.');
      setLoading(false);
      return;
    }
    setLoading(false);
    setStatusMsg('Evidencia subida correctamente.');
    files.forEach((entry) => URL.revokeObjectURL(entry.url));
    setFiles([]);
    setComentarios('');
  };

  const isSupportedFile = (file: File) => file.type.startsWith('image/') || file.type === 'application/pdf';

  const handleFileSelect = (selected?: File[] | null) => {
    if (!selected || selected.length === 0) return;
    const next = selected.filter(isSupportedFile).map((file) => ({
      file,
      url: URL.createObjectURL(file),
      kind: (file.type === 'application/pdf' ? 'pdf' : 'image') as const,
    }));
    if (next.length === 0) return;
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const entry = prev[index];
      if (entry) URL.revokeObjectURL(entry.url);
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const clearFiles = () => {
    files.forEach((entry) => URL.revokeObjectURL(entry.url));
    setFiles([]);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    handleFileSelect(droppedFiles);
  };

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
      {!actividadId && (
        <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>
          Actividad:
          <select
            className="input"
            value={actividadSeleccionada}
            onChange={(e) => {
              const value = e.target.value;
              setActividadSeleccionada(value ? Number(value) : '');
            }}
            style={{ marginLeft: 8 }}
            required
          >
            <option value="">Selecciona actividad</option>
            {actividades.map((actividad) => (
              <option key={actividad.id} value={actividad.id}>
                {actividad.anNumber} - {actividad.titulo || 'Sin titulo'}
              </option>
            ))}
          </select>
        </label>
      )}
      <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>
        Tipo de evidencia:
        <select className="input" value={tipo} onChange={e => setTipo(e.target.value)} style={{ marginLeft: 8 }}>
          <option value="Hoja de Servicio">Hoja de Servicio</option>
          <option value="Foto llegada">Foto llegada</option>
          <option value="Foto salida">Foto salida</option>
          <option value="Evidencia general">Evidencia general</option>
        </select>
      </label>
      <textarea
        className="input"
        rows={3}
        placeholder="Comentarios de evidencia"
        value={comentarios}
        onChange={(e) => setComentarios(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--muted)'}`,
          background: isDragging ? 'rgba(15, 106, 214, 0.08)' : 'var(--surface-light)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        <input
          id="evidence-file"
          className="input"
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => handleFileSelect(Array.from(e.target.files || []))}
          style={{ display: 'none' }}
        />
        <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
          Arrastra tus archivos aqui o
        </div>
        <label htmlFor="evidence-file" className="button-secondary" style={{ cursor: 'pointer' }}>
          Seleccionar archivo
        </label>
        <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
          {files.length > 0 ? `${files.length} archivo(s) seleccionados` : 'Ningun archivo seleccionado'}
        </div>
      </div>
      {files.length > 0 && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {files.map((entry, index) => (
              <div
                key={`${entry.file.name}-${index}`}
                style={{
                  position: 'relative',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  overflow: 'hidden',
                  background: 'rgba(15, 106, 214, 0.08)',
                  minHeight: entry.kind === 'pdf' ? 180 : 110,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {entry.kind === 'image' ? (
                  <img src={entry.url} alt={entry.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <object
                    data={entry.url}
                    type="application/pdf"
                    width="100%"
                    height="100%"
                    aria-label="Vista previa PDF"
                  >
                    <embed src={entry.url} type="application/pdf" />
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, padding: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>PDF</div>
                      <div style={{ wordBreak: 'break-word' }}>{entry.file.name}</div>
                    </div>
                  </object>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    border: 'none',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    cursor: 'pointer',
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="button-primary" type="submit" disabled={loading || files.length === 0}>Subir</button>
        {locationError && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{locationError}</span>}
        {submitError && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{submitError}</span>}
        {statusMsg && <span style={{ color: 'var(--accent)', fontSize: 12 }}>{statusMsg}</span>}
        {files.length > 0 && (
          <button
            className="button-secondary"
            type="button"
            onClick={clearFiles}
            disabled={loading}
          >
            Quitar archivo
          </button>
        )}
      </div>
    </form>
  );
};

export default EvidenceUploader;
