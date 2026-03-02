"use client";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';

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

  if (loading) return <div style={{ textAlign: 'center', padding: 20 }}>Cargando horas de comida...</div>;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <style jsx>{`
        .lunch-filter-row {
          display: grid;
          grid-template-columns: auto auto 1fr;
          gap: 12px;
          align-items: center;
        }

        .lunch-date-input {
          max-width: 200px;
          width: 100%;
        }

        .desktop-table {
          display: block;
        }

        .mobile-cards {
          display: none;
        }

        @media (max-width: 1100px) {
          .lunch-filter-row {
            grid-template-columns: 1fr;
          }

          .lunch-date-input,
          .lunch-clear-btn {
            max-width: 100%;
            width: 100%;
          }

          .desktop-table {
            display: none;
          }

          .mobile-cards {
            display: grid;
            gap: 12px;
          }
        }

        @media (max-width: 520px) {
          .mobile-photo-actions {
            grid-template-columns: 1fr;
          }

          .lunch-filter-row {
            gap: 8px;
          }
        }
      `}</style>
      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <h3 style={{ color: 'var(--primary)', marginBottom: 4 }}>🍽️ Registro de Horas de Comida</h3>

        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="lunch-filter-row">
          <input
            type="date"
            className="input"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ width: '100%' }}
            data-lunch-filter="date"
          />
          {dateFilter && (
            <button
              className="button-secondary lunch-clear-btn"
              onClick={() => setDateFilter('')}
              style={{ padding: '8px 12px', fontSize: 13 }}
            >
              Limpiar
            </button>
          )}
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {lunchBreaks.length} registros
          </div>
        </div>

        {lunchBreaks.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>
            No hay registros de horas de comida
          </div>
        ) : (
          <>
            <div className="desktop-table">
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--muted)', borderRadius: 12 }}>
                <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--muted)' }}>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Usuario
                      </th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Fecha
                      </th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Entrada a Comida
                      </th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Regreso al Trabajo
                      </th>
                      <th style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Fotos
                      </th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lunchBreaks.map((lunch) => (
                      <tr key={lunch.id} style={{ borderBottom: '1px solid var(--muted)' }}>
                        <td style={{ padding: 12 }}>
                          <div style={{ fontWeight: 500 }}>{lunch.user.nombre}</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                            {lunch.user.email}
                          </div>
                        </td>
                        <td style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>
                          {new Date(lunch.date).toLocaleDateString('es-MX')}
                        </td>
                        <td style={{ padding: 12 }}>
                          <div style={{ fontWeight: 500, fontSize: 12 }}>
                            {new Date(lunch.checkinTime).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          {lunch.isCheckinLate && (
                            <div style={{ color: 'var(--warning)', fontSize: 11 }}>
                              ⚠️ Fuera de horario
                            </div>
                          )}
                        </td>
                        <td style={{ padding: 12 }}>
                          {lunch.checkoutTime ? (
                            <>
                              <div style={{ fontWeight: 500, fontSize: 12 }}>
                                {new Date(lunch.checkoutTime).toLocaleTimeString('es-MX', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                              {lunch.isCheckoutLate && (
                                <div style={{ color: 'var(--danger)', fontSize: 11 }}>
                                  ⚠️ Pasó de hora
                                </div>
                              )}
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: 12, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            {lunch.checkinPhotoUrl && (
                              <button
                                style={{
                                  padding: '4px 8px',
                                  fontSize: 11,
                                  background: 'var(--info)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                }}
                                onClick={() => openPhotoGallery(lunch.checkinPhotoUrl)}
                              >
                                📷 Entrada
                              </button>
                            )}
                            {lunch.checkoutPhotoUrl && (
                              <button
                                style={{
                                  padding: '4px 8px',
                                  fontSize: 11,
                                  background: 'var(--success)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                }}
                                onClick={() => openPhotoGallery(lunch.checkoutPhotoUrl!)}
                              >
                                📷 Salida
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: 12 }}>
                          <div
                            style={{
                              display: 'inline-block',
                              padding: '4px 8px',
                              borderRadius: 4,
                              background:
                                lunch.status === 'COMPLETED'
                                  ? 'var(--success)20'
                                  : 'var(--warning)20',
                              color:
                                lunch.status === 'COMPLETED'
                                  ? 'var(--success)'
                                  : 'var(--warning)',
                              fontWeight: 500,
                              fontSize: 11,
                            }}
                          >
                            {lunch.status === 'COMPLETED' ? '✓ Completada' : '⏳ En Progreso'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mobile-cards">
                {lunchBreaks.map((lunch) => (
                  <div key={lunch.id} className="card" style={{ border: '1px solid var(--muted)', padding: 12, display: 'grid', gap: 10, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{lunch.user.nombre}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, wordBreak: 'break-word' }}>{lunch.user.email}</div>
                      </div>
                      <div
                        style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: 4,
                          background: lunch.status === 'COMPLETED' ? 'var(--success)20' : 'var(--warning)20',
                          color: lunch.status === 'COMPLETED' ? 'var(--success)' : 'var(--warning)',
                          fontWeight: 600,
                          fontSize: 11,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lunch.status === 'COMPLETED' ? '✓ Completada' : '⏳ En Progreso'}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
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

                    <div className="mobile-photo-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button
                        style={{
                          padding: '10px 8px',
                          fontSize: 12,
                          background: 'var(--info)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          cursor: lunch.checkinPhotoUrl ? 'pointer' : 'not-allowed',
                          opacity: lunch.checkinPhotoUrl ? 1 : 0.6,
                        }}
                        disabled={!lunch.checkinPhotoUrl}
                        onClick={() => lunch.checkinPhotoUrl && openPhotoGallery(lunch.checkinPhotoUrl)}
                      >
                        📷 Entrada
                      </button>
                      <button
                        style={{
                          padding: '10px 8px',
                          fontSize: 12,
                          background: 'var(--success)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          cursor: lunch.checkoutPhotoUrl ? 'pointer' : 'not-allowed',
                          opacity: lunch.checkoutPhotoUrl ? 1 : 0.6,
                        }}
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
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: 20,
          }}
          onClick={closePhotoGallery}
        >
          <div style={{ maxWidth: '90%', maxHeight: '90%', position: 'relative' }}>
            <img
              src={expandedPhotoUrl}
              alt="expanded"
              style={{ width: '100%', height: '100%', maxHeight: '90vh', objectFit: 'contain' }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={closePhotoGallery}
              style={{
                position: 'absolute',
                top: -40,
                right: 0,
                background: '#fff',
                border: 'none',
                padding: '8px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
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
