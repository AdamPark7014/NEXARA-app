"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from './UserContext';

interface Fine {
  id: number;
  usuarioId: number;
  tipo: string;
  razon: string;
  descripcion?: string;
  monto: number;
  referenciaId?: number;
  estatusPago: string;
  fechaCreacion: string;
  fechaPago?: string;
  notas?: string;
  usuario?: { id: number; nombre: string; email: string };
}

interface FinesTableProps {
  tipo?: string;
  usuarioId?: number;
  showUser?: boolean;
  onRefresh?: () => void;
}

const FinesTable: React.FC<FinesTableProps> = ({
  tipo,
  usuarioId,
  showUser = true,
  onRefresh,
}) => {
  const { user } = useUser();
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(true);
  const [estatusPago, setEstatusPago] = useState('');

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(
    /[\/.]+$/,
    ''
  );
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  // Función para cargar multas
  const loadFines = async () => {
    setLoading(true);
    try {
      let endpoint = 'fines';
      if (usuarioId) {
        endpoint = `fines/user/${usuarioId}`;
        if (tipo) {
          endpoint += `/type/${tipo}`;
        }
      } else if (tipo) {
        endpoint = `fines/type/${tipo}`;
      }

      const res = await fetch(buildApiUrl(endpoint), {
        headers: { Authorization: `Bearer ${user?.token}` || '' },
      });

      if (res.ok) {
        const data = await res.json();
        const filtered = Array.isArray(data)
          ? data.filter((f: Fine) => !estatusPago || f.estatusPago === estatusPago)
          : [];
        setFines(filtered);
      } else {
        setFines([]);
      }
    } catch {
      setFines([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.token) return;
    loadFines();
  }, [user?.token, tipo, usuarioId, estatusPago]);

  useEffect(() => {
    if (onRefresh) {
      onRefresh();
    }
  }, []);

  const getStatusColor = (count: number, tipo: string): string => {
    if (count === 0) return '#22c55e'; // Verde
    if (tipo === 'asistencia' || tipo === 'actividad') {
      if (count <= 2) return '#eab308'; // Amarillo
      return '#ef4444'; // Rojo
    }
    if (count <= 2) return '#eab308';
    return '#ef4444';
  };

  const countByStatus = (status: string) =>
    fines.filter((f) => f.estatusPago === status).length;

  if (loading) return <div style={{ padding: 12 }}>Cargando multas...</div>;

  return (
    <div className="card">
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12, color: 'var(--primary)' }}>Multas</h3>

        {/* Filtro de estatus */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <select
            className="input"
            value={estatusPago}
            onChange={(e) => setEstatusPago(e.target.value)}
            style={{ maxWidth: 200 }}
          >
            <option value="">Todos los estatus</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Pagada">Pagada</option>
          </select>
        </div>

        {/* Indicadores de estatus */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
          <div>
            <span style={{ color: '#22c55e', fontWeight: 'bold' }}>● </span>
            Sin multas: {countByStatus('Pendiente') === 0 ? '✓' : countByStatus('Pendiente')}
          </div>
          <div>
            <span style={{ color: '#eab308', fontWeight: 'bold' }}>● </span>
            1-2 multas: {countByStatus('Pendiente') <= 2 && countByStatus('Pendiente') > 0 ? '✓' : '-'}
          </div>
          <div>
            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>● </span>
            3+ multas: {countByStatus('Pendiente') >= 3 ? '✓' : '-'}
          </div>
        </div>
      </div>

      {fines.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Sin multas registradas
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)' }}>ID</th>
                {showUser && (
                  <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)' }}>Usuario</th>
                )}
                <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)' }}>Tipo</th>
                <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)' }}>Razón</th>
                <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)' }}>Monto</th>
                <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)' }}>Estatus</th>
                <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)' }}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {fines.map((fine) => (
                <tr key={fine.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 12 }}>{fine.id}</td>
                  {showUser && (
                    <td style={{ padding: 12 }}>{fine.usuario?.nombre || '-'}</td>
                  )}
                  <td style={{ padding: 12 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: 4,
                        backgroundColor: 'var(--bg-secondary)',
                        fontSize: 12,
                      }}
                    >
                      {fine.tipo}
                    </span>
                  </td>
                  <td style={{ padding: 12 }}>{fine.razon}</td>
                  <td style={{ padding: 12, fontWeight: 'bold' }}>
                    ${Number(fine.monto).toFixed(2)}
                  </td>
                  <td style={{ padding: 12 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: 4,
                        backgroundColor:
                          fine.estatusPago === 'Pagada'
                            ? '#22c55e40'
                            : '#ef444440',
                        color: fine.estatusPago === 'Pagada' ? '#22c55e' : '#ef4444',
                        fontSize: 12,
                        fontWeight: 'bold',
                      }}
                    >
                      {fine.estatusPago}
                    </span>
                  </td>
                  <td style={{ padding: 12 }}>
                    {new Date(fine.fechaCreacion).toLocaleDateString('es-MX')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FinesTable;
