"use client";
import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import styles from './EvidenceTable.module.css';

interface Evidence {
  id: number;
  userId?: number;
  tipoEvidencia: string;
  archivoUrl: string;
  aprobada: boolean;
  estatus?: string;
  comentarios?: string | null;
  observacionesRevision?: string | null;
  calificacionEficiencia?: string | null;
  revisadoEn?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  actividad: {
    anNumber: string;
    titulo?: string;
    indicaciones?: string | null;
    creador?: { nombre: string } | null;
    responsable?: { nombre: string } | null;
  };
  user?: { nombre: string } | null;
  aprobadoPor?: { nombre: string } | null;
}

const EvidenceTable: React.FC<{ mode?: 'admin' | 'user'; title?: string | null }> = ({ mode = 'admin', title = 'Evidencias' }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const { user } = useUser();
  const [loading, setLoading] = useState(true);

  // Filtros y paginación
  const [estatus, setEstatus] = useState<string>('');
  const [actividad, setActividad] = useState<string>('');
  const [responsable, setResponsable] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const estatusList = ['Pendiente', 'Aprobada', 'Rechazada'];
  const calificacionOptions = ['Alta', 'Media', 'Baja'];
  const [reviewDrafts, setReviewDrafts] = useState<Record<number, { calificacion: string; observaciones: string }>>({});

  // Simulación de datos de evidencias (reemplazar con fetch real)
  const [evidences, setEvidences] = useState<Evidence[]>([]);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');
  const getAssetUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const base = API_URL.replace(/\/+api\/?$/, '');
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  };
  const getMapsUrl = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return '';
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

  // Filtrado
  const filtered = evidences.filter(evi =>
    (estatus ? evi.estatus === estatus : true) &&
    (actividad ? evi.actividad?.anNumber?.toLowerCase().includes(actividad.toLowerCase()) : true) &&
    (responsable
      ? (evi.user?.nombre || evi.actividad?.responsable?.nombre || '')
        .toLowerCase()
        .includes(responsable.toLowerCase())
      : true)
  );
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const updateReviewDraft = (id: number, changes: Partial<{ calificacion: string; observaciones: string }>) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], calificacion: '', observaciones: '', ...changes },
    }));
  };

  const handleReview = async (id: number, approved: boolean) => {
    if (!user?.token) return;
    const draft = reviewDrafts[id] || { calificacion: '', observaciones: '' };
    const payload = {
      aprobada: approved,
      estatus: approved ? 'Aprobada' : 'Rechazada',
      calificacionEficiencia: draft.calificacion || null,
      observacionesRevision: draft.observaciones || null,
    };
    const res = await fetch(buildApiUrl(`evidences/${id}`), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${user.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      fetchEvidences();
    }
  };

  const handleRemoveOwn = async (id: number) => {
    if (!user?.token) return;
    const res = await fetch(buildApiUrl(`evidences/self/${id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (res.ok) fetchEvidences();
  };


  // Importar evidencias
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportMsg(null);
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(buildApiUrl('evidences/import'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData,
    });
    if (!res.ok) {
      setImportMsg('Error al importar evidencias');
      return;
    }
    const data = await res.json();
    setImportMsg(data.message + (data.count ? ` (${data.count})` : ''));
    fetchEvidences();
  };

  const fetchEvidences = () => {
    if (!user?.token) return;
    setLoading(true);
    fetch(buildApiUrl('evidences'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('No autorizado');
        return res.json();
      })
      .then((data) => setEvidences(Array.isArray(data) ? data : []))
      .catch(() => setEvidences([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user?.token) return;
    fetchEvidences();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['websocket'] });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'Evidence') {
        fetchEvidences();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.token]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) return <div>Cargando evidencias...</div>;

  return (
    <div className="card">
      {title && <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>{title}</h2>}
      <div className={styles.filtersRow}>
        <select className="input" value={estatus} onChange={e => setEstatus(e.target.value)}>
          <option value="">Todos los estatus</option>
          {estatusList.map((e: string) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input
          className="input"
          placeholder="Actividad"
          value={actividad}
          onChange={e => setActividad(e.target.value)}
        />
        <input
          className="input"
          placeholder="Responsable"
          value={responsable}
          onChange={e => setResponsable(e.target.value)}
        />
        {hasPermission(user, PERMISSIONS.EVIDENCES_EXPORT) && (
          <>
            <button
              className="button-primary"
              onClick={async () => {
                const res = await fetch(buildApiUrl('export/evidence'));
                if (!res.ok) return alert('Error al exportar');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'evidencias.xlsx';
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
              }}
            >
              Exportar Excel
            </button>
            <button className="button-primary" onClick={() => fileInputRef.current?.click()}>Importar Excel</button>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              ref={fileInputRef}
              className={styles.hiddenInput}
              onChange={handleImport}
            />
          </>
        )}
      </div>
      {importMsg && <div style={{ color: importMsg.startsWith('Error') ? 'var(--danger)' : 'var(--accent)' }}>{importMsg}</div>}
      <div className={styles.tableWrapper}>
      <table className={`table ${styles.evidenceTable}`}>
        <thead className={styles.tableHead}>
          <tr>
            <th>ID</th>
            <th>Actividad</th>
            <th>Estatus</th>
            <th>Responsable</th>
            <th>Archivo</th>
            <th>Comentarios</th>
            <th>Ubicacion</th>
            <th>Revision</th>
            {hasPermission(user, PERMISSIONS.EVIDENCES_REVIEW) && <th>Acciones</th>}
            {mode === 'user' && <th>Gestion</th>}
          </tr>
        </thead>
        <tbody className={styles.tableBody}>
          {paginated.map((evi: Evidence) => (
            <tr key={evi.id} className={styles.dataRow}>
              <td className={styles.dataCell} data-label="ID">{evi.id}</td>
              <td className={styles.dataCell} data-label="Actividad">
                <div>{evi.actividad?.titulo || evi.actividad?.anNumber}</div>
                <div className={styles.cellSubtext}>{evi.actividad?.anNumber}</div>
                <div className={styles.cellSubtext}>{evi.actividad?.indicaciones || '-'}</div>
                <div className={styles.cellSubtext}>
                  {evi.actividad?.creador?.nombre ? `Asignado por ${evi.actividad?.creador?.nombre}` : 'Asignado por -'}
                </div>
              </td>
              <td className={styles.dataCell} data-label="Estatus">
                <span
                  className={`badge ${
                    evi.estatus === 'Aprobada'
                      ? 'approved'
                      : evi.estatus === 'Pendiente'
                        ? 'pending'
                        : evi.estatus === 'Rechazada'
                          ? 'rejected'
                          : ''
                  }`}
                >
                  {evi.estatus}
                </span>
              </td>
              <td className={styles.dataCell} data-label="Responsable">{evi.user?.nombre || evi.actividad?.responsable?.nombre || '-'}</td>
              <td className={styles.dataCell} data-label="Archivo">
                {evi.archivoUrl ? (
                  <div className={styles.fileCell}>
                    {evi.archivoUrl.toLowerCase().endsWith('.pdf') ? (
                      <div className={styles.filePreviewPdf}>
                        PDF
                      </div>
                    ) : (
                      <img
                        src={getAssetUrl(evi.archivoUrl)}
                        alt="Evidencia"
                        className={styles.filePreviewImage}
                      />
                    )}
                    <a className="link" href={getAssetUrl(evi.archivoUrl)} target="_blank" rel="noopener noreferrer">Ver archivo</a>
                  </div>
                ) : (
                  '-'
                )}
              </td>
              <td className={styles.dataCell} data-label="Comentarios">
                <div>{evi.comentarios || '-'}</div>
                <div className={styles.cellSubtext}>{evi.tipoEvidencia}</div>
              </td>
              <td className={styles.dataCell} data-label="Ubicacion">
                {getMapsUrl(evi.latitud, evi.longitud) ? (
                  <a className="link" href={getMapsUrl(evi.latitud, evi.longitud)} target="_blank" rel="noopener noreferrer">Ver mapa</a>
                ) : (
                  '-'
                )}
              </td>
              <td className={styles.dataCell} data-label="Revision">
                <div>{evi.calificacionEficiencia || '-'}</div>
                <div className={styles.cellSubtext}>{evi.observacionesRevision || '-'}</div>
                <div className={styles.cellSubtext}>{evi.aprobadoPor?.nombre ? `Reviso ${evi.aprobadoPor?.nombre}` : ''}</div>
                <div className={styles.cellSubtext}>{formatDateTime(evi.revisadoEn)}</div>
              </td>
              {hasPermission(user, PERMISSIONS.EVIDENCES_REVIEW) && (
                <td className={styles.dataCell} data-label="Acciones">
                  <div className={styles.actionsCell}>
                    <select
                      className="input"
                      value={reviewDrafts[evi.id]?.calificacion || ''}
                      onChange={(event) => updateReviewDraft(evi.id, { calificacion: event.target.value })}
                    >
                      <option value="">Calificacion</option>
                      {calificacionOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="Observaciones"
                      value={reviewDrafts[evi.id]?.observaciones || ''}
                      onChange={(event) => updateReviewDraft(evi.id, { observaciones: event.target.value })}
                    />
                    <div className={styles.actionsButtons}>
                      <button className="button-primary" onClick={() => handleReview(evi.id, true)}>Aprobar</button>
                      <button className="button-secondary" onClick={() => handleReview(evi.id, false)}>Rechazar</button>
                    </div>
                  </div>
                </td>
              )}
              {mode === 'user' && (
                <td className={styles.dataCell} data-label="Gestion">
                  {evi.estatus === 'Pendiente' ? (
                    <button
                      className="button-secondary"
                      onClick={() => handleRemoveOwn(evi.id)}
                    >
                      Quitar
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Bloqueado</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className={styles.paginationRow}>
        <button className="button-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
        <span>Página {page} de {totalPages || 1}</span>
        <button className="button-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}>Siguiente</button>
      </div>
    </div>
  );
};

  // Pagination
export default EvidenceTable;
