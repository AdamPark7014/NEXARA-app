"use client";

import React, { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import styles from "./ConsoleAttendanceTable.module.css";

type AttendanceEvent = { type: string; timestamp: string; deviceInfo?: string };

type Activity = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  fechaAsignacion: string | null;
  fechaInicio: string | null;
  fechaFinalizacion: string | null;
};

type UserAttendanceStats = {
  userId: number;
  userName: string;
  email: string;
  department: string;
  roleName: string;
  totalMinutes: number;
  workDays: number;
  avgMinutesPerDay: number;
  days: { date: string; totalMinutes: number; isOpen: boolean }[];
  attendances: AttendanceEvent[];
  activities: Activity[];
  productivity: {
    avgScore: number;
    level: string;
    counts: { alta: number; media: number; baja: number };
    reviewed: number;
    notes: { rating: string; note: string | null; reviewedAt: string }[];
  };
};

type AttendanceRangeResponse = {
  rangeStart: string;
  rangeEnd: string;
  totalUsers: number;
  totalMinutesAll: number;
  avgMinutesPerUser: number;
  users: UserAttendanceStats[];
};

type DetailFilter = {
  mode: "dia" | "semana" | "mes";
  anchor: string;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(
  /[\/.]+$/,
  ""
);
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;
const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, "");

const toInputDate = (date: Date) => date.toISOString().slice(0, 10);

const toLocalDateKey = (iso?: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("sv-SE");
};

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor(minutes % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${mins}`;
};

const formatTimeOnly = (iso?: string | null) => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};

const formatDeviceInfo = (deviceInfo?: string | null) => {
  const normalized = String(deviceInfo || "").trim();
  return normalized || "Sin dispositivo";
};

const getMinutesFromMidnight = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
};

const getAverageTime = (attendances: AttendanceEvent[], type: "entrada" | "salida") => {
  const dayMap = new Map<string, number>();
  attendances.forEach((item) => {
    if (item.type !== type) return;
    const dateKey = toLocalDateKey(item.timestamp);
    if (!dateKey) return;
    const minutes = getMinutesFromMidnight(item.timestamp);
    if (minutes === null) return;
    const current = dayMap.get(dateKey);
    if (current === undefined) {
      dayMap.set(dateKey, minutes);
      return;
    }
    dayMap.set(dateKey, type === "entrada" ? Math.min(current, minutes) : Math.max(current, minutes));
  });
  if (dayMap.size === 0) return "-";
  const total = Array.from(dayMap.values()).reduce((sum, value) => sum + value, 0);
  return formatMinutes(Math.round(total / dayMap.size));
};

const getWeekRange = (anchor: Date) => {
  const dayOfWeek = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getMonthRange = (anchor: Date) => {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

const clampRange = (range: { start: Date; end: Date }, globalStart: Date, globalEnd: Date) => {
  const start = range.start < globalStart ? globalStart : range.start;
  const end = range.end > globalEnd ? globalEnd : range.end;
  return { start, end };
};

const groupDailyDetails = (
  attendances: AttendanceEvent[],
  activities: Activity[],
  rangeStart: Date,
  rangeEnd: Date
) => {
  const dailyMap = new Map<
    string,
    {
      entries: { time: string; deviceInfo?: string }[];
      exits: { time: string; deviceInfo?: string }[];
      activities: Activity[];
    }
  >();

  attendances.forEach((item) => {
    const dateKey = toLocalDateKey(item.timestamp);
    if (!dateKey) return;
    const timestamp = new Date(item.timestamp);
    if (Number.isNaN(timestamp.getTime())) return;
    if (timestamp < rangeStart || timestamp > rangeEnd) return;
    const entry = dailyMap.get(dateKey) || { entries: [], exits: [], activities: [] };
    const timeLabel = formatTimeOnly(item.timestamp);
    if (item.type === "entrada") entry.entries.push({ time: timeLabel, deviceInfo: item.deviceInfo });
    if (item.type === "salida") entry.exits.push({ time: timeLabel, deviceInfo: item.deviceInfo });
    dailyMap.set(dateKey, entry);
  });

  activities.forEach((activity) => {
    const dateSource = activity.fechaInicio || activity.fechaAsignacion || activity.fechaFinalizacion;
    const dateKey = toLocalDateKey(dateSource);
    if (!dateKey) return;
    const timestamp = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(timestamp.getTime())) return;
    if (timestamp < rangeStart || timestamp > rangeEnd) return;
    const entry = dailyMap.get(dateKey) || { entries: [], exits: [], activities: [] };
    entry.activities.push(activity);
    dailyMap.set(dateKey, entry);
  });

  return Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, detail]) => ({ date, ...detail }));
};

const ConsoleAttendanceTable = () => {
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
  const [rangeTo, setRangeTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());
  const [detailFilters, setDetailFilters] = useState<Record<number, DetailFilter>>({});

  const fetchStats = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      const res = await fetch(buildApiUrl(`attendance/hierarchy/range?${params.toString()}`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Error al cargar estadisticas");
      }
      const payload = await res.json();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
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
    const socket: Socket = io(socketUrl, { transports: ["polling", "websocket"] });
    socket.on("attendance:updated", () => fetchStats());
    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "Attendance" || payload?.model === "AttendanceDay") {
        fetchStats();
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [rangeFrom, rangeTo, user]);

  const summary = useMemo(() => {
    if (!data) return { totalUsers: 0, totalMinutesAll: 0, avgMinutesPerUser: 0 };
    return {
      totalUsers: data.totalUsers || 0,
      totalMinutesAll: data.totalMinutesAll || 0,
      avgMinutesPerUser: data.avgMinutesPerUser || 0,
    };
  }, [data]);

  const toggleUserExpand = (userId: number) => {
    const next = new Set(expandedUsers);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
      setDetailFilters((prev) => {
        if (prev[userId]) return prev;
        return { ...prev, [userId]: { mode: "semana", anchor: rangeTo } };
      });
    }
    setExpandedUsers(next);
  };

  const updateDetailFilter = (userId: number, changes: Partial<DetailFilter>) => {
    setDetailFilters((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] || { mode: "semana", anchor: rangeTo }), ...changes },
    }));
  };

  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE)) {
    return <div className={styles.locked}>No tienes permisos para ver este panel.</div>;
  }

  return (
    <section className={styles.card}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>Console analytics</p>
          <h2 className={styles.title}>Estadisticas de asistencia</h2>
          <p className={styles.subtitle}>
            Seguimiento diario de jornadas, productividad y actividad operativa.
          </p>
        </div>
        <div className={styles.heroStats}>
          <div>
            <span>Usuarios visibles</span>
            <strong>{summary.totalUsers}</strong>
          </div>
          <div>
            <span>Tiempo total</span>
            <strong>{formatMinutes(summary.totalMinutesAll)}</strong>
          </div>
          <div>
            <span>Promedio</span>
            <strong>{formatMinutes(summary.avgMinutesPerUser)}</strong>
          </div>
        </div>
      </header>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label>Desde</label>
          <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
        </div>
        <div className={styles.controlGroup}>
          <label>Hasta</label>
          <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
        </div>
        <button
          className={styles.ghostButton}
          onClick={() => {
            const { start, end } = getWeekRange(new Date());
            setRangeFrom(toInputDate(start));
            setRangeTo(toInputDate(end));
          }}
        >
          Semana actual
        </button>
        <button
          className={styles.ghostButton}
          onClick={() => {
            const { start, end } = getMonthRange(new Date());
            setRangeFrom(toInputDate(start));
            setRangeTo(toInputDate(end));
          }}
        >
          Mes actual
        </button>
        <button className={styles.primaryButton} onClick={fetchStats} disabled={loading}>
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.summaryGrid}>
        <div>
          <p>Periodo</p>
          <strong>
            {data?.rangeStart || rangeFrom} - {data?.rangeEnd || rangeTo}
          </strong>
        </div>
        <div>
          <p>Total de usuarios</p>
          <strong>{summary.totalUsers}</strong>
        </div>
        <div>
          <p>Tiempo total acumulado</p>
          <strong>{formatMinutes(summary.totalMinutesAll)}</strong>
        </div>
        <div>
          <p>Promedio por usuario</p>
          <strong>{formatMinutes(summary.avgMinutesPerUser)}</strong>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Departamento</th>
              <th>Rol</th>
              <th>Dias trabajados</th>
              <th>Entrada promedio</th>
              <th>Salida promedio</th>
              <th>Productividad</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(data?.users || [])
              .filter((item) => {
                const email = String(item?.email || '').toLowerCase();
                return email !== 'gerencia@nexara.com.mx' && email !== 'developer@nexara.com.mx';
              })
              .map((userStat) => {
              const avgEntry = getAverageTime(userStat.attendances, "entrada");
              const avgExit = getAverageTime(userStat.attendances, "salida");
              return (
                <React.Fragment key={userStat.userId}>
                  <tr>
                    <td>
                      <strong>{userStat.userName}</strong>
                      <span>{userStat.email}</span>
                    </td>
                    <td>{userStat.department || "-"}</td>
                    <td>{userStat.roleName || "-"}</td>
                    <td>{userStat.workDays}</td>
                    <td>{avgEntry}</td>
                    <td>{avgExit}</td>
                    <td>
                      <span className={styles.badge} data-level={userStat.productivity?.level || "Sin datos"}>
                        {userStat.productivity?.level || "Sin datos"}
                      </span>
                    </td>
                    <td>
                      <button
                        className={styles.detailsButton}
                        onClick={() => toggleUserExpand(userStat.userId)}
                      >
                        {expandedUsers.has(userStat.userId) ? "Ocultar" : "Detalles"}
                      </button>
                    </td>
                  </tr>
                  {expandedUsers.has(userStat.userId) && (
                    <tr>
                      <td colSpan={8} className={styles.detailCell}>
                        <div className={styles.detailHeader}>
                          <div>
                            <h4>Detalle de jornadas</h4>
                            <p>Entradas, salidas y actividades por periodo.</p>
                          </div>
                          <div className={styles.detailControls}>
                            <select
                              value={(detailFilters[userStat.userId] || { mode: "semana" }).mode}
                              onChange={(e) =>
                                updateDetailFilter(userStat.userId, {
                                  mode: e.target.value as DetailFilter["mode"],
                                })
                              }
                            >
                              <option value="dia">Dia</option>
                              <option value="semana">Semana</option>
                              <option value="mes">Mes</option>
                            </select>
                            <input
                              type="date"
                              value={(detailFilters[userStat.userId] || { anchor: rangeTo }).anchor}
                              onChange={(e) =>
                                updateDetailFilter(userStat.userId, { anchor: e.target.value })
                              }
                            />
                          </div>
                        </div>

                        {(() => {
                          const filter = detailFilters[userStat.userId] || { mode: "semana", anchor: rangeTo };
                          const anchorDate = new Date(filter.anchor || rangeTo);
                          const globalStart = new Date(`${rangeFrom}T00:00:00`);
                          const globalEnd = new Date(`${rangeTo}T23:59:59`);
                          let detailRange = { start: globalStart, end: globalEnd };

                          if (filter.mode === "dia") {
                            const start = new Date(anchorDate);
                            start.setHours(0, 0, 0, 0);
                            const end = new Date(anchorDate);
                            end.setHours(23, 59, 59, 999);
                            detailRange = { start, end };
                          }
                          if (filter.mode === "semana") {
                            detailRange = getWeekRange(anchorDate);
                          }
                          if (filter.mode === "mes") {
                            detailRange = getMonthRange(anchorDate);
                          }

                          detailRange = clampRange(detailRange, globalStart, globalEnd);

                          const dailyRows = groupDailyDetails(
                            userStat.attendances,
                            userStat.activities,
                            detailRange.start,
                            detailRange.end
                          );

                          return (
                            <>
                              <div className={styles.detailSummary}>
                                <div>
                                  <span>Dias trabajados</span>
                                  <strong>{userStat.workDays}</strong>
                                </div>
                                <div>
                                  <span>Promedio entrada</span>
                                  <strong>{getAverageTime(userStat.attendances, "entrada")}</strong>
                                </div>
                                <div>
                                  <span>Promedio salida</span>
                                  <strong>{getAverageTime(userStat.attendances, "salida")}</strong>
                                </div>
                                <div>
                                  <span>Productividad</span>
                                  <strong>{userStat.productivity?.level || "Sin datos"}</strong>
                                </div>
                              </div>
                              <div className={styles.detailTableWrap}>
                                <table className={styles.detailTable}>
                                  <thead>
                                    <tr>
                                      <th>Fecha</th>
                                      <th>Entradas</th>
                                      <th>Salidas</th>
                                      <th>Dispositivo entrada</th>
                                      <th>Dispositivo salida</th>
                                      <th>Actividades</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dailyRows.length === 0 && (
                                      <tr>
                                        <td colSpan={6} className={styles.emptyRow}>
                                          Sin registros en este periodo.
                                        </td>
                                      </tr>
                                    )}
                                    {dailyRows.map((row) => (
                                      <tr key={row.date}>
                                        <td>{formatDateLabel(row.date)}</td>
                                        <td>{row.entries.length ? row.entries.map((entry) => entry.time).join(", ") : "-"}</td>
                                        <td>{row.exits.length ? row.exits.map((exit) => exit.time).join(", ") : "-"}</td>
                                        <td>
                                          {row.entries.length
                                            ? row.entries.map((entry) => formatDeviceInfo(entry.deviceInfo)).join(", ")
                                            : "-"}
                                        </td>
                                        <td>
                                          {row.exits.length
                                            ? row.exits.map((exit) => formatDeviceInfo(exit.deviceInfo)).join(", ")
                                            : "-"}
                                        </td>
                                        <td>
                                          {row.activities.length ? (
                                            <div className={styles.activityList}>
                                              {row.activities.map((activity) => (
                                                <span key={activity.id}>
                                                  {activity.anNumber} · {activity.titulo}
                                                </span>
                                              ))}
                                            </div>
                                          ) : (
                                            "-"
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          );
                        })()}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
              })}
          </tbody>
        </table>
      </div>

      {(data?.users || []).filter((item) => {
        const email = String(item?.email || '').toLowerCase();
        return email !== 'gerencia@nexara.com.mx' && email !== 'developer@nexara.com.mx';
      }).length === 0 && (
        <div className={styles.emptyState}>No hay usuarios visibles en este rango.</div>
      )}
    </section>
  );
};

export default ConsoleAttendanceTable;
