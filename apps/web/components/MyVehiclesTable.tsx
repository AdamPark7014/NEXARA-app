"use client";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';

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

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');

  const fetchRequests = () => {
    if (!user?.token) return;
    setLoading(true);
    fetch(buildApiUrl('vehicles'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setRequests(Array.isArray(data) ? data : []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequests();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['websocket'] });

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
      <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Mis solicitudes de vehiculo</h2>
      {requests.length === 0 && (
        <div style={{ color: 'var(--text-secondary)' }}>Aun no tienes solicitudes registradas.</div>
      )}
      {requests.map((request) => (
        <div key={request.id} className="card" style={{ marginBottom: 12, background: 'var(--surface-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>{request.vehiculo?.nombre || request.nombreVehiculo || 'Vehiculo'}</strong>
              <div style={{ color: 'var(--text-secondary)' }}>{request.placasVehiculo || request.vehiculo?.placas || '-'}</div>
            </div>
            <div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Periodo solicitado</div>
              <div>{formatDateTime(request.fechaInicioSolicitada)}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{formatDateTime(request.fechaFinSolicitada)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Periodo aprobado</div>
              <div>{formatDateTime(request.fechaInicioAprobada)}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{formatDateTime(request.fechaFinAprobada)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Entrega</div>
              <div>{request.entregaEstatus || 'Pendiente'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {Array.isArray(request.entregaFotos) ? `${request.entregaFotos.length} foto(s)` : 'Sin fotos'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Penalizacion</div>
              <div>{request.penalizacionMonto ? `$${request.penalizacionMonto}` : '-'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {request.penalizacionNotas || 'Sin notas'}
              </div>
            </div>
          </div>
          {Array.isArray(request.entregaFotos) && request.entregaFotos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {request.entregaFotos.map((foto, index) => (
                <img
                  key={`${request.id}-foto-${index}`}
                  src={foto}
                  alt={`Entrega ${index + 1}`}
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: '1px solid var(--muted)',
                  }}
                />
              ))}
            </div>
          )}
          {request.estatusAprobacion === 'Aprobado' && (
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>Evidencia de entrega (minimo 5 fotos)</div>
                <input
                  className="input"
                  type="file"
                  multiple
                  onChange={(event) => handleDeliverySelect(request.id, Array.from(event.target.files || []))}
                />
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>
                  {deliveryDrafts[request.id]?.length ? `${deliveryDrafts[request.id].length} archivo(s) seleccionados` : ''}
                </div>
                <button
                  className="button-primary"
                  style={{ marginTop: 8 }}
                  disabled={actionLoading === request.id}
                  onClick={() => handleSubmitDelivery(request.id)}
                >
                  {actionLoading === request.id ? 'Subiendo...' : 'Subir evidencia'}
                </button>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>Solicitar renovacion</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  <input
                    className="input"
                    type="datetime-local"
                    value={renewalDrafts[request.id]?.inicio || ''}
                    onChange={(event) => setRenewalDrafts((prev) => ({
                      ...prev,
                      [request.id]: { ...prev[request.id], inicio: event.target.value },
                    }))}
                  />
                  <input
                    className="input"
                    type="datetime-local"
                    value={renewalDrafts[request.id]?.fin || ''}
                    onChange={(event) => setRenewalDrafts((prev) => ({
                      ...prev,
                      [request.id]: { ...prev[request.id], fin: event.target.value },
                    }))}
                  />
                </div>
                <button
                  className="button-secondary"
                  style={{ marginTop: 8 }}
                  disabled={actionLoading === request.id}
                  onClick={() => handleRenewalRequest(request.id)}
                >
                  {actionLoading === request.id ? 'Enviando...' : 'Solicitar renovacion'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
};

export default MyVehiclesTable;
