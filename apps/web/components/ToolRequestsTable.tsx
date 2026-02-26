"use client";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import FinesTable from './FinesTable';

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
  const [tools, setTools] = useState<ToolRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');

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

  if (loading) return <div style={{ textAlign: 'center', padding: 20 }}>Cargando solicitudes...</div>;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <h3 style={{ color: 'var(--primary)', marginBottom: 4 }}>Solicitudes de Herramientas</h3>
        
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ flex: 1, minWidth: 150 }}
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
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, alignSelf: 'center' }}>
            {tools.length} solicitud(es)
          </div>
        </div>

        {tools.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>
            No hay solicitudes de herramientas
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
                    Modelo/Serie
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Estado
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Solicitado
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Devolución
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Aprobado Por
                  </th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => (
                  <tr key={tool.id} style={{ borderBottom: '1px solid var(--muted)' }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 500 }}>{tool.requestedBy?.nombre || 'N/A'}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        {tool.requestedBy?.email || ''}
                      </div>
                    </td>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 500 }}>{tool.toolName}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        {tool.reason.substring(0, 40)}...
                      </div>
                    </td>
                    <td style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>
                      {tool.model} / {tool.serialNumber.substring(0, 20)}
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
                    <td style={{ padding: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {new Date(tool.requestDate).toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {tool.expectedReturnDate
                        ? new Date(tool.expectedReturnDate).toLocaleDateString('es-MX', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {tool.approvedBy?.nombre || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
