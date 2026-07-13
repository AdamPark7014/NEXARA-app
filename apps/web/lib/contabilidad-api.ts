import { buildApiUrl } from "@/lib/api-base";
import { getSalesExecutiveInsights, getSalesMetrics, type SalesExecutiveInsights, type SalesMetrics } from "@/lib/sales-api";

export type ContabilidadPeriod = "week" | "month" | "year";

export type ViaticRecord = {
  id: number;
  usuarioId?: number | null;
  montoSolicitado?: number | null;
  estatusPago?: string | null;
  razonGasto?: string | null;
  createdAt?: string | null;
  usuario?: { id?: number; nombre?: string | null } | null;
};

export type VehiclePenaltyRecord = {
  id: number;
  solicitanteId?: number | null;
  penalizacionMonto?: number | null;
  estatusAprobacion?: string | null;
  fechaInicio?: string | null;
  fechaSolicitud?: string | null;
  createdAt?: string | null;
  solicitante?: { id?: number; nombre?: string | null } | null;
  vehiculo?: { nombre?: string | null; placas?: string | null } | null;
};

export type AttendanceRangeSummary = {
  totalMinutesAll?: number;
  totalUsers?: number;
  rangeEnd?: string;
  users?: {
    userId: number;
    userName?: string;
    email?: string;
    department?: string | null;
    roleName?: string;
    roleFlags?: {
      accesoConsole?: boolean;
      accesoConsoleAdmin?: boolean;
      accesoGestionUsuarios?: boolean;
      accesoGestionTienda?: boolean;
      accesoGestionWeb?: boolean;
      accesoContabilidad?: boolean;
    };
    isSuperAdmin?: boolean;
    permissions?: string[];
    totalMinutes?: number;
    attendances?: { type: string; timestamp: string }[];
  }[];
};

/** Proyectos de campo (OperationalProject). Antes: WorkProject legacy. */
export type OperationalProjectRecord = {
  id: number;
  title: string;
  status?: string | null;
  client?: { id?: number; name?: string | null } | null;
  salesProject?: { id?: number; name?: string | null; budget?: string | number | null } | null;
  createdAt?: string | null;
};

/** @deprecated Prefer OperationalProjectRecord */
export type WorkProjectRecord = OperationalProjectRecord & {
  clientName?: string | null;
  budgetTotal?: string | number | null;
  budgetUsed?: string | number | null;
};

export type ExpenseRecord = {
  id: number;
  monto?: number | string | null;
  amount?: number | string | null;
  createdAt?: string | null;
  concepto?: string | null;
  category?: string | null;
};

export type FineRecord = {
  id: number;
  monto?: number | string | null;
  amount?: number | string | null;
  motivo?: string | null;
  reason?: string | null;
  tipo?: string | null;
  type?: string | null;
  createdAt?: string | null;
};

export type ConsoleDashboardStats = {
  viaticos?: {
    total?: number;
    porEstatus?: Array<{ estatus?: string; cantidad?: number }>;
  };
  vehiculos?: {
    total?: number;
    porEstatus?: Array<{ estatus?: string; cantidad?: number }>;
  };
  actividades?: {
    total?: number;
  };
  evidencias?: {
    total?: number;
    aprobadas?: number;
  };
};

export type UnifiedContabilidadSnapshot = {
  generatedAt: string;
  period: ContabilidadPeriod;
  attendanceScope: "hierarchy" | "self" | "none";
  viatics: ViaticRecord[];
  vehicles: VehiclePenaltyRecord[];
  attendance: AttendanceRangeSummary | null;
  /** Alias estable: proyectos OPS (antes work-projects legacy). */
  workProjects: WorkProjectRecord[];
  operationalProjects: OperationalProjectRecord[];
  expenses: ExpenseRecord[];
  fines: FineRecord[];
  consoleStats: ConsoleDashboardStats | null;
  salesMetrics: SalesMetrics | null;
  salesInsights: SalesExecutiveInsights | null;
  warnings: string[];
};

const parseResponsePayload = (text: string): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const maybeMessage = (payload as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
    if (Array.isArray(maybeMessage) && maybeMessage.length > 0) {
      return String(maybeMessage[0]);
    }
  }
  return fallback;
};

const apiRequest = async <T>(path: string, token: string, fallbackError = "Error en solicitud"): Promise<T> => {
  const response = await fetch(buildApiUrl(path), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  const payload = parseResponsePayload(text);
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, fallbackError));
  }
  return payload as T;
};

const safeArrayFetch = async <T>(
  path: string,
  token: string,
  warnings: string[],
  warningLabel: string,
): Promise<T[]> => {
  try {
    const payload = await apiRequest<unknown>(path, token, `No se pudo cargar ${warningLabel}`);
    return Array.isArray(payload) ? (payload as T[]) : [];
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : `No se pudo cargar ${warningLabel}`);
    return [];
  }
};

const safeObjectFetch = async <T>(
  path: string,
  token: string,
  warnings: string[],
  warningLabel: string,
): Promise<T | null> => {
  try {
    return await apiRequest<T>(path, token, `No se pudo cargar ${warningLabel}`);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : `No se pudo cargar ${warningLabel}`);
    return null;
  }
};

export const getUnifiedContabilidadSnapshot = async (
  token: string,
  options: {
    from: string;
    to: string;
    period: ContabilidadPeriod;
    canManageAttendance: boolean;
    canViewAttendance: boolean;
  },
): Promise<UnifiedContabilidadSnapshot> => {
  const warnings: string[] = [];

  const attendancePromise = options.canManageAttendance
    ? safeObjectFetch<AttendanceRangeSummary>(
        `attendance/hierarchy/range?from=${options.from}&to=${options.to}`,
        token,
        warnings,
        "asistencia jerárquica",
      )
    : options.canViewAttendance
      ? safeObjectFetch<AttendanceRangeSummary>(
          `attendance/range?from=${options.from}&to=${options.to}`,
          token,
          warnings,
          "asistencia individual",
        )
      : Promise.resolve(null);

  const [
    viatics,
    vehicles,
    operationalProjectsRaw,
    expenses,
    fines,
    consoleStats,
    attendance,
    salesMetrics,
    salesInsights,
  ] = await Promise.all([
    safeArrayFetch<ViaticRecord>("viatics", token, warnings, "viáticos"),
    safeArrayFetch<VehiclePenaltyRecord>("vehicles", token, warnings, "multas de vehículos"),
    safeArrayFetch<OperationalProjectRecord>("operational-projects", token, warnings, "proyectos operativos"),
    safeArrayFetch<ExpenseRecord>("expenses", token, warnings, "gastos operativos"),
    safeArrayFetch<FineRecord>("fines", token, warnings, "multas"),
    safeObjectFetch<ConsoleDashboardStats>("dashboard", token, warnings, "resumen de consola"),
    attendancePromise,
    getSalesMetrics(token, options.period).catch((error) => {
      warnings.push(error instanceof Error ? error.message : "No se pudo cargar métricas de ventas");
      return null;
    }),
    getSalesExecutiveInsights(token, options.period).catch((error) => {
      warnings.push(error instanceof Error ? error.message : "No se pudo cargar insights de ventas");
      return null;
    }),
  ]);

  const operationalProjects = operationalProjectsRaw.map((p) => ({
    ...p,
    clientName: p.client?.name ?? null,
    budgetTotal: p.salesProject?.budget ?? null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    period: options.period,
    attendanceScope: options.canManageAttendance ? "hierarchy" : options.canViewAttendance ? "self" : "none",
    viatics,
    vehicles,
    attendance,
    workProjects: operationalProjects,
    operationalProjects,
    expenses,
    fines,
    consoleStats,
    salesMetrics,
    salesInsights,
    warnings,
  };
};
