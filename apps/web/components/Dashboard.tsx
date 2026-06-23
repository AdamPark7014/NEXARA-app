/**
 * Dashboard del Panel Console — orquestador.
 *
 * Esta versión refactorizada (Fase 11.5) reemplazó al monolito de 964 líneas
 * por una composición clara:
 *
 *   useDashboardData → estado + fetch + websocket
 *   DashboardHero    → encabezado + selector usuario
 *   DashboardKpis    → 5 StatCard reutilizables (consistencia visual ERP)
 *   DashboardCharts  → grids de gráficas (asistencia, actividades, viáticos)
 *
 * El componente principal sólo:
 *   1. Llama al hook de datos.
 *   2. Resuelve el usuario activo y los slices visibles.
 *   3. Compone los subcomponentes en el layout y aplica los estilos comunes.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import DashboardHero from './dashboard/DashboardHero';
import DashboardKpis from './dashboard/DashboardKpis';
import DashboardCharts from './dashboard/DashboardCharts';
import { useDashboardData } from './dashboard/useDashboardData';
import {
  formatDate,
  getUserMinutesAndDaily,
  toLocalDateInput,
} from './dashboard/utils';
import type { AttendanceRangeUser } from './dashboard/types';

export default function Dashboard() {
  const { user } = useUser();
  const isConsoleAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const normalizedUserId = user?.id ? Number(user.id) : null;

  const { isMounted, loading, error, viatics, activities, attendance, weekRange } =
    useDashboardData({ user });

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const availableUsers = useMemo<AttendanceRangeUser[]>(() => {
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
      const target =
        availableUsers.find((item) => item.userId !== normalizedUserId) || availableUsers[0];
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
      const target =
        availableUsers.find((item) => item.userId !== normalizedUserId) || availableUsers[0];
      setSelectedUserId(target?.userId ?? null);
      return;
    }
    if (normalizedUserId && availableUsers.some((item) => item.userId === normalizedUserId)) {
      setSelectedUserId(normalizedUserId);
    } else {
      setSelectedUserId(availableUsers[0].userId);
    }
  }, [availableUsers, isSuperAdmin, normalizedUserId, selectedUserId]);

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

  // ── Slices por usuario activo (KPIs) ──────────────────────────────────────
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
  const attendanceSummary = scopedAttendanceUsers.map((item) =>
    getUserMinutesAndDaily(item, weekRange.start, weekRange.end),
  );
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
      horas: Math.round((minutes / 60) * 10) / 10,
    }));

  const viaticTotals = {
    amount: filteredViatics.reduce((sum, item) => sum + (item.montoSolicitado || 0), 0),
    total: filteredViatics.length,
    pending: filteredViatics.filter((item) => item.estatusPago === 'Pendiente').length,
    approved: filteredViatics.filter((item) => item.estatusPago === 'Aprobado').length,
  };
  const activityTotals = {
    total: filteredActivities.length,
    statusCounts: filteredActivities.reduce(
      (acc, item) => {
        const key = item.estatus || 'Sin estatus';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };

  // ── Slices globales (charts) ──────────────────────────────────────────────
  const allViatics = viatics.filter((item) => isWithinWeek(item.createdAt));
  const allActivities = activities.filter((item) => {
    const dateRef = item.fechaAsignacion || item.fechaInicio || item.fechaFinalizacion || null;
    return isWithinWeek(dateRef);
  });
  const viaticStatusData = Object.entries(
    allViatics.reduce(
      (acc, item) => {
        const key = item.estatusPago || 'Sin estatus';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).map(([estatus, cantidad]) => ({ estatus, cantidad }));
  const activityStatusData = Object.entries(
    allActivities.reduce(
      (acc, item) => {
        const key = item.estatus || 'Sin estatus';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).map(([estatus, cantidad]) => ({ estatus, cantidad }));

  const daysInWeek = 7;
  const avgDailyMinutes = attendanceMinutes ? Math.round(attendanceMinutes / daysInWeek) : 0;

  const weeklyUserHours = availableUsers
    .map((item) => ({
      userId: item.userId,
      name: item.userName || `Usuario ${item.userId}`,
      minutes: getUserMinutesAndDaily(item, weekRange.start, weekRange.end).totalMinutes,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return (
    <div className="dashboardRoot">
      <DashboardHero
        user={{ nombre: user.nombre, role: user.role, isSuperAdmin: user.isSuperAdmin }}
        userName={userName}
        weekRange={weekRange}
        isConsoleAdmin={isConsoleAdmin}
        availableUsers={availableUsers}
        activeUserId={activeUserId}
        onChangeUser={(id) => setSelectedUserId(id)}
      />

      <DashboardKpis
        attendanceMinutes={attendanceMinutes}
        activeUsersCount={activeUsersCount}
        activitiesTotal={activityTotals.total}
        viaticTotals={viaticTotals}
        avgDailyMinutes={avgDailyMinutes}
      />

      <DashboardCharts
        attendanceChart={attendanceChart}
        activityStatusData={activityStatusData}
        activityTotal={activityTotals.total}
        viaticStatusData={viaticStatusData}
        viaticTotal={viaticTotals.total}
        weeklyUserHours={weeklyUserHours}
      />

      <style jsx>{`
        .dashboardRoot {
          display: grid;
          gap: 18px;
          padding-bottom: 12px;
        }

        :global(.loadingCard),
        :global(.errorCard) {
          padding: 28px;
          border-radius: 18px;
          border: 1px solid var(--border);
          background: linear-gradient(
            160deg,
            color-mix(in srgb, var(--surface) 98%, transparent),
            color-mix(in srgb, var(--surface-2) 92%, transparent)
          );
          color: var(--foreground);
          text-align: center;
          font-size: 16px;
          box-shadow: var(--elev-1);
        }
        :global(.errorCard) {
          color: var(--state-danger-text);
          border-color: var(--state-danger-border);
          background: linear-gradient(
            160deg,
            color-mix(in srgb, var(--state-danger-bg) 72%, var(--surface)),
            color-mix(in srgb, var(--surface-2) 94%, transparent)
          );
        }

        :global(.heroCard) {
          position: relative;
          display: grid;
          gap: 16px;
          padding: clamp(18px, 2.5vw, 28px);
          border: 1px solid var(--border);
          border-radius: 24px;
          overflow: hidden;
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--primary) 18%, transparent), transparent 32%),
            radial-gradient(circle at left bottom, color-mix(in srgb, var(--secondary) 14%, transparent), transparent 28%),
            linear-gradient(155deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 92%, transparent));
          box-shadow: var(--elev-2);
        }
        :global(.heroCard)::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 8%, transparent), transparent 40%, color-mix(in srgb, var(--secondary) 7%, transparent));
          pointer-events: none;
        }
        :global(.heroHeader),
        :global(.analysisHeader),
        :global(.userHoursRow) {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        :global(.heroHeader),
        :global(.analysisHeader) {
          flex-wrap: wrap;
          align-items: flex-start;
        }
        :global(.heroKicker),
        :global(.analysisEyebrow),
        :global(.filterLabel) {
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-size: 11px;
          color: var(--text-tertiary);
        }
        :global(.heroTitle),
        :global(.analysisTitle) {
          margin: 0;
          color: var(--foreground);
          line-height: 1.08;
        }
        :global(.heroTitle) {
          font-size: clamp(26px, 3vw, 38px);
          font-family: var(--font-heading);
          letter-spacing: var(--panel-title-tracking);
        }
        :global(.analysisTitle) {
          margin-top: 6px;
          font-size: clamp(18px, 1.7vw, 22px);
          font-family: var(--font-heading);
        }
        :global(.heroSubtitle),
        :global(.heroMeta),
        :global(.userHoursName) {
          color: var(--text-secondary);
          font-size: 13px;
        }
        :global(.heroMeta) {
          display: grid;
          gap: 8px;
          justify-items: end;
        }
        :global(.heroRole),
        :global(.heroLevel),
        :global(.chip),
        :global(.chipLive),
        :global(.analysisPill) {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 88%, transparent);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 650;
          letter-spacing: 0.01em;
        }
        :global(.heroRole) {
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, var(--surface)), color-mix(in srgb, var(--secondary) 8%, var(--surface-2)));
          border-color: color-mix(in srgb, var(--primary) 26%, var(--border));
          color: var(--foreground);
        }
        :global(.heroLevel),
        :global(.chipLive) {
          background: var(--state-info-bg);
          border-color: var(--state-info-border);
          color: var(--state-info-text);
        }
        :global(.analysisPill),
        :global(.chip) {
          background: color-mix(in srgb, var(--surface-2) 88%, transparent);
        }
        :global(.heroBadges),
        :global(.filtersRow) {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        :global(.filtersRow) {
          padding-top: 4px;
        }
        :global(.filterControl) {
          display: grid;
          gap: 6px;
        }
        :global(.input) {
          min-width: 220px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 96%, transparent);
          color: var(--foreground);
          font-size: 14px;
        }
        :global(.input):focus {
          outline: none;
          border-color: color-mix(in srgb, var(--primary) 58%, var(--border));
          box-shadow: var(--ring-soft);
        }
        :global(.analyticsGrid) {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
          gap: 14px;
        }
        :global(.analysisCard) {
          position: relative;
          display: grid;
          gap: 14px;
          padding: 18px;
          border: 1px solid var(--border);
          border-radius: 22px;
          overflow: hidden;
          background: linear-gradient(162deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 92%, transparent));
          box-shadow: var(--elev-1);
        }
        :global(.analysisCard)::before {
          content: '';
          position: absolute;
          left: 18px;
          right: 18px;
          top: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--primary), var(--secondary));
          opacity: 0.9;
        }
        :global(.chartWrap) {
          width: 100%;
          height: 240px;
          padding: 10px;
          border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
          border-radius: 16px;
          overflow: hidden;
          background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 97%, transparent), color-mix(in srgb, var(--surface-clean-soft) 92%, transparent));
        }
        :global(.chartEmpty) {
          height: 100%;
          display: grid;
          place-items: center;
          text-align: center;
          border: 1px dashed color-mix(in srgb, var(--border) 90%, transparent);
          border-radius: 12px;
          color: var(--text-tertiary);
          font-size: 13px;
          padding: 12px;
          background: color-mix(in srgb, var(--surface-2) 72%, transparent);
        }
        :global(.chartTooltip) {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 98%, transparent);
          color: var(--foreground);
          font-size: 12px;
          display: grid;
          gap: 6px;
          box-shadow: var(--elev-1);
        }
        :global(.chartTooltipTitle) {
          font-weight: 700;
          color: var(--foreground);
        }
        :global(.chartTooltipRow) {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          color: var(--text-secondary);
        }
        :global(.userHoursList) {
          display: grid;
          gap: 10px;
        }
        :global(.userHoursRow) {
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: linear-gradient(145deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--surface-2) 88%, transparent));
        }
        :global(.userHoursValue),
        :global(.chartTooltipValue) {
          font-weight: 700;
          color: var(--foreground);
        }
        @media (max-width: 900px) {
          :global(.heroMeta) {
            justify-items: start;
          }
        }
        @media (max-width: 640px) {
          .dashboardRoot {
            gap: 14px;
          }
          :global(.analyticsGrid) {
            grid-template-columns: 1fr;
          }
          :global(.heroCard),
          :global(.analysisCard) {
            padding: 16px;
            border-radius: 18px;
          }
          :global(.heroTitle) {
            font-size: 24px;
          }
          :global(.input) {
            min-width: 0;
            width: 100%;
          }
          :global(.chartWrap) {
            height: 220px;
          }
        }
      `}</style>
    </div>
  );
}
