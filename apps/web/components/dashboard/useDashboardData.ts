/**
 * Hook que encapsula TODA la lógica de datos del Dashboard:
 *  - Fetch concurrente de viáticos, actividades y asistencia.
 *  - Selección de endpoint de asistencia según permisos del usuario.
 *  - Suscripción a websocket para refrescar en vivo cuando otra parte del
 *    sistema modifica viáticos, actividades o asistencia.
 *  - Manejo de errores, loading y aborts.
 *
 * El componente que lo usa sólo recibe estado listo para pintar. Esto separa
 * data layer ↔ UI y permite testear cada parte por separado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { buildApiUrl, getSocketBaseUrl } from '@/lib/api-base';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import type { Activity, AttendanceRange, Viatic, WeekRange } from './types';
import { getWeekRange } from './utils';

type Options = {
  user: any;
};

export function useDashboardData({ user }: Options) {
  const [isMounted, setIsMounted] = useState(false);
  const [viatics, setViatics] = useState<Viatic[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekRange: WeekRange = useMemo(() => getWeekRange(new Date()), []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchAll = useCallback(
    async (signal?: AbortSignal) => {
      if (!user?.token) return;
      setLoading(true);
      setError(null);

      try {
        const headers = { Authorization: `Bearer ${user.token}` };
        const params = new URLSearchParams({ from: weekRange.from, to: weekRange.to });
        const canManageAttendance = hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE);
        const canViewAttendance = hasPermission(user, PERMISSIONS.ATTENDANCE_VIEW);

        const [viaticsRes, activitiesRes, attendanceRes] = await Promise.all([
          fetch(buildApiUrl('viatics'), { headers, signal }),
          fetch(buildApiUrl('activities'), { headers, signal }),
          canManageAttendance
            ? fetch(buildApiUrl(`attendance/hierarchy/range?${params.toString()}`), { headers, signal })
            : canViewAttendance
              ? fetch(buildApiUrl(`attendance/range?${params.toString()}`), { headers, signal })
              : Promise.resolve(null),
        ]);

        const viaticsData = viaticsRes.ok ? ((await viaticsRes.json()) as Viatic[]) : [];
        const activitiesData = activitiesRes.ok ? ((await activitiesRes.json()) as Activity[]) : [];

        let attendancePayload:
          | AttendanceRange
          | { totalMinutes?: number; days?: any[]; attendances?: any[] }
          | null = null;
        if (attendanceRes) {
          if (attendanceRes.ok) {
            attendancePayload = await attendanceRes.json();
          } else {
            let attendanceMessage = `Error al consultar asistencia (${attendanceRes.status})`;
            try {
              const errorPayload = await attendanceRes.json();
              if (errorPayload?.message) attendanceMessage = errorPayload.message;
            } catch {
              // ignore non-JSON error bodies
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
          const payload = attendancePayload as {
            totalMinutes?: number;
            days?: any[];
            attendances?: any[];
          };
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
        if (signal?.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof Error && /aborted/i.test(err.message)) return;
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [user, weekRange.from, weekRange.to],
  );

  useEffect(() => {
    if (!user?.token) return;
    const controller = new AbortController();
    fetchAll(controller.signal);
    return () => controller.abort();
  }, [user?.token, fetchAll]);

  useEffect(() => {
    if (!user?.token) return;
    const socket: Socket = io(getSocketBaseUrl(), {
      transports: ['polling', 'websocket'],
      auth: { token: user.token },
    });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchAll();
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

  return {
    isMounted,
    loading,
    error,
    viatics,
    activities,
    attendance,
    weekRange,
    refresh: fetchAll,
  };
}
