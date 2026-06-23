"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import styles from './FinesTable.module.css';

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
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        loadFines();
      }, 250);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['Multa', 'Fine', 'Usuario', 'User'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, tipoFiltro, usuarioFiltro, estatusPago]);

  useEffect(() => {
    if (onRefresh) {
      onRefresh();
    }
  }, []);

  const countByStatus = (status: string) =>
    fines.filter((f) => f.estatusPago === status).length;

  if (loading) return <div className={styles.loading}>Cargando multas...</div>;

  const usuarioActual = usuarios.find((u) => u.id === Number(usuarioFiltro));

  return (
    <div className="card">
      <div className={styles.header}>
        <h3 className={styles.title}>Multas</h3>

        {/* Filtros - solo visible cuando showUser es true (gestión) Y no hay usuarioId específico */}
        {showUser && !usuarioIdProp && (
          <div className={styles.filtersGrid}>
            {/* Filtro de Usuario */}
            <div className={styles.filterCol}>
              <label className={styles.filterLabel}>
                Filtrar por Usuario
              </label>
              <select
                className={`input ${styles.fullWidth}`}
                value={usuarioFiltro}
                onChange={(e) => setUsuarioFiltro(e.target.value)}
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
            <div className={styles.filterCol}>
              <label className={styles.filterLabel}>
                Filtrar por Tipo
              </label>
              <select
                className={`input ${styles.fullWidth}`}
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
              >
                <option value="">Todos los tipos</option>
                <option value="actividad">Actividades</option>
                <option value="vehiculo">Vehículos</option>
                <option value="asistencia">Asistencia</option>
                <option value="herramienta">Herramientas</option>
              </select>
            </div>

            {/* Filtro de Estatus */}
            <div className={styles.filterCol}>
              <label className={styles.filterLabel}>
                Filtrar por Estatus
              </label>
              <select
                className={`input ${styles.fullWidth}`}
                value={estatusPago}
                onChange={(e) => setEstatusPago(e.target.value)}
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
          <div className={styles.userInfo}>
            📌 Mostrando multas de: <strong>{usuarioActual.nombre}</strong> ({usuarioActual.email})
          </div>
        )}

        {/* Indicadores de estatus */}
        <div className={styles.statusLegend}>
          <div className={styles.statusLegendItem}>
            <span className={`${styles.dot} ${styles.dotGreen}`}>● </span>
            Sin multas: {countByStatus('Pendiente') === 0 ? '✓' : countByStatus('Pendiente')}
          </div>
          <div className={styles.statusLegendItem}>
            <span className={`${styles.dot} ${styles.dotYellow}`}>● </span>
            1-2 multas: {countByStatus('Pendiente') <= 2 && countByStatus('Pendiente') > 0 ? '✓' : '-'}
          </div>
          <div className={styles.statusLegendItem}>
            <span className={`${styles.dot} ${styles.dotRed}`}>● </span>
            3+ multas: {countByStatus('Pendiente') >= 3 ? '✓' : '-'}
          </div>
        </div>
      </div>

      {fines.length === 0 ? (
        <div className={styles.empty}>
          Sin multas registradas {usuarioActual ? `para ${usuarioActual.nombre}` : ''}
        </div>
      ) : (
        <>
          {!isMobile && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr className={styles.rowBorder}>
                    <th className={styles.th}>ID</th>
                    {showUser && !usuarioFiltro && (
                      <th className={styles.th}>Usuario</th>
                    )}
                    <th className={styles.th}>Tipo</th>
                    <th className={styles.th}>Razón</th>
                    <th className={styles.th}>Descripción</th>
                    <th className={styles.th}>Monto</th>
                    <th className={styles.th}>Estatus</th>
                    <th className={styles.th}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {fines.map((fine) => (
                    <tr key={fine.id} className={styles.rowBorder}>
                      <td className={styles.td}>{fine.id}</td>
                      {showUser && !usuarioFiltro && (
                        <td className={styles.td}>{fine.usuario?.nombre || '-'}</td>
                      )}
                      <td className={styles.td}>
                        <span className={`${styles.tipoBadge} ${getTipoClass(fine.tipo)}`}>
                          {getTipoLabel(fine.tipo)}
                        </span>
                      </td>
                      <td className={`${styles.td} ${styles.reason}`}>{fine.razon}</td>
                      <td className={`${styles.td} ${styles.descCell}`}>
                        {fine.descripcion ? (
                          <span title={fine.descripcion}>
                            {fine.descripcion.substring(0, 30)}
                            {fine.descripcion.length > 30 ? '...' : ''}
                          </span>
                        ) : (
                          <span className={styles.muted}>-</span>
                        )}
                      </td>
                      <td className={`${styles.td} ${styles.amount}`}>
                        ${Number(fine.monto).toFixed(2)}
                      </td>
                      <td className={styles.td}>
                        <span
                          className={`${styles.statusBadge} ${fine.estatusPago === 'Pagada' ? styles.statusPaid : styles.statusPending}`}
                        >
                          {fine.estatusPago}
                        </span>
                      </td>
                      <td className={styles.td}>
                        {new Date(fine.fechaCreacion).toLocaleDateString('es-MX')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isMobile && (
            <div className={styles.mobileList}>
              {fines.map((fine) => (
                <div key={fine.id} className={styles.mobileCard}>
                  <div className={styles.mobileTop}>
                    <div className={styles.mobileTopMain}>
                      <div className={styles.mobileId}>Multa #{fine.id}</div>
                      <div className={styles.mobileReason}>{fine.razon}</div>
                    </div>
                    <span
                      className={`${styles.mobileStatus} ${fine.estatusPago === 'Pagada' ? styles.statusPaid : styles.statusPending}`}
                    >
                      {fine.estatusPago}
                    </span>
                  </div>

                  <div className={styles.mobileAmount}>
                    ${Number(fine.monto).toFixed(2)}
                  </div>

                  <div className={styles.mobileMetaGrid}>
                    <div className={styles.mobileMetaItem}>
                      <span className={styles.mobileMetaLabel}>Tipo</span>
                      <span className={`${styles.mobileTipoBadge} ${getTipoClass(fine.tipo)}`}>
                        {getTipoLabel(fine.tipo)}
                      </span>
                    </div>
                    <div className={styles.mobileMetaItem}>
                      <span className={styles.mobileMetaLabel}>Fecha</span>
                      <span className={styles.mobileMetaValue}>
                        {new Date(fine.fechaCreacion).toLocaleDateString('es-MX', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    {showUser && !usuarioFiltro && fine.usuario?.nombre && (
                      <div className={`${styles.mobileMetaItem} ${styles.mobileMetaItemFull}`}>
                        <span className={styles.mobileMetaLabel}>Usuario</span>
                        <span className={styles.mobileMetaValue}>{fine.usuario.nombre}</span>
                      </div>
                    )}
                    {fine.descripcion && (
                      <div className={`${styles.mobileMetaItem} ${styles.mobileMetaItemFull}`}>
                        <span className={styles.mobileMetaLabel}>Descripción</span>
                        <span className={`${styles.mobileMetaValue} ${styles.mobileDesc}`}>
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

function getTipoClass(tipo: string): string {
  const normalized = String(tipo || '').toLowerCase();
  if (normalized === 'actividad') return styles.tipoActividad;
  if (normalized === 'vehiculo') return styles.tipoVehiculo;
  if (normalized === 'asistencia') return styles.tipoAsistencia;
  if (normalized === 'herramienta') return styles.tipoHerramienta;
  return styles.tipoDefault;
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
