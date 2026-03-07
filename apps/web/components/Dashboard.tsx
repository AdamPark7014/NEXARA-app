import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

type Viatic = {
  id: number;
  usuarioId?: number | null;
  montoSolicitado?: number | null;
  estatusPago?: string | null;
  razonGasto?: string | null;
  createdAt?: string | null;
  usuario?: { id?: number; nombre: string } | null;
};

type Activity = {
  id: number;
  estatus: string;
  titulo?: string | null;
  fechaAsignacion?: string | null;
  fechaInicio?: string | null;
  fechaFinalizacion?: string | null;
  responsableId?: number | null;
  responsable?: { id?: number; nombre: string } | null;
};

type AttendanceRangeUser = {
  userId: number;
  userName?: string;
  totalMinutes?: number;
  days?: { date: string; totalMinutes: number; isOpen?: boolean }[];
  attendances?: { type: string; timestamp: string }[];
};

type AttendanceRange = {
  rangeStart?: string;
  rangeEnd?: string;
  totalMinutesAll?: number;
  totalUsers?: number;
  users?: AttendanceRangeUser[];
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

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
    start,
    end,
    from: toLocalDateInput(start),
    to: toLocalDateInput(end),
  };
};

const getLastWeekRange = (anchor: Date) => {
  const current = getWeekRange(anchor);
  const start = new Date(current.start);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start,
    end,
    from: toLocalDateInput(start),
    to: toLocalDateInput(end),
  };
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};

const formatHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

const toLocalDateKey = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('sv-SE');
};

const buildMinutesFromAttendances = (
  attendances: { type: string; timestamp: string }[],
  rangeStart: Date,
  rangeEnd: Date,
) => {
  const events = attendances
    .map((item) => ({ type: item.type, timestamp: new Date(item.timestamp) }))
    .filter((item) => !Number.isNaN(item.timestamp.getTime()))
    .filter((item) => item.timestamp >= rangeStart && item.timestamp <= rangeEnd)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  let totalMinutes = 0;
  let openEntryTime: Date | null = null;
  let openEntryDate: string | null = null;
  const dailyMap = new Map<string, number>();

  events.forEach((event) => {
    if (event.type === 'entrada') {
      openEntryTime = event.timestamp;
      openEntryDate = toLocalDateKey(event.timestamp.toISOString());
      return;
    }
    if (event.type === 'salida' && openEntryTime) {
      const minutes = Math.max(0, Math.floor((event.timestamp.getTime() - openEntryTime.getTime()) / 60000));
      totalMinutes += minutes;
      const dayKey = openEntryDate || toLocalDateKey(event.timestamp.toISOString());
      if (dayKey) {
        dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + minutes);
      }
      openEntryTime = null;
      openEntryDate = null;
    }
  });

  // Close any open entry at the range end
  if (openEntryTime !== null) {
    const entryTime = openEntryTime as Date;
    const minutes = Math.max(0, Math.floor((rangeEnd.getTime() - entryTime.getTime()) / 60000));
    totalMinutes += minutes;
    const dayKey = openEntryDate || toLocalDateKey(rangeEnd.toISOString());
    if (dayKey) {
      dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + minutes);
    }
  }

  return { totalMinutes, dailyMap };
};

export default function Dashboard() {
  const { user } = useUser();
  const [isMounted, setIsMounted] = useState(false);
  const [viatics, setViatics] = useState<Viatic[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRange | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConsoleAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const normalizedUserId = user?.id ? Number(user.id) : null;

  const weekRange = useMemo(() => getWeekRange(new Date()), []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const availableUsers = useMemo(() => {
    const list = attendance?.users || [];
    if (isSuperAdmin) {
      return list.filter((item) => item.userId !== normalizedUserId);
    }
    if (!isConsoleAdmin) return list;
    if (!normalizedUserId || !user?.nombre) return list;
    const exists = list.some((item) => item.userId === normalizedUserId);
    if (exists) return list;
    return [...list, { userId: normalizedUserId, userName: user.nombre }];
  }, [attendance?.users, isConsoleAdmin, isSuperAdmin, normalizedUserId, user?.nombre]);

  useEffect(() => {
    if (selectedUserId !== null) return;
    if (isSuperAdmin) {
      const target = availableUsers.find((item) => item.userId !== normalizedUserId) || availableUsers[0];
      if (target) setSelectedUserId(target.userId);
    } else if (normalizedUserId) {
      setSelectedUserId(normalizedUserId);
    }
  }, [availableUsers, isSuperAdmin, normalizedUserId, selectedUserId]);

  useEffect(() => {
    if (!availableUsers.length) return;
    const exists = availableUsers.some((item) => item.userId === selectedUserId);
    if (exists) return;
    if (isSuperAdmin) {
      const target = availableUsers.find((item) => item.userId !== normalizedUserId) || availableUsers[0];
      setSelectedUserId(target?.userId ?? null);
      return;
    }
    if (normalizedUserId && availableUsers.some((item) => item.userId === normalizedUserId)) {
      setSelectedUserId(normalizedUserId);
    } else {
      setSelectedUserId(availableUsers[0].userId);
    }
  }, [availableUsers, isSuperAdmin, normalizedUserId, selectedUserId]);

  useEffect(() => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);

    const fetchAll = async () => {
      try {
        const headers = { Authorization: `Bearer ${user.token}` };
        const params = new URLSearchParams({ from: weekRange.from, to: weekRange.to });
        const canManageAttendance = hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE);
        const canViewAttendance = hasPermission(user, PERMISSIONS.ATTENDANCE_VIEW);

        const [viaticsRes, activitiesRes, attendanceRes] = await Promise.all([
          fetch(buildApiUrl('viatics'), { headers }),
          fetch(buildApiUrl('activities'), { headers }),
          canManageAttendance
            ? fetch(buildApiUrl(`attendance/hierarchy/range?${params.toString()}`), { headers })
            : canViewAttendance
              ? fetch(buildApiUrl(`attendance/range?${params.toString()}`), { headers })
              : Promise.resolve(null),
        ]);

        const viaticsData = viaticsRes.ok ? ((await viaticsRes.json()) as Viatic[]) : [];
        const activitiesData = activitiesRes.ok ? ((await activitiesRes.json()) as Activity[]) : [];
        let attendancePayload: AttendanceRange | { totalMinutes?: number; days?: any[]; attendances?: any[] } | null = null;
        if (attendanceRes) {
          if (attendanceRes.ok) {
            attendancePayload = await attendanceRes.json();
          } else {
            let attendanceMessage = `Error al consultar asistencia (${attendanceRes.status})`;
            try {
              const errorPayload = await attendanceRes.json();
              if (errorPayload?.message) attendanceMessage = errorPayload.message;
            } catch {
              // Ignore JSON parse errors for non-JSON responses.
            }
            throw new Error(attendanceMessage);
          }
        }

        setViatics(Array.isArray(viaticsData) ? viaticsData : []);
        setActivities(Array.isArray(activitiesData) ? activitiesData : []);

        if (canManageAttendance && attendancePayload) {
          setAttendance(attendancePayload as AttendanceRange);
        } else if (attendancePayload && user?.id) {
          const normalizedUserId = Number(user.id);
          const payload = attendancePayload as { totalMinutes?: number; days?: any[]; attendances?: any[] };
          setAttendance({
            rangeStart: weekRange.from,
            rangeEnd: weekRange.to,
            totalMinutesAll: payload.totalMinutes || 0,
            totalUsers: 1,
            users: [
              {
                userId: normalizedUserId,
                userName: user.nombre,
                totalMinutes: payload.totalMinutes || 0,
                days: payload.days || [],
                attendances: payload.attendances || [],
              },
            ],
          });
        } else {
          setAttendance(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [user, weekRange.from, weekRange.to]);

  if (!isMounted) return <div className="loadingCard">Cargando dashboard...</div>;
  if (loading) return <div className="loadingCard">Cargando dashboard...</div>;
  if (error) return <div className="errorCard">{error}</div>;
  if (!user) return null;

  const activeUserId = selectedUserId ?? (isSuperAdmin ? null : Number(user.id));
  const isWithinWeek = (value?: string | null) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date >= weekRange.start && date <= weekRange.end;
  };

  const userName =
    availableUsers.find((item) => item.userId === activeUserId)?.userName ||
    (isSuperAdmin ? 'Sin usuario seleccionado' : user.nombre);

  const filteredViatics = viatics.filter((item) => {
    if (!isWithinWeek(item.createdAt)) return false;
    const userId = item.usuario?.id ?? item.usuarioId ?? null;
    return userId ? userId === activeUserId : false;
  });

  const filteredActivities = activities.filter((item) => {
    const dateRef = item.fechaAsignacion || item.fechaInicio || item.fechaFinalizacion || null;
    if (!isWithinWeek(dateRef)) return false;
    const userId = item.responsable?.id ?? item.responsableId ?? null;
    return userId ? userId === activeUserId : false;
  });

  const scopedAttendanceUsers = availableUsers.length
    ? availableUsers.filter((item) => item.userId === activeUserId)
    : [];

  const getUserMinutesAndDaily = (item: AttendanceRangeUser) => {
    const dailyMap = new Map<string, number>();
    const minutesFromDays = (item.days || []).reduce((sum, day) => {
      const dayKey = day.date;
      if (dayKey) {
        dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + (day.totalMinutes || 0));
      }
      return sum + (day.totalMinutes || 0);
    }, 0);

    if (minutesFromDays > 0) {
      return { totalMinutes: minutesFromDays, dailyMap };
    }

    if ((item.totalMinutes || 0) > 0) {
      return { totalMinutes: item.totalMinutes || 0, dailyMap };
    }

    if (item.attendances && item.attendances.length) {
      return buildMinutesFromAttendances(item.attendances, weekRange.start, weekRange.end);
    }

    return { totalMinutes: 0, dailyMap };
  };

  const attendanceSummary = scopedAttendanceUsers.map((item) => getUserMinutesAndDaily(item));
  const attendanceMinutes = attendanceSummary.reduce((sum, item) => sum + item.totalMinutes, 0);

  const todayKey = toLocalDateInput(new Date());
  const activeUsersCount = availableUsers.filter((item) =>
    (item.days || []).some((day) => day.date === todayKey && day.isOpen),
  ).length;

  const attendanceByDay = attendanceSummary.reduce((map, item) => {
    item.dailyMap.forEach((minutes, dateKey) => {
      map.set(dateKey, (map.get(dateKey) || 0) + minutes);
    });
    return map;
  }, new Map<string, number>());

  const attendanceChart = Array.from(attendanceByDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, minutes]) => ({
      date: formatDate(date),
      horas: formatHours(minutes),
    }));

  const viaticTotals = {
    amount: filteredViatics.reduce((sum, item) => sum + (item.montoSolicitado || 0), 0),
    total: filteredViatics.length,
    pending: filteredViatics.filter((item) => item.estatusPago === 'Pendiente').length,
    approved: filteredViatics.filter((item) => item.estatusPago === 'Aprobado').length,
  };

  const activityTotals = {
    total: filteredActivities.length,
    statusCounts: filteredActivities.reduce((acc, item) => {
      const key = item.estatus || 'Sin estatus';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  // Para gráficas: mostrar datos de TODOS los usuarios, no solo el seleccionado
  const allViatics = viatics.filter((item) => isWithinWeek(item.createdAt));
  const allActivities = activities.filter((item) => {
    const dateRef = item.fechaAsignacion || item.fechaInicio || item.fechaFinalizacion || null;
    return isWithinWeek(dateRef);
  });

  const viaticStatusData = Object.entries(
    allViatics.reduce((acc, item) => {
      const key = item.estatusPago || 'Sin estatus';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  ).map(([estatus, cantidad]) => ({ estatus, cantidad }));

  const activityStatusData = Object.entries(
    allActivities.reduce((acc, item) => {
      const key = item.estatus || 'Sin estatus';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  ).map(([estatus, cantidad]) => ({ estatus, cantidad }));

  const hasAttendanceData = attendanceChart.some((item) => item.horas > 0);
  const hasActivityData = activityStatusData.length > 0;
  const hasViaticData = viaticStatusData.length > 0;

  const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number }>; label?: string }) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div className="chartTooltip">
        {label && <div className="chartTooltipTitle">{label}</div>}
        {payload.map((item, index) => (
          <div key={`${item.name ?? 'item'}-${index}`} className="chartTooltipRow">
            <span>{item.name ?? 'Total'}</span>
            <span className="chartTooltipValue">{item.value ?? 0}</span>
          </div>
        ))}
      </div>
    );
  };

  const daysInWeek = 7;
  const avgDailyMinutes = attendanceMinutes ? Math.round(attendanceMinutes / daysInWeek) : 0;

  const weeklyUserHours = availableUsers
    .map((item) => {
      const minutes = getUserMinutesAndDaily(item).totalMinutes;
      return {
        userId: item.userId,
        name: item.userName || `Usuario ${item.userId}`,
        minutes,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  return (
    <div className="dashboardRoot">
      <div className="heroCard">
        <div className="heroHeader">
          <div>
            <p className="heroKicker">Panel Console</p>
            <h1 className="heroTitle">Resumen semanal operativo</h1>
            <div className="heroSubtitle">{userName} · Semana {weekRange.from} a {weekRange.to}</div>
          </div>
          <div className="heroMeta">
            <div className="heroRole">{user.role}</div>
            {user.isSuperAdmin && <div className="heroLevel">Superadmin</div>}
          </div>
        </div>
        <div className="heroBadges">
          <span className="chip">Semana: {formatDate(weekRange.from)} - {formatDate(weekRange.to)}</span>
          <span className="chip chipLive">Usuario: {userName}</span>
        </div>
        {isConsoleAdmin && availableUsers.length > 0 && (
          <div className="filtersRow">
            <label className="filterControl">
              <span className="filterLabel">Usuario</span>
              <select
                className="input"
                value={activeUserId ?? ""}
                onChange={(event) => setSelectedUserId(Number(event.target.value))}
              >
                {availableUsers.map((item) => (
                  <option key={item.userId} value={item.userId}>
                    {item.userName || `Usuario ${item.userId}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="kpiGrid">
        <div className="kpiCard kpiDelay1">
          <div className="kpiHeader">
            <span className="kpiEyebrow">Horas trabajadas</span>
            <span className="kpiPill">Semana</span>
          </div>
          <div className="kpiValue">{formatHours(attendanceMinutes)} h</div>
          <div className="kpiMeta">Total semanal por usuario</div>
        </div>

        <div className="kpiCard kpiDelay2">
          <div className="kpiHeader">
            <span className="kpiEyebrow">Usuarios activos</span>
            <span className="kpiPill">Hoy</span>
          </div>
          <div className="kpiValue">{activeUsersCount}</div>
          <div className="kpiMeta">Con entrada abierta</div>
        </div>

        <div className="kpiCard kpiDelay3">
          <div className="kpiHeader">
            <span className="kpiEyebrow">Actividades</span>
            <span className="kpiPill">Semana</span>
          </div>
          <div className="kpiValue">{activityTotals.total}</div>
          <div className="kpiMeta">Asignadas o en proceso</div>
        </div>

        <div className="kpiCard kpiDelay4">
          <div className="kpiHeader">
            <span className="kpiEyebrow">Viaticos</span>
            <span className="kpiPill">Semana</span>
          </div>
          <div className="kpiValue">{formatCurrency(viaticTotals.amount)}</div>
          <div className="kpiMeta">{viaticTotals.pending} pendientes · {viaticTotals.approved} aprobados</div>
        </div>

        <div className="kpiCard kpiDelay5">
          <div className="kpiHeader">
            <span className="kpiEyebrow">Ritmo diario</span>
            <span className="kpiPill pillAccent">Promedio</span>
          </div>
          <div className="kpiValue">
            {formatHours(avgDailyMinutes)} h
          </div>
          <div className="kpiMeta">Horas promedio por dia</div>
        </div>
      </div>

      <div className="analyticsGrid">
        <div className="analysisCard">
          <div className="analysisHeader">
            <div>
              <div className="analysisEyebrow">Asistencia</div>
              <h3 className="analysisTitle">Horas por dia</h3>
            </div>
            <span className="analysisPill">Semana actual</span>
          </div>
          <div className="chartWrap">
            {hasAttendanceData ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={attendanceChart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hoursFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" />
                      <stop offset="100%" stopColor="var(--secondary)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(23, 137, 252, 0.18)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-tertiary)" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} stroke="var(--text-tertiary)" tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar dataKey="horas" name="Horas" fill="url(#hoursFill)" radius={[8, 8, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chartEmpty">Sin datos en la semana actual.</div>
            )}
          </div>
        </div>

        <div className="analysisCard">
          <div className="analysisHeader">
            <div>
              <div className="analysisEyebrow">Actividades</div>
              <h3 className="analysisTitle">Distribucion por estatus</h3>
            </div>
            <span className="analysisPill">{activityTotals.total} total</span>
          </div>
          <div className="chartWrap">
            {hasActivityData ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={activityStatusData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" />
                      <stop offset="100%" stopColor="var(--primary-light)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(23, 137, 252, 0.18)" vertical={false} />
                  <XAxis dataKey="estatus" stroke="var(--text-tertiary)" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} stroke="var(--text-tertiary)" tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="cantidad" name="Actividades" fill="url(#activityFill)" radius={[8, 8, 0, 0]} barSize={26} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chartEmpty">Sin datos en la semana actual.</div>
            )}
          </div>
        </div>

        <div className="analysisCard">
          <div className="analysisHeader">
            <div>
              <div className="analysisEyebrow">Viaticos</div>
              <h3 className="analysisTitle">Pagos por estatus</h3>
            </div>
            <span className="analysisPill">{viaticTotals.total} registros</span>
          </div>
          <div className="chartWrap">
            {hasViaticData ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={viaticStatusData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="viaticFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--secondary)" />
                      <stop offset="100%" stopColor="var(--accent)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(23, 137, 252, 0.18)" vertical={false} />
                  <XAxis dataKey="estatus" stroke="var(--text-tertiary)" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} stroke="var(--text-tertiary)" tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="cantidad" name="Viaticos" fill="url(#viaticFill)" radius={[8, 8, 0, 0]} barSize={26} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chartEmpty">Sin datos en la semana actual.</div>
            )}
          </div>
        </div>
        {weeklyUserHours.length > 0 && (
          <div className="analysisCard">
            <div className="analysisHeader">
              <div>
                <div className="analysisEyebrow">Usuarios</div>
                <h3 className="analysisTitle">Horas trabajadas</h3>
              </div>
              <span className="analysisPill">Semana actual</span>
            </div>
            <div className="userHoursList">
              {weeklyUserHours.map((item) => (
                <div key={item.userId} className="userHoursRow">
                  <span className="userHoursName">{item.name}</span>
                  <span className="userHoursValue">{formatHours(item.minutes)} h</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .loadingCard,
        .errorCard,
        .heroCard,
        .kpiCard,
        .analysisCard,
        .chartWrap,
        .userHoursRow,
        .chartEmpty,
        .chartTooltip,
        .chip,
        .chipLive,
        .kpiPill,
        .analysisPill,
        .heroLevel,
        .input {
          background: var(--surface) !important;
          box-shadow: none !important;
          text-shadow: none !important;
          filter: none !important;
          backdrop-filter: none !important;
        }

        .loadingCard,
        .errorCard {
          padding: 24px;
          border-radius: 12px;
          border: 1px solid var(--border);
          color: var(--foreground);
          text-align: center;
          font-size: 16px;
        }

        .errorCard {
          color: var(--danger);
          border-color: var(--danger);
        }

        .dashboardRoot {
          display: grid;
          gap: 14px;
        }

        .heroCard,
        .kpiCard,
        .analysisCard {
          display: grid;
          gap: 12px;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }

        .heroHeader,
        .kpiHeader,
        .analysisHeader,
        .userHoursRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .heroHeader,
        .analysisHeader {
          flex-wrap: wrap;
        }

        .heroKicker,
        .kpiEyebrow,
        .analysisEyebrow,
        .filterLabel {
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .heroTitle,
        .analysisTitle,
        .kpiValue {
          margin: 0;
          color: var(--foreground);
          line-height: 1.15;
        }

        .heroTitle {
          font-size: clamp(20px, 2.2vw, 28px);
        }

        .analysisTitle {
          margin-top: 4px;
          font-size: clamp(18px, 1.8vw, 22px);
        }

        .kpiValue {
          font-size: clamp(22px, 2.4vw, 30px);
          font-weight: 700;
        }

        .heroSubtitle,
        .heroMeta,
        .kpiMeta,
        .userHoursName,
        .analysisPill,
        .kpiPill,
        .heroLevel,
        .chip,
        .chipLive {
          color: var(--text-secondary);
          font-size: 12px;
        }

        .heroBadges,
        .filtersRow {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .filterControl {
          display: grid;
          gap: 6px;
        }

        .input {
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--border);
          color: var(--foreground);
          font-size: 14px;
        }

        .kpiGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }

        .analyticsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 12px;
        }

        .userHoursList {
          display: grid;
          gap: 8px;
        }

        .userHoursRow {
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid var(--border);
        }

        .userHoursValue,
        .chartTooltipValue {
          font-weight: 700;
          color: var(--foreground);
        }

        .chartWrap {
          width: 100%;
          height: 240px;
          padding: 8px;
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
        }

        .chartWrap::before,
        .heroCard::after,
        .kpiCard::before,
        .analysisCard::before {
          content: none !important;
        }

        .chartEmpty {
          height: 100%;
          display: grid;
          place-items: center;
          text-align: center;
          border: 1px dashed var(--border);
          border-radius: 8px;
          color: var(--text-tertiary);
          font-size: 13px;
          padding: 12px;
        }

        .chartTooltip {
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--border);
          color: var(--foreground);
          font-size: 12px;
          display: grid;
          gap: 4px;
        }

        .chartTooltipRow {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }

        @media (max-width: 900px) {
          .heroMeta {
            text-align: left;
          }
        }

        @media (max-width: 640px) {
          .kpiGrid,
          .analyticsGrid {
            grid-template-columns: 1fr;
          }

          .heroCard,
          .kpiCard,
          .analysisCard {
            padding: 14px;
          }
        }
      `}</style>
    </div>
  );
}
