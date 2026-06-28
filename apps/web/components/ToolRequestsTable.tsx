"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { isPanelDrawerViewport } from "@/lib/panel-drawer-breakpoint";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import FinesTable from './FinesTable';
import styles from './ToolRequestsTable.module.css';

interface ToolRequest {
  id: number;
  requestedBy: { nombre: string; email: string };
  toolName: string;
  model: string;
  serialNumber: string;
  reason: string;
  startDate: string;
  expectedReturnDate: string;
  status: 'PENDING' | 'APPROVED' | 'IN_USE' | 'RETURNED' | 'DAMAGED' | 'REJECTED';
  requestDate: string;
  approvalDate: string | null;
  approvedBy: { nombre: string } | null;
  deliveryDate: string | null;
  deliveryReceivedBy: { nombre: string } | null;
  returnDate: string | null;
  returnReceivedBy: { nombre: string } | null;
  damageDescription: string | null;
  renewalCount: number;
}

const ToolRequestsTable: React.FC = () => {
  const { user } = useUser();
  const canManage = hasPermission(user, PERMISSIONS.TOOLS_MANAGE);
  const [tools, setTools] = useState<ToolRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(isPanelDrawerViewport(window.innerWidth));
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const fetchTools = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const url = statusFilter
        ? `${buildApiUrl('tool-requests')}?status=${statusFilter}`
        : buildApiUrl('tool-requests');
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error('Error al cargar solicitudes');
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
  }, [user, statusFilter]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'ToolRequest') {
        fetchTools();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.token]);

  const runAction = async (id: number, path: string, init: RequestInit = {}) => {
    if (!user?.token || !canManage) return;
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(buildApiUrl(path), {
        ...init,
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      await fetchTools();
    } catch (err) {
      setActionError(formatApiError(err, "No se pudo completar la acción"));
    } finally {
      setBusyId(null);
    }
  };

  const approveRequest = (id: number) => void runAction(id, `tool-requests/${id}/approve`, { method: "POST" });

  const rejectRequest = (id: number) => {
    const adminNotes = window.prompt("Motivo del rechazo (obligatorio):");
    if (!adminNotes?.trim()) return;
    void runAction(id, `tool-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ adminNotes: adminNotes.trim() }),
    });
  };

  const deliverRequest = (id: number) => void runAction(id, `tool-requests/${id}/deliver`, { method: "POST" });

  const returnRequest = (id: number) => {
    const damageDescription = window.prompt("Descripción de daño (opcional, dejar vacío si está en buen estado):") ?? "";
    void runAction(id, `tool-requests/${id}/return`, {
      method: "POST",
      body: JSON.stringify({ damageDescription: damageDescription.trim() || undefined }),
    });
  };

  const renderActions = (tool: ToolRequest) => {
    if (!canManage) return null;
    const busy = busyId === tool.id;
    return (
      <div className={styles.actions}>
        {tool.status === "PENDING" && (
          <>
            <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => approveRequest(tool.id)}>Aprobar</button>
            <button type="button" className={`${styles.actionBtn} ${styles.actionDanger}`} disabled={busy} onClick={() => rejectRequest(tool.id)}>Rechazar</button>
          </>
        )}
        {tool.status === "APPROVED" && (
          <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => deliverRequest(tool.id)}>Entregar</button>
        )}
        {tool.status === "IN_USE" && (
          <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => returnRequest(tool.id)}>Registrar devolución</button>
        )}
      </div>
    );
  };

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

  const getStatusClass = (status: ToolRequest['status']) => {
    if (status === 'PENDING') return styles.statusPending;
    if (status === 'APPROVED') return styles.statusApproved;
    if (status === 'IN_USE') return styles.statusInUse;
    if (status === 'RETURNED') return styles.statusReturned;
    if (status === 'DAMAGED') return styles.statusDamaged;
    if (status === 'REJECTED') return styles.statusRejected;
    return styles.statusReturned;
  };

  if (loading) return <div className={styles.loading}>Cargando solicitudes...</div>;

  return (
    <div className={styles.root}>
      <div className={`card ${styles.panel}`}>
        <h3 className={styles.title}>Solicitudes de Herramientas</h3>
        
        {error && <div className={styles.error}>{error}</div>}
        {actionError && <div className={styles.error}>{actionError}</div>}

        <div className={styles.filterRow}>
          <select
            className={`input ${styles.filterSelect}`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="APPROVED">Aprobada</option>
            <option value="IN_USE">En Uso</option>
            <option value="RETURNED">Devuelta</option>
            <option value="DAMAGED">Dañada</option>
            <option value="REJECTED">Rechazada</option>
          </select>
          <div className={styles.counter}>
            {tools.length} solicitud(es)
          </div>
        </div>

        {tools.length === 0 ? (
          <div className={styles.empty}>
            No hay solicitudes de herramientas
          </div>
        ) : (
          <>
            {!isMobile && (
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
                        Modelo/Serie
                      </th>
                      <th className={styles.th}>
                        Estado
                      </th>
                      <th className={styles.th}>
                        Solicitado
                      </th>
                      <th className={styles.th}>
                        Devolución
                      </th>
                      <th className={styles.th}>
                        Aprobado Por
                      </th>
                      {canManage && (
                        <th className={styles.th}>Acciones</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((tool) => (
                      <tr key={tool.id} className={styles.rowBorder}>
                        <td className={styles.td}>
                          <div className={styles.userName}>{tool.requestedBy?.nombre || 'N/A'}</div>
                          <div className={styles.smallMuted}>
                            {tool.requestedBy?.email || ''}
                          </div>
                        </td>
                        <td className={styles.td}>
                          <div className={styles.toolName}>{tool.toolName}</div>
                          <div className={styles.smallMuted}>
                            {tool.reason.substring(0, 40)}...
                          </div>
                        </td>
                        <td className={`${styles.td} ${styles.metaText}`}>
                          {tool.model} / {tool.serialNumber.substring(0, 20)}
                        </td>
                        <td className={styles.td}>
                          <div className={`${styles.statusBadge} ${getStatusClass(tool.status)}`}>
                            {getStatusLabel(tool.status)}
                          </div>
                        </td>
                        <td className={`${styles.td} ${styles.metaText}`}>
                          {new Date(tool.requestDate).toLocaleDateString('es-MX', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className={`${styles.td} ${styles.metaText}`}>
                          {tool.expectedReturnDate
                            ? new Date(tool.expectedReturnDate).toLocaleDateString('es-MX', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className={`${styles.td} ${styles.metaText}`}>
                          {tool.approvedBy?.nombre || '—'}
                        </td>
                        {canManage && (
                          <td className={styles.td}>{renderActions(tool)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isMobile && (
              <div className={styles.mobileList}>
                {tools.map((tool) => (
                  <div key={tool.id} className={styles.mobileCard}>
                    <div className={styles.mobileTop}>
                      <div className={styles.mobileTopMain}>
                        <div className={styles.mobileToolName}>{tool.toolName}</div>
                        <div className={styles.mobileRequester}>{tool.requestedBy?.nombre || 'N/A'}</div>
                      </div>
                      <div className={`${styles.mobileStatus} ${getStatusClass(tool.status)}`}>
                        {getStatusLabel(tool.status)}
                      </div>
                    </div>

                    <div className={styles.mobileMetaGrid}>
                      <div className={styles.mobileMetaItem}>
                        <span className={styles.mobileMetaLabel}>Modelo</span>
                        <span className={styles.mobileMetaValue}>{tool.model}</span>
                      </div>
                      <div className={styles.mobileMetaItem}>
                        <span className={styles.mobileMetaLabel}>Serie</span>
                        <span className={styles.mobileMetaValue}>{tool.serialNumber.substring(0, 15)}</span>
                      </div>
                      <div className={styles.mobileMetaItem}>
                        <span className={styles.mobileMetaLabel}>Solicitado</span>
                        <span className={styles.mobileMetaValue}>
                          {new Date(tool.requestDate).toLocaleDateString('es-MX', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className={styles.mobileMetaItem}>
                        <span className={styles.mobileMetaLabel}>Devolución</span>
                        <span className={styles.mobileMetaValue}>
                          {tool.expectedReturnDate
                            ? new Date(tool.expectedReturnDate).toLocaleDateString('es-MX', {
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </span>
                      </div>
                      <div className={`${styles.mobileMetaItem} ${styles.mobileMetaFull}`}>
                        <span className={styles.mobileMetaLabel}>Razón</span>
                        <span className={`${styles.mobileMetaValue} ${styles.mobileReason}`}>
                          {tool.reason}
                        </span>
                      </div>
                      {tool.approvedBy?.nombre && (
                        <div className={`${styles.mobileMetaItem} ${styles.mobileMetaFull}`}>
                          <span className={styles.mobileMetaLabel}>Aprobado por</span>
                          <span className={styles.mobileMetaValue}>{tool.approvedBy.nombre}</span>
                        </div>
                      )}
                    </div>
                    {renderActions(tool)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <FinesTable
        tipo="herramienta"
        showUser={true}
      />
    </div>
  );
};

export default ToolRequestsTable;
