"use client";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import styles from './MyVehiclesTable.module.css';
import { openExternalUrl } from '@/lib/open-external-url';

interface VehicleRequest {
  id: number;
  nombreVehiculo?: string | null;
  placasVehiculo?: string | null;
  estatusAprobacion: string;
  fechaInicioAprobada?: string | null;
  fechaFinAprobada?: string | null;
  fechaInicioSolicitada?: string | null;
  fechaFinSolicitada?: string | null;
  entregaEstatus?: string | null;
  entregaFotos?: string[] | null;
  renovacionEstatus?: string | null;
  penalizacionMonto?: number | null;
  penalizacionNotas?: string | null;
  solicitante?: { nombre: string } | null;
  vehiculo?: { nombre: string; placas?: string | null } | null;
}

const MyVehiclesTable: React.FC = () => {
  const { user } = useUser();
  const [requests, setRequests] = useState<VehicleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renewalDrafts, setRenewalDrafts] = useState<Record<number, { inicio: string; fin: string }>>({});
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<number, File[]>>({});
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 900);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');
  const extractList = <T,>(payload: unknown): T[] => {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown[] }).data)) {
      return (payload as { data: T[] }).data;
    }
    return [];
  };

  const fetchRequests = () => {
    if (!user?.token) return;
    setLoading(true);
    fetch(buildApiUrl('vehicles'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setRequests(extractList<VehicleRequest>(data)))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequests();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, {
      transports: ['polling'],
      upgrade: false,
      timeout: 20000,
      reconnectionAttempts: 8,
    });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'VehicleControl') {
        fetchRequests();
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

  const handleDeliverySelect = (id: number, files: File[]) => {
    setDeliveryDrafts((prev) => ({ ...prev, [id]: files }));
  };

  const handleSubmitDelivery = async (id: number) => {
    if (!user?.token) return;
    const files = deliveryDrafts[id] || [];
    if (files.length < 5) {
      setError('Debes subir minimo 5 fotos de entrega');
      return;
    }
    setActionLoading(id);
    setError(null);
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const res = await fetch(buildApiUrl(`vehicles/${id}/delivery-evidence`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || 'Error al subir evidencia');
    } else {
      setDeliveryDrafts((prev) => ({ ...prev, [id]: [] }));
      fetchRequests();
    }
    setActionLoading(null);
  };

  const handleRenewalRequest = async (id: number) => {
    if (!user?.token) return;
    const draft = renewalDrafts[id];
    if (!draft?.inicio || !draft.fin) {
      setError('Selecciona fechas para renovar');
      return;
    }
    setActionLoading(id);
    setError(null);
    const res = await fetch(buildApiUrl(`vehicles/${id}/renewal`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        renovacionSolicitadaInicio: draft.inicio,
        renovacionSolicitadaFin: draft.fin,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || 'Error al solicitar renovacion');
    } else {
      fetchRequests();
    }
    setActionLoading(null);
  };

  if (loading) return <div>Cargando solicitudes...</div>;

  return (
    <div className="card">
      <h2 className={styles.title}>Mis solicitudes de vehiculo</h2>
      
      {requests.length === 0 ? (
        <div className={styles.emptyState}>
          Aun no tienes solicitudes registradas.
        </div>
      ) : (
        <div className={styles.requestsGrid}>
          {requests.map((request) => (
            <div 
              key={request.id} 
              className={`card ${styles.requestCard}`}
            >
              {/* Header */}
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.vehicleName}>
                    {request.vehiculo?.nombre || request.nombreVehiculo || 'Vehiculo'}
                  </div>
                  <div className={styles.plateText}>
                    {request.placasVehiculo || request.vehiculo?.placas || 'Sin placas'}
                  </div>
                </div>
                <div className={`${styles.badgeWrap} ${isMobile ? styles.badgeWrapMobile : ''}`}>
                  <span className={`badge ${request.estatusAprobacion === 'Aprobado' ? 'approved' : request.estatusAprobacion === 'Pendiente' ? 'pending' : request.estatusAprobacion === 'Rechazado' ? 'rejected' : ''}`}>
                    {request.estatusAprobacion}
                  </span>
                  {request.renovacionEstatus && (
                    <span className={`badge ${request.renovacionEstatus === 'Aprobada' ? 'approved' : request.renovacionEstatus === 'Pendiente' ? 'pending' : 'rejected'}`}>
                      Renovacion {request.renovacionEstatus}
                    </span>
                  )}
                </div>
              </div>

              {/* Info Grid */}
              <div className={`${styles.infoGrid} ${isMobile ? styles.infoGridMobile : ''}`}>
                <div className={styles.infoTile}>
                  <div className={styles.sectionLabel}>
                    📅 Periodo solicitado
                  </div>
                  <div className={styles.metaText}>{formatDateTime(request.fechaInicioSolicitada)}</div>
                  <div className={styles.metaText}>{formatDateTime(request.fechaFinSolicitada)}</div>
                </div>
                
                <div className={styles.infoTile}>
                  <div className={styles.sectionLabel}>
                    ✅ Periodo aprobado
                  </div>
                  <div className={styles.metaText}>{formatDateTime(request.fechaInicioAprobada)}</div>
                  <div className={styles.metaText}>{formatDateTime(request.fechaFinAprobada)}</div>
                </div>
                
                <div className={styles.infoTile}>
                  <div className={styles.sectionLabel}>
                    📦 Entrega
                  </div>
                  <div className={styles.statusText}>
                    {request.entregaEstatus || 'Pendiente'}
                  </div>
                  <div className={styles.tinyMuted}>
                    {Array.isArray(request.entregaFotos) ? `${request.entregaFotos.length} foto(s)` : 'Sin fotos'}
                  </div>
                </div>
                
                <div className={styles.infoTile}>
                  <div className={styles.sectionLabel}>
                    💰 Penalizacion
                  </div>
                  <div className={`${styles.statusText} ${request.penalizacionMonto ? styles.dangerText : ''}`}>
                    {request.penalizacionMonto ? `$${request.penalizacionMonto}` : 'Sin penalizacion'}
                  </div>
                  <div className={styles.tinyMuted}>
                    {request.penalizacionNotas || '-'}
                  </div>
                </div>
              </div>

              {/* Fotos de entrega */}
              {Array.isArray(request.entregaFotos) && request.entregaFotos.length > 0 && (
                <div className={styles.photosSection}>
                  <div className={styles.photosTitle}>
                    Evidencias de entrega
                  </div>
                  <div className={`${styles.photosGrid} ${isMobile ? styles.photosGridMobile : ''}`}>
                    {request.entregaFotos.map((foto, index) => (
                      <img
                        key={`${request.id}-foto-${index}`}
                        src={foto}
                        alt={`Entrega ${index + 1}`}
                        className={styles.photoThumb}
                        onClick={() => void openExternalUrl(foto)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones - Solo si está aprobado */}
              {request.estatusAprobacion === 'Aprobado' && (
                <div className={styles.actionsSection}>
                  {/* Evidencia de entrega */}
                  <div className={styles.actionTile}>
                    <div className={styles.actionTitle}>
                      📸 Subir evidencia de entrega
                    </div>
                    <div className={styles.uploadHint}>
                      Minimo 5 fotos del estado del vehiculo
                    </div>
                    <input
                      className={`input ${styles.uploadInput}`}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(event) => handleDeliverySelect(request.id, Array.from(event.target.files || []))}
                    />
                    <div className={styles.fileCount}>
                      {deliveryDrafts[request.id]?.length ? `${deliveryDrafts[request.id].length} archivo(s) seleccionados` : ''}
                    </div>
                    <button
                      className={`button-primary ${isMobile ? styles.fullBtn : ''}`}
                      disabled={actionLoading === request.id}
                      onClick={() => handleSubmitDelivery(request.id)}
                    >
                      {actionLoading === request.id ? '⏳ Subiendo...' : '✓ Subir evidencia'}
                    </button>
                  </div>

                  {/* Solicitar renovacion */}
                  <div className={styles.actionTile}>
                    <div className={styles.actionTitle}>
                      🔄 Solicitar renovacion
                    </div>
                    <div className={`${styles.dateGrid} ${isMobile ? styles.dateGridMobile : ''}`}>
                      <div>
                        <label className={styles.dateLabel}>
                          Fecha inicio
                        </label>
                        <input
                          className={`input ${styles.dateInput}`}
                          type="datetime-local"
                          value={renewalDrafts[request.id]?.inicio || ''}
                          onChange={(event) => setRenewalDrafts((prev) => ({
                            ...prev,
                            [request.id]: { ...prev[request.id], inicio: event.target.value },
                          }))}
                        />
                      </div>
                      <div>
                        <label className={styles.dateLabel}>
                          Fecha fin
                        </label>
                        <input
                          className={`input ${styles.dateInput}`}
                          type="datetime-local"
                          value={renewalDrafts[request.id]?.fin || ''}
                          onChange={(event) => setRenewalDrafts((prev) => ({
                            ...prev,
                            [request.id]: { ...prev[request.id], fin: event.target.value },
                          }))}
                        />
                      </div>
                    </div>
                    <button
                      className={`button-secondary ${isMobile ? styles.fullBtn : ''}`}
                      disabled={actionLoading === request.id}
                      onClick={() => handleRenewalRequest(request.id)}
                    >
                      {actionLoading === request.id ? '⏳ Enviando...' : '↻ Solicitar renovacion'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {error && (
        <div className={styles.errorBox}>
          {error}
        </div>
      )}
    </div>
  );
};

export default MyVehiclesTable;
