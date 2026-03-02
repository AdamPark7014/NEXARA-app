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
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });

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
      
      {requests.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', padding: 24, textAlign: 'center' }}>
          Aun no tienes solicitudes registradas.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {requests.map((request) => (
            <div 
              key={request.id} 
              className="card" 
              style={{ 
                marginBottom: 0,
                background: 'var(--surface-light)',
                border: '1px solid var(--border)'
              }}
            >
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                gap: 12, 
                flexWrap: 'wrap',
                paddingBottom: 12,
                borderBottom: '1px solid var(--border)',
                marginBottom: 12
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                    {request.vehiculo?.nombre || request.nombreVehiculo || 'Vehiculo'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {request.placasVehiculo || request.vehiculo?.placas || 'Sin placas'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 6, alignItems: 'flex-end' }}>
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
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: 16, 
                marginBottom: 16 
              }}>
                <div style={{ 
                  padding: 12, 
                  borderRadius: 8, 
                  background: 'var(--surface)',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>
                    📅 Periodo solicitado
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 2 }}>{formatDateTime(request.fechaInicioSolicitada)}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{formatDateTime(request.fechaFinSolicitada)}</div>
                </div>
                
                <div style={{ 
                  padding: 12, 
                  borderRadius: 8, 
                  background: 'var(--surface)',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>
                    ✅ Periodo aprobado
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 2 }}>{formatDateTime(request.fechaInicioAprobada)}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{formatDateTime(request.fechaFinAprobada)}</div>
                </div>
                
                <div style={{ 
                  padding: 12, 
                  borderRadius: 8, 
                  background: 'var(--surface)',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>
                    📦 Entrega
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                    {request.entregaEstatus || 'Pendiente'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {Array.isArray(request.entregaFotos) ? `${request.entregaFotos.length} foto(s)` : 'Sin fotos'}
                  </div>
                </div>
                
                <div style={{ 
                  padding: 12, 
                  borderRadius: 8, 
                  background: 'var(--surface)',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>
                    💰 Penalizacion
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: request.penalizacionMonto ? 'var(--danger)' : 'var(--text-primary)' }}>
                    {request.penalizacionMonto ? `$${request.penalizacionMonto}` : 'Sin penalizacion'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                    {request.penalizacionNotas || '-'}
                  </div>
                </div>
              </div>

              {/* Fotos de entrega */}
              {Array.isArray(request.entregaFotos) && request.entregaFotos.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                    Evidencias de entrega
                  </div>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(80px, 1fr))' : 'repeat(auto-fill, minmax(100px, 1fr))',
                    gap: 8
                  }}>
                    {request.entregaFotos.map((foto, index) => (
                      <img
                        key={`${request.id}-foto-${index}`}
                        src={foto}
                        alt={`Entrega ${index + 1}`}
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          objectFit: 'cover',
                          borderRadius: 10,
                          border: '1px solid var(--muted)',
                          cursor: 'pointer'
                        }}
                        onClick={() => window.open(foto, '_blank')}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones - Solo si está aprobado */}
              {request.estatusAprobacion === 'Aprobado' && (
                <div style={{ 
                  display: 'grid', 
                  gap: 16, 
                  paddingTop: 16, 
                  borderTop: '1px solid var(--border)' 
                }}>
                  {/* Evidencia de entrega */}
                  <div style={{ 
                    padding: 12, 
                    borderRadius: 8, 
                    background: 'var(--surface)',
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                      📸 Subir evidencia de entrega
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 8 }}>
                      Minimo 5 fotos del estado del vehiculo
                    </div>
                    <input
                      className="input"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(event) => handleDeliverySelect(request.id, Array.from(event.target.files || []))}
                      style={{ marginBottom: 8, fontSize: 13 }}
                    />
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 10 }}>
                      {deliveryDrafts[request.id]?.length ? `${deliveryDrafts[request.id].length} archivo(s) seleccionados` : ''}
                    </div>
                    <button
                      className="button-primary"
                      style={{ width: isMobile ? '100%' : 'auto', padding: '10px 16px', fontSize: 13 }}
                      disabled={actionLoading === request.id}
                      onClick={() => handleSubmitDelivery(request.id)}
                    >
                      {actionLoading === request.id ? '⏳ Subiendo...' : '✓ Subir evidencia'}
                    </button>
                  </div>

                  {/* Solicitar renovacion */}
                  <div style={{ 
                    padding: 12, 
                    borderRadius: 8, 
                    background: 'var(--surface)',
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                      🔄 Solicitar renovacion
                    </div>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                      gap: 8, 
                      marginBottom: 10 
                    }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                          Fecha inicio
                        </label>
                        <input
                          className="input"
                          type="datetime-local"
                          value={renewalDrafts[request.id]?.inicio || ''}
                          onChange={(event) => setRenewalDrafts((prev) => ({
                            ...prev,
                            [request.id]: { ...prev[request.id], inicio: event.target.value },
                          }))}
                          style={{ fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                          Fecha fin
                        </label>
                        <input
                          className="input"
                          type="datetime-local"
                          value={renewalDrafts[request.id]?.fin || ''}
                          onChange={(event) => setRenewalDrafts((prev) => ({
                            ...prev,
                            [request.id]: { ...prev[request.id], fin: event.target.value },
                          }))}
                          style={{ fontSize: 13 }}
                        />
                      </div>
                    </div>
                    <button
                      className="button-secondary"
                      style={{ width: isMobile ? '100%' : 'auto', padding: '10px 16px', fontSize: 13 }}
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
        <div style={{ 
          color: 'var(--danger)', 
          marginTop: 16, 
          padding: 12, 
          borderRadius: 8, 
          background: 'var(--danger)10',
          border: '1px solid var(--danger)30',
          fontSize: 13
        }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default MyVehiclesTable;
