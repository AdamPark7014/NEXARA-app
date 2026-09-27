"use client";

/**
 * ERP · Indicadores de personas
 * Plantilla, asistencia, puntualidad, carga, permisos y productividad de órdenes de trabajo.
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import InlineAlert from "@/components/ui/InlineAlert";
import FilterToolbar from "@/components/FilterToolbar";
import HrModuleRail from "@/components/hr/HrModuleRail";
import { SkeletonList } from "@/components/PageState";
import { exportToExcel } from "@/lib/export-excel";
import { useUser } from "@/components/UserContext";
import { useHrManagementGuard } from "@/lib/useHrManagementGuard";
import { getHrSubmoduleConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { DashGrid, DashCol, DashPanel, StatStrip, DashPill } from "@/components/dashboard/DashKit";

interface EngineerRow {
  engineerId: number;
  engineerName: string;
  totalActivities: number;
  completed: number;
  completionRate: number;
  avgDurationMin: number | null;
}

interface PeopleInsights {
  generatedAt: string;
  kpis: {
    headcount: number;
    inactiveOrBaja: number;
    turnoverPct: number;
    hires12m: number;
    punctualityPct: number;
    lateEvents30d: number;
    lunchLate30d: number;
    avgDailyPresent: number;
    openAttendanceDays: number;
    pendingLeaves: number;
    approvedLeavesThisMonth: number;
    avgPerformanceRating: number;
    reviewsCount: number;
  };
  trends: { present14d: Array<{ date: string; count: number }> };
  distributions: { byDepartment: Array<{ name: string; count: number }> };
  workloadTop: Array<{
    userId: number;
    nombre: string;
    department: string;
    daysPresent: number;
    avgMinutes: number;
    lateCount: number;
  }>;
  lateLeaders: Array<{
    userId: number;
    nombre: string;
    lateCount: number;
    daysPresent: number;
  }>;
  pendingLeaveQueue: Array<{
    id: number;
    type: string;
    days: number;
    startDate: string;
    user: { id: number; nombre: string };
    createdAt: string;
  }>;
  recentReviews: Array<{
    id: number;
    period: string;
    overallRating: number;
    status: string;
    user: { id: number; nombre: string };
    reviewer: { id: number; nombre: string };
    reviewDate: string;
  }>;
  alerts: Array<{ severity: "warning" | "danger"; message: string }>;
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  VACATION: "Vacaciones",
  SICK: "Enfermedad",
  PERSONAL: "Personal",
  MATERNITY: "Maternidad",
  PATERNITY: "Paternidad",
  BEREAVEMENT: "Duelo",
  UNPAID: "Sin goce de sueldo",
};

const REVIEW_PERIOD_LABEL: Record<string, string> = {
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  SEMI_ANNUAL: "Semestral",
  ANNUAL: "Anual",
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviada",
  ACKNOWLEDGED: "Recibida",
};

const nf1 = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function days(n: number): string {
  return n === 1 ? "1 día" : `${n} días`;
}

function shortDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const readable = text.trim().startsWith("<") ? "" : text;
    throw new Error(readable || (res.status === 403 ? "No tienes permiso para ver estos indicadores." : "El servidor no respondió. Intenta de nuevo en unos minutos."));
  }
  return res.json();
}

export default function HrKpisPage() {
  const { user } = useUser();
  useHrManagementGuard();
  const viewCfg = useMemo(() => getHrSubmoduleConfig(user, "kpis"), [user]);
  const token = user?.token ?? "";

  const [insights, setInsights] = useState<PeopleInsights | null>(null);
  const [engineers, setEngineers] = useState<EngineerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const deferredQ = useDeferredValue(searchQ);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [dash, engData] = await Promise.all([
        apiFetch("hr/dashboard", token),
        apiFetch("analytics/bi/engineers?limit=15", token).catch(() => []),
      ]);
      setInsights(dash as PeopleInsights);
      setEngineers(Array.isArray(engData) ? engData : []);
      setError(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar los indicadores de personas."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const avgCompletion = useMemo(() => engineers.length
    ? Math.round(engineers.reduce((s, e) => s + e.completionRate, 0) / engineers.length)
    : 0, [engineers]);

  const visibleEngineers = useMemo(() => {
    const q = deferredQ.trim().toLowerCase();
    if (!q) return engineers;
    return engineers.filter((e) => e.engineerName.toLowerCase().includes(q));
  }, [engineers, deferredQ]);

  const presenceMax = useMemo(
    () => Math.max(1, ...(insights?.trends.present14d ?? []).map((x) => x.count)),
    [insights],
  );

  const columns: Column<EngineerRow>[] = [
    { key: "engineerName", label: "Ingeniero" },
    { key: "totalActivities", label: "Órdenes (90 días)", width: 140, numeric: true, align: "right", render: (r) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.totalActivities}</span> },
    { key: "completed", label: "Cerradas", width: 100, numeric: true, align: "right", render: (r) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.completed}</span> },
    {
      key: "completionRate", label: "Cierre",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
          <div aria-hidden="true" style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${Math.min(100, Math.max(0, r.completionRate))}%`,
              background: r.completionRate >= 80 ? "var(--success)" : r.completionRate >= 60 ? "var(--primary)" : "var(--warning)",
              borderRadius: 3,
            }} />
          </div>
          <Tag size="sm" variant={r.completionRate >= 80 ? "positive" : r.completionRate >= 60 ? "accent" : "warning"}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.completionRate}%</span>
          </Tag>
        </div>
      ),
      width: 190,
    },
    {
      key: "avgDurationMin", label: "Minutos por orden", width: 150, numeric: true, align: "right",
      render: (r) => r.avgDurationMin != null
        ? <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.avgDurationMin} min</span>
        : <span style={{ color: "var(--text-tertiary)" }}>Sin dato</span>,
    },
  ];

  const k = insights?.kpis;
  const initialLoading = loading && !insights;

  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        title="Indicadores de personas"
        subtitle={viewCfg.subtitle || "Asistencia, puntualidad, carga de trabajo, rotación, permisos y productividad en campo."}
        meta={insights?.generatedAt ? (
          <Tag variant="default" size="sm">
            Actualizado {new Date(insights.generatedAt).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </Tag>
        ) : undefined}
        actions={
          <Button variant="ghost" size="sm" loading={loading && !!insights} onClick={() => void load()}>Actualizar</Button>
        }
      />

      <HrModuleRail />

      {initialLoading && <SkeletonList rows={5} />}

      {error && insights && (
        <InlineAlert
          variant="warning"
          title="No se pudo actualizar"
          message={`${error} Mostramos la última información cargada.`}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 12 }}
        />
      )}
      {error && !insights && !loading && (
        <InlineAlert
          variant="danger"
          title="No se pudieron cargar los indicadores"
          message={error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
        />
      )}

      {insights && k && (
        <>
          <StatStrip
            stats={[
              { label: "Plantilla activa", value: k.headcount, sub: `${k.hires12m} altas en 12 meses`, big: true },
              { label: "Rotación", value: `${nf1.format(k.turnoverPct)}%`, tone: k.turnoverPct > 15 ? "warning" : "positive", sub: `${k.inactiveOrBaja} bajas o inactivas` },
              { label: "Puntualidad (30 días)", value: `${nf1.format(k.punctualityPct)}%`, tone: k.punctualityPct >= 90 ? "positive" : "warning" },
              { label: "Presentes por día", value: nf1.format(k.avgDailyPresent), tone: "accent" },
              { label: "Permisos por aprobar", value: k.pendingLeaves, tone: k.pendingLeaves ? "warning" : "default" },
              { label: "Cierre de órdenes", value: `${avgCompletion}%`, sub: "Promedio de ingenieros, 90 días" },
            ]}
          />

          {insights.alerts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "16px 0" }}>
              {insights.alerts.map((a) => (
                <InlineAlert key={a.message} variant={a.severity === "danger" ? "danger" : "warning"} message={a.message} dense />
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <DashGrid>
              <DashCol span={6}>
                <DashPanel title="Presencia en los últimos 14 días" subtitle="Personas con jornada registrada por día">
                  <ol aria-label="Personas presentes por día" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "flex-end", gap: 4, height: 72 }}>
                    {insights.trends.present14d.map((p) => (
                      <li
                        key={p.date}
                        title={`${shortDay(p.date)}: ${p.count}`}
                        aria-label={`${shortDay(p.date)}: ${p.count} ${p.count === 1 ? "persona" : "personas"}`}
                        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                      >
                        <div aria-hidden="true" style={{
                          width: "100%",
                          height: `${Math.max(4, (p.count / presenceMax) * 56)}px`,
                          background: "var(--primary)",
                          borderRadius: 3,
                          opacity: p.count ? 1 : 0.25,
                        }} />
                      </li>
                    ))}
                  </ol>
                  <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <DashPill tone={k.lateEvents30d ? "warning" : "positive"}>Tardanzas (30 días): {k.lateEvents30d}</DashPill>
                    <DashPill tone={k.lunchLate30d ? "warning" : "neutral"}>Regresos tarde de comida: {k.lunchLate30d}</DashPill>
                    <DashPill tone="accent">Calificación promedio: {nf1.format(k.avgPerformanceRating)} de 5</DashPill>
                  </div>
                </DashPanel>
              </DashCol>
              <DashCol span={6}>
                <DashPanel title="Personas por área" subtitle="Plantilla activa">
                  {insights.distributions.byDepartment.length === 0 ? (
                    <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Nadie tiene área asignada todavía.</span>
                  ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      {insights.distributions.byDepartment.slice(0, 8).map((d) => (
                        <li key={d.name} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 140px) 1fr 36px", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 12.5, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.name}>{d.name}</span>
                          <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${(d.count / Math.max(1, k.headcount)) * 100}%`,
                              background: "var(--primary)", borderRadius: 3,
                            }} />
                          </div>
                          <span style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </DashPanel>
              </DashCol>
              <DashCol span={6}>
                <DashPanel title="Mayor carga de trabajo" subtitle="Horas promedio por día, últimos 30 días">
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10, maxHeight: 240, overflowY: "auto" }}>
                    {insights.workloadTop.map((w) => (
                      <li key={w.userId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <Link href={`/erp/hr/${w.userId}`} style={{ fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}>{w.nombre}</Link>
                          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{[w.department, `${days(w.daysPresent)} con asistencia`].filter(Boolean).join(" · ")}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{nf1.format(w.avgMinutes / 60)} h</strong>
                          {w.lateCount > 0 && (
                            <div style={{ fontSize: 12, color: "var(--state-warning-text)" }}>
                              {w.lateCount === 1 ? "1 tardanza" : `${w.lateCount} tardanzas`}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                    {!insights.workloadTop.length && <li style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin asistencia en los últimos 30 días.</li>}
                  </ul>
                </DashPanel>
              </DashCol>
              <DashCol span={6}>
                <DashPanel title="Permisos por aprobar" subtitle="Solicitudes en espera de Recursos Humanos">
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto" }}>
                    {insights.pendingLeaveQueue.map((l) => (
                      <li key={l.id} style={{ fontSize: 13, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                        <strong>{l.user.nombre}</strong> · {LEAVE_TYPE_LABEL[l.type] ?? "Otro permiso"} · {days(l.days)}
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                          Desde el {new Date(l.startDate).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
                        </div>
                      </li>
                    ))}
                    {!insights.pendingLeaveQueue.length && <li style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No hay permisos pendientes.</li>}
                  </ul>
                  {insights.pendingLeaveQueue.length > 0 && (
                    <Link href="/erp/hr" style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: "var(--primary)", padding: "6px 0" }}>
                      Revisar en Plantilla → Permisos
                    </Link>
                  )}
                </DashPanel>
              </DashCol>
            </DashGrid>
          </div>

          <Section title="Productividad en campo" subtitle="Órdenes de trabajo de los últimos 90 días">
            <FilterToolbar
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar ingeniero…", ariaLabel: "Buscar ingeniero" }}
              onClear={() => setSearchQ("")}
              resultCount={visibleEngineers.length}
              rightActions={engineers.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft="⬇"
                  onClick={() => exportToExcel(visibleEngineers, [
                    { key: "engineerName", label: "Ingeniero" },
                    { key: "totalActivities", label: "Órdenes (90 días)" },
                    { key: "completed", label: "Cerradas" },
                    { key: "completionRate", label: "% de cierre", format: (v) => `${String(v)}%` },
                    { key: "avgDurationMin", label: "Minutos promedio por orden" },
                  ], "indicadores-ingenieros")}
                >
                  Exportar a Excel
                </Button>
              ) : undefined}
            />
            <DataTable
              columns={columns}
              rows={visibleEngineers}
              rowKey={(r) => r.engineerId}
              ariaLabel="Productividad por ingeniero"
              emptyTitle={searchQ ? "Ningún ingeniero coincide" : "Sin datos"}
              emptyDescription={searchQ ? "Prueba con otro nombre." : "No hay órdenes cerradas en los últimos 90 días."}
            />
          </Section>

          {insights.recentReviews.length > 0 && (
            <Section
              title="Evaluaciones recientes"
              subtitle={`${k.reviewsCount} ${k.reviewsCount === 1 ? "evaluación" : "evaluaciones"} en total · promedio ${nf1.format(k.avgPerformanceRating)} de 5`}
            >
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {insights.recentReviews.map((r) => (
                  <li key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>
                      <strong>{r.user.nombre}</strong> · {REVIEW_PERIOD_LABEL[r.period] ?? "Otro periodo"} · evaluó {r.reviewer.nombre}
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <Tag size="sm" variant={r.overallRating >= 4 ? "positive" : r.overallRating >= 3 ? "accent" : "warning"}>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{nf1.format(r.overallRating)} de 5</span>
                      </Tag>
                      <Tag size="sm" variant="default">{REVIEW_STATUS_LABEL[r.status] ?? "Sin estado"}</Tag>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </>
  );
}
