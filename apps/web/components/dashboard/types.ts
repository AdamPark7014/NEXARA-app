/**
 * Tipos compartidos del Dashboard. Se extrajeron del antiguo `Dashboard.tsx`
 * monolítico para que el componente principal sea un mero orquestador y los
 * subcomponentes (`DashboardHero`, `DashboardKpis`, `DashboardCharts`, …)
 * compartan una sola fuente de verdad.
 */

export type Viatic = {
  id: number;
  usuarioId?: number | null;
  montoSolicitado?: number | null;
  estatusPago?: string | null;
  razonGasto?: string | null;
  createdAt?: string | null;
  usuario?: { id?: number; nombre: string } | null;
};

export type Activity = {
  id: number;
  estatus: string;
  titulo?: string | null;
  fechaAsignacion?: string | null;
  fechaInicio?: string | null;
  fechaFinalizacion?: string | null;
  responsableId?: number | null;
  responsable?: { id?: number; nombre: string } | null;
};

export type AttendanceRangeUser = {
  userId: number;
  userName?: string;
  totalMinutes?: number;
  days?: { date: string; totalMinutes: number; isOpen?: boolean }[];
  attendances?: { type: string; timestamp: string }[];
};

export type AttendanceRange = {
  rangeStart?: string;
  rangeEnd?: string;
  totalMinutesAll?: number;
  totalUsers?: number;
  users?: AttendanceRangeUser[];
};

export type WeekRange = {
  start: Date;
  end: Date;
  from: string;
  to: string;
};

export type DashboardStatusEntry = {
  estatus: string;
  cantidad: number;
};

export type DashboardChartPoint = {
  date: string;
  horas: number;
};

export type WeeklyUserHours = {
  userId: number;
  name: string;
  minutes: number;
};
