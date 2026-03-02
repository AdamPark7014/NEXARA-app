"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

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

interface User {
  id: number;
  nombre: string;
  email: string;
}

const toLocalDateInput = (date: Date) => date.toLocaleDateString('sv-SE');

const getWeekRange = (anchor: Date) => {
  const dayOfWeek = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    from: toLocalDateInput(start),
    to: toLocalDateInput(end),
  };
};

interface FinesTableProps {
  tipo?: string;
  usuarioId?: number;
  showUser?: boolean;
  onRefresh?: () => void;
}

const FinesTable: React.FC<FinesTableProps> = ({
  tipo: tipoProp,
  usuarioId: usuarioIdProp,
  showUser = true,
  onRefresh,
}) => {
  const { user } = useUser();
  const [fines, setFines] = useState<Fine[]>([]);
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [estatusPago, setEstatusPago] = useState('');
  const [usuarioFiltro, setUsuarioFiltro] = useState<string>(usuarioIdProp ? String(usuarioIdProp) : '');
  const [tipoFiltro, setTipoFiltro] = useState(tipoProp || '');
  const [isMobile, setIsMobile] = useState(false);
  const MOBILE_BREAKPOINT = 1024;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [MOBILE_BREAKPOINT]);
  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(
    /[\/.]+$/,
    ''
  );
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  // Cargar usuarios disponibles
  useEffect(() => {
    if (!user?.token) return;

    if (!showUser || Boolean(usuarioIdProp)) {
      setUsuarios([]);
      return;
    }

    const headers = { Authorization: `Bearer ${user.token}` };
    const canUseAssignable =
      hasPermission(user, PERMISSIONS.USERS_MANAGE) ||
      hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
    const canUseHierarchy = hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE);

    const loadUsers = async () => {
      if (!canUseAssignable && !canUseHierarchy) {
        setUsuarios([]);
        return;
      }

      try {
        if (canUseAssignable) {
          const assignableRes = await fetch(buildApiUrl('users/assignable'), { headers });
          const assignableData = assignableRes.ok ? await assignableRes.json() : [];
          const assignableUsers = Array.isArray(assignableData) ? assignableData : [];

          if (assignableUsers.length > 0) {
            setUsuarios(assignableUsers);
            return;
          }
        }

        if (!canUseHierarchy) {
          setUsuarios([]);
          return;
        }

        const week = getWeekRange(new Date());
        const params = new URLSearchParams({ from: week.from, to: week.to });
        const hierarchyRes = await fetch(buildApiUrl(`attendance/hierarchy/range?${params.toString()}`), { headers });
        const hierarchyData = hierarchyRes.ok ? await hierarchyRes.json() : null;
        const fallbackUsers = Array.isArray(hierarchyData?.users)
          ? hierarchyData.users
              .map((item: any) => ({
                id: Number(item.userId),
                nombre: item.userName || `Usuario ${item.userId}`,
                email: item.email || '',
              }))
              .filter((item: User) => Number.isFinite(item.id) && item.id !== user.id)
          : [];

        setUsuarios(fallbackUsers);
      } catch {
        setUsuarios([]);
      }
    };

    loadUsers();
  }, [user, user?.token, showUser, usuarioIdProp]);

  // Función para cargar multas
  const loadFines = async () => {
    setLoading(true);
    try {
      let endpoint = 'fines';
      
      if (usuarioFiltro) {
        endpoint = `fines/user/${usuarioFiltro}`;
        if (tipoFiltro) {
          endpoint += `/type/${tipoFiltro}`;
        }
      } else if (tipoFiltro) {
        endpoint = `fines/type/${tipoFiltro}`;
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
  }, [user?.token, tipoFiltro, usuarioFiltro, estatusPago]);

  useEffect(() => {
    if (onRefresh) {
      onRefresh();
    }
  }, []);

  const countByStatus = (status: string) =>
    fines.filter((f) => f.estatusPago === status).length;

  if (loading) return <div style={{ padding: 12 }}>Cargando multas...</div>;

  const usuarioActual = usuarios.find((u) => u.id === Number(usuarioFiltro));

  const mobileCardListStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "16px 12px",
    boxSizing: "border-box",
    width: "100%",
  };

  const mobileCardStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)",
    borderRadius: "12px",
    padding: "16px 14px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    border: "1px solid #e5e7eb",
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
  };

  const mobileMetaGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    marginTop: "12px",
    width: "100%",
    minWidth: 0,
  };

  const mobileMetaItemStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
    wordBreak: "break-word",
    overflowWrap: "break-word",
  };

  const mobileMetaLabelStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    color: "#6b7280",
    letterSpacing: "0.5px",
    wordBreak: "break-word",
  };

  const mobileMetaValueStyle: React.CSSProperties = {
    fontSize: "14px",
    color: "#111827",
    fontWeight: 500,
    wordBreak: "break-word",
    overflowWrap: "break-word",
    minWidth: 0,
  };

  return (
    <div className="card">
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12, color: 'var(--primary)' }}>Multas</h3>

        {/* Filtros - solo visible cuando showUser es true (gestión) Y no hay usuarioId específico */}
        {showUser && !usuarioIdProp && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            {/* Filtro de Usuario */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                Filtrar por Usuario
              </label>
              <select
                className="input"
                value={usuarioFiltro}
                onChange={(e) => setUsuarioFiltro(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Todos los usuarios</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro de Tipo */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                Filtrar por Tipo
              </label>
              <select
                className="input"
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Todos los tipos</option>
                <option value="actividad">Actividades</option>
                <option value="vehiculo">Vehículos</option>
                <option value="asistencia">Asistencia</option>
                <option value="herramienta">Herramientas</option>
              </select>
            </div>

            {/* Filtro de Estatus */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                Filtrar por Estatus
              </label>
              <select
                className="input"
                value={estatusPago}
                onChange={(e) => setEstatusPago(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Todos los estatus</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Pagada">Pagada</option>
              </select>
            </div>
          </div>
        )}

        {/* Usuario seleccionado info */}
        {showUser && usuarioActual && (
          <div style={{
            padding: 10,
            backgroundColor: 'var(--primary)20',
            borderRadius: 4,
            marginBottom: 12,
            fontSize: 13,
          }}>
            📌 Mostrando multas de: <strong>{usuarioActual.nombre}</strong> ({usuarioActual.email})
          </div>
        )}

        {/* Indicadores de estatus */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: '#22c55e', fontWeight: 'bold' }}>● </span>
            Sin multas: {countByStatus('Pendiente') === 0 ? '✓' : countByStatus('Pendiente')}
          </div>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: '#eab308', fontWeight: 'bold' }}>● </span>
            1-2 multas: {countByStatus('Pendiente') <= 2 && countByStatus('Pendiente') > 0 ? '✓' : '-'}
          </div>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>● </span>
            3+ multas: {countByStatus('Pendiente') >= 3 ? '✓' : '-'}
          </div>
        </div>
      </div>

      {fines.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Sin multas registradas {usuarioActual ? `para ${usuarioActual.nombre}` : ''}
        </div>
      ) : (
        <>
          {!isMobile && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)', fontSize: 12 }}>ID</th>
                    {showUser && !usuarioFiltro && (
                      <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)', fontSize: 12 }}>Usuario</th>
                    )}
                    <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)', fontSize: 12 }}>Tipo</th>
                    <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)', fontSize: 12 }}>Razón</th>
                    <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)', fontSize: 12 }}>Descripción</th>
                    <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)', fontSize: 12 }}>Monto</th>
                    <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)', fontSize: 12 }}>Estatus</th>
                    <th style={{ padding: 12, textAlign: 'left', color: 'var(--primary)', fontSize: 12 }}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {fines.map((fine) => (
                    <tr key={fine.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 12, fontSize: 12 }}>{fine.id}</td>
                      {showUser && !usuarioFiltro && (
                        <td style={{ padding: 12, fontSize: 12 }}>{fine.usuario?.nombre || '-'}</td>
                      )}
                      <td style={{ padding: 12, fontSize: 12 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: 4,
                            backgroundColor: getTipoColor(fine.tipo),
                            color: 'white',
                            fontWeight: 500,
                            fontSize: 11,
                          }}
                        >
                          {getTipoLabel(fine.tipo)}
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12, fontWeight: 500 }}>{fine.razon}</td>
                      <td style={{ padding: 12, fontSize: 12, maxWidth: 150 }}>
                        {fine.descripcion ? (
                          <span title={fine.descripcion}>
                            {fine.descripcion.substring(0, 30)}
                            {fine.descripcion.length > 30 ? '...' : ''}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, fontWeight: 'bold', color: '#ef4444' }}>
                        ${Number(fine.monto).toFixed(2)}
                      </td>
                      <td style={{ padding: 12, fontSize: 12 }}>
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
                            fontSize: 11,
                            fontWeight: 'bold',
                          }}
                        >
                          {fine.estatusPago}
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12 }}>
                        {new Date(fine.fechaCreacion).toLocaleDateString('es-MX')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isMobile && (
            <div style={mobileCardListStyle}>
              {fines.map((fine) => (
                <div key={fine.id} style={mobileCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "4px" }}>Multa #{fine.id}</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>{fine.razon}</div>
                    </div>
                    <span
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        backgroundColor:
                          fine.estatusPago === 'Pagada'
                            ? '#22c55e40'
                            : '#ef444440',
                        color: fine.estatusPago === 'Pagada' ? '#22c55e' : '#ef4444',
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fine.estatusPago}
                    </span>
                  </div>

                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#ef4444", marginBottom: "12px" }}>
                    ${Number(fine.monto).toFixed(2)}
                  </div>

                  <div style={mobileMetaGridStyle}>
                    <div style={mobileMetaItemStyle}>
                      <span style={mobileMetaLabelStyle}>Tipo</span>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: 6,
                          backgroundColor: getTipoColor(fine.tipo),
                          color: 'white',
                          fontWeight: 600,
                          fontSize: 12,
                          width: "fit-content",
                        }}
                      >
                        {getTipoLabel(fine.tipo)}
                      </span>
                    </div>
                    <div style={mobileMetaItemStyle}>
                      <span style={mobileMetaLabelStyle}>Fecha</span>
                      <span style={mobileMetaValueStyle}>
                        {new Date(fine.fechaCreacion).toLocaleDateString('es-MX', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    {showUser && !usuarioFiltro && fine.usuario?.nombre && (
                      <div style={{ ...mobileMetaItemStyle, gridColumn: "1 / -1" }}>
                        <span style={mobileMetaLabelStyle}>Usuario</span>
                        <span style={mobileMetaValueStyle}>{fine.usuario.nombre}</span>
                      </div>
                    )}
                    {fine.descripcion && (
                      <div style={{ ...mobileMetaItemStyle, gridColumn: "1 / -1" }}>
                        <span style={mobileMetaLabelStyle}>Descripción</span>
                        <span style={{ ...mobileMetaValueStyle, fontSize: "13px", color: "#6b7280" }}>
                          {fine.descripcion}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Función auxiliar para obtener color por tipo
function getTipoColor(tipo: string): string {
  const colors: { [key: string]: string } = {
    actividad: '#f59e0b',
    vehiculo: '#ef4444',
    asistencia: '#0f6ad6',
    herramienta: '#8b5cf6',
  };
  return colors[tipo] || '#6b7280';
}

// Función auxiliar para obtener label por tipo
function getTipoLabel(tipo: string): string {
  const labels: { [key: string]: string } = {
    actividad: 'Actividades',
    vehiculo: 'Vehículos',
    asistencia: 'Asistencia',
    herramienta: 'Herramientas',
  };
  return labels[tipo] || tipo;
}

export default FinesTable;
