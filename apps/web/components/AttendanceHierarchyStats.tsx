"use client";
import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

interface UserAttendanceStats {
  userId: number;
  userName: string;
  email: string;
  department: string;
  roleName: string;
  totalMinutes: number;
  workDays: number;
  avgMinutesPerDay: number;
  days: { date: string; totalMinutes: number; isOpen: boolean }[];
  attendances: { type: string; timestamp: string }[];
  productivity: {
    avgScore: number;
    level: string;
    counts: { alta: number; media: number; baja: number };
    reviewed: number;
    notes: { rating: string; note: string | null; reviewedAt: string }[];
  };
}

interface AttendanceRangeResponse {
  rangeStart: string;
  rangeEnd: string;
  totalUsers: number;
  totalMinutesAll: number;
  avgMinutesPerUser: number;
  users: UserAttendanceStats[];
}

const AttendanceHierarchyStats: React.FC = () => {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AttendanceRangeResponse | null>(null);
  const [rangeFrom, setRangeFrom] = useState<string>(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return start.toISOString().slice(0, 10);
  });
  const [rangeTo, setRangeTo] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());
  const [paymentDrafts, setPaymentDrafts] = useState<
    Record<number, { amount: string; note: string; files: File[]; uploading?: boolean }>
  >({});
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);

  const toInputDate = (date: Date) => date.toISOString().slice(0, 10);

  const getWeekRange = () => {
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: toInputDate(start), to: toInputDate(end) };
  };

  const getMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toInputDate(start), to: toInputDate(end) };
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
    const mins = Math.floor(minutes % 60).toString().padStart(2, '0');
    return `${hours}:${mins}`;
  };

  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeOnly = (iso?: string | null) => {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const productivityStyle = (level?: string) => {
    if (level === 'Alta') return { background: 'rgba(22,169,110,0.15)', color: '#16a96e' };
    if (level === 'Media') return { background: 'rgba(241,139,31,0.18)', color: '#f18b1f' };
    if (level === 'Baja') return { background: 'rgba(235,87,87,0.2)', color: '#eb5757' };
    return { background: 'rgba(15,106,214,0.12)', color: 'var(--primary)' };
  };

  const getLatestTimeByType = (
    list: { type: string; timestamp: string }[],
    type: 'entrada' | 'salida'
  ) => {
    const filtered = list.filter((item) => item.type === type);
    if (filtered.length === 0) return null;
    const latest = filtered.reduce((max, item) =>
      item.timestamp > max.timestamp ? item : max
    );
    return latest.timestamp;
  };

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  const getSocketBaseUrl = () => {
    return API_URL.replace(/\/+api\/?$/, '');
  };

  const updatePaymentDraft = (
    userId: number,
    changes: Partial<{ amount: string; note: string; files: File[]; uploading: boolean }>,
  ) => {
    setPaymentDrafts((prev) => {
      const base = prev[userId] || { amount: '', note: '', files: [] };
      return {
        ...prev,
        [userId]: { ...base, ...changes },
      };
    });
  };

  const handlePaymentFiles = (userId: number, files: File[]) => {
    if (!files.length) return;
    updatePaymentDraft(userId, { files: [...(paymentDrafts[userId]?.files || []), ...files] });
  };

  const submitPayment = async (userStat: UserAttendanceStats) => {
    if (!user?.token) return;
    const draft = paymentDrafts[userStat.userId] || { amount: '', note: '', files: [] };
    if (!draft.amount) {
      setPaymentMessage('Define el monto del pago antes de registrar.');
      return;
    }
    setPaymentMessage(null);
    updatePaymentDraft(userStat.userId, { uploading: true });
    try {
      const formData = new FormData();
      formData.append('userId', String(userStat.userId));
      formData.append('periodFrom', rangeFrom);
      formData.append('periodTo', rangeTo);
      formData.append('totalMinutes', String(userStat.totalMinutes || 0));
      formData.append('amount', draft.amount);
      if (draft.note) formData.append('note', draft.note);
      draft.files.forEach((file) => formData.append('files', file));

      const res = await fetch(buildApiUrl('employee-payments'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error al registrar el pago');
      }

      setPaymentMessage('Pago registrado correctamente.');
      updatePaymentDraft(userStat.userId, { amount: '', note: '', files: [] });
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : 'Error al registrar el pago');
    } finally {
      updatePaymentDraft(userStat.userId, { uploading: false });
    }
  };

  const fetchStats = async () => {
    if (!user?.token) {
      setError('No autenticado');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        from: rangeFrom,
        to: rangeTo,
      });

      const res = await fetch(
        buildApiUrl(`attendance/hierarchy/range?${params.toString()}`),
        {
          headers: { Authorization: `Bearer ${user.token}` },
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        let message = 'Error al cargar estadisticas';
        try {
          const errorJson = JSON.parse(errorText);
          message = errorJson.message || message;
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }

      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE)) {
      fetchStats();
    }
  }, [rangeFrom, rangeTo, user]);

  useEffect(() => {
    if (!hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE)) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['websocket'] });

    socket.on('attendance:updated', () => {
      fetchStats();
    });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'Attendance' || payload?.model === 'AttendanceDay') {
        fetchStats();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [rangeFrom, rangeTo, user]);

  useEffect(() => {
    if (!user?.token || !hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE)) return;

    const intervalId = setInterval(() => {
      fetchStats();
    }, 30000);

    const handleVisibility = () => {
      if (!document.hidden) fetchStats();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [rangeFrom, rangeTo, user]);

  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE)) {
    return (
      <div style={{ padding: '20px', color: 'var(--danger)' }}>
        No tienes permisos para ver el panel de estadisticas de asistencia.
        (Requerido: permiso de administracion de asistencia)
      </div>
    );
  }

  const toggleUserExpand = (userId: number) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedUsers(newExpanded);
  };

  const heroStyle: React.CSSProperties = {
    display: 'grid',
    gap: 6,
    marginBottom: 16,
    background: 'linear-gradient(135deg, rgba(15,106,214,0.14) 0%, rgba(22,169,110,0.1) 100%)',
    border: '1px solid rgba(15,106,214,0.18)',
    boxShadow: '0 12px 26px rgba(15,106,214,0.12)',
  };

  const tableWrapStyle: React.CSSProperties = {
    borderRadius: 16,
    border: '1px solid var(--muted)',
    background: 'var(--surface)',
    overflow: 'auto',
    boxShadow: '0 12px 26px var(--shadow)',
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', display: 'grid', gap: 16 }}>
      <div className="card" style={heroStyle}>
        <h2 style={{ color: 'var(--primary)' }}>Estadisticas de Asistencia</h2>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Visualiza tiempos, entradas/salidas y promedio de jornadas por usuario.
        </div>
      </div>

      {/* Controles de rango */}
      <div className="card" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label>Desde:</label>
          <input
            type="date"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            className="input"
            style={{ marginLeft: '5px' }}
          />
        </div>
        <div>
          <label>Hasta:</label>
          <input
            type="date"
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            className="input"
            style={{ marginLeft: '5px' }}
          />
        </div>
        <button
          onClick={() => {
            const { from, to } = getWeekRange();
            setRangeFrom(from);
            setRangeTo(to);
          }}
          className="button-secondary"
        >
          Semana Actual
        </button>
        <button
          onClick={() => {
            const { from, to } = getMonthRange();
            setRangeFrom(from);
            setRangeTo(to);
          }}
          className="button-secondary"
        >
          Mes Actual
        </button>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="button-primary"
          style={{ opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div style={{ color: '#fff', marginBottom: '20px', padding: '10px', backgroundColor: 'var(--danger)', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      {paymentMessage && (
        <div style={{ color: '#0b2c1a', marginBottom: '20px', padding: '10px', backgroundColor: 'rgba(22,169,110,0.12)', borderRadius: '6px' }}>
          {paymentMessage}
        </div>
      )}

      {data && (
        <>
          {/* Resumen general */}
          <div className="card" style={{ padding: '15px' }}>
            <h3>Resumen del Periodo</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div>
                <strong>Periodo:</strong>
                <p>{data.rangeStart} al {data.rangeEnd}</p>
              </div>
              <div>
                <strong>Total de Usuarios:</strong>
                <p>{data.totalUsers}</p>
              </div>
              <div>
                <strong>Tiempo Total Acumulado:</strong>
                <p>{formatTime(data.totalMinutesAll)}</p>
              </div>
              <div>
                <strong>Promedio por Usuario:</strong>
                <p>{formatTime(data.avgMinutesPerUser)}</p>
              </div>
            </div>
          </div>

          {/* Tabla de usuarios */}
          <div style={tableWrapStyle}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Departamento</th>
                  <th>Rol</th>
                  <th style={{ textAlign: 'center' }}>Dias Trabajados</th>
                  <th style={{ textAlign: 'center' }}>Hora Entrada</th>
                  <th style={{ textAlign: 'center' }}>Hora Salida</th>
                  <th style={{ textAlign: 'center' }}>Promedio Diario</th>
                  <th style={{ textAlign: 'center' }}>Productividad</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((userStat, idx) => (
                  <React.Fragment key={userStat.userId}>
                    <tr style={{ backgroundColor: idx % 2 === 0 ? 'var(--surface-light)' : 'var(--surface)' }}>
                      <td>
                        <strong>{userStat.userName}</strong>
                        <p style={{ margin: '4px 0', fontSize: '0.85em', color: 'var(--text-tertiary)' }}>
                          {userStat.email}
                        </p>
                      </td>
                      <td>{userStat.department || '-'}</td>
                      <td>{userStat.roleName}</td>
                      <td style={{ textAlign: 'center' }}>{userStat.workDays}</td>
                      <td style={{ textAlign: 'center' }}>
                        {formatTimeOnly(getLatestTimeByType(userStat.attendances, 'entrada'))}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {formatTimeOnly(getLatestTimeByType(userStat.attendances, 'salida'))}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {formatTime(userStat.avgMinutesPerDay)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge" style={productivityStyle(userStat.productivity?.level)}>
                          {userStat.productivity?.level || 'Sin datos'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => toggleUserExpand(userStat.userId)}
                          className="button-secondary"
                          style={{ padding: '6px 12px' }}
                        >
                          {expandedUsers.has(userStat.userId) ? 'v' : '>'} Detalles
                        </button>
                      </td>
                    </tr>

                    {/* Detalle expandido */}
                    {expandedUsers.has(userStat.userId) && (
                      <tr style={{ backgroundColor: 'var(--surface-light)' }}>
                        <td colSpan={9} style={{ padding: '15px' }}>
                          <div style={{ display: 'grid', gap: 16 }}>
                            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                              <div className="card" style={{ padding: 14 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.2rem' }}>
                                  Tiempo trabajado
                                </div>
                                <div style={{ fontSize: 22, fontWeight: 700 }}>{formatTime(userStat.totalMinutes)}</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                                  Promedio diario: {formatTime(userStat.avgMinutesPerDay)}
                                </div>
                              </div>
                              <div className="card" style={{ padding: 14 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.2rem' }}>
                                  Productividad
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                  <span className="badge" style={productivityStyle(userStat.productivity?.level)}>
                                    {userStat.productivity?.level || 'Sin datos'}
                                  </span>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                                    {userStat.productivity?.reviewed || 0} evaluaciones
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                                  <span>Alta: {userStat.productivity?.counts.alta || 0}</span>
                                  <span>Media: {userStat.productivity?.counts.media || 0}</span>
                                  <span>Baja: {userStat.productivity?.counts.baja || 0}</span>
                                </div>
                              </div>
                              <div className="card" style={{ padding: 14 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.2rem' }}>
                                  Pago sugerido
                                </div>
                                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                  Define el monto manual y registra evidencia del pago.
                                </div>
                                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                                  Periodo: {rangeFrom} - {rangeTo}
                                </div>
                              </div>
                            </div>

                            <div className="card" style={{ padding: 16 }}>
                              <h4 style={{ marginTop: 0 }}>Registrar pago</h4>
                              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', alignItems: 'end' }}>
                                <div>
                                  <label style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Monto</label>
                                  <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={paymentDrafts[userStat.userId]?.amount || ''}
                                    onChange={(e) => updatePaymentDraft(userStat.userId, { amount: e.target.value })}
                                  />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                  <label style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Notas</label>
                                  <input
                                    className="input"
                                    placeholder="Detalle del pago o comentario"
                                    value={paymentDrafts[userStat.userId]?.note || ''}
                                    onChange={(e) => updatePaymentDraft(userStat.userId, { note: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div
                                onDragOver={(event) => {
                                  event.preventDefault();
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  const dropped = Array.from(event.dataTransfer.files || []);
                                  handlePaymentFiles(userStat.userId, dropped);
                                }}
                                style={{
                                  border: '2px dashed var(--muted)',
                                  background: 'var(--surface-light)',
                                  borderRadius: 12,
                                  padding: 14,
                                  marginTop: 12,
                                  textAlign: 'center',
                                }}
                              >
                                <input
                                  id={`payment-file-${userStat.userId}`}
                                  className="input"
                                  type="file"
                                  multiple
                                  accept="image/*,.pdf"
                                  onChange={(e) => handlePaymentFiles(userStat.userId, Array.from(e.target.files || []))}
                                  style={{ display: 'none' }}
                                />
                                <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>
                                  Arrastra evidencia de pago (imagen/PDF) o
                                </div>
                                <label htmlFor={`payment-file-${userStat.userId}`} className="button-secondary" style={{ cursor: 'pointer' }}>
                                  Seleccionar archivo
                                </label>
                                <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                                  {(paymentDrafts[userStat.userId]?.files || []).length > 0
                                    ? `${paymentDrafts[userStat.userId].files.length} archivo(s) seleccionados`
                                    : 'Ningun archivo seleccionado'}
                                </div>
                                {(paymentDrafts[userStat.userId]?.files || []).length > 0 && (
                                  <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                                    {paymentDrafts[userStat.userId].files.map((file) => (
                                      <div key={`${userStat.userId}-${file.name}`}>{file.name}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                                <button
                                  className="button-primary"
                                  onClick={() => submitPayment(userStat)}
                                  disabled={Boolean(paymentDrafts[userStat.userId]?.uploading)}
                                >
                                  {paymentDrafts[userStat.userId]?.uploading ? 'Registrando...' : 'Registrar pago'}
                                </button>
                                {(paymentDrafts[userStat.userId]?.files || []).length > 0 && (
                                  <button
                                    className="button-secondary"
                                    onClick={() => updatePaymentDraft(userStat.userId, { files: [] })}
                                  >
                                    Quitar archivos
                                  </button>
                                )}
                              </div>
                            </div>

                            <h4>Desglose por Dia</h4>
                            {userStat.days.length > 0 ? (
                              <div style={tableWrapStyle}>
                                <table className="table" style={{ fontSize: '0.92em' }}>
                                  <thead>
                                    <tr>
                                      <th>Fecha</th>
                                      <th style={{ textAlign: 'center' }}>Horas</th>
                                      <th style={{ textAlign: 'center' }}>Estado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {userStat.days.map((day) => (
                                      <tr key={day.date}>
                                        <td>{day.date}</td>
                                        <td style={{ textAlign: 'center' }}>
                                          {formatTime(day.totalMinutes)}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                          <span className={`badge ${day.isOpen ? 'pending' : 'approved'}`}>
                                            {day.isOpen ? 'En curso' : 'Completado'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p style={{ color: 'var(--text-tertiary)' }}>Sin registros en este periodo</p>
                            )}

                            {userStat.productivity?.notes?.length > 0 && (
                              <div>
                                <h4 style={{ marginTop: 15 }}>Notas de productividad</h4>
                                <div style={tableWrapStyle}>
                                  <table className="table" style={{ fontSize: '0.92em' }}>
                                    <thead>
                                      <tr>
                                        <th>Calificacion</th>
                                        <th>Comentario</th>
                                        <th>Fecha</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {userStat.productivity.notes.map((note, i) => (
                                        <tr key={`${note.reviewedAt}-${i}`}>
                                          <td>
                                            <span className="badge" style={productivityStyle(note.rating)}>
                                              {note.rating}
                                            </span>
                                          </td>
                                          <td>{note.note || 'Sin comentarios'}</td>
                                          <td>{formatDateTime(note.reviewedAt)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            <h4 style={{ marginTop: '15px' }}>Historial de Registros</h4>
                            {userStat.attendances.length > 0 ? (
                              <div style={tableWrapStyle}>
                                <table className="table" style={{ fontSize: '0.92em' }}>
                                  <thead>
                                    <tr>
                                      <th>Tipo</th>
                                      <th>Fecha y Hora</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {userStat.attendances.map((att, i) => (
                                      <tr key={i}>
                                        <td>
                                          <span className={`badge ${att.type === 'entrada' ? 'approved' : 'rejected'}`}>
                                            {att.type === 'entrada' ? 'Entrada' : 'Salida'}
                                          </span>
                                        </td>
                                        <td>{formatDateTime(att.timestamp)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p style={{ color: 'var(--text-tertiary)' }}>Sin registros en este periodo</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {data.users.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              No hay usuarios para mostrar en este rango segun tu nivel jerarquico
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AttendanceHierarchyStats;
