"use client";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { revokeObjectUrlLater, triggerFileDownload } from '@/lib/file-download';
import { PERMISSIONS } from '@/lib/permissions';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

interface ServiceClient {
  id: number;
  nombre?: string;
  name?: string;
  razonSocial?: string;
  rfc?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  contacto?: string;
  logo?: string;
  activo?: boolean;
  createdAt: string;
}

export default function ServiceClientsPage() {
  const { user } = useUser();
  const [clients, setClients] = useState<ServiceClient[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClients = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('service-clients'), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setClients(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) loadClients();
  }, [user?.token]);

  const activos = clients.filter(c => c.activo !== false).length;

  const downloadReport = async (id: number) => {
    try {
      const res = await fetch(buildApiUrl(`service-clients/${id}/report`), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        triggerFileDownload(url, `reporte-cliente-${id}.pdf`, { preferOpenOnMobile: true });
        revokeObjectUrlLater(url);
      }
    } catch { /* ignore */ }
  };

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{clients.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total clientes de servicio</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>{activos}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Clientes activos</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger, #ef4444)' }}>{clients.length - activos}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Inactivos</div>
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>🏢 Clientes de Servicio</h2>
          {loading ? (
            <p>Cargando clientes...</p>
          ) : clients.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No hay clientes de servicio registrados.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>ID</th>
                  <th style={{ padding: '8px 6px' }}>Nombre</th>
                  <th style={{ padding: '8px 6px' }}>Razón social</th>
                  <th style={{ padding: '8px 6px' }}>RFC</th>
                  <th style={{ padding: '8px 6px' }}>Email</th>
                  <th style={{ padding: '8px 6px' }}>Contacto</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                  <th style={{ padding: '8px 6px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px' }}>{c.id}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{c.nombre || c.name || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{c.razonSocial || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{c.rfc || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{c.email || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{c.contacto || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        background: c.activo !== false ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
                        color: c.activo !== false ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)',
                      }}>
                        {c.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <button
                        onClick={() => downloadReport(c.id)}
                        style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}
                      >
                        📄 PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
