"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import { isSalesManagerUser } from "@/lib/panel-user";
import {
  getSalesManagerCockpit,
  getSalesMetrics,
  getSalesVendorStats,
  type SalesManagerCockpit,
  type SalesMetrics,
  type SalesVendorStats,
} from "@/lib/sales-api";
import styles from "./page.module.css";

type AttendanceEvent = { type: string; timestamp: string };

type AttendanceUserStat = {
  userId: number;
  userName: string;
  totalMinutes: number;
  avgMinutesPerDay: number;
  workDays: number;
  attendances: AttendanceEvent[];
  productivity?: {
    avgScore: number;
    level: string;
    counts: { alta: number; media: number; baja: number };
    reviewed: number;
  };
};

type AttendanceRangeResponse = {
  totalUsers: number;
  totalMinutesAll: number;
  avgMinutesPerUser: number;
  users: AttendanceUserStat[];
};

type Period = "week" | "month" | "year";

const toInputDate = (date: Date) => date.toISOString().slice(0, 10);

const getRangeForPeriod = (period: Period) => {
  const now = new Date();
  if (period === "week") {
    const dayOfWeek = (now.getDay() + 6) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);
    return { from: toInputDate(start), to: toInputDate(now) };
  }
  if (period === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: toInputDate(start), to: toInputDate(now) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toInputDate(start), to: toInputDate(now) };
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatHours = (minutes: number) => `${(minutes / 60).toFixed(1)} h`;

const statusLabel = (status?: "on-track" | "risk" | "off-track") => {
  if (status === "on-track") return "On-track";
  if (status === "risk") return "Riesgo";
  return "Off-track";
};

const statusClass = (status?: "on-track" | "risk" | "off-track") => {
  if (status === "on-track") return styles.statusOnTrack;
  if (status === "risk") return styles.statusRisk;
  return styles.statusOffTrack;
};

const getFirstEntry = (attendances: AttendanceEvent[]) => {
  const entries = attendances
    .filter((item) => item.type === "entrada")
    .map((item) => new Date(item.timestamp))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  return entries[0] || null;
};

export default function VentasGestionVendedoresPage() {
  const { user } = useUser();
  const [period, setPeriod] = useState<Period>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null);
  const [vendorStats, setVendorStats] = useState<SalesVendorStats[]>([]);
  const [cockpit, setCockpit] = useState<SalesManagerCockpit | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRangeResponse | null>(null);

  const canManageSellers = isSalesManagerUser(user);

  const periodLabel = period === "week" ? "Semana" : period === "month" ? "Mes" : "Año";

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.token || !canManageSellers) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[/.]+$/, "");
      const { from, to } = getRangeForPeriod(period);

      try {
        const [metricsData, vendorData, cockpitData, attendanceRes] = await Promise.all([
          getSalesMetrics(user.token, period),
          getSalesVendorStats(user.token, period),
          getSalesManagerCockpit(user.token, period),
          fetch(`${API_URL}/attendance/hierarchy/range?from=${from}&to=${to}`, {
            headers: { Authorization: `Bearer ${user.token}` },
          }),
        ]);

        let attendancePayload: AttendanceRangeResponse | null = null;
        if (attendanceRes.ok) {
          attendancePayload = (await attendanceRes.json()) as AttendanceRangeResponse;
        }

        if (attendancePayload) {
          const sellerIds = new Set(
            vendorData
              .map((seller) => Number(seller.userId))
              .filter((id) => Number.isFinite(id) && id > 0),
          );

          const filteredUsers = (attendancePayload.users || []).filter((item) => sellerIds.has(Number(item.userId)));
          const totalMinutesAll = filteredUsers.reduce((sum, item) => sum + Number(item.totalMinutes || 0), 0);

          attendancePayload = {
            ...attendancePayload,
            users: filteredUsers,
            totalUsers: filteredUsers.length,
            totalMinutesAll,
            avgMinutesPerUser: filteredUsers.length ? totalMinutesAll / filteredUsers.length : 0,
          };
        }

        setMetrics(metricsData);
        setVendorStats(vendorData);
        setCockpit(cockpitData);
        setAttendance(attendancePayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar la gestión de vendedores");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.token, period, canManageSellers]);

  const attendanceInsights = useMemo(() => {
    const users = attendance?.users || [];
    if (!users.length) {
      return {
        activeUsers: 0,
        averageProductivity: 0,
        punctualityRate: 0,
        lowProductivityUsers: 0,
      };
    }

    const activeUsers = users.filter((item) => item.totalMinutes > 0).length;
    const averageProductivity =
      users.reduce((sum, item) => sum + Number(item.productivity?.avgScore || 0), 0) / users.length;

    const punctualUsers = users.filter((item) => {
      const firstEntry = getFirstEntry(item.attendances || []);
      if (!firstEntry) return false;
      const hour = firstEntry.getHours();
      const minute = firstEntry.getMinutes();
      return hour < 9 || (hour === 9 && minute <= 15);
    }).length;

    const lowProductivityUsers = users.filter((item) => {
      const level = item.productivity?.level?.toLowerCase() || "";
      return level === "baja" || item.avgMinutesPerDay < 300;
    }).length;

    return {
      activeUsers,
      averageProductivity,
      punctualityRate: (punctualUsers / users.length) * 100,
      lowProductivityUsers,
    };
  }, [attendance]);

  const riskRows = useMemo(() => {
    const vendorRisk = vendorStats
      .filter((item) => item.status === "risk" || item.status === "off-track")
      .map((item) => ({
        key: `vendor-${item.userId}`,
        seller: item.userName,
        area: "Meta comercial",
        signal: `${statusLabel(item.status)} · ${(item.attainmentRevenue || 0).toFixed(0)}% de cumplimiento`,
      }));

    const attendanceRisk = (attendance?.users || [])
      .filter((item) => {
        const level = item.productivity?.level?.toLowerCase() || "";
        return level === "baja" || item.avgMinutesPerDay < 300;
      })
      .slice(0, 12)
      .map((item) => ({
        key: `attendance-${item.userId}`,
        seller: item.userName,
        area: "Productividad diaria",
        signal: `Nivel ${item.productivity?.level || "Sin dato"} · ${formatHours(item.avgMinutesPerDay || 0)} promedio`,
      }));

    return [...vendorRisk, ...attendanceRisk].slice(0, 20);
  }, [vendorStats, attendance]);

  const topPerformers = useMemo(() => {
    return [...vendorStats]
      .sort((a, b) => Number(b.performance || 0) - Number(a.performance || 0))
      .slice(0, 8);
  }, [vendorStats]);

  if (!user) return <div className={styles.loading}>Cargando usuario...</div>;

  if (!canManageSellers) {
    return (
      <section className={styles.page}>
        <div className={styles.lockedCard}>
          <h1>Gestión de vendedores</h1>
          <p>Este panel es exclusivo para perfiles admin/superadmin o con permisos de gestión.</p>
        </div>
      </section>
    );
  }

  if (loading) return <div className={styles.loading}>Cargando panel ejecutivo...</div>;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Ventas · Control Ejecutivo</p>
          <h1 className={styles.title}>Gestión integral de vendedores</h1>
          <p className={styles.subtitle}>
            Supervisión de cumplimiento comercial y productividad diaria en una sola vista ({periodLabel}).
          </p>
        </div>
        <div className={styles.periodButtons}>
          {(["week", "month", "year"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              className={`${styles.periodBtn} ${period === item ? styles.periodBtnActive : ""}`}
            >
              {item === "week" ? "Semana" : item === "month" ? "Mes" : "Año"}
            </button>
          ))}
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.kpiGrid}>
        <article className="card" style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)" }}>Pipeline activo</p>
          <h3>{formatMoney(metrics?.pipelineValue || 0)}</h3>
          <span>{metrics?.opportunityCount || 0} oportunidades</span>
        </article>
        <article className="card" style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)" }}>Ingreso total</p>
          <h3>{formatMoney(metrics?.totalRevenue || 0)}</h3>
          <span>Margen promedio {Number(metrics?.averageMargin || 0).toFixed(1)}%</span>
        </article>
        <article className="card" style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)" }}>Vendedores activos</p>
          <h3>{attendanceInsights.activeUsers}</h3>
          <span>Con actividad operativa registrada</span>
        </article>
        <article className="card" style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)" }}>Puntualidad diaria</p>
          <h3>{attendanceInsights.punctualityRate.toFixed(0)}%</h3>
          <span>Entrada antes de 9:15 AM</span>
        </article>
        <article className="card" style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)" }}>Productividad media</p>
          <h3>{attendanceInsights.averageProductivity.toFixed(1)}</h3>
          <span>Score promedio del equipo</span>
        </article>
        <article className="card" style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)" }}>Vendedores en riesgo</p>
          <h3>{Math.max(attendanceInsights.lowProductivityUsers, cockpit?.summary.coachingQueue || 0)}</h3>
          <span>Requieren coaching inmediato</span>
        </article>
      </div>

      <div className={styles.gridTwo}>
        <article className="card">
          <h2>Leaderboard comercial</h2>
          <div className={styles.tableWrapper}>
            <table className="table">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Performance</th>
                  <th>Ingresos</th>
                  <th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {topPerformers.map((seller) => (
                  <tr key={seller.userId}>
                    <td>{seller.userName}</td>
                    <td>{Number(seller.performance || 0).toFixed(1)}</td>
                    <td>{formatMoney(seller.revenue || 0)}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${statusClass(seller.status)}`}>
                        {statusLabel(seller.status)}
                      </span>
                    </td>
                  </tr>
                ))}
                {topPerformers.length === 0 && (
                  <tr>
                    <td colSpan={4}>Sin datos disponibles.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <h2>Prioridades de coaching</h2>
          <ul className={styles.priorityList}>
            {(cockpit?.coachingPriorities || []).slice(0, 10).map((item) => (
              <li key={item.opportunityId} className={styles.priorityItem}>
                <div>
                  <strong>{item.ownerName}</strong>
                  <p>{item.title}</p>
                </div>
                <span className={styles.riskPill}>Riesgo {item.riskScore}</span>
              </li>
            ))}
            {!cockpit?.coachingPriorities?.length && <li className={styles.empty}>Sin prioridades activas.</li>}
          </ul>
        </article>
      </div>

      <article className="card">
        <h2>Verificación diaria de productividad</h2>
        <div className={styles.tableWrapper}>
          <table className="table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Horas promedio</th>
                <th>Días trabajados</th>
                <th>Score productividad</th>
                <th>Nivel</th>
              </tr>
            </thead>
            <tbody>
              {(attendance?.users || []).slice(0, 20).map((row) => (
                <tr key={row.userId}>
                  <td>{row.userName}</td>
                  <td>{formatHours(row.avgMinutesPerDay || 0)}</td>
                  <td>{row.workDays || 0}</td>
                  <td>{Number(row.productivity?.avgScore || 0).toFixed(1)}</td>
                  <td>{row.productivity?.level || "Sin dato"}</td>
                </tr>
              ))}
              {!attendance?.users?.length && (
                <tr>
                  <td colSpan={5}>No hay datos de asistencia/productividad para el periodo.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Focos rojos y acciones sugeridas</h2>
        <ul className={styles.alertList}>
          {riskRows.map((risk) => (
            <li key={risk.key} className={styles.alertItem}>
              <strong>{risk.seller}</strong>
              <span>{risk.area}</span>
              <p>{risk.signal}</p>
            </li>
          ))}
          {riskRows.length === 0 && <li className={styles.empty}>Sin alertas críticas detectadas.</li>}
        </ul>
      </article>
    </section>
  );
}
