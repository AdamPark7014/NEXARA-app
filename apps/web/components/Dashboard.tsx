import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';

interface DashboardStats {
  actividades: { total: number; porEstatus: { estatus: string; cantidad: number }[] };
  evidencias: { total: number; aprobadas: number };
  viaticos: { total: number; porEstatus: { estatus: string; cantidad: number }[] };
  vehiculos: { total: number; porEstatus: { estatus: string; cantidad: number }[] };
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    fetch(apiUrl + '/api/dashboard')
      .then(res => res.json())
      .then((data) => {
        if (data && data.error) {
          setError('Error al cargar métricas: ' + data.error);
        } else {
          setStats(data);
        }
      })
      .catch(() => setError('Error al cargar métricas'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card">Cargando dashboard...</div>;
  if (error) return <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!stats) return null;

  return (
    <>
      <h1 style={{ color: 'var(--primary)', marginBottom: 24 }}>Dashboard</h1>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 32 }}>
        <div className="card" style={{ minWidth: 320 }}>
          <h2 style={{ color: 'var(--primary)' }}>Actividades</h2>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total: {stats.actividades.total}</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.actividades.porEstatus} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
              <XAxis dataKey="estatus" stroke="var(--text-secondary)" />
              <YAxis allowDecimals={false} stroke="var(--text-secondary)" />
              <Tooltip />
              <Bar dataKey="cantidad" fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{ minWidth: 320 }}>
          <h2 style={{ color: 'var(--primary)' }}>Evidencias</h2>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total: {stats.evidencias.total}</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Aprobadas', value: stats.evidencias.aprobadas },
                  { name: 'No aprobadas', value: stats.evidencias.total - stats.evidencias.aprobadas },
                ]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
                label
              >
                <Cell fill="var(--accent)" />
                <Cell fill="var(--danger)" />
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{ minWidth: 320 }}>
          <h2 style={{ color: 'var(--primary)' }}>Viáticos</h2>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total: {stats.viaticos.total}</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.viaticos.porEstatus} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
              <XAxis dataKey="estatus" stroke="var(--text-secondary)" />
              <YAxis allowDecimals={false} stroke="var(--text-secondary)" />
              <Tooltip />
              <Bar dataKey="cantidad" fill="var(--secondary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{ minWidth: 320 }}>
          <h2 style={{ color: 'var(--primary)' }}>Vehículos</h2>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total: {stats.vehiculos.total}</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.vehiculos.porEstatus} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
              <XAxis dataKey="estatus" stroke="var(--text-secondary)" />
              <YAxis allowDecimals={false} stroke="var(--text-secondary)" />
              <Tooltip />
              <Bar dataKey="cantidad" fill="var(--purple)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
