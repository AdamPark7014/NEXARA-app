"use client";

import HelpTab from '@/components/HelpTab';
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

interface ServiceSheet {
  id: number;
  activityId: number;
  clientName?: string;
  serviceType?: string;
  status?: string;
  technicianName?: string;
  observations?: string;
  createdAt: string;
  activity?: {
    id: number;
    titulo?: string;
    title?: string;
    fecha?: string;
  };
}

export default function ServiceSheetsPage() {
  const { user } = useUser();
  const [sheets, setSheets] = useState<ServiceSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadSheets = async () => {
    setLoading(true);
    try {
      // Service-sheets are per-activity; fetch recent activities and their sheets
      const res = await fetch(buildApiUrl('activities'), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const activities = await res.json();
        const list = Array.isArray(activities) ? activities : [];
        // For each activity, try to load sheet
        const sheetPromises = list.slice(0, 100).map(async (act: { id: number; titulo?: string; title?: string; fecha?: string }) => {
          try {
            const sRes = await fetch(buildApiUrl(`service-sheets/${act.id}`), {
              headers: { Authorization: `Bearer ${user?.token}` },
            });
            if (sRes.ok) {
              const sheet = await sRes.json();
              if (sheet && sheet.id) return { ...sheet, activity: act };
            }
          } catch { /* skip */ }
          return null;
        });
        const results = await Promise.all(sheetPromises);
        setSheets(results.filter(Boolean) as ServiceSheet[]);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) loadSheets();
  }, [user?.token]);

  const handleDownloadPdf = async (activityId: number) => {
    try {
      const res = await fetch(buildApiUrl(`service-sheets/${activityId}/pdf`), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hoja-servicio-${activityId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* ignore */ }
  };

  const filtered = sheets.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.clientName || '').toLowerCase().includes(q) ||
      (s.technicianName || '').toLowerCase().includes(q) ||
      (s.activity?.titulo || s.activity?.title || '').toLowerCase().includes(q) ||
      String(s.activityId).includes(q)
    );
  });

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <HelpTab module="service-sheets" user={user} />
        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{sheets.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total hojas de servicio</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>
              {sheets.filter(s => s.status === 'completed' || s.status === 'completado').length}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Completadas</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning, #f59e0b)' }}>
              {sheets.filter(s => s.status !== 'completed' && s.status !== 'completado').length}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Pendientes</div>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente, técnico, actividad..."
            style={{
              flex: 1,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 14,
            }}
          />
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>📋 Hojas de Servicio</h2>
          {loading ? (
            <p>Cargando hojas de servicio...</p>
          ) : filtered.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No se encontraron hojas de servicio.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>ID</th>
                  <th style={{ padding: '8px 6px' }}>Actividad</th>
                  <th style={{ padding: '8px 6px' }}>Cliente</th>
                  <th style={{ padding: '8px 6px' }}>Técnico</th>
                  <th style={{ padding: '8px 6px' }}>Tipo</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                  <th style={{ padding: '8px 6px' }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px' }}>{s.id}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                      {s.activity?.titulo || s.activity?.title || `Act #${s.activityId}`}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{s.clientName || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{s.technicianName || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{s.serviceType || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        background: (s.status === 'completed' || s.status === 'completado')
                          ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.12)',
                        color: (s.status === 'completed' || s.status === 'completado')
                          ? 'var(--success, #22c55e)' : 'var(--warning, #f59e0b)',
                      }}>
                        {s.status || 'pendiente'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      {new Date(s.createdAt).toLocaleDateString('es-MX')}
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <button
                        onClick={() => handleDownloadPdf(s.activityId)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--primary)',
                          background: 'transparent',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        📥 PDF
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
