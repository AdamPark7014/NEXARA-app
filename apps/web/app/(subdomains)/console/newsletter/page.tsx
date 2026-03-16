"use client";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import HelpTab from '@/components/HelpTab';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

interface Subscriber {
  id: number;
  email: string;
  nombre?: string;
  activo?: boolean;
  createdAt: string;
}

export default function NewsletterPage() {
  const { user } = useUser();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadSubscribers = async () => {
    setLoading(true);
    try {
      let url = 'newsletter';
      if (search) url += `?search=${encodeURIComponent(search)}`;
      const res = await fetch(buildApiUrl(url), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSubscribers(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) loadSubscribers();
  }, [user?.token]);

  const activos = subscribers.filter(s => s.activo !== false).length;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{subscribers.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total suscriptores</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>{activos}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Activos</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger, #ef4444)' }}>{subscribers.length - activos}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Inactivos</div>
          </div>
        </div>

        {/* Search */}
        <div className="card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Buscar suscriptor por email o nombre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadSubscribers()}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
          />
          <button onClick={loadSubscribers} style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Buscar
          </button>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>📧 Suscriptores del Newsletter</h2>
          {loading ? (
            <p>Cargando suscriptores...</p>
          ) : subscribers.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No se encontraron suscriptores.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>ID</th>
                  <th style={{ padding: '8px 6px' }}>Email</th>
                  <th style={{ padding: '8px 6px' }}>Nombre</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                  <th style={{ padding: '8px 6px' }}>Fecha de registro</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px' }}>{s.id}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{s.email}</td>
                    <td style={{ padding: '8px 6px' }}>{s.nombre || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        background: s.activo !== false ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
                        color: s.activo !== false ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)',
                      }}>
                        {s.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{new Date(s.createdAt).toLocaleDateString('es-MX')}</td>
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
