"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import FinesTable from './FinesTable';
import styles from './MyToolsTable.module.css';

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

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'PENDING':
        return styles.statusPending;
      case 'APPROVED':
        return styles.statusApproved;
      case 'IN_USE':
        return styles.statusInUse;
      case 'RETURNED':
        return styles.statusReturned;
      case 'DAMAGED':
        return styles.statusDamaged;
      case 'REJECTED':
        return styles.statusRejected;
      default:
        return styles.statusReturned;
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

  if (loading) return <div className={styles.loading}>Cargando herramientas...</div>;

  return (
    <div className={styles.wrapper}>
      <div className={`card ${styles.panel}`}>
        <h3 className={styles.title}>Mis Herramientas</h3>
        
        {error && <div className={styles.errorText}>{error}</div>}

        {tools.length === 0 ? (
          <div className={styles.empty}>
            No tienes herramientas solicitadas aún
          </div>
        ) : (
          <>
            {/* Vista Desktop - Tabla */}
            {!isMobile && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.tableHeadRow}>
                      <th className={styles.thLeft}>
                        Herramienta
                      </th>
                      <th className={styles.thLeft}>
                        Modelo/Serie
                      </th>
                      <th className={styles.thLeft}>
                        Estado
                      </th>
                      <th className={styles.thLeft}>
                        Devolución
                      </th>
                      <th className={styles.thLeft}>
                        Renovaciones
                      </th>
                      <th className={styles.thCenter}>
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((tool) => (
                      <tr key={tool.id} className={styles.tableRow}>
                        <td className={styles.tdLeft}>
                          <div className={styles.toolName}>{tool.toolName}</div>
                          <div className={styles.reasonPreview}>
                            {tool.reason.substring(0, 50)}...
                          </div>
                        </td>
                        <td className={`${styles.tdLeft} ${styles.metaCell}`}>
                          {tool.model} / {tool.serialNumber}
                        </td>
                        <td className={styles.tdLeft}>
                          <div className={`${styles.statusChip} ${getStatusClass(tool.status)}`}>
                            {getStatusLabel(tool.status)}
                          </div>
                        </td>
                        <td className={`${styles.tdLeft} ${styles.metaCell}`}>
                          {new Date(tool.expectedReturnDate).toLocaleDateString('es-MX')}
                        </td>
                        <td className={`${styles.tdCenter} ${styles.renewalCount}`}>
                          {tool.renewalCount}
                        </td>
                        <td className={styles.tdCenter}>
                          {canRenew(tool) ? (
                            <button
                              className={`button-secondary ${styles.renewBtnDesktop}`}
                              onClick={() => openRenewalModal(tool.id)}
                            >
                              ↻ Renovar
                            </button>
                          ) : (
                            <span className={styles.noAction}>—</span>
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
              <div className={styles.mobileList}>
                {tools.map((tool) => (
                  <div key={tool.id} className={styles.mobileCard}>
                    {/* Header */}
                    <div className={styles.mobileHeader}>
                      <div className={styles.mobileHeaderMain}>
                        <div className={styles.mobileName}>
                          {tool.toolName}
                        </div>
                        <div className={styles.mobileMeta}>
                          {tool.model} • {tool.serialNumber}
                        </div>
                      </div>
                      <div className={`${styles.mobileStatus} ${getStatusClass(tool.status)}`}>
                        {getStatusLabel(tool.status)}
                      </div>
                    </div>

                    {/* Motivo */}
                    <div className={styles.reasonCard}>
                      <div className={styles.reasonLabel}>Motivo</div>
                      <div>{tool.reason}</div>
                    </div>

                    {/* Info Grid */}
                    <div className={styles.infoGrid}>
                      <div>
                        <div className={styles.infoLabel}>Fecha Inicio</div>
                        <div className={styles.infoValue}>
                          {new Date(tool.startDate).toLocaleDateString('es-MX', { 
                            day: '2-digit', 
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                      <div>
                        <div className={styles.infoLabel}>Devolución</div>
                        <div className={styles.infoValue}>
                          {new Date(tool.expectedReturnDate).toLocaleDateString('es-MX', { 
                            day: '2-digit', 
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                      <div>
                        <div className={styles.infoLabel}>Renovaciones</div>
                        <div className={styles.infoValuePrimary}>
                          {tool.renewalCount}
                        </div>
                      </div>
                      <div>
                        <div className={styles.infoLabel}>Solicitud</div>
                        <div className={styles.infoValueSmall}>
                          {new Date(tool.requestDate).toLocaleDateString('es-MX')}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {canRenew(tool) && (
                      <button
                        className={`button-secondary ${styles.renewBtnMobile}`}
                        onClick={() => openRenewalModal(tool.id)}
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
        <div className={styles.modalOverlay}>
          <div className={`card ${styles.modalCard}`}>
            <h3 className={styles.modalTitle}>Renovar Herramienta</h3>

            <label className={styles.fieldLabel}>
              Nueva fecha de devolución *
              <input
                className="input"
                type="date"
                value={newReturnDate}
                onChange={(e) => setNewReturnDate(e.target.value)}
              />
            </label>

            <label className={styles.fieldLabel}>
              Motivo de la renovación
              <textarea
                className={`input ${styles.reasonInput}`}
                value={renewalReason}
                onChange={(e) => setRenewalReason(e.target.value)}
                placeholder="Explica por qué necesitas renovar el plazo..."
              />
            </label>

            {error && <div className={styles.modalError}>{error}</div>}

            <div className={styles.modalActions}>
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
