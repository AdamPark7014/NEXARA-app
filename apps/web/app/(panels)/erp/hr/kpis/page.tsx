"use client";

/**
 * ERP · People Intelligence
 * KPIs de plantilla, asistencia, puntualidad, carga, leaves y productividad OT.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import HrModuleRail from "@/components/hr/HrModuleRail";
import { exportToExcel } from "@/lib/export-excel";
import { useUser } from "@/components/UserContext";
import { useHrManagementGuard } from "@/lib/useHrManagementGuard";
import { getHrSubmoduleConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
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

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
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

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [dash, engData] = await Promise.all([
        apiFetch("hr/dashboard", token),
        apiFetch("analytics/bi/engineers?limit=15", token).catch(() => []),
      ]);
      setInsights(dash as PeopleInsights);
      setEngineers(Array.isArray(engData) ? engData : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar KPIs de personas");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const avgCompletion = engineers.length
    ? Math.round(engineers.reduce((s, e) => s + e.completionRate, 0) / engineers.length)
    : 0;

  const visibleEngineers = useMemo(() => {
    if (!searchQ.trim()) return engineers;
    const q = searchQ.toLowerCase();
    return engineers.filter((e) => e.engineerName.toLowerCase().includes(q));
  }, [engineers, searchQ]);

  const columns: Column<EngineerRow>[] = [
    { key: "engineerName", label: "Ingeniero" },
    { key: "totalActivities", label: "OT (90d)", width: 80 },
    { key: "completed", label: "Cerradas", width: 80 },
    {
      key: "completionRate", label: "% cierre",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${r.completionRate}%`,
              background: r.completionRate >= 80 ? "var(--success)" : r.completionRate >= 60 ? "var(--primary)" : "var(--warning)",
              borderRadius: 3,
            }} />
          </div>
          <Tag variant={r.completionRate >= 80 ? "positive" : r.completionRate >= 60 ? "accent" : "warning"}>
            {r.completionRate}%
          </Tag>
        </div>
      ),
      width: 180,
    },
    { key: "avgDurationMin", label: "Min/OT", render: (r) => (r.avgDurationMin != null ? `${r.avgDurationMin}m` : "—"), width: 70 },
  ];

  const k = insights?.kpis;

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title="People Intelligence"
        subtitle={viewCfg.subtitle || "Asistencia, puntualidad, carga laboral, rotación, permisos y productividad de campo."}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => void load()}>Actualizar</Button>
          </div>
        }
      />

      <HrModuleRail />

      {loading && <EmptyState title="Cargando KPIs…" description="Calculando métricas de personas." />}
      {!loading && error && (
        <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
      )}

      {!loading && !error && k && (
        <>
          <StatStrip
            stats={[
              { label: "Plantilla activa", value: k.headcount, sub: `${k.hires12m} altas 12m`, big: true },
              { label: "Rotación", value: `${k.turnoverPct}%`, tone: k.turnoverPct > 15 ? "warning" : "positive", sub: `${k.inactiveOrBaja} bajas/inact.` },
              { label: "Puntualidad 30d", value: `${k.punctualityPct}%`, tone: k.punctualityPct >= 90 ? "positive" : "warning" },
              { label: "Presentes/día", value: k.avgDailyPresent, tone: "accent" },
              { label: "Permisos pend.", value: k.pendingLeaves, tone: k.pendingLeaves ? "warning" : "default" },
              { label: "Cierre OT avg", value: `${avgCompletion}%`, sub: "Ingenieros 90d" },
            ]}
          />

          {insights!.alerts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "16px 0" }}>
              {insights!.alerts.map((a) => (
                <div
                  key={a.message}
                  style={{
                    padding: "10px 14px", borderRadius: 10, fontSize: 13,
                    background: "var(--state-warning-bg)",
                    border: "1px solid var(--state-warning-border)",
                    color: "var(--state-warning-text)",
                  }}
                >
                  {a.message}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <DashGrid>
              <DashCol span={6}>
                <DashPanel title="Presencia · 14d" subtitle="Personas con jornada registrada">
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 72 }}>
                    {insights!.trends.present14d.map((p) => {
                      const max = Math.max(1, ...insights!.trends.present14d.map((x) => x.count));
                      return (
                        <div key={p.date} title={`${p.date}: ${p.count}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <div style={{
                            width: "100%",
                            height: `${Math.max(4, (p.count / max) * 56)}px`,
                            background: "var(--primary)",
                            borderRadius: 3,
                            opacity: p.count ? 1 : 0.25,
                          }} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <DashPill tone={k.lateEvents30d ? "warning" : "positive"}>Tardanzas 30d: {k.lateEvents30d}</DashPill>
                    <DashPill tone={k.lunchLate30d ? "warning" : "neutral"}>Comida tarde: {k.lunchLate30d}</DashPill>
                    <DashPill tone="accent">Rating avg: {k.avgPerformanceRating}/5</DashPill>
                  </div>
                </DashPanel>
              </DashCol>
              <DashCol span={6}>
                <DashPanel title="Headcount por área" subtitle="Plantilla activa">
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {insights!.distributions.byDepartment.slice(0, 8).map((d) => (
                      <div key={d.name} style={{ display: "grid", gridTemplateColumns: "140px 1fr 32px", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.name}</span>
                        <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${(d.count / Math.max(1, k.headcount)) * 100}%`,
                            background: "var(--primary)", borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{d.count}</span>
                      </div>
                    ))}
                  </div>
                </DashPanel>
              </DashCol>
              <DashCol span={6}>
                <DashPanel title="Carga laboral · top" subtitle="Minutos promedio / día (30d)">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                    {insights!.workloadTop.map((w) => (
                      <div key={w.userId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, gap: 8 }}>
                        <div>
                          <Link href={`/erp/hr/${w.userId}`} style={{ fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}>{w.nombre}</Link>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{w.department} · {w.daysPresent}d</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong>{Math.round(w.avgMinutes / 60 * 10) / 10}h</strong>
                          {w.lateCount > 0 && <div style={{ fontSize: 10, color: "var(--warning)" }}>{w.lateCount} tarde</div>}
                        </div>
                      </div>
                    ))}
                    {!insights!.workloadTop.length && <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin asistencia en 30d</span>}
                  </div>
                </DashPanel>
              </DashCol>
              <DashCol span={6}>
                <DashPanel title="Cola de permisos" subtitle="Pendientes de aprobación">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                    {insights!.pendingLeaveQueue.map((l) => (
                      <div key={l.id} style={{ fontSize: 12.5, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                        <strong>{l.user.nombre}</strong> · {l.type} · {l.days}d
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          Desde {new Date(l.startDate).toLocaleDateString("es-MX")}
                        </div>
                      </div>
                    ))}
                    {!insights!.pendingLeaveQueue.length && <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin pendientes</span>}
                  </div>
                </DashPanel>
              </DashCol>
            </DashGrid>
          </div>

          <Section title="Productividad operativa · últimos 90 días">
            <FilterToolbar
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por ingeniero…" }}
              onClear={() => setSearchQ("")}
              resultCount={visibleEngineers.length}
              rightActions={engineers.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => exportToExcel(visibleEngineers, [
                    { key: "engineerName", label: "Ingeniero" },
                    { key: "totalActivities", label: "OT (90d)" },
                    { key: "completed", label: "Cerradas" },
                    { key: "completionRate", label: "% Cierre", format: (v) => `${String(v)}%` },
                    { key: "avgDurationMin", label: "Duración promedio (min)" },
                  ], "kpis-ingenieros")}
                >
                  Excel
                </Button>
              ) : undefined}
            />
            <DataTable
              columns={columns}
              rows={visibleEngineers}
              rowKey={(r) => r.engineerId}
              emptyTitle="Sin datos"
              emptyDescription="No hay actividades cerradas en los últimos 90 días."
            />
          </Section>

          {insights!.recentReviews.length > 0 && (
            <Section title="Evaluaciones recientes" subtitle={`${k.reviewsCount} reviews en total · avg ${k.avgPerformanceRating}/5`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {insights!.recentReviews.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span><strong>{r.user.nombre}</strong> · {r.period} · por {r.reviewer.nombre}</span>
                    <Tag variant={r.overallRating >= 4 ? "positive" : r.overallRating >= 3 ? "accent" : "warning"}>
                      {r.overallRating}/5 · {r.status}
                    </Tag>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );
}
