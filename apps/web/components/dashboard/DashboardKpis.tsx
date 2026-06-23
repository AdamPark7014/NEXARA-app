/**
 * KPIs principales del Dashboard.
 *
 * Antes el monolito declaraba 5 `<div className="kpiCard">` casi idénticos.
 * Ahora se delega en `<StatCard>` (componente reutilizable global) para
 * mantener consistencia visual con el resto del ERP (Approvals, Executive,
 * Ventas, etc.) y reducir CSS específico.
 */

import { StatCard } from '@/components/PageState';
import { formatCurrency, formatHours } from './utils';

type Props = {
  attendanceMinutes: number;
  activeUsersCount: number;
  activitiesTotal: number;
  viaticTotals: {
    amount: number;
    total: number;
    pending: number;
    approved: number;
  };
  avgDailyMinutes: number;
};

export default function DashboardKpis({
  attendanceMinutes,
  activeUsersCount,
  activitiesTotal,
  viaticTotals,
  avgDailyMinutes,
}: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14,
      }}
    >
      <StatCard
        label="Horas trabajadas · semana"
        value={`${formatHours(attendanceMinutes)} h`}
        icon="⏱️"
        color="#0ea5e9"
      />
      <StatCard
        label="Usuarios activos · hoy"
        value={activeUsersCount}
        icon="👥"
        color="#22c55e"
      />
      <StatCard
        label="Actividades · semana"
        value={activitiesTotal}
        icon="📋"
        color="#a855f7"
      />
      <StatCard
        label="Viáticos · semana"
        value={formatCurrency(viaticTotals.amount)}
        delta={`${viaticTotals.pending} pendientes · ${viaticTotals.approved} aprobados`}
        deltaPositive={viaticTotals.approved >= viaticTotals.pending}
        icon="🧾"
        color="#f59e0b"
      />
      <StatCard
        label="Ritmo diario · promedio"
        value={`${formatHours(avgDailyMinutes)} h`}
        icon="📈"
        color="#dc2626"
      />
    </div>
  );
}
