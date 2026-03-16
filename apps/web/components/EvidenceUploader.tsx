"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { useUser } from './UserContext';
import styles from './EvidenceUploader.module.css';
import { io, Socket } from 'socket.io-client';

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

  const fetchActivities = useCallback(() => {
    if (!user?.token || actividadId) return;
    fetch(buildApiUrl('activities'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setActividades(Array.isArray(data) ? data : []))
      .catch(() => setActividades([]));
  }, [user?.token, actividadId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    if (!user?.token || actividadId) return;

    const socketUrl = API_URL.replace(/\/+api\/?$/, '');
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchActivities();
      }, 300);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['Activity', 'Actividad', 'Evidence'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [API_URL, user?.token, actividadId, fetchActivities]);

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
            () => reject(new Error('No se pudo obtener la ubicación')),
            { enableHighAccuracy: true, timeout: 15000 }
          );
        });
        formData.append('latitud', String(coords.latitude));
        formData.append('longitud', String(coords.longitude));
      } catch {
        setLocationError('No se pudo obtener la ubicación.');
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
      kind: file.type === 'application/pdf' ? ('pdf' as const) : ('image' as const),
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
    <form className={`card ${styles.form}`} onSubmit={handleSubmit}>
      {!actividadId && (
        <label className={styles.fieldLabel}>
          Actividad:
          <select
            value={actividadSeleccionada}
            onChange={(e) => {
              const value = e.target.value;
              setActividadSeleccionada(value ? Number(value) : '');
            }}
            className={`input ${styles.inlineSelect}`}
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
      <label className={styles.fieldLabel}>
        Tipo de evidencia:
        <select className={`input ${styles.inlineSelect}`} value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="Hoja de Servicio">Hoja de Servicio</option>
          <option value="Foto llegada">Foto llegada</option>
          <option value="Foto salida">Foto salida</option>
          <option value="Evidencia general">Evidencia general</option>
        </select>
      </label>
      <textarea
        rows={3}
        placeholder="Comentarios de evidencia"
        value={comentarios}
        onChange={(e) => setComentarios(e.target.value)}
        className={`input ${styles.commentInput}`}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`${styles.dropzone} ${isDragging ? styles.dropzoneDragging : ''}`}
      >
        <input
          id="evidence-file"
          className={styles.hiddenInput}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => handleFileSelect(Array.from(e.target.files || []))}
        />
        <div className={styles.helperText}>
          Arrastra tus archivos aquí o
        </div>
        <label htmlFor="evidence-file" className={`button-secondary ${styles.fileTrigger}`}>
          Seleccionar archivo
        </label>
        <div className={`${styles.helperText} ${styles.helperBottom}`}>
          {files.length > 0 ? `${files.length} archivo(s) seleccionados` : 'Ningun archivo seleccionado'}
        </div>
      </div>
      {files.length > 0 && (
        <div className={styles.previewList}>
          <div className={styles.previewGrid}>
            {files.map((entry, index) => (
              <div
                key={`${entry.file.name}-${index}`}
                className={`${styles.previewTile} ${entry.kind === 'pdf' ? styles.previewTilePdf : ''}`}
              >
                {entry.kind === 'image' ? (
                  <img src={entry.url} alt={entry.file.name} className={styles.previewImage} />
                ) : (
                  <object
                    data={entry.url}
                    type="application/pdf"
                    width="100%"
                    height="100%"
                    aria-label="Vista previa PDF"
                  >
                    <embed src={entry.url} type="application/pdf" />
                    <div className={styles.pdfFallback}>
                      <div className={styles.pdfTitle}>PDF</div>
                      <div className={styles.pdfName}>{entry.file.name}</div>
                    </div>
                  </object>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className={styles.removeBtn}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className={styles.actionsRow}>
        <button className="button-primary" type="submit" disabled={loading || files.length === 0}>Subir</button>
        {locationError && <span className={styles.msgError}>{locationError}</span>}
        {submitError && <span className={styles.msgError}>{submitError}</span>}
        {statusMsg && <span className={styles.msgSuccess}>{statusMsg}</span>}
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

