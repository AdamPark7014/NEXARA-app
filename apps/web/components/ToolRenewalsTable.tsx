"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import KpiCard from './ui/KpiCard';
import styles from './ToolRenewalsTable.module.css';
import { createRealtimeSocket } from '@/lib/realtime-socket';

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
      const res = await fetch(buildApiUrl(`tool-requests/renewals/pending`), {
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

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchRenewals();
      }, 250);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ToolRenewal', 'ToolRequest'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, refreshTrigger]);

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

  const getStatusClass = (status: ToolRenewal['status']) => {
    if (status === 'PENDING') return styles.statusPending;
    if (status === 'APPROVED') return styles.statusApproved;
    if (status === 'REJECTED') return styles.statusRejected;
    return styles.statusPending;
  };

  const handleAction = async () => {
    if (!user || !selectedRenewalId || !actionType) return;

    setActionLoading(true);
    try {
      let endpoint = '';
      let body = {};

      if (actionType === 'approve') {
        endpoint = buildApiUrl(`tool-requests/renewals/${selectedRenewalId}/approve`);
      } else {
        endpoint = buildApiUrl(`tool-requests/renewals/${selectedRenewalId}/reject`);
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

  if (loading) return <div className={styles.loading}>Cargando renovaciones...</div>;

  const renewalCounts = {
    total: renewals.length,
    pending: renewals.filter((r) => r.status === 'PENDING').length,
    urgent: renewals.filter((r) => r.status === 'PENDING' && getDaysUntilExpiry(r.previousReturnDate) <= 1).length,
    approved: renewals.filter((r) => r.status === 'APPROVED').length,
  };

  return (
    <div className={styles.root}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KpiCard label="Total" value={renewalCounts.total} icon="🔁" />
        <KpiCard label="Pendientes" value={renewalCounts.pending} icon="⏳" variant={renewalCounts.pending > 0 ? "warning" : "default"} />
        <KpiCard label="Urgentes (≤1 día)" value={renewalCounts.urgent} icon="⚠️" variant={renewalCounts.urgent > 0 ? "danger" : "positive"} />
        <KpiCard label="Aprobadas" value={renewalCounts.approved} icon="✅" variant="positive" />
      </div>

      <div className={`card ${styles.panel}`}>
        <div className={styles.header}>
          <h3 className={styles.title}>Renovaciones de Herramientas</h3>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`input ${styles.filter}`}
          >
            <option value="PENDING">Pendientes</option>
            <option value="all">Todos los estados</option>
            <option value="APPROVED">Aprobadas</option>
            <option value="REJECTED">Rechazadas</option>
          </select>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {filteredRenewals.length === 0 ? (
          <div className={styles.empty}>
            No hay renovaciones para mostrar
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.rowBorder}>
                  <th className={styles.th}>
                    Usuario
                  </th>
                  <th className={styles.th}>
                    Herramienta
                  </th>
                  <th className={styles.th}>
                    Fecha Actual
                  </th>
                  <th className={styles.th}>
                    Nueva Fecha
                  </th>
                  <th className={styles.th}>
                    Días vencimiento actual
                  </th>
                  <th className={styles.th}>
                    Estado
                  </th>
                  <th className={`${styles.th} ${styles.thCenter}`}>
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
                      className={`${styles.rowBorder} ${isUrgent ? styles.rowUrgent : ''}`}
                    >
                      <td className={styles.td}>
                        <div className={styles.userName}>{renewal.toolRequest.usuario.nombre}</div>
                        <div className={styles.smallMuted}>
                          {renewal.toolRequest.usuario.email}
                        </div>
                      </td>
                      <td className={`${styles.td} ${styles.toolName}`}>
                        {renewal.toolRequest.toolName}
                      </td>
                      <td className={`${styles.td} ${styles.dateMuted}`}>
                        {new Date(renewal.previousReturnDate).toLocaleDateString()}
                      </td>
                      <td className={`${styles.td} ${styles.newDate}`}>
                        {new Date(renewal.newReturnDate).toLocaleDateString()}
                      </td>
                      <td className={`${styles.td} ${isUrgent ? styles.expiryUrgent : styles.expiryText}`}>
                        <div className={isUrgent ? styles.expiryWeightUrgent : styles.expiryWeight}>
                          {isUrgent ? '⚠️ ' : ''}{daysUntilExpiry} días
                        </div>
                        {renewal.renewalReason && (
                          <div className={styles.reason}>
                            "{renewal.renewalReason}"
                          </div>
                        )}
                      </td>
                      <td className={styles.td}>
                        <div className={`${styles.status} ${getStatusClass(renewal.status)}`}>
                          {getStatusLabel(renewal.status)}
                        </div>
                      </td>
                      <td className={styles.actionsCell}>
                        {renewal.status === 'PENDING' && (
                          <>
                            <button
                              className={`button-secondary ${styles.smallBtn} ${styles.approveBtn}`}
                              onClick={() => openActionModal(renewal.id, 'approve')}
                            >
                              ✓ Aprobar
                            </button>
                            <button
                              className={`button-secondary ${styles.smallBtn} ${styles.rejectBtn}`}
                              onClick={() => openActionModal(renewal.id, 'reject')}
                            >
                              ✗ Rechazar
                            </button>
                          </>
                        )}
                        {renewal.status !== 'PENDING' && (
                          <span className={styles.processedText}>
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
        <div className={styles.modalOverlay}>
          <div className={`card ${styles.modalCard}`}>
            <h3 className={styles.modalTitle}>
              {actionType === 'approve' ? 'Aprobar Renovación' : 'Rechazar Renovación'}
            </h3>

            {actionType === 'reject' && (
              <label className={styles.rejectField}>
                Motivo del rechazo (Opcional)
                <textarea
                  className={`input ${styles.rejectArea}`}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explica por qué se rechaza la renovación..."
                />
              </label>
            )}

            {error && <div className={styles.modalError}>{error}</div>}

            <div className={styles.modalActions}>
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
