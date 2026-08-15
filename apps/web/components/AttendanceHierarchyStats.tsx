"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import styles from './AttendanceHierarchyStats.module.css';
import { createRealtimeSocket } from '@/lib/realtime-socket';

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
  attendances: { type: string; timestamp: string; deviceInfo?: string | null }[];
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

  const productivityClass = (level?: string) => {
    if (level === 'Alta') return styles.productivityAlta;
    if (level === 'Media') return styles.productivityMedia;
    if (level === 'Baja') return styles.productivityBaja;
    return styles.productivityDefault;
  };

  const getLatestTimeByType = (
    list: { type: string; timestamp: string; deviceInfo?: string | null }[],
    type: 'entrada' | 'salida'
  ) => {
    const filtered = list.filter((item) => item.type === type);
    if (filtered.length === 0) return null;
    const latest = filtered.reduce((max, item) =>
      item.timestamp > max.timestamp ? item : max
    );
    return latest.timestamp;
  };

  const getLatestAttendanceByType = (
    list: { type: string; timestamp: string; deviceInfo?: string | null }[],
    type: 'entrada' | 'salida',
  ) => {
    const filtered = list.filter((item) => item.type === type);
    if (filtered.length === 0) return null;
    return filtered.reduce((max, item) =>
      item.timestamp > max.timestamp ? item : max
    );
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
        let message = 'Error al cargar estadísticas';
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
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['polling', 'websocket'] });

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
      <div className={styles.noPermission}>
        No tienes permisos para ver el panel de estadísticas de asistencia.
        (Requerido: permiso de administración de asistencia)
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

  return (
    <div className={styles.wrapper}>
      <div className={`card ${styles.heroCard}`}>
        <h2 className={styles.heroTitle}>Estadísticas de Asistencia</h2>
        <div className={styles.heroSubtitle}>
          Visualiza tiempos, entradas/salidas y promedio de jornadas por usuario.
        </div>
      </div>

      {/* Controles de rango */}
      <div className={`card ${styles.controlsCard}`}>
        <div>
          <label>Desde:</label>
          <input
            type="date"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            className={`input ${styles.inputOffset}`}
          />
        </div>
        <div>
          <label>Hasta:</label>
          <input
            type="date"
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            className={`input ${styles.inputOffset}`}
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
          className={`button-primary ${loading ? styles.loadingButton : ''}`}
        >
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className={styles.alertError}>
          {error}
        </div>
      )}

      {paymentMessage && (
        <div className={styles.alertSuccess}>
          {paymentMessage}
        </div>
      )}

      {data && (
        <>
          {/* Resumen general */}
          <div className={`card ${styles.summaryCard}`}>
            <h3>Resumen del Periodo</h3>
            <div className={styles.summaryGrid}>
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
          <div className={styles.tableWrap}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Departamento</th>
                  <th>Rol</th>
                  <th className={styles.center}>Dias Trabajados</th>
                  <th className={styles.center}>Hora Entrada</th>
                  <th className={styles.center}>Dispositivo Entrada</th>
                  <th className={styles.center}>Hora Salida</th>
                  <th className={styles.center}>Dispositivo Salida</th>
                  <th className={styles.center}>Promedio Diario</th>
                  <th className={styles.center}>Productividad</th>
                  <th className={styles.center}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((userStat, idx) => (
                  <React.Fragment key={userStat.userId}>
                    <tr className={idx % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                      <td>
                        <strong>{userStat.userName}</strong>
                        <p className={styles.emailText}>
                          {userStat.email}
                        </p>
                      </td>
                      <td>{userStat.department || '-'}</td>
                      <td>{userStat.roleName}</td>
                      <td className={styles.center}>{userStat.workDays}</td>
                      <td className={styles.center}>
                        {formatTimeOnly(getLatestTimeByType(userStat.attendances, 'entrada'))}
                      </td>
                      <td className={styles.deviceText}>
                        {getLatestAttendanceByType(userStat.attendances, 'entrada')?.deviceInfo || '-'}
                      </td>
                      <td className={styles.center}>
                        {formatTimeOnly(getLatestTimeByType(userStat.attendances, 'salida'))}
                      </td>
                      <td className={styles.deviceText}>
                        {getLatestAttendanceByType(userStat.attendances, 'salida')?.deviceInfo || '-'}
                      </td>
                      <td className={styles.center}>
                        {formatTime(userStat.avgMinutesPerDay)}
                      </td>
                      <td className={styles.center}>
                        <span className={`badge ${styles.productivityBadge} ${productivityClass(userStat.productivity?.level)}`}>
                          {userStat.productivity?.level || 'Sin datos'}
                        </span>
                      </td>
                      <td className={styles.center}>
                        <button
                          onClick={() => toggleUserExpand(userStat.userId)}
                          className={`button-secondary ${styles.detailsButton}`}
                        >
                          {expandedUsers.has(userStat.userId) ? 'v' : '>'} Detalles
                        </button>
                      </td>
                    </tr>

                    {/* Detalle expandido */}
                    {expandedUsers.has(userStat.userId) && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={11} className={styles.expandedCell}>
                          <div className={styles.expandedContent}>
                            <div className={styles.kpiGrid}>
                              <div className={`card ${styles.kpiCard}`}>
                                <div className={styles.kpiLabel}>
                                  Tiempo trabajado
                                </div>
                                <div className={styles.kpiValue}>{formatTime(userStat.totalMinutes)}</div>
                                <div className={styles.kpiHint}>
                                  Promedio diario: {formatTime(userStat.avgMinutesPerDay)}
                                </div>
                              </div>
                              <div className={`card ${styles.kpiCard}`}>
                                <div className={styles.kpiLabel}>
                                  Productividad
                                </div>
                                <div className={styles.productivityMeta}>
                                  <span className={`badge ${styles.productivityBadge} ${productivityClass(userStat.productivity?.level)}`}>
                                    {userStat.productivity?.level || 'Sin datos'}
                                  </span>
                                  <span className={styles.metaText}>
                                    {userStat.productivity?.reviewed || 0} evaluaciones
                                  </span>
                                </div>
                                <div className={styles.countsRow}>
                                  <span>Alta: {userStat.productivity?.counts.alta || 0}</span>
                                  <span>Media: {userStat.productivity?.counts.media || 0}</span>
                                  <span>Baja: {userStat.productivity?.counts.baja || 0}</span>
                                </div>
                              </div>
                              <div className={`card ${styles.kpiCard}`}>
                                <div className={styles.kpiLabel}>
                                  Pago sugerido
                                </div>
                                <div className={styles.kpiHint}>
                                  Define el monto manual y registra evidencia del pago.
                                </div>
                                <div className={styles.periodText}>
                                  Periodo: {rangeFrom} - {rangeTo}
                                </div>
                              </div>
                            </div>

                            <div className={`card ${styles.paymentCard}`}>
                              <h4 className={styles.paymentTitle}>Registrar pago</h4>
                              <div className={styles.paymentGrid}>
                                <div>
                                  <label className={styles.labelText}>Monto</label>
                                  <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={paymentDrafts[userStat.userId]?.amount || ''}
                                    onChange={(e) => updatePaymentDraft(userStat.userId, { amount: e.target.value })}
                                  />
                                </div>
                                <div className={styles.noteField}>
                                  <label className={styles.labelText}>Notas</label>
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
                                className={styles.dropzone}
                              >
                                <input
                                  id={`payment-file-${userStat.userId}`}
                                  className={`input ${styles.hiddenInput}`}
                                  type="file"
                                  multiple
                                  accept="image/*,.pdf"
                                  onChange={(e) => handlePaymentFiles(userStat.userId, Array.from(e.target.files || []))}
                                />
                                <div className={styles.dropzoneHint}>
                                  Arrastra evidencia de pago (imagen/PDF) o
                                </div>
                                <label htmlFor={`payment-file-${userStat.userId}`} className={`button-secondary ${styles.filePickerLabel}`}>
                                  Seleccionar archivo
                                </label>
                                <div className={styles.fileSummary}>
                                  {(paymentDrafts[userStat.userId]?.files || []).length > 0
                                    ? `${paymentDrafts[userStat.userId].files.length} archivo(s) seleccionados`
                                    : 'Ningún archivo seleccionado'}
                                </div>
                                {(paymentDrafts[userStat.userId]?.files || []).length > 0 && (
                                  <div className={styles.fileList}>
                                    {paymentDrafts[userStat.userId].files.map((file) => (
                                      <div key={`${userStat.userId}-${file.name}`}>{file.name}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className={styles.paymentActions}>
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
                              <div className={styles.tableWrap}>
                                <table className={`table ${styles.smallTable}`}>
                                  <thead>
                                    <tr>
                                      <th>Fecha</th>
                                      <th className={styles.center}>Horas</th>
                                      <th className={styles.center}>Estado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {userStat.days.map((day) => (
                                      <tr key={day.date}>
                                        <td>{day.date}</td>
                                        <td className={styles.center}>
                                          {formatTime(day.totalMinutes)}
                                        </td>
                                        <td className={styles.center}>
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
                              <p className={styles.sectionMuted}>Sin registros en este periodo</p>
                            )}

                            {userStat.productivity?.notes?.length > 0 && (
                              <div>
                                <h4 className={styles.notesTitle}>Notas de productividad</h4>
                                <div className={styles.tableWrap}>
                                  <table className={`table ${styles.smallTable}`}>
                                    <thead>
                                      <tr>
                                        <th>Calificación</th>
                                        <th>Comentario</th>
                                        <th>Fecha</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {userStat.productivity.notes.map((note, i) => (
                                        <tr key={`${note.reviewedAt}-${i}`}>
                                          <td>
                                            <span className={`badge ${styles.productivityBadge} ${productivityClass(note.rating)}`}>
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

                            <h4 className={styles.historyTitle}>Historial de Registros</h4>
                            {userStat.attendances.length > 0 ? (
                              <div className={styles.tableWrap}>
                                <table className={`table ${styles.smallTable}`}>
                                  <thead>
                                    <tr>
                                      <th>Tipo</th>
                                      <th>Fecha y Hora</th>
                                      <th>Dispositivo</th>
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
                                        <td>{att.deviceInfo || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className={styles.sectionMuted}>Sin registros en este periodo</p>
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
            <div className={styles.emptyUsers}>
              No hay usuarios para mostrar en este rango según tu nivel jerárquico
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AttendanceHierarchyStats;
