"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { getApiBaseCandidates, getSocketBaseUrl as resolveSocketBaseUrl } from '@/lib/api-base';

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

type CollectionResponse<T> = T[] | { data?: T[] | null } | null | undefined;

type VisibleUser = {
  id: number;
  nombre: string;
  email?: string | null;
  role?: {
    accesoConsoleAdmin?: boolean;
    nombre?: string | null;
  } | null;
};

const buildApiUrlWithBase = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

const normalizeCollectionResponse = <T,>(payload: CollectionResponse<T>): T[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
};

const fetchFromApiCandidates = async (
  path: string,
  init?: RequestInit,
  timeoutMs = 15000,
) => {
  const candidates = getApiBaseCandidates();
  let lastError: unknown = null;

  for (const base of candidates) {
    const controller = new AbortController();
    const externalSignal = init?.signal;
    const onExternalAbort = () => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(buildApiUrlWithBase(base, path), {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      return response;
    } catch (err) {
      clearTimeout(timeout);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No se pudo conectar con la API');
};

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
  const [visibleUsers, setVisibleUsers] = useState<VisibleUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isConsoleAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const normalizedUserId = user?.id ? Number(user.id) : null;

  const weekRange = useMemo(() => getWeekRange(new Date()), []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const availableUsers = useMemo(() => {
    const map = new Map<number, AttendanceRangeUser>();

    const pushUser = (candidate: AttendanceRangeUser | null | undefined) => {
      if (!candidate || typeof candidate.userId !== 'number' || Number.isNaN(candidate.userId)) return;
      const existing = map.get(candidate.userId);
      if (!existing) {
        map.set(candidate.userId, {
          userId: candidate.userId,
          userName: candidate.userName,
          totalMinutes: candidate.totalMinutes,
          days: candidate.days || [],
          attendances: candidate.attendances || [],
        });
        return;
      }

      map.set(candidate.userId, {
        userId: candidate.userId,
        userName: existing.userName || candidate.userName,
        totalMinutes: existing.totalMinutes || candidate.totalMinutes,
        days: (existing.days && existing.days.length ? existing.days : candidate.days) || [],
        attendances:
          (existing.attendances && existing.attendances.length ? existing.attendances : candidate.attendances) || [],
      });
    };

    (attendance?.users || []).forEach((item) => pushUser(item));

    visibleUsers.forEach((item) => {
      pushUser({ userId: Number(item.id), userName: item.nombre });
    });

    if (normalizedUserId && user?.nombre) {
      pushUser({ userId: normalizedUserId, userName: user.nombre });
    }

    let list = Array.from(map.values()).sort((left, right) => {
      const leftName = String(left.userName || `Usuario ${left.userId}`);
      const rightName = String(right.userName || `Usuario ${right.userId}`);
      return leftName.localeCompare(rightName, 'es', { sensitivity: 'base' });
    });

    if (isSuperAdmin) {
      return list.filter((item) => item.userId !== normalizedUserId);
    }

    if (!isConsoleAdmin) {
      return normalizedUserId ? list.filter((item) => item.userId === normalizedUserId) : list;
    }

    return list;
  }, [attendance?.users, isConsoleAdmin, isSuperAdmin, normalizedUserId, user?.nombre, visibleUsers]);

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
    if (!availableUsers.length) {
      if (selectedUserId !== null) {
        setSelectedUserId(null);
      }
      return;
    }
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

  const fetchAll = useCallback(async (signal?: AbortSignal, options?: { silent?: boolean }) => {
    if (!user?.token) return;
    const silent = Boolean(options?.silent);
    if (silent) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    setError(null);

    try {
      const abortController = signal ? null : new AbortController();
      const activeSignal = signal || abortController?.signal;

      const headers = { Authorization: `Bearer ${user.token}` };
      const params = new URLSearchParams({ from: weekRange.from, to: weekRange.to });
      const canManageAttendance = hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE);
      const canViewAttendance = hasPermission(user, PERMISSIONS.ATTENDANCE_VIEW);

      const [viaticsResult, activitiesResult] = await Promise.allSettled([
        fetchFromApiCandidates('viatics', { headers, signal: activeSignal }),
        fetchFromApiCandidates('activities', { headers, signal: activeSignal }),
      ]);

      let visibleUsersRes: Response | null = null;
      if (isConsoleAdmin || isSuperAdmin) {
        try {
          const assignableResponse = await fetchFromApiCandidates('users/assignable', { headers, signal: activeSignal });
          if (assignableResponse.ok) {
            visibleUsersRes = assignableResponse;
          } else {
            const fallbackResponse = await fetchFromApiCandidates('users', { headers, signal: activeSignal });
            visibleUsersRes = fallbackResponse.ok ? fallbackResponse : null;
          }
        } catch {
          try {
            const fallbackResponse = await fetchFromApiCandidates('users', { headers, signal: activeSignal });
            visibleUsersRes = fallbackResponse.ok ? fallbackResponse : null;
          } catch {
            visibleUsersRes = null;
          }
        }
      }

      const viaticsRes = viaticsResult.status === 'fulfilled' ? viaticsResult.value : null;
      const activitiesRes = activitiesResult.status === 'fulfilled' ? activitiesResult.value : null;

      let attendanceRes: Response | null = null;
      if (canManageAttendance) {
        try {
          const hierarchyRes = await fetchFromApiCandidates(`attendance/hierarchy/range?${params.toString()}`, {
            headers,
            signal: activeSignal,
          });
          if (hierarchyRes.ok) {
            attendanceRes = hierarchyRes;
          } else if ([404, 403].includes(hierarchyRes.status) && canViewAttendance) {
            const fallbackRes = await fetchFromApiCandidates(`attendance/range?${params.toString()}`, {
              headers,
              signal: activeSignal,
            });
            attendanceRes = fallbackRes.ok ? fallbackRes : null;
          }
        } catch {
          attendanceRes = null;
        }
      } else if (canViewAttendance) {
        try {
          const ownAttendanceRes = await fetchFromApiCandidates(`attendance/range?${params.toString()}`, {
            headers,
            signal: activeSignal,
          });
          attendanceRes = ownAttendanceRes.ok ? ownAttendanceRes : null;
        } catch {
          attendanceRes = null;
        }
      }

      const viaticsData = viaticsRes?.ok ? ((await viaticsRes.json()) as CollectionResponse<Viatic>) : [];
      const activitiesData = activitiesRes?.ok ? ((await activitiesRes.json()) as CollectionResponse<Activity>) : [];
      const visibleUsersData = visibleUsersRes?.ok ? ((await visibleUsersRes.json()) as CollectionResponse<VisibleUser>) : [];
      let attendancePayload: AttendanceRange | { totalMinutes?: number; days?: any[]; attendances?: any[] } | null = null;
      if (attendanceRes?.ok) {
        attendancePayload = await attendanceRes.json();
      }

      const normalizedVisibleUsers = normalizeCollectionResponse(visibleUsersData);
      const allCoreRequestsFailed = !viaticsRes && !activitiesRes && !attendanceRes && !visibleUsersRes;
      if (allCoreRequestsFailed) {
        if (silent) {
          return;
        }
        setVisibleUsers([]);
        setViatics([]);
        setActivities([]);
        setAttendance(null);
        return;
      }

      setVisibleUsers(normalizedVisibleUsers);
      setViatics(normalizeCollectionResponse(viaticsData));
      setActivities(normalizeCollectionResponse(activitiesData));

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
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Tiempo de espera agotado al cargar dashboard. Verifica tu conexion e intenta de nuevo.');
      } else {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      }
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
      }
    }
  }, [isConsoleAdmin, isSuperAdmin, user, weekRange.from, weekRange.to]);

  useEffect(() => {
    if (!user?.token) return;
    const controller = new AbortController();
    fetchAll(controller.signal, { silent: false });
    return () => controller.abort();
  }, [user?.token, fetchAll]);

  useEffect(() => {
    if (!user?.token) return;

    const socket: Socket = io(resolveSocketBaseUrl(), {
      transports: ['polling', 'websocket'],
      auth: { token: user.token },
    });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchAll(undefined, { silent: true });
      }, 250);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['Viatico', 'Actividad', 'Activity', 'Attendance'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, fetchAll]);

  const shouldShowLoading = !isMounted || initialLoading;
  const shouldShowError = !shouldShowLoading && Boolean(error);
  const shouldShowEmptySession = !shouldShowLoading && !shouldShowError && !user;

  if (!user && !shouldShowLoading && !shouldShowError) {
    return (
      <div className="dashboardRoot">
        <div className="errorCard">No se encontró una sesión activa.</div>
        <style jsx>{`
          .dashboardRoot {
            display: grid;
            gap: 18px;
            padding-bottom: 12px;
          }

          .errorCard {
            padding: 28px;
            border-radius: 18px;
            border: 1px solid var(--state-danger-border);
            background: linear-gradient(160deg, color-mix(in srgb, var(--state-danger-bg) 72%, var(--surface)), color-mix(in srgb, var(--surface-2) 94%, transparent));
            color: var(--state-danger-text);
            text-align: center;
            font-size: 16px;
            box-shadow: var(--elev-1);
          }
        `}</style>
      </div>
    );
  }

  const currentUser = user;

  const activeUserId = selectedUserId ?? (isSuperAdmin ? null : Number(currentUser?.id ?? 0));
  const isWithinWeek = (value?: string | null) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date >= weekRange.start && date <= weekRange.end;
  };

  const userName =
    availableUsers.find((item) => item.userId === activeUserId)?.userName ||
    (isSuperAdmin ? 'Sin usuario seleccionado' : currentUser?.nombre || 'Sin usuario seleccionado');

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
      {shouldShowLoading ? (
        <div className="loadingCard">Cargando dashboard...</div>
      ) : shouldShowError ? (
        <div className="errorCard">{error}</div>
      ) : shouldShowEmptySession ? (
        <div className="errorCard">No se encontró una sesión activa.</div>
      ) : (
        <>
      <div className="heroCard">
        <div className="heroTop">
          <div className="heroLeft">
            <p className="heroKicker">Contexto operativo</p>
            <span className="heroWeekRange">{formatDate(weekRange.from)} - {formatDate(weekRange.to)}</span>
            <span className="heroCurrentUser">{userName}</span>
          </div>
          <div className="heroMeta">
            {currentUser?.role && <span className="heroRole">{currentUser.role}</span>}
            {currentUser?.isSuperAdmin && <span className="heroLevel">Superadmin</span>}
            {refreshing && <span className="heroRefreshing">↻</span>}
          </div>
        </div>
        {(isConsoleAdmin || isSuperAdmin) && availableUsers.length > 0 && (
          <select
            className="userSelect"
            value={activeUserId ?? ""}
            onChange={(event) => setSelectedUserId(Number(event.target.value))}
            aria-label="Seleccionar usuario"
          >
            {availableUsers.map((item) => (
              <option key={item.userId} value={item.userId}>
                {item.userName || `Usuario ${item.userId}`}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="kpiGrid">
        <div className="kpiCard kpiDelay1">
          <span className="kpiIcon">🕒</span>
          <span className="kpiValue">{formatHours(attendanceMinutes)}<span className="kpiUnit">h</span></span>
          <span className="kpiLabel">Horas<br/>semana</span>
        </div>
        <div className="kpiCard kpiDelay2">
          <span className="kpiIcon">🟢</span>
          <span className="kpiValue">{activeUsersCount}</span>
          <span className="kpiLabel">Usuarios<br/>activos</span>
        </div>
        <div className="kpiCard kpiDelay3">
          <span className="kpiIcon">📋</span>
          <span className="kpiValue">{activityTotals.total}</span>
          <span className="kpiLabel">Actividades<br/>semana</span>
        </div>
        <div className="kpiCard kpiDelay4">
          <span className="kpiIcon">💰</span>
          <span className="kpiValue kpiValueMoney">{formatCurrency(viaticTotals.amount)}</span>
          <span className="kpiLabel">Viáticos<br/>{viaticTotals.pending} pend.</span>
        </div>
        <div className="kpiCard kpiDelay5">
          <span className="kpiIcon">📈</span>
          <span className="kpiValue">{formatHours(avgDailyMinutes)}<span className="kpiUnit">h</span></span>
          <span className="kpiLabel">Ritmo<br/>diario</span>
        </div>
        <div className="kpiCard kpiDelay6">
          <span className="kpiIcon">✅</span>
          <span className="kpiValue">{activityTotals.total > 0 ? Math.round(((activityTotals.total - (activityTotals.pending ?? activityTotals.total)) / activityTotals.total) * 100) : 0}<span className="kpiUnit">%</span></span>
          <span className="kpiLabel">Actividades<br/>completadas</span>
        </div>
      </div>

      <div className="analyticsGrid">
        <div className="analysisCard">
          <div className="analysisHeader">
            <span className="analysisIcon">📅</span>
            <div className="analysisTitleWrap">
              <span className="analysisEyebrow">Asistencia</span>
              <h3 className="analysisTitle">Horas / día</h3>
            </div>
            <span className="analysisPill">Semana</span>
          </div>
          <div className="chartWrap">
            {hasAttendanceData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hoursFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" />
                      <stop offset="100%" stopColor="var(--secondary)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--stroke-clean)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-tertiary)" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} stroke="var(--text-tertiary)" tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="horas" name="Horas" fill="url(#hoursFill)" radius={[6, 6, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chartEmpty">Sin datos en la semana actual.</div>
            )}
          </div>
        </div>

        <div className="analysisCard">
          <div className="analysisHeader">
            <span className="analysisIcon">📋</span>
            <div className="analysisTitleWrap">
              <span className="analysisEyebrow">Actividades</span>
              <h3 className="analysisTitle">Por estatus</h3>
            </div>
            <span className="analysisPill">{activityTotals.total}</span>
          </div>
          <div className="chartWrap">
            {hasActivityData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityStatusData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" />
                      <stop offset="100%" stopColor="var(--secondary)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--stroke-clean)" vertical={false} />
                  <XAxis dataKey="estatus" stroke="var(--text-tertiary)" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} stroke="var(--text-tertiary)" tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="cantidad" name="Actividades" fill="url(#activityFill)" radius={[6, 6, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chartEmpty">Sin datos</div>
            )}
          </div>
        </div>

        <div className="analysisCard">
          <div className="analysisHeader">
            <span className="analysisIcon">💸</span>
            <div className="analysisTitleWrap">
              <span className="analysisEyebrow">Viáticos</span>
              <h3 className="analysisTitle">Por estatus</h3>
            </div>
            <span className="analysisPill">{viaticTotals.total}</span>
          </div>
          <div className="chartWrap">
            {hasViaticData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={viaticStatusData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="viaticFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--secondary)" />
                      <stop offset="100%" stopColor="var(--accent)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--stroke-clean)" vertical={false} />
                  <XAxis dataKey="estatus" stroke="var(--text-tertiary)" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} stroke="var(--text-tertiary)" tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="cantidad" name="Viáticos" fill="url(#viaticFill)" radius={[6, 6, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chartEmpty">Sin datos</div>
            )}
          </div>
        </div>
        {weeklyUserHours.length > 0 && (
          <div className="analysisCard">
            <div className="analysisHeader">
              <span className="analysisIcon">👥</span>
              <div className="analysisTitleWrap">
                <span className="analysisEyebrow">Usuarios</span>
                <h3 className="analysisTitle">Horas semana</h3>
              </div>
              <span className="analysisPill">Semana</span>
            </div>
            <div className="userHoursList">
              {weeklyUserHours.map((item) => (
                <div key={item.userId} className="userHoursRow">
                  <span className="userHoursValue">{formatHours(item.minutes)}<span className="kpiUnit">h</span></span>
                  <span className="userHoursName">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
        </>
      )}

      <style jsx>{`
        /* ── Root ── */
        .dashboardRoot {
          display: grid;
          gap: 10px;
          padding: 6px 2px 4px;
        }

        /* ── States ── */
        .loadingCard,
        .errorCard {
          padding: 32px 20px;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 97%, transparent);
          color: var(--foreground);
          text-align: center;
          font-size: 15px;
        }
        .errorCard {
          color: var(--state-danger-text);
          border-color: var(--state-danger-border);
          background: color-mix(in srgb, var(--state-danger-bg) 60%, var(--surface));
        }

        /* ── Hero ── */
        .heroCard {
          position: relative;
          display: grid;
          gap: 8px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 98%, transparent);
          overflow: hidden;
        }
        .heroCard::after {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: color-mix(in srgb, var(--primary) 45%, var(--border));
          opacity: 0.7;
        }
        .heroTop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .heroLeft {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .heroKicker {
          margin: 0;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 700;
          color: var(--text-tertiary);
        }
        .heroCurrentUser {
          font-size: 14px;
          font-weight: 600;
          color: var(--foreground);
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .heroMeta {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          align-items: center;
        }
        .heroRole,
        .heroLevel {
          display: inline-flex;
          align-items: center;
          height: 22px;
          padding: 0 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border));
          background: color-mix(in srgb, var(--primary) 10%, var(--surface));
          color: var(--foreground);
        }
        .heroLevel {
          background: var(--state-info-bg);
          border-color: var(--state-info-border);
          color: var(--state-info-text);
        }
        .heroRefreshing {
          font-size: 13px;
          color: var(--primary);
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .heroWeekRange {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          white-space: nowrap;
        }
        .userSelect {
          width: 100%;
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 96%, transparent);
          color: var(--foreground);
          font-size: 13px;
          font-family: var(--font-base);
        }
        .userSelect:focus {
          outline: none;
          border-color: color-mix(in srgb, var(--primary) 58%, var(--border));
        }

        /* ── KPI row (mobile) ── */
        .kpiGrid {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
          scroll-snap-type: x proximity;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .kpiGrid::-webkit-scrollbar { display: none; }
        .kpiCard {
          position: relative;
          flex: 0 0 clamp(132px, 42vw, 152px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 14px 10px 12px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: linear-gradient(160deg,
            color-mix(in srgb, var(--surface) 98%, transparent),
            color-mix(in srgb, var(--surface-2) 92%, transparent));
          text-align: center;
          overflow: hidden;
          scroll-snap-align: start;
        }
        .kpiCard::after {
          content: "";
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--primary), var(--secondary));
          opacity: 0.6;
        }
        .kpiIcon {
          font-size: 24px;
          line-height: 1;
          margin-bottom: 2px;
        }
        .kpiValue {
          font-size: 31px;
          font-weight: 800;
          color: var(--foreground);
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .kpiValueMoney {
          font-size: 18px;
          letter-spacing: -0.01em;
        }
        .kpiUnit {
          font-size: 15px;
          font-weight: 600;
          opacity: 0.65;
          margin-left: 1px;
        }
        .kpiLabel {
          font-size: 13px;
          color: var(--text-tertiary);
          line-height: 1.25;
          margin-top: 2px;
        }

        /* ── Analytics — always 2 columns ── */
        .analyticsGrid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .analysisCard {
          position: relative;
          display: grid;
          gap: 8px;
          padding: 10px;
          border: 1px solid var(--border);
          border-radius: 14px;
          overflow: hidden;
          background: linear-gradient(162deg,
            color-mix(in srgb, var(--surface) 98%, transparent),
            color-mix(in srgb, var(--surface-2) 92%, transparent));
        }
        .analysisCard::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--primary), var(--secondary));
          opacity: 0.7;
        }
        .analysisHeader {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .analysisIcon {
          font-size: 18px;
          line-height: 1;
          flex-shrink: 0;
        }
        .analysisTitleWrap {
          flex: 1;
          min-width: 0;
        }
        .analysisEyebrow {
          display: block;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 700;
          color: var(--text-tertiary);
        }
        .analysisTitle {
          margin: 0;
          font-size: 13px;
          font-weight: 700;
          color: var(--foreground);
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .analysisPill {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          height: 22px;
          padding: 0 8px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface-2) 88%, transparent);
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 700;
        }
        .chartWrap {
          width: 100%;
          height: 170px;
          border-radius: 8px;
          overflow: hidden;
        }
        .chartEmpty {
          height: 100%;
          display: grid;
          place-items: center;
          text-align: center;
          border: 1px dashed color-mix(in srgb, var(--border) 88%, transparent);
          border-radius: 8px;
          color: var(--text-tertiary);
          font-size: 11px;
          background: color-mix(in srgb, var(--surface-2) 72%, transparent);
        }

        /* ── Chart tooltip ── */
        .chartTooltip {
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 98%, transparent);
          color: var(--foreground);
          font-size: 11px;
          display: grid;
          gap: 4px;
        }
        .chartTooltipTitle {
          font-weight: 700;
          color: var(--foreground);
        }
        .chartTooltipRow {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          color: var(--text-secondary);
        }
        .chartTooltipValue {
          font-weight: 700;
          color: var(--foreground);
        }

        /* ── User hours — horizontal scroll cards ── */
        .userHoursList {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 2px;
          scrollbar-width: none;
        }
        .userHoursList::-webkit-scrollbar { display: none; }
        .userHoursRow {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 96%, transparent);
          min-width: 92px;
        }
        .userHoursValue {
          font-size: 18px;
          font-weight: 800;
          color: var(--foreground);
          line-height: 1;
        }
        .userHoursName {
          font-size: 11px;
          color: var(--text-secondary);
          text-align: center;
          line-height: 1.2;
          max-width: 84px;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        /* ── Desktop — wider grids ── */
        @media (min-width: 900px) {
          .dashboardRoot { gap: 16px; }
          .kpiGrid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 12px;
            overflow: visible;
            padding-bottom: 0;
          }
          .kpiCard {
            flex: initial;
          }
          .analyticsGrid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .chartWrap { height: 200px; }
          .kpiCard { padding: 16px 12px; }
          .analysisCard { padding: 16px; gap: 12px; }
        }
      `}</style>
    </div>
  );
}
