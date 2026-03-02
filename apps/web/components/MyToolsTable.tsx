"use client";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import FinesTable from './FinesTable';

interface ToolRequest {
  id: number;
  toolName: string;
  model: string;
  serialNumber: string;
  reason: string;
  startDate: string;
  expectedReturnDate: string;
  status: 'PENDING' | 'APPROVED' | 'IN_USE' | 'RETURNED' | 'DAMAGED' | 'REJECTED';
  requestDate: string;
  approvalDate: string | null;
  returnDate: string | null;
  renewalCount: number;
}

const MyToolsTable: React.FC = () => {
  const { user } = useUser();
  const [tools, setTools] = useState<ToolRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renewalModalOpen, setRenewalModalOpen] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<number | null>(null);
  const [newReturnDate, setNewReturnDate] = useState('');
  const [renewalReason, setRenewalReason] = useState('');
  const [renewalLoading, setRenewalLoading] = useState(false);
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

  const fetchTools = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('tool-requests/my-requests'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error('Error al cargar herramientas');
      const data = await res.json();
      setTools(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, [user]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['websocket'] });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'ToolRequest') {
        fetchTools();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.token]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'var(--warning)';
      case 'APPROVED':
        return 'var(--info)';
      case 'IN_USE':
        return 'var(--success)';
      case 'RETURNED':
        return 'var(--text-secondary)';
      case 'DAMAGED':
        return 'var(--danger)';
      case 'REJECTED':
        return 'var(--danger)';
      default:
        return 'var(--text-primary)';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      PENDING: 'Pendiente',
      APPROVED: 'Aprobada',
      IN_USE: 'En Uso',
      RETURNED: 'Devuelta',
      DAMAGED: 'Dañada',
      REJECTED: 'Rechazada',
    };
    return labels[status] || status;
  };

  const canRenew = (tool: ToolRequest) => {
    if (tool.status !== 'IN_USE') return false;
    const daysUntilExpiry = Math.ceil(
      (new Date(tool.expectedReturnDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  const handleRenewalSubmit = async () => {
    if (!user || !selectedToolId || !newReturnDate) {
      setError('Por favor completa todos los campos');
      return;
    }

    setRenewalLoading(true);
    try {
      const res = await fetch(
        buildApiUrl(`tool-requests/${selectedToolId}/renewal-request`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            newReturnDate: new Date(newReturnDate).toISOString(),
            renewalReason,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al solicitar renovación');
      }

      setRenewalModalOpen(false);
      setSelectedToolId(null);
      setNewReturnDate('');
      setRenewalReason('');
      await fetchTools();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRenewalLoading(false);
    }
  };

  const openRenewalModal = (toolId: number) => {
    setSelectedToolId(toolId);
    const today = new Date();
    today.setDate(today.getDate() + 1);
    setNewReturnDate(today.toISOString().split('T')[0]);
    setRenewalModalOpen(true);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 20 }}>Cargando herramientas...</div>;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <h3 style={{ color: 'var(--primary)', marginBottom: 4 }}>Mis Herramientas</h3>
        
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}

        {tools.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>
            No tienes herramientas solicitadas aún
          </div>
        ) : (
          <>
            {/* Vista Desktop - Tabla */}
            {!isMobile && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 800 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--muted)' }}>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Herramienta
                      </th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Modelo/Serie
                      </th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Estado
                      </th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Devolución
                      </th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Renovaciones
                      </th>
                      <th style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((tool) => (
                      <tr key={tool.id} style={{ borderBottom: '1px solid var(--muted)' }}>
                        <td style={{ padding: 12 }}>
                          <div style={{ fontWeight: 500 }}>{tool.toolName}</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                            {tool.reason.substring(0, 50)}...
                          </div>
                        </td>
                        <td style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>
                          {tool.model} / {tool.serialNumber}
                        </td>
                        <td style={{ padding: 12 }}>
                          <div
                            style={{
                              display: 'inline-block',
                              padding: '4px 8px',
                              borderRadius: 4,
                              background: getStatusColor(tool.status) + '20',
                              color: getStatusColor(tool.status),
                              fontWeight: 500,
                              fontSize: 11,
                            }}
                          >
                            {getStatusLabel(tool.status)}
                          </div>
                        </td>
                        <td style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>
                          {new Date(tool.expectedReturnDate).toLocaleDateString('es-MX')}
                        </td>
                        <td style={{ padding: 12, textAlign: 'center', fontWeight: 500 }}>
                          {tool.renewalCount}
                        </td>
                        <td style={{ padding: 12, textAlign: 'center' }}>
                          {canRenew(tool) ? (
                            <button
                              className="button-secondary"
                              onClick={() => openRenewalModal(tool.id)}
                              style={{ padding: '4px 8px', fontSize: 11 }}
                            >
                              ↻ Renovar
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Vista Móvil - Cards */}
            {isMobile && (
              <div style={{ display: 'grid', gap: 16 }}>
                {tools.map((tool) => (
                  <div
                    key={tool.id}
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      background: 'var(--surface-light)',
                      border: '1px solid var(--border)',
                      display: 'grid',
                      gap: 12
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                          {tool.toolName}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                          {tool.model} • {tool.serialNumber}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          background: getStatusColor(tool.status) + '20',
                          color: getStatusColor(tool.status),
                          fontWeight: 600,
                          fontSize: 11,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {getStatusLabel(tool.status)}
                      </div>
                    </div>

                    {/* Motivo */}
                    <div style={{ 
                      padding: 10, 
                      borderRadius: 8, 
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      fontSize: 12
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Motivo</div>
                      <div>{tool.reason}</div>
                    </div>

                    {/* Info Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, fontSize: 13 }}>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>Fecha Inicio</div>
                        <div style={{ fontWeight: 500 }}>
                          {new Date(tool.startDate).toLocaleDateString('es-MX', { 
                            day: '2-digit', 
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>Devolución</div>
                        <div style={{ fontWeight: 500 }}>
                          {new Date(tool.expectedReturnDate).toLocaleDateString('es-MX', { 
                            day: '2-digit', 
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>Renovaciones</div>
                        <div style={{ fontWeight: 600, color: 'var(--primary)' }}>
                          {tool.renewalCount}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>Solicitud</div>
                        <div style={{ fontWeight: 500, fontSize: 12 }}>
                          {new Date(tool.requestDate).toLocaleDateString('es-MX')}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {canRenew(tool) && (
                      <button
                        className="button-secondary"
                        onClick={() => openRenewalModal(tool.id)}
                        style={{ 
                          width: '100%',
                          padding: '10px 16px', 
                          fontSize: 13,
                          marginTop: 4
                        }}
                      >
                        ↻ Solicitar Renovación
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <FinesTable
        tipo="herramienta"
        usuarioId={user?.id}
        showUser={false}
      />

      {renewalModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
          }}
        >
          <div className="card" style={{ maxWidth: 500, width: '90%' }}>
            <h3 style={{ color: 'var(--primary)', marginBottom: 20 }}>Renovar Herramienta</h3>

            <label style={{ display: 'grid', gap: 6, marginBottom: 16, color: 'var(--text-secondary)' }}>
              Nueva fecha de devolución *
              <input
                className="input"
                type="date"
                value={newReturnDate}
                onChange={(e) => setNewReturnDate(e.target.value)}
              />
            </label>

            <label style={{ display: 'grid', gap: 6, marginBottom: 16, color: 'var(--text-secondary)' }}>
              Motivo de la renovación
              <textarea
                className="input"
                style={{ minHeight: 80, resize: 'vertical' }}
                value={renewalReason}
                onChange={(e) => setRenewalReason(e.target.value)}
                placeholder="Explica por qué necesitas renovar el plazo..."
              />
            </label>

            {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="button-primary"
                onClick={handleRenewalSubmit}
                disabled={renewalLoading}
              >
                {renewalLoading ? 'Procesando...' : '✓ Renovar'}
              </button>
              <button
                className="button-secondary"
                onClick={() => {
                  setRenewalModalOpen(false);
                  setSelectedToolId(null);
                  setNewReturnDate('');
                  setRenewalReason('');
                  setError(null);
                }}
                disabled={renewalLoading}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyToolsTable;
