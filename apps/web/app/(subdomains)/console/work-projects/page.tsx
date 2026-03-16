"use client";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

interface WorkProject {
  id: number;
  nombre: string;
  descripcion?: string;
  estado?: string;
  presupuesto?: number;
  costoReal?: number;
  fechaInicio?: string;
  fechaFin?: string;
  cliente?: string;
  responsable?: string;
  createdAt: string;
}

export default function WorkProjectsPage() {
  const { user } = useUser();
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('work-projects'), {
        headers: { Authorization: `Bearer ${user?.token}` },
        <HelpTab module="work-projects" user={user} />
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) loadProjects();
  }, [user?.token]);

  const totalPresupuesto = projects.reduce((acc, p) => acc + (p.presupuesto || 0), 0);
  const totalCosto = projects.reduce((acc, p) => acc + (p.costoReal || 0), 0);
  const activos = projects.filter(p => p.estado === 'activo' || p.estado === 'en_progreso').length;

  const statusColor = (estado?: string) => {
    if (estado === 'completado' || estado === 'finalizado') return 'var(--success, #22c55e)';
    if (estado === 'cancelado') return 'var(--danger, #ef4444)';
    if (estado === 'activo' || estado === 'en_progreso') return 'var(--info, #3b82f6)';
    return 'var(--warning, #f59e0b)';
  };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{projects.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Proyectos totales</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--info, #3b82f6)' }}>{activos}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>En progreso</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>
              ${totalPresupuesto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Presupuesto total</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: totalCosto > totalPresupuesto ? 'var(--danger, #ef4444)' : 'var(--warning, #f59e0b)' }}>
              ${totalCosto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Costo real acumulado</div>
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>🏗️ Proyectos de Obra</h2>
          {loading ? (
            <p>Cargando proyectos...</p>
          ) : projects.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No hay proyectos registrados.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>ID</th>
                  <th style={{ padding: '8px 6px' }}>Proyecto</th>
                  <th style={{ padding: '8px 6px' }}>Cliente</th>
                  <th style={{ padding: '8px 6px' }}>Presupuesto</th>
                  <th style={{ padding: '8px 6px' }}>Costo real</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                  <th style={{ padding: '8px 6px' }}>Inicio</th>
                  <th style={{ padding: '8px 6px' }}>Fin</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px' }}>{p.id}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{p.nombre}</td>
                    <td style={{ padding: '8px 6px' }}>{p.cliente || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>${(p.presupuesto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 6px' }}>${(p.costoReal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: `${statusColor(p.estado)}22`, color: statusColor(p.estado) }}>
                        {p.estado || 'planificado'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{p.fechaInicio ? new Date(p.fechaInicio).toLocaleDateString('es-MX') : '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{p.fechaFin ? new Date(p.fechaFin).toLocaleDateString('es-MX') : '—'}</td>
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
