"use client";

import HelpTab from '@/components/HelpTab';
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { triggerBlobDownload } from '@/lib/file-download';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const isConsoleAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const scopeTitle = isSuperAdmin
    ? 'Todas las hojas de servicio'
    : isConsoleAdmin
      ? 'Hojas de servicio de mi equipo'
      : 'Mis hojas de servicio';
  const scopeDescription = isSuperAdmin
    ? 'Vista global de toda la operación.'
    : isConsoleAdmin
      ? 'Solo registros del personal de tu departamento.'
      : 'Solo actividades donde eres el responsable.';

  const assetBaseUrl = API_URL.replace(/\/+api\/?$/, '');
  const getAssetUrl = (raw?: string | null) => {
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${assetBaseUrl}${raw.startsWith('/') ? raw : `/${raw}`}`;
  };

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const loadSheets = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('service-sheets'), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSheets(Array.isArray(data) ? (data as ServiceSheet[]) : []);
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
        void triggerBlobDownload(blob, `hoja-servicio-${activityId}.pdf`, { mimeType: "application/pdf" });
      }
    } catch { /* ignore */ }
  };

  const handlePreviewPdf = async (sheet: ServiceSheet) => {
    if (previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    const staticUrl = getAssetUrl((sheet as any).pdfUrl || null);
    setPreviewTitle(sheet.activity?.titulo || sheet.activity?.title || `Hoja de servicio #${sheet.activityId}`);
    setPreviewOpen(true);

    if (staticUrl) {
      setPreviewUrl(staticUrl);
      return;
    }

    setPreviewLoading(true);
    setPreviewUrl('');
    try {
      const res = await fetch(buildApiUrl(`service-sheets/${sheet.activityId}/pdf`), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setPreviewUrl(blobUrl);
    } catch {
      setPreviewUrl('');
    } finally {
      setPreviewLoading(false);
    }
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
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>{scopeTitle}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{scopeDescription}</div>
        </div>
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
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>📋 {scopeTitle}</h2>
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
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handlePreviewPdf(s)}
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
                          👁 Ver
                        </button>
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
                          📥 Descargar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {previewOpen && (
          <div
            onClick={() => setPreviewOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(4, 12, 24, 0.62)',
              zIndex: 1200,
              display: 'grid',
              placeItems: 'center',
              padding: 16,
            }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              style={{
                width: 'min(1100px, 96vw)',
                height: 'min(88vh, 920px)',
                background: 'var(--card-bg, #0f1f33)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 12,
                display: 'grid',
                gridTemplateRows: 'auto 1fr',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <strong style={{ color: 'var(--foreground)' }}>Vista previa: {previewTitle}</strong>
                <button className="button-secondary" onClick={() => setPreviewOpen(false)}>Cerrar</button>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#0b1626' }}>
                {previewLoading ? (
                  <div style={{ padding: 16 }}>Generando PDF...</div>
                ) : previewUrl ? (
                  <iframe title="Vista previa hoja de servicio" src={previewUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
                ) : (
                  <div style={{ padding: 16 }}>No se pudo cargar la vista previa del PDF.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
