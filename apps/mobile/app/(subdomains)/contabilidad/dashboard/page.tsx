"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { canViewContabilidadTarget } from "@/lib/contabilidad-visibility";
import {
  getUnifiedContabilidadSnapshot,
  type AttendanceRangeSummary,
  type ContabilidadPeriod,
  type ExpenseRecord,
  type FineRecord,
  type UnifiedContabilidadSnapshot,
  type VehiclePenaltyRecord,
  type ViaticRecord,
  type WorkProjectRecord,
} from "@/lib/contabilidad-api";
import styles from "./page.module.css";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("es-MX") : "";

const getDateRange = (period: ContabilidadPeriod) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === "week") {
    const dayOfWeek = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - dayOfWeek);
  } else if (period === "month") {
    start.setDate(1);
  } else {
    start.setMonth(0, 1);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return {
    start,
    end,
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
};

const parseAmount = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function ContabilidadDashboard() {
  const { user } = useUser();
  const [snapshot, setSnapshot] = useState<UnifiedContabilidadSnapshot | null>(null);
  const [period, setPeriod] = useState<ContabilidadPeriod>("month");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => getDateRange(period), [period]);

  const attendance = useMemo<AttendanceRangeSummary | null>(() => {
    if (!snapshot?.attendance) return null;
    if (snapshot.attendance.users?.length) return snapshot.attendance;
    if (!user?.id) return snapshot.attendance;

    const asIndividualPayload = snapshot.attendance as AttendanceRangeSummary & { totalMinutes?: number };
    const totalMinutes = asIndividualPayload.totalMinutes || asIndividualPayload.totalMinutesAll || 0;

    return {
      totalMinutesAll: totalMinutes,
      totalUsers: 1,
      rangeEnd: snapshot.attendance.rangeEnd || range.to,
      users: [
        {
          userId: user.id,
          userName: user.nombre,
          totalMinutes,
        },
      ],
    };
  }, [snapshot, user?.id, user?.nombre, range.to]);

  const visibleAttendanceUsers = useMemo(() => {
    if (!attendance?.users?.length) return [];
    return attendance.users.filter((item) =>
      canViewContabilidadTarget(user, {
        id: item.userId,
        isSuperAdmin: item.isSuperAdmin,
        roleName: item.roleName,
        roleFlags: item.roleFlags,
        permissions: item.permissions,
      }),
    );
  }, [attendance?.users, user]);

  const visibleAttendanceUserIdSet = useMemo(
    () => new Set(visibleAttendanceUsers.map((item) => item.userId)),
    [visibleAttendanceUsers],
  );

  useEffect(() => {
    if (!visibleAttendanceUsers.length) {
      if (selectedUserId !== null) {
        setSelectedUserId(null);
      }
      return;
    }

    const selectedStillVisible =
      selectedUserId !== null && visibleAttendanceUsers.some((item) => item.userId === selectedUserId);

    if (!selectedStillVisible) {
      setSelectedUserId(visibleAttendanceUsers[0].userId);
    }
  }, [visibleAttendanceUsers, selectedUserId]);

  useEffect(() => {
    if (!user?.token) return;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const canManageAttendance = hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE);
        const canViewAttendance = hasPermission(user, PERMISSIONS.ATTENDANCE_VIEW);

        const data = await getUnifiedContabilidadSnapshot(user.token, {
          from: range.from,
          to: range.to,
          period,
          canManageAttendance,
          canViewAttendance,
        });

        setSnapshot(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [user, range.from, range.to, period, refreshSeed]);

  const viatics = snapshot?.viatics || [];
  const vehicles = snapshot?.vehicles || [];
  const projects = snapshot?.workProjects || [];
  const expenses = snapshot?.expenses || [];
  const fines = snapshot?.fines || [];

  const activeUserId = selectedUserId ?? null;

  const isWithinWeek = (value?: string | null) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date >= range.start && date <= range.end;
  };

  const filteredViatics = useMemo(() => {
    return viatics.filter((item) => {
      if (!isWithinWeek(item.createdAt)) return false;
      const userId = item.usuario?.id ?? item.usuarioId ?? null;
      if (userId !== null && visibleAttendanceUserIdSet.size > 0 && !visibleAttendanceUserIdSet.has(userId)) {
        return false;
      }
      if (!activeUserId) return true;
      return userId === activeUserId;
    });
  }, [viatics, activeUserId, range.start, range.end, visibleAttendanceUserIdSet]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((item) => {
      const dateRef = item.fechaInicio || item.fechaSolicitud || item.createdAt || null;
      if (!isWithinWeek(dateRef)) return false;
      const userId = item.solicitante?.id ?? item.solicitanteId ?? null;
      if (userId !== null && visibleAttendanceUserIdSet.size > 0 && !visibleAttendanceUserIdSet.has(userId)) {
        return false;
      }
      if (!activeUserId) return true;
      return userId === activeUserId;
    });
  }, [vehicles, activeUserId, range.start, range.end, visibleAttendanceUserIdSet]);

  const filteredProjects = useMemo(() => {
    return projects.filter((item) => isWithinWeek(item.createdAt));
  }, [projects, range.start, range.end]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => isWithinWeek(item.createdAt));
  }, [expenses, range.start, range.end]);

  const filteredFines = useMemo(() => {
    return fines.filter((item) => isWithinWeek(item.createdAt));
  }, [fines, range.start, range.end]);

  const viaticTotals = useMemo(() => {
    const total = filteredViatics.reduce((sum, item) => sum + (item.montoSolicitado || 0), 0);
    const pending = filteredViatics.filter((item) => item.estatusPago === "Pendiente").length;
    const approved = filteredViatics.filter((item) => item.estatusPago === "Aprobado").length;
    return { total, pending, approved };
  }, [filteredViatics]);

  const expenseTotals = useMemo(() => {
    const total = filteredExpenses.reduce(
      (sum, item) => sum + parseAmount(item.amount ?? item.monto),
      0,
    );
    return { total, records: filteredExpenses.length };
  }, [filteredExpenses]);

  const penalties = useMemo(() => {
    const list = filteredVehicles.filter((item) => (item.penalizacionMonto || 0) > 0);
    const total = list.reduce((sum, item) => sum + (item.penalizacionMonto || 0), 0);
    return { list, total };
  }, [filteredVehicles]);

  const fineTotals = useMemo(() => {
    const total = filteredFines.reduce(
      (sum, item) => sum + parseAmount(item.amount ?? item.monto),
      0,
    );
    return { total, records: filteredFines.length };
  }, [filteredFines]);

  const projectBudget = useMemo(() => {
    const total = filteredProjects.reduce((sum, item) => sum + parseAmount(item.budgetTotal), 0);
    const used = filteredProjects.reduce((sum, item) => sum + parseAmount(item.budgetUsed), 0);
    return {
      total,
      used,
      utilization: total > 0 ? (used / total) * 100 : 0,
    };
  }, [filteredProjects]);

  const totalHours = useMemo(() => {
    const rangeEnd = attendance?.rangeEnd
      ? new Date(`${attendance.rangeEnd}T23:59:59`)
      : range.end;

    const users = visibleAttendanceUsers;
    const scopedUsers = users.length && activeUserId
      ? users.filter((item) => item.userId === activeUserId)
      : users;

    const reportedMinutes = scopedUsers.reduce(
      (sum, item) => sum + (item.totalMinutes || 0),
      0,
    );

    if (reportedMinutes > 0) {
      return Math.round((reportedMinutes / 60) * 10) / 10;
    }

    const fallbackMinutes = scopedUsers.reduce((sum, user) => {
      const events = (user.attendances || [])
        .map((item) => ({
          type: item.type,
          timestamp: new Date(item.timestamp),
        }))
        .filter((item) => !Number.isNaN(item.timestamp.getTime()))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      let total = 0;
      let openEntryTime: number | null = null;

      events.forEach((event) => {
        if (event.type === "entrada") {
          openEntryTime = event.timestamp.getTime();
        } else if (event.type === "salida" && openEntryTime !== null) {
          const minutes = Math.max(0, Math.floor((event.timestamp.getTime() - openEntryTime) / 60000));
          total += minutes;
          openEntryTime = null;
        }
      });

      if (openEntryTime !== null) {
        const minutes = Math.max(0, Math.floor((rangeEnd.getTime() - openEntryTime) / 60000));
        total += minutes;
      }

      return sum + total;
    }, 0);

    return Math.round((fallbackMinutes / 60) * 10) / 10;
  }, [visibleAttendanceUsers, attendance?.rangeEnd, activeUserId, range.end]);

  const commercialTotals = useMemo(() => {
    const revenue = snapshot?.salesMetrics?.totalRevenue || 0;
    const pipeline = snapshot?.salesMetrics?.pipelineValue || 0;
    const margin = snapshot?.salesMetrics?.averageMargin || 0;
    return { revenue, pipeline, margin };
  }, [snapshot?.salesMetrics]);

  const consolidatedOutflow = useMemo(() => {
    return viaticTotals.total + penalties.total + expenseTotals.total + fineTotals.total;
  }, [viaticTotals.total, penalties.total, expenseTotals.total, fineTotals.total]);

  const executiveScore = useMemo(() => {
    const coverage = consolidatedOutflow > 0 ? (commercialTotals.revenue / consolidatedOutflow) * 100 : 100;
    const marginScore = Math.min(100, Math.max(0, commercialTotals.margin * 2));
    const utilizationPenalty = Math.min(35, projectBudget.utilization * 0.35);
    const finePenalty = Math.min(20, fineTotals.total > 0 ? (fineTotals.total / Math.max(consolidatedOutflow, 1)) * 100 : 0);
    return Math.round(Math.max(0, Math.min(100, coverage * 0.4 + marginScore * 0.3 + (100 - utilizationPenalty) * 0.2 + (100 - finePenalty) * 0.1)));
  }, [commercialTotals.revenue, commercialTotals.margin, consolidatedOutflow, projectBudget.utilization, fineTotals.total]);

  const riskAlerts = useMemo(() => {
    const alerts: Array<{ id: string; title: string; detail: string; level: "high" | "medium" | "low" }> = [];

    if (commercialTotals.revenue > 0 && consolidatedOutflow > commercialTotals.revenue) {
      alerts.push({
        id: "cashflow-negative",
        title: "Flujo operativo en presión",
        detail: "El egreso operativo actual supera el ingreso registrado por ventas en el período.",
        level: "high",
      });
    }

    if (projectBudget.utilization > 85) {
      alerts.push({
        id: "budget-utilization",
        title: "Uso de presupuesto elevado",
        detail: `La utilización del presupuesto de proyectos está en ${projectBudget.utilization.toFixed(1)}%.`,
        level: "medium",
      });
    }

    if (viaticTotals.pending > 0) {
      alerts.push({
        id: "viatics-pending",
        title: "Viáticos pendientes por validar",
        detail: `${viaticTotals.pending} solicitudes requieren resolución para evitar arrastre de gasto.`,
        level: "medium",
      });
    }

    const insightsRisk = snapshot?.salesInsights?.riskAlerts || [];
    insightsRisk.slice(0, 2).forEach((item, index) => {
      alerts.push({
        id: `sales-risk-${index}`,
        title: "Riesgo comercial",
        detail: item.message,
        level: item.level,
      });
    });

    return alerts.slice(0, 5);
  }, [commercialTotals.revenue, consolidatedOutflow, projectBudget.utilization, viaticTotals.pending, snapshot?.salesInsights?.riskAlerts]);

  const latestViatics = useMemo(() => {
    return [...filteredViatics]
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 3);
  }, [filteredViatics]);

  const latestProjects = useMemo(() => {
    return [...filteredProjects]
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 3);
  }, [filteredProjects]);

  const movementFeed = useMemo(() => {
    const viaticMovements = latestViatics.map((item) => ({
      key: `viatic-${item.id}`,
      kind: "Viático",
      title: item.razonGasto || "Solicitud sin descripción",
      meta: `${item.usuario?.nombre || "Sin usuario"} · ${formatCurrency(item.montoSolicitado || 0)}`,
      date: item.createdAt || null,
    }));

    const penaltyMovements = penalties.list.slice(0, 2).map((item) => ({
      key: `penalty-${item.id}`,
      kind: "Multa vehículo",
      title: `${item.vehiculo?.nombre || "Vehículo"}${item.vehiculo?.placas ? ` (${item.vehiculo.placas})` : ""}`,
      meta: `${item.solicitante?.nombre || "Sin responsable"} · ${formatCurrency(item.penalizacionMonto || 0)}`,
      date: item.fechaInicio || item.fechaSolicitud || item.createdAt || null,
    }));

    const expenseMovements = filteredExpenses.slice(0, 2).map((item) => ({
      key: `expense-${item.id}`,
      kind: "Gasto",
      title: item.concepto || item.category || "Egreso operativo",
      meta: formatCurrency(parseAmount(item.amount ?? item.monto)),
      date: item.createdAt || null,
    }));

    return [...viaticMovements, ...penaltyMovements, ...expenseMovements]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 6);
  }, [latestViatics, penalties.list, filteredExpenses]);

  const capitalMax = useMemo(() => {
    return Math.max(viaticTotals.total, penalties.total, expenseTotals.total, fineTotals.total, 1);
  }, [viaticTotals.total, penalties.total, expenseTotals.total, fineTotals.total]);

  const toCapitalPercent = (value: number) => {
    if (!capitalMax) return 0;
    return Math.min(100, Math.round((value / capitalMax) * 100));
  };

  const periodLabel = period === "week" ? "Semana" : period === "month" ? "Mes" : "Año";

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Panel Contable Corporativo</p>
          <h1 className={styles.title}>Tablero financiero integrado</h1>
          <p className={styles.subtitle}>
            Integra contabilidad, operación y ventas para decisiones financieras claras y oportunas.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setRefreshSeed((prev) => prev + 1)}
          >
            Actualizar información
          </button>
          <Link className={styles.secondaryButton} href="/pagos">
            Revisar pagos
          </Link>
          <Link className={styles.secondaryButton} href="/proyectos">
            Revisar proyectos
          </Link>
        </div>
      </header>

      <div className={styles.filters}>
        <div className={styles.filterMeta}>
          {periodLabel} actual: {formatDate(range.from)} - {formatDate(range.to)} · Última actualización {formatDate(snapshot?.generatedAt)}
        </div>
        <div className={styles.periodButtons}>
          {(["week", "month", "year"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`${styles.periodButton} ${period === key ? styles.periodButtonActive : ""}`}
              onClick={() => setPeriod(key)}
            >
              {key === "week" ? "Semana" : key === "month" ? "Mes" : "Año"}
            </button>
          ))}
        </div>
        {hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE) && visibleAttendanceUsers.length ? (
          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Usuario</span>
            <select
              className="input"
              value={activeUserId ?? ""}
              onChange={(event) => setSelectedUserId(Number(event.target.value))}
            >
              {visibleAttendanceUsers.map((item) => (
                <option key={item.userId} value={item.userId}>
                  {item.userName || `Usuario ${item.userId}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {!!snapshot?.warnings.length && (
        <div className={styles.warningBox}>
          <p className={styles.warningTitle}>Fuentes con disponibilidad parcial</p>
          <ul className={styles.warningList}>
            {snapshot.warnings.slice(0, 4).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Ingresos de ventas</p>
          <h2 className={styles.metricValue}>{formatCurrency(commercialTotals.revenue)}</h2>
          <p className={styles.metricMeta}>Pipeline comercial: {formatCurrency(commercialTotals.pipeline)}</p>
        </div>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Egreso consolidado</p>
          <h2 className={styles.metricValue}>{formatCurrency(consolidatedOutflow)}</h2>
          <p className={styles.metricMeta}>Viáticos, multas, gastos y sanciones del periodo</p>
        </div>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Índice de salud financiera</p>
          <h2 className={styles.metricValue}>{executiveScore}/100</h2>
          <p className={styles.metricMeta}>Margen promedio de ventas: {commercialTotals.margin.toFixed(1)}%</p>
        </div>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Presupuesto proyectos</p>
          <h2 className={styles.metricValue}>{projectBudget.utilization.toFixed(1)}%</h2>
          <p className={styles.metricMeta}>Usado {formatCurrency(projectBudget.used)} de {formatCurrency(projectBudget.total)}</p>
        </div>
      </div>

      <div className={styles.metricsGridCompact}>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Viáticos activos</p>
          <h2 className={styles.metricValue}>{formatCurrency(viaticTotals.total)}</h2>
          <p className={styles.metricMeta}>
            {viaticTotals.pending} pendientes · {viaticTotals.approved} aprobados
          </p>
        </div>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Multas registradas</p>
          <h2 className={styles.metricValue}>{formatCurrency(penalties.total)}</h2>
          <p className={styles.metricMeta}>{penalties.list.length} cargos recientes de vehículos</p>
        </div>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Gasto operativo</p>
          <h2 className={styles.metricValue}>{formatCurrency(expenseTotals.total)}</h2>
          <p className={styles.metricMeta}>{expenseTotals.records} movimientos registrados</p>
        </div>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Multas generales</p>
          <h2 className={styles.metricValue}>{formatCurrency(fineTotals.total)}</h2>
          <p className={styles.metricMeta}>{fineTotals.records} incidencias económicas</p>
        </div>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Horas trabajadas</p>
          <h2 className={styles.metricValue}>{totalHours} h</h2>
          <p className={styles.metricMeta}>
            {visibleAttendanceUsers.length ? `${visibleAttendanceUsers.length} colaboradores` : "Sin permisos de asistencia"}
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.panelCard}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Movimientos consolidados</h3>
              <p className={styles.cardSubtitle}>
                Eventos consolidados entre contabilidad operativa, multas y gastos.
              </p>
            </div>
            <span className={styles.badge}>{movementFeed.length} eventos</span>
          </div>
          <div className={styles.activityList}>
            {movementFeed.map((item) => (
              <div key={item.key} className={styles.activityItem}>
                <div>
                  <span className={styles.activityLabel}>{item.kind}</span>
                  <p className={styles.activityTitle}>{item.title}</p>
                  <p className={styles.activityMeta}>{item.meta}</p>
                </div>
                <p className={styles.activityMeta}>{formatDate(item.date)}</p>
              </div>
            ))}
            {!loading && movementFeed.length === 0 && (
              <p className={styles.activityMeta}>Sin movimientos recientes.</p>
            )}
          </div>
        </div>

        <div className={styles.panelCard}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Mapa de egresos</h3>
              <p className={styles.cardSubtitle}>Distribución ejecutiva por rubro financiero.</p>
            </div>
          </div>
          <div className={styles.miniChart}>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Viaticos</span>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${toCapitalPercent(viaticTotals.total)}%` }}
                />
              </div>
            </div>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Multas</span>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${toCapitalPercent(penalties.total)}%` }}
                />
              </div>
            </div>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Gastos</span>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${toCapitalPercent(expenseTotals.total)}%` }}
                />
              </div>
            </div>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Sanciones</span>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${toCapitalPercent(fineTotals.total)}%` }}
                />
              </div>
            </div>
          </div>
          <div className={styles.sectionBlock}>
            <h4 className={styles.cardTitle}>Proyectos prioritarios</h4>
            <div className={styles.activityList}>
              {latestProjects.map((project) => (
                <div key={project.id} className={styles.activityItem}>
                  <div>
                    <span className={styles.activityLabel}>Proyecto</span>
                    <p className={styles.activityTitle}>{project.title}</p>
                    <p className={styles.activityMeta}>
                      {project.clientName || "Sin cliente"} · {project.status || "Sin estatus"}
                    </p>
                  </div>
                  <p className={styles.activityMeta}>{formatDate(project.createdAt)}</p>
                </div>
              ))}
              {!loading && latestProjects.length === 0 && (
                <p className={styles.activityMeta}>No hay proyectos prioritarios en el periodo.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.panelCard}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Alertas y conciliación</h3>
              <p className={styles.cardSubtitle}>Riesgos detectados al consolidar ventas y contabilidad.</p>
            </div>
            <span className={styles.badge}>{riskAlerts.length} alertas</span>
          </div>
          <div className={styles.activityList}>
            {riskAlerts.map((alert) => (
              <div key={alert.id} className={styles.activityItem}>
                <div>
                  <span className={styles.activityLabel}>{alert.level.toUpperCase()}</span>
                  <p className={styles.activityTitle}>{alert.title}</p>
                  <p className={styles.activityMeta}>{alert.detail}</p>
                </div>
              </div>
            ))}
            {!loading && riskAlerts.length === 0 && (
              <p className={styles.activityMeta}>Sin alertas críticas para este período.</p>
            )}
          </div>
        </div>

        <div className={styles.panelCard}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Estado de integración</h3>
              <p className={styles.cardSubtitle}>Conexión entre paneles y cobertura de datos.</p>
            </div>
          </div>
          <div className={styles.integrationList}>
            <div className={styles.integrationItem}>
              <p className={styles.integrationTitle}>Consola operativa</p>
              <p className={styles.integrationMeta}>
                Actividades: {snapshot?.consoleStats?.actividades?.total || 0} · Viáticos: {snapshot?.consoleStats?.viaticos?.total || 0}
              </p>
            </div>
            <div className={styles.integrationItem}>
              <p className={styles.integrationTitle}>Ventas</p>
              <p className={styles.integrationMeta}>
                Ingreso: {formatCurrency(commercialTotals.revenue)} · Margen: {commercialTotals.margin.toFixed(1)}%
              </p>
            </div>
            <div className={styles.integrationItem}>
              <p className={styles.integrationTitle}>Contabilidad</p>
              <p className={styles.integrationMeta}>
                Proyectos activos: {filteredProjects.length} · Horas operativas: {totalHours}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
