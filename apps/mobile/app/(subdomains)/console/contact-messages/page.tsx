"use client";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '../../../../components/HelpTab';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

interface ContactMessage {
  id: number;
  nombre?: string;
  name?: string;
  email: string;
  telefono?: string;
  phone?: string;
  asunto?: string;
  subject?: string;
  mensaje?: string;
  message?: string;
  status?: string;
  category?: string;
  createdAt: string;
}

export default function ContactMessagesPage() {
  const { user } = useUser();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  const loadMessages = async () => {
    setLoading(true);
    try {
      let url = 'contact-messages';
      if (filterStatus) url += `?status=${filterStatus}`;
      const res = await fetch(buildApiUrl(url), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) loadMessages();
  }, [user?.token, filterStatus]);

  const noLeidos = messages.filter(m => m.status === 'nuevo' || m.status === 'new' || !m.status).length;
  const respondidos = messages.filter(m => m.status === 'respondido' || m.status === 'replied').length;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <HelpTab module="contact-messages" user={user} />
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{messages.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total mensajes</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger, #ef4444)' }}>{noLeidos}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin leer</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>{respondidos}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Respondidos</div>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ fontSize: 13 }}>Filtrar por estado:</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
            <option value="">Todos</option>
            <option value="nuevo">Nuevos</option>
            <option value="leido">Leídos</option>
            <option value="respondido">Respondidos</option>
            <option value="archivado">Archivados</option>
          </select>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>📬 Mensajes de Contacto</h2>
          {loading ? (
            <p>Cargando mensajes...</p>
          ) : messages.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No hay mensajes de contacto.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>ID</th>
                  <th style={{ padding: '8px 6px' }}>Nombre</th>
                  <th style={{ padding: '8px 6px' }}>Email</th>
                  <th style={{ padding: '8px 6px' }}>Asunto</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {messages.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px' }}>{m.id}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{m.nombre || m.name || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{m.email}</td>
                    <td style={{ padding: '8px 6px' }}>{m.asunto || m.subject || '(Sin asunto)'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        background: (!m.status || m.status === 'nuevo') ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)',
                        color: (!m.status || m.status === 'nuevo') ? 'var(--danger, #ef4444)' : 'var(--success, #22c55e)',
                      }}>
                        {m.status || 'nuevo'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{new Date(m.createdAt).toLocaleDateString('es-MX')}</td>
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
