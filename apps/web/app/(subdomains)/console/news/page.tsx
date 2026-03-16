"use client";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

interface NewsPost {
  id: number;
  titulo?: string;
  title?: string;
  contenido?: string;
  content?: string;
  status?: string;
  coverImage?: string;
  autor?: string;
  author?: string;
  createdAt: string;
}

export default function NewsPage() {
  const { user } = useUser();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('news'), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) loadPosts();
  }, [user?.token]);

  const publicados = posts.filter(p => p.status === 'published' || p.status === 'publicado').length;
  const borradores = posts.filter(p => p.status === 'draft' || p.status === 'borrador' || !p.status).length;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{posts.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total publicaciones</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>{publicados}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Publicados</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning, #f59e0b)' }}>{borradores}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Borradores</div>
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>📰 Noticias y Comunicados</h2>
          {loading ? (
            <p>Cargando noticias...</p>
          ) : posts.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No hay noticias registradas.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>ID</th>
                  <th style={{ padding: '8px 6px' }}>Título</th>
                  <th style={{ padding: '8px 6px' }}>Autor</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {posts.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px' }}>{p.id}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{p.titulo || p.title || '(Sin título)'}</td>
                    <td style={{ padding: '8px 6px' }}>{p.autor || p.author || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        background: (p.status === 'published' || p.status === 'publicado') ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.12)',
                        color: (p.status === 'published' || p.status === 'publicado') ? 'var(--success, #22c55e)' : 'var(--warning, #f59e0b)',
                      }}>
                        {p.status || 'borrador'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{new Date(p.createdAt).toLocaleDateString('es-MX')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <HelpTab module="news" user={user} />
      </div>
    </RoleGuard>
  );
}
