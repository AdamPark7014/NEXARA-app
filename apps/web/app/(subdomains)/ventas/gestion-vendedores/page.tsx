"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HelpTab from "@/components/HelpTab";
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

type OperationalProjectSummary = {
  id: number;
  title: string;
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED";
  vendor?: { id: number; nombre: string };
  client?: { id: number; name: string };
  activities?: Array<{ id: number }>;
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

const badgeClass = (status?: "on-track" | "risk" | "off-track") => {
  if (status === "on-track") return "badge-success";
  if (status === "risk") return "badge-warning";
  return "badge-danger";
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
  const selectedOwnerId =
    typeof window === "undefined"
      ? undefined
      : Number(new URLSearchParams(window.location.search).get("ownerId") || 0) || undefined;
  const [period, setPeriod] = useState<Period>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null);
  const [vendorStats, setVendorStats] = useState<SalesVendorStats[]>([]);
  const [cockpit, setCockpit] = useState<SalesManagerCockpit | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRangeResponse | null>(null);
  const [operationalProjects, setOperationalProjects] = useState<OperationalProjectSummary[]>([]);

  const canManageSellers = isSalesManagerUser(user);

  const periodLabel = period === "week" ? "Semana" : period === "month" ? "Mes" : "Año";

  const selectedVendor = selectedOwnerId
    ? vendorStats.find((v) => v.userId === selectedOwnerId) || null
    : null;

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
        const [metricsData, vendorData, cockpitData, attendanceRes, projectsRes] = await Promise.all([
          getSalesMetrics(user.token, period),
          getSalesVendorStats(user.token, period),
          getSalesManagerCockpit(user.token, period),
          fetch(`${API_URL}/attendance/hierarchy/range?from=${from}&to=${to}`, {
            headers: { Authorization: `Bearer ${user.token}` },
          }),
          fetch(`${API_URL}/operational-projects`, {
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

        const projectsData = projectsRes.ok ? ((await projectsRes.json()) as OperationalProjectSummary[]) : [];

        setMetrics(metricsData);
        setVendorStats(vendorData);
        setCockpit(cockpitData);
        setAttendance(attendancePayload);
        setOperationalProjects(Array.isArray(projectsData) ? projectsData : []);
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

  const projectRowsByVendor = useMemo(() => {
    const grouped = new Map<number, { vendorName: string; total: number; active: number; onHold: number; completed: number; activities: number }>();
    for (const project of operationalProjects) {
      const vendorId = Number(project.vendor?.id || 0);
      if (!vendorId) continue;
      const current = grouped.get(vendorId) || {
        vendorName: project.vendor?.nombre || `Vendedor ${vendorId}`,
        total: 0,
        active: 0,
        onHold: 0,
        completed: 0,
        activities: 0,
      };
      current.total += 1;
      current.activities += project.activities?.length || 0;
      if (project.status === "ACTIVE") current.active += 1;
      if (project.status === "ON_HOLD") current.onHold += 1;
      if (project.status === "COMPLETED") current.completed += 1;
      grouped.set(vendorId, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.active - a.active || b.total - a.total);
  }, [operationalProjects]);

  if (!user) return <div style={{ padding: 16 }}>Cargando usuario...</div>;

  if (!canManageSellers) {
    return (
      <section style={{ display: "grid", gap: 18, padding: "12px 4px 28px", position: "relative" }}>
        <div className="card">
          <h1>Gestión de vendedores</h1>
          <p>Este panel es exclusivo para perfiles admin/superadmin o con permisos de gestión.</p>
        </div>
      </section>
    );
  }

  if (loading) return <div style={{ padding: 16 }}>Cargando panel ejecutivo...</div>;

  return (
    <section className="salesCockpit">
      <HelpTab module="sales-management" user={user} />

      <header className="salesHero card">
        <div>
          <p className="salesEyebrow">Ventas · Control Ejecutivo</p>
          <h1 className="salesTitle">Gestión integral de vendedores</h1>
          <p className="salesSubtitle">
            Supervisión de cumplimiento comercial y productividad diaria en una sola vista ({periodLabel}).
          </p>
        </div>
        <div className="periodTabs" role="tablist" aria-label="Periodo de análisis">
          {(["week", "month", "year"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              className={`periodBtn ${period === item ? "isActive" : ""}`}
            >
              {item === "week" ? "Semana" : item === "month" ? "Mes" : "Año"}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="card errorCard">{error}</div>}

      <div className="card panelCard directoryCard" aria-label="Directorio de vendedores">
        <div className="panelHead">
          <h2>Directorio de vendedores</h2>
          <span className="panelHint">
            Contexto activo: <strong>{selectedVendor?.userName || "Todos"}</strong>
          </span>
        </div>
        <div className="directoryGrid">
          <div className="tableWrap">
            <table className="table directoryTable">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Ingresos</th>
                  <th>Oportunidades</th>
                  <th>Proyectos</th>
                  <th>Performance</th>
                </tr>
              </thead>
              <tbody>
                <tr className={!selectedOwnerId ? "isSelectedRow" : ""}>
                  <td>
                    <Link href="/gestion-vendedores" className="rowLink">
                      Todos los vendedores
                    </Link>
                  </td>
                  <td>{formatMoney(vendorStats.reduce((s, v) => s + Number(v.revenue || 0), 0))}</td>
                  <td>{vendorStats.reduce((s, v) => s + Number(v.opportunities || 0), 0)}</td>
                  <td>{vendorStats.reduce((s, v) => s + Number(v.projects || 0), 0)}</td>
                  <td>—</td>
                </tr>
                {vendorStats.map((v) => (
                  <tr key={v.userId} className={selectedOwnerId === v.userId ? "isSelectedRow" : ""}>
                    <td>
                      <Link href={`/gestion-vendedores?ownerId=${v.userId}`} className="rowLink">
                        {v.userName}
                      </Link>
                    </td>
                    <td>{formatMoney(v.revenue || 0)}</td>
                    <td>{v.opportunities}</td>
                    <td>{v.projects}</td>
                    <td>
                      <span className={`statusPill ${badgeClass(v.status)}`}>
                        {statusLabel(v.status)} · {Number(v.performance || 0).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
                {vendorStats.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--text-tertiary)" }}>
                      No hay vendedores configurados con acceso a Panel Ventas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <aside className="directoryDetail card" aria-label="Perfil del vendedor seleccionado">
            <div className="detailHead">
              <p className="detailKicker">Perfil</p>
              <h3 className="detailTitle">{selectedVendor?.userName || "Vista global"}</h3>
              <p className="detailSubtitle">
                {selectedVendor
                  ? "Accesos directos a módulos con el filtro del vendedor aplicado."
                  : "Selecciona un vendedor para abrir su contexto en los módulos."}
              </p>
            </div>
            <div className="detailKpis">
              <div className="miniKpi">
                <strong>{selectedVendor ? formatMoney(selectedVendor.revenue || 0) : "—"}</strong>
                <span>Ingresos</span>
              </div>
              <div className="miniKpi">
                <strong>{selectedVendor ? selectedVendor.opportunities : "—"}</strong>
                <span>Oportunidades</span>
              </div>
              <div className="miniKpi">
                <strong>{selectedVendor ? selectedVendor.projects : "—"}</strong>
                <span>Proyectos</span>
              </div>
            </div>
            <div className="detailActions">
              <Link className="actionBtn" href={selectedVendor ? `/dashboard?ownerId=${selectedVendor.userId}` : "/dashboard"}>
                Abrir dashboard
              </Link>
              <Link className="actionBtn" href={selectedVendor ? `/oportunidades?ownerId=${selectedVendor.userId}` : "/oportunidades"}>
                Pipeline (oportunidades)
              </Link>
              <Link className="actionBtn" href={selectedVendor ? `/leads?ownerId=${selectedVendor.userId}` : "/leads"}>
                Leads
              </Link>
              <Link className="actionBtn" href={selectedVendor ? `/clientes?ownerId=${selectedVendor.userId}` : "/clientes"}>
                Clientes
              </Link>
              <Link className="actionBtn" href={selectedVendor ? `/proyectos?ownerId=${selectedVendor.userId}` : "/proyectos"}>
                Proyectos
              </Link>
            </div>
          </aside>
        </div>
      </div>

      <div className="kpiGrid">
        <article className="card kpiCard">
          <p className="kpiLabel">Pipeline activo</p>
          <h3 className="kpiValue">{formatMoney(metrics?.pipelineValue || 0)}</h3>
          <span className="kpiMeta">{metrics?.opportunityCount || 0} oportunidades</span>
        </article>
        <article className="card kpiCard">
          <p className="kpiLabel">Ingreso total</p>
          <h3 className="kpiValue">{formatMoney(metrics?.totalRevenue || 0)}</h3>
          <span className="kpiMeta">Margen promedio {Number(metrics?.averageMargin || 0).toFixed(1)}%</span>
        </article>
        <article className="card kpiCard">
          <p className="kpiLabel">Vendedores activos</p>
          <h3 className="kpiValue">{attendanceInsights.activeUsers}</h3>
          <span className="kpiMeta">Con actividad operativa registrada</span>
        </article>
        <article className="card kpiCard">
          <p className="kpiLabel">Puntualidad diaria</p>
          <h3 className="kpiValue">{attendanceInsights.punctualityRate.toFixed(0)}%</h3>
          <span className="kpiMeta">Entrada antes de 9:15 AM</span>
        </article>
        <article className="card kpiCard">
          <p className="kpiLabel">Productividad media</p>
          <h3 className="kpiValue">{attendanceInsights.averageProductivity.toFixed(1)}</h3>
          <span className="kpiMeta">Score promedio del equipo</span>
        </article>
        <article className="card kpiCard">
          <p className="kpiLabel">Vendedores en riesgo</p>
          <h3 className="kpiValue">{Math.max(attendanceInsights.lowProductivityUsers, cockpit?.summary.coachingQueue || 0)}</h3>
          <span className="kpiMeta">Requieren coaching inmediato</span>
        </article>
      </div>

      <div className="splitGrid">
        <article className="card panelCard">
          <div className="panelHead">
            <h2>Leaderboard comercial</h2>
            <span className="panelHint">Top {Math.max(topPerformers.length, 0)} vendedores</span>
          </div>
          <div className="tableWrap">
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
                      <span className={`statusPill ${badgeClass(seller.status)}`}>
                        {statusLabel(seller.status)}
                      </span>
                    </td>
                  </tr>
                ))}
                {topPerformers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="emptyCell">Sin datos disponibles.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card panelCard">
          <div className="panelHead">
            <h2>Prioridades de coaching</h2>
            <span className="panelHint">Enfoque inmediato</span>
          </div>
          <ul className="coachingList">
            {(cockpit?.coachingPriorities || []).slice(0, 10).map((item) => (
              <li key={item.opportunityId} className="coachingItem">
                <div>
                  <strong>{item.ownerName}</strong>
                  <p>{item.title}</p>
                </div>
                <span className="riskChip">Riesgo {item.riskScore}</span>
              </li>
            ))}
            {!cockpit?.coachingPriorities?.length && <li className="emptyState">Sin prioridades activas.</li>}
          </ul>
        </article>
      </div>

      <article className="card panelCard">
        <div className="panelHead">
          <h2>Proyectos operacionales por vendedor</h2>
          <span className="panelHint">Carga por estatus y volumen operativo</span>
        </div>
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Total proyectos</th>
                <th>Activos</th>
                <th>En pausa</th>
                <th>Cerrados</th>
                <th>Actividades</th>
              </tr>
            </thead>
            <tbody>
              {projectRowsByVendor.length === 0 && (
                <tr>
                  <td colSpan={6} className="emptyCell">Sin proyectos operacionales registrados.</td>
                </tr>
              )}
              {projectRowsByVendor.map((row) => (
                <tr key={row.vendorName}>
                  <td>{row.vendorName}</td>
                  <td>{row.total}</td>
                  <td>{row.active}</td>
                  <td>{row.onHold}</td>
                  <td>{row.completed}</td>
                  <td>{row.activities}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card panelCard">
        <div className="panelHead">
          <h2>Verificación diaria de productividad</h2>
          <span className="panelHint">Horas efectivas y score por vendedor</span>
        </div>
        <div className="tableWrap">
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
                  <td colSpan={5} className="emptyCell">No hay datos de asistencia/productividad para el periodo.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card panelCard">
        <div className="panelHead">
          <h2>Focos rojos y acciones sugeridas</h2>
          <span className="panelHint">Alertas para intervención operativa</span>
        </div>
        <ul className="riskList">
          {riskRows.map((risk) => (
            <li key={risk.key} className="riskItem">
              <strong>{risk.seller}</strong>
              <span>{risk.area}</span>
              <p>{risk.signal}</p>
            </li>
          ))}
          {riskRows.length === 0 && <li className="emptyState">Sin alertas críticas detectadas.</li>}
        </ul>
      </article>

      <style jsx>{`
        .salesCockpit {
          display: grid;
          gap: 16px;
          padding: 10px 2px 28px;
          position: relative;
        }

        .salesHero {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
          border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
          background:
            radial-gradient(120% 100% at 100% 0%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 58%),
            linear-gradient(180deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 92%, transparent));
        }

        .directoryCard {
          padding: 18px 18px;
        }

        .directoryGrid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(260px, 0.75fr);
          gap: 14px;
          align-items: start;
          margin-top: 12px;
        }

        .directoryTable .rowLink {
          color: inherit;
          text-decoration: none;
          font-weight: 700;
        }

        .directoryTable tr.isSelectedRow {
          background: color-mix(in srgb, var(--primary) 10%, transparent);
        }

        .directoryDetail {
          position: sticky;
          top: 14px;
          padding: 16px 16px;
          border-radius: 16px;
        }

        .detailKicker {
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 0.7rem;
          color: var(--text-tertiary);
          font-weight: 800;
        }

        .detailTitle {
          margin: 6px 0 6px;
          letter-spacing: -0.02em;
        }

        .detailSubtitle {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.9rem;
          line-height: 1.5;
        }

        .detailKpis {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 14px;
        }

        .miniKpi {
          padding: 10px 10px;
          border-radius: 14px;
          border: 1px solid color-mix(in srgb, var(--primary) 14%, var(--border));
          background: color-mix(in srgb, var(--primary) 7%, var(--surface));
        }

        .miniKpi strong {
          display: block;
          font-size: 0.95rem;
          letter-spacing: -0.02em;
        }

        .miniKpi span {
          display: block;
          margin-top: 4px;
          font-size: 0.78rem;
          color: var(--text-secondary);
        }

        .detailActions {
          display: grid;
          gap: 8px;
          margin-top: 14px;
        }

        .detailActions .actionBtn {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--surface-clean);
          color: var(--foreground);
          text-decoration: none;
          transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
          font-weight: 650;
        }

        .detailActions .actionBtn:hover {
          transform: translateY(-1px);
          background: color-mix(in srgb, var(--primary) 6%, var(--surface));
          border-color: color-mix(in srgb, var(--primary) 22%, var(--border));
        }

        .salesEyebrow {
          margin: 0;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          font-size: 0.68rem;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .salesTitle {
          margin: 6px 0 8px;
          font-size: clamp(1.7rem, 3vw, 2.6rem);
          line-height: 1.1;
        }

        .salesSubtitle {
          margin: 0;
          color: var(--text-secondary);
          max-width: 760px;
        }

        .periodTabs {
          display: inline-flex;
          gap: 8px;
          padding: 4px;
          border-radius: 14px;
          background: color-mix(in srgb, var(--surface-2) 88%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
        }

        .periodBtn {
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-primary);
          border-radius: 10px;
          padding: 8px 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
        }

        .periodBtn:hover {
          background: color-mix(in srgb, var(--surface) 84%, var(--primary) 16%);
        }

        .periodBtn.isActive {
          color: #fff;
          border-color: color-mix(in srgb, var(--primary) 40%, transparent);
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 88%, white 12%), color-mix(in srgb, var(--secondary) 84%, white 16%));
          box-shadow: 0 8px 16px color-mix(in srgb, var(--primary) 28%, transparent);
        }

        .errorCard {
          color: var(--state-danger-text, #d54444);
          border: 1px solid color-mix(in srgb, var(--state-danger-border, #d54444) 40%, transparent);
          background: color-mix(in srgb, var(--state-danger-bg, #ffefef) 78%, transparent);
        }

        .kpiGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .kpiCard {
          display: grid;
          gap: 4px;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 90%, transparent));
        }

        .kpiCard::before {
          content: "";
          display: block;
          width: 44px;
          height: 3px;
          border-radius: 999px;
          margin-bottom: 4px;
          background: linear-gradient(90deg, var(--primary), var(--secondary));
        }

        .kpiLabel {
          margin: 0;
          font-size: 0.82rem;
          color: var(--text-secondary);
        }

        .kpiValue {
          margin: 0;
          font-size: 2rem;
          line-height: 1.05;
          letter-spacing: -0.02em;
        }

        .kpiMeta {
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        .splitGrid {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
          gap: 12px;
        }

        .panelCard {
          border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
          background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 92%, transparent));
        }

        .panelHead {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .panelHead h2 {
          margin: 0;
          font-size: 1.7rem;
          line-height: 1.1;
        }

        .panelHint {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .tableWrap {
          overflow-x: auto;
          border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
          border-radius: 12px;
        }

        .statusPill {
          padding: 4px 9px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 700;
          display: inline-block;
        }

        .coachingList,
        .riskList {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 8px;
        }

        .coachingItem,
        .riskItem {
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          border-radius: 12px;
          padding: 10px 12px;
          background: color-mix(in srgb, var(--surface) 94%, transparent);
        }

        .coachingItem {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .coachingItem p,
        .riskItem p {
          margin: 0;
          color: var(--text-secondary);
        }

        .riskItem {
          display: grid;
          gap: 4px;
        }

        .riskChip {
          flex-shrink: 0;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 4px 9px;
          border-radius: 999px;
          background: rgba(241, 139, 31, 0.14);
          color: #d3781b;
        }

        .emptyCell,
        .emptyState {
          color: var(--text-secondary);
          opacity: 0.78;
          padding: 10px 0;
        }

        @media (max-width: 1040px) {
          .splitGrid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .salesTitle {
            font-size: 1.9rem;
          }

          .periodTabs {
            width: 100%;
            justify-content: space-between;
          }

          .periodBtn {
            flex: 1;
          }

          .kpiGrid {
            grid-template-columns: 1fr;
          }

          .panelHead h2 {
            font-size: 1.35rem;
          }
        }

        @media (max-width: 980px) {
          .directoryGrid {
            grid-template-columns: 1fr;
          }

          .directoryDetail {
            position: static;
          }
        }
      `}</style>
    </section>
  );
}
