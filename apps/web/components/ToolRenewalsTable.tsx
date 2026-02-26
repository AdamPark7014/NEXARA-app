"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from './UserContext';

interface ToolRenewal {
  id: number;
  toolRequestId: number;
  previousReturnDate: string;
  newReturnDate: string;
  renewalReason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestDate: string;
  approvalDate: string | null;
  toolRequest: {
    id: number;
    toolName: string;
    usuario: {
      id: number;
      nombre: string;
      email: string;
    };
  };
  approver?: {
    id: number;
    nombre: string;
  };
}

interface ToolRenewalsTableProps {
  refreshTrigger?: number;
}

const ToolRenewalsTable: React.FC<ToolRenewalsTableProps> = ({ refreshTrigger = 0 }) => {
  const { user } = useUser();
  const [renewals, setRenewals] = useState<ToolRenewal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [selectedRenewalId, setSelectedRenewalId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchRenewals = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tool-requests/renewals/pending`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error('Error al cargar renovaciones');
      const data = await res.json();
      setRenewals(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRenewals();
  }, [user, refreshTrigger]);

  const filteredRenewals = statusFilter === 'all'
    ? renewals
    : renewals.filter((r) => r.status === statusFilter);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'var(--warning)';
      case 'APPROVED':
        return 'var(--success)';
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
      REJECTED: 'Rechazada',
    };
    return labels[status] || status;
  };

  const handleAction = async () => {
    if (!user || !selectedRenewalId || !actionType) return;

    setActionLoading(true);
    try {
      let endpoint = '';
      let body = {};

      if (actionType === 'approve') {
        endpoint = `${process.env.NEXT_PUBLIC_API_URL}/api/tool-requests/renewals/${selectedRenewalId}/approve`;
      } else {
        endpoint = `${process.env.NEXT_PUBLIC_API_URL}/api/tool-requests/renewals/${selectedRenewalId}/reject`;
        body = { reason: rejectionReason };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error en la acción');
      }

      setActionType(null);
      setSelectedRenewalId(null);
      setRejectionReason('');
      await fetchRenewals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setActionLoading(false);
    }
  };

  const openActionModal = (renewalId: number, type: 'approve' | 'reject') => {
    setSelectedRenewalId(renewalId);
    setActionType(type);
    setRejectionReason('');
  };

  const getDaysUntilExpiry = (expiryDate: string) => {
    const days = Math.ceil(
      (new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 20 }}>Cargando renovaciones...</div>;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ color: 'var(--primary)', marginBottom: 0 }}>Renovaciones de Herramientas</h3>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input"
            style={{ maxWidth: 200 }}
          >
            <option value="PENDING">Pendientes</option>
            <option value="all">Todos los estados</option>
            <option value="APPROVED">Aprobadas</option>
            <option value="REJECTED">Rechazadas</option>
          </select>
        </div>

        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}

        {filteredRenewals.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>
            No hay renovaciones para mostrar
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--muted)' }}>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Usuario
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Herramienta
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Fecha Actual
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Nueva Fecha
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Días vencimiento actual
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Estado
                  </th>
                  <th style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRenewals.map((renewal) => {
                  const daysUntilExpiry = getDaysUntilExpiry(renewal.previousReturnDate);
                  const isUrgent = daysUntilExpiry <= 1;

                  return (
                    <tr
                      key={renewal.id}
                      style={{
                        borderBottom: '1px solid var(--muted)',
                        background: isUrgent ? 'rgba(255, 0, 0, 0.05)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: 12 }}>
                        <div style={{ fontWeight: 500 }}>{renewal.toolRequest.usuario.nombre}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                          {renewal.toolRequest.usuario.email}
                        </div>
                      </td>
                      <td style={{ padding: 12, fontWeight: 500 }}>
                        {renewal.toolRequest.toolName}
                      </td>
                      <td style={{ padding: 12, color: 'var(--text-secondary)' }}>
                        {new Date(renewal.previousReturnDate).toLocaleDateString()}
                      </td>
                      <td style={{ padding: 12, fontWeight: 500, color: 'var(--success)' }}>
                        {new Date(renewal.newReturnDate).toLocaleDateString()}
                      </td>
                      <td style={{ padding: 12, color: isUrgent ? 'var(--danger)' : 'var(--text-secondary)' }}>
                        <div style={{ fontWeight: isUrgent ? 600 : 400 }}>
                          {isUrgent ? '⚠️ ' : ''}{daysUntilExpiry} días
                        </div>
                        {renewal.renewalReason && (
                          <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>
                            "{renewal.renewalReason}"
                          </div>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>
                        <div
                          style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: 4,
                            background: getStatusColor(renewal.status) + '20',
                            color: getStatusColor(renewal.status),
                            fontWeight: 500,
                            fontSize: 11,
                          }}
                        >
                          {getStatusLabel(renewal.status)}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: 12,
                          textAlign: 'center',
                          display: 'flex',
                          gap: 6,
                          justifyContent: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        {renewal.status === 'PENDING' && (
                          <>
                            <button
                              className="button-secondary"
                              onClick={() => openActionModal(renewal.id, 'approve')}
                              style={{ padding: '4px 8px', fontSize: 11, background: 'var(--success)20', color: 'var(--success)' }}
                            >
                              ✓ Aprobar
                            </button>
                            <button
                              className="button-secondary"
                              onClick={() => openActionModal(renewal.id, 'reject')}
                              style={{ padding: '4px 8px', fontSize: 11, background: 'var(--danger)20', color: 'var(--danger)' }}
                            >
                              ✗ Rechazar
                            </button>
                          </>
                        )}
                        {renewal.status !== 'PENDING' && (
                          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                            {renewal.approver?.nombre ? `Por ${renewal.approver.nombre}` : 'Procesado'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {actionType && (
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
            <h3 style={{ color: 'var(--primary)', marginBottom: 20 }}>
              {actionType === 'approve' ? 'Aprobar Renovación' : 'Rechazar Renovación'}
            </h3>

            {actionType === 'reject' && (
              <label style={{ display: 'grid', gap: 6, marginBottom: 16, color: 'var(--text-secondary)' }}>
                Motivo del rechazo (Opcional)
                <textarea
                  className="input"
                  style={{ minHeight: 80, resize: 'vertical' }}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explica por qué se rechaza la renovación..."
                />
              </label>
            )}

            {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="button-primary"
                onClick={handleAction}
                disabled={actionLoading}
              >
                {actionLoading ? 'Procesando...' : 'Confirmar'}
              </button>
              <button
                className="button-secondary"
                onClick={() => {
                  setActionType(null);
                  setSelectedRenewalId(null);
                  setRejectionReason('');
                  setError(null);
                }}
                disabled={actionLoading}
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

export default ToolRenewalsTable;
