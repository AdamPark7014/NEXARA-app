/**
 * Charts del Dashboard — asistencia, actividades, viáticos y top-N usuarios.
 *
 * Cada gráfica vive en su propia tarjeta `.analysisCard` para mantener la
 * jerarquía visual y permitir reordenar/ocultar grids en mobile via CSS.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardChartPoint, DashboardStatusEntry, WeeklyUserHours } from './types';
import { formatHours } from './utils';

type Props = {
  attendanceChart: DashboardChartPoint[];
  activityStatusData: DashboardStatusEntry[];
  activityTotal: number;
  viaticStatusData: DashboardStatusEntry[];
  viaticTotal: number;
  weeklyUserHours: WeeklyUserHours[];
};

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
  label?: string;
}) => {
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

export default function DashboardCharts({
  attendanceChart,
  activityStatusData,
  activityTotal,
  viaticStatusData,
  viaticTotal,
  weeklyUserHours,
}: Props) {
  const hasAttendanceData = attendanceChart.some((item) => item.horas > 0);
  const hasActivityData = activityStatusData.length > 0;
  const hasViaticData = viaticStatusData.length > 0;

  return (
    <div className="analyticsGrid">
      <div className="analysisCard">
        <div className="analysisHeader">
          <div>
            <div className="analysisEyebrow">Asistencia</div>
            <h3 className="analysisTitle">Horas por día</h3>
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
                <CartesianGrid stroke="var(--stroke-clean)" vertical={false} />
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
            <h3 className="analysisTitle">Distribución por estatus</h3>
          </div>
          <span className="analysisPill">{activityTotal} total</span>
        </div>
        <div className="chartWrap">
          {hasActivityData ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={activityStatusData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" />
                    <stop offset="100%" stopColor="var(--secondary)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--stroke-clean)" vertical={false} />
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
            <div className="analysisEyebrow">Viáticos</div>
            <h3 className="analysisTitle">Pagos por estatus</h3>
          </div>
          <span className="analysisPill">{viaticTotal} registros</span>
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
                <CartesianGrid stroke="var(--stroke-clean)" vertical={false} />
                <XAxis dataKey="estatus" stroke="var(--text-tertiary)" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} stroke="var(--text-tertiary)" tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="cantidad" name="Viáticos" fill="url(#viaticFill)" radius={[8, 8, 0, 0]} barSize={26} />
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
  );
}
