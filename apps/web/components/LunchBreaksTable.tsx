"use client";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import styles from './LunchBreaksTable.module.css';

interface LunchBreak {
  id: number;
  usuarioId: number;
  user: {
    id: number;
    nombre: string;
    email: string;
  };
  date: string;
  checkinTime: string;
  checkoutTime: string | null;
  checkinPhotoUrl: string;
  checkoutPhotoUrl: string | null;
  status: string;
  isCheckinLate: boolean;
  isCheckoutLate: boolean;
  notes: string | null;
}

const LunchBreaksTable: React.FC = () => {
  const { user } = useUser();
  const [lunchBreaks, setLunchBreaks] = useState<LunchBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState('');

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');

  const fetchLunchBreaks = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Usar endpoint correspondiente según el rol
      const isAdmin = user.permissions?.includes('attendance.manage') || user.isSuperAdmin;
      const baseEndpoint = isAdmin ? 'lunch-breaks/users' : 'lunch-breaks/my-breaks';
      let endpoint = buildApiUrl(baseEndpoint);
      
      if (dateFilter) {
        const date = new Date(dateFilter);
        const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        endpoint += `?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
      }

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${user.token}` },
      });

      if (!res.ok) throw new Error('Error al cargar horas de comida');
      const data = await res.json();
      setLunchBreaks(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLunchBreaks();
  }, [user, dateFilter]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });

    socket.on('lunch_break:approaching', () => fetchLunchBreaks());
    socket.on('lunch_break:expired', () => fetchLunchBreaks());
    socket.on('lunch_break:checkin', () => fetchLunchBreaks());
    socket.on('lunch_break:checkout', () => fetchLunchBreaks());

    return () => {
      socket.disconnect();
    };
  }, [user?.token]);

  const openPhotoGallery = (photoUrl: string) => {
    setExpandedPhotoUrl(photoUrl);
  };

  const closePhotoGallery = () => {
    setExpandedPhotoUrl(null);
  };

  if (loading) return <div className={styles.loading}>Cargando horas de comida...</div>;

  return (
    <div className={styles.root}>
      <div className={`card ${styles.panel}`}>
        <h3 className={styles.title}>🍽️ Registro de Horas de Comida</h3>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.filterRow}>
          <input
            type="date"
            className={`input ${styles.dateInput}`}
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            data-lunch-filter="date"
          />
          {dateFilter && (
            <button
              className={`button-secondary ${styles.clearBtn}`}
              type="button"
              onClick={() => setDateFilter('')}
            >
              Limpiar
            </button>
          )}
          <div className={styles.counter}>
            {lunchBreaks.length} registros
          </div>
        </div>

        {lunchBreaks.length === 0 ? (
          <div className={styles.emptyState}>
            No hay registros de horas de comida
          </div>
        ) : (
          <>
            <div className={styles.desktopTable}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.rowBorder}>
                      <th className={styles.th}>
                        Usuario
                      </th>
                      <th className={styles.th}>
                        Fecha
                      </th>
                      <th className={styles.th}>
                        Entrada a Comida
                      </th>
                      <th className={styles.th}>
                        Regreso al Trabajo
                      </th>
                      <th className={`${styles.th} ${styles.thCenter}`}>
                        Fotos
                      </th>
                      <th className={styles.th}>
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lunchBreaks.map((lunch) => (
                      <tr key={lunch.id} className={styles.rowBorder}>
                        <td className={styles.td}>
                          <div className={styles.userName}>{lunch.user.nombre}</div>
                          <div className={styles.emailMuted}>
                            {lunch.user.email}
                          </div>
                        </td>
                        <td className={`${styles.td} ${styles.textMuted}`}>
                          {new Date(lunch.date).toLocaleDateString('es-MX')}
                        </td>
                        <td className={styles.td}>
                          <div className={styles.timeStrong}>
                            {new Date(lunch.checkinTime).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          {lunch.isCheckinLate && (
                            <div className={styles.warningText}>
                              ⚠️ Fuera de horario
                            </div>
                          )}
                        </td>
                        <td className={styles.td}>
                          {lunch.checkoutTime ? (
                            <>
                              <div className={styles.timeStrong}>
                                {new Date(lunch.checkoutTime).toLocaleTimeString('es-MX', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                              {lunch.isCheckoutLate && (
                                <div className={styles.dangerText}>
                                  ⚠️ Pasó de hora
                                </div>
                              )}
                            </>
                          ) : (
                            <span className={styles.textMuted}>—</span>
                          )}
                        </td>
                        <td className={`${styles.td} ${styles.tdCenter}`}>
                          <div className={styles.photoActions}>
                            {lunch.checkinPhotoUrl && (
                              <button
                                className={`${styles.photoBtn} ${styles.btnInfo}`}
                                type="button"
                                onClick={() => openPhotoGallery(lunch.checkinPhotoUrl)}
                              >
                                📷 Entrada
                              </button>
                            )}
                            {lunch.checkoutPhotoUrl && (
                              <button
                                className={`${styles.photoBtn} ${styles.btnSuccess}`}
                                type="button"
                                onClick={() => openPhotoGallery(lunch.checkoutPhotoUrl!)}
                              >
                                📷 Salida
                              </button>
                            )}
                          </div>
                        </td>
                        <td className={styles.td}>
                          <div className={`${styles.statusPill} ${lunch.status === 'COMPLETED' ? styles.statusCompleted : styles.statusProgress}`}>
                            {lunch.status === 'COMPLETED' ? '✓ Completada' : '⏳ En Progreso'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.mobileCards}>
                {lunchBreaks.map((lunch) => (
                  <div key={lunch.id} className={`card ${styles.mobileCard}`}>
                    <div className={styles.mobileHeader}>
                      <div className={styles.mobileUser}>
                        <div className={styles.mobileName}>{lunch.user.nombre}</div>
                        <div className={`${styles.mobileEmail} ${styles.textMuted}`}>{lunch.user.email}</div>
                      </div>
                      <div className={`${styles.statusPill} ${styles.mobileStatus} ${lunch.status === 'COMPLETED' ? styles.statusCompleted : styles.statusProgress}`}>
                        {lunch.status === 'COMPLETED' ? '✓ Completada' : '⏳ En Progreso'}
                      </div>
                    </div>

                    <div className={styles.mobileData}>
                      <div><strong>Fecha:</strong> {new Date(lunch.date).toLocaleDateString('es-MX')}</div>
                      <div>
                        <strong>Entrada:</strong>{' '}
                        {new Date(lunch.checkinTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        {lunch.isCheckinLate ? ' · ⚠️ Fuera de horario' : ''}
                      </div>
                      <div>
                        <strong>Regreso:</strong>{' '}
                        {lunch.checkoutTime
                          ? new Date(lunch.checkoutTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                        {lunch.checkoutTime && lunch.isCheckoutLate ? ' · ⚠️ Pasó de hora' : ''}
                      </div>
                    </div>

                    <div className={styles.mobilePhotoActions}>
                      <button
                        className={`${styles.mobilePhotoBtn} ${styles.btnInfo} ${!lunch.checkinPhotoUrl ? styles.mobilePhotoBtnDisabled : ''}`}
                        type="button"
                        disabled={!lunch.checkinPhotoUrl}
                        onClick={() => lunch.checkinPhotoUrl && openPhotoGallery(lunch.checkinPhotoUrl)}
                      >
                        📷 Entrada
                      </button>
                      <button
                        className={`${styles.mobilePhotoBtn} ${styles.btnSuccess} ${!lunch.checkoutPhotoUrl ? styles.mobilePhotoBtnDisabled : ''}`}
                        type="button"
                        disabled={!lunch.checkoutPhotoUrl}
                        onClick={() => lunch.checkoutPhotoUrl && openPhotoGallery(lunch.checkoutPhotoUrl)}
                      >
                        📷 Salida
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      {/* Modal de foto expandida */}
      {expandedPhotoUrl && (
        <div className={styles.modalOverlay} onClick={closePhotoGallery} aria-hidden="true">
          <div className={styles.modalContent} role="dialog" aria-modal="true" aria-label="Vista ampliada de foto de registro de comida">
            <img
              src={expandedPhotoUrl}
              alt="expanded"
              className={styles.modalImage}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={closePhotoGallery}
              className={styles.closeBtn}
            >
              ✕ Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LunchBreaksTable;
