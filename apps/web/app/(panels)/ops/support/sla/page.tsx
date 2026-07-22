"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";
import { DashGrid, DashCol, DashPanel, StatStrip, DashPill } from "@/components/dashboard/DashKit";

interface Breach {
  id: number;
  anNumber?: string;
  titulo?: string;
  type: "response" | "response_open" | "resolution";
  priority?: string;
  hoursLate: number;
}

interface SlaInsights {
  total: number;
  stillOpen: number;
  responseSla: { onTime: number; late: number; compliancePct: number; avgHours: number };
  resolutionSla: { onTime: number; late: number; compliancePct: number; avgHours: number };
  breaches: Breach[];
  bySeverity: { high: number; medium: number; low: number };
  mttr: { meanHours: number; medianHours: number; sampleSize: number };
  backlog: {
    open: number;
    aging: { h0_24: number; d1_3: number; d3_7: number; d7_plus: number };
    oldest: Array<{
      id: number;
      anNumber?: string | null;
      titulo?: string | null;
      prioridad?: string | null;
      ageHours: number | null;
      assignee: string | null;
    }>;
  };
  techRanking: Array<{ userId: number; nombre: string; closed: number; mttrHours: number }>;
  trends: {
    opened14d: Array<{ date: string; count: number }>;
    closed14d: Array<{ date: string; count: number }>;
  };
  inboxByStatus: Record<string, number>;
  alerts: Array<{ severity: string; message: string }>;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function SupportSlaPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "support-sla"), [user]);
  const router = useRouter();
  const token = user?.token ?? "";

  // SLA — solo managers/soporte. ing_campo ve su dashboard operativo.
  useEffect(() => {
    const v2 = resolveV2RoleKey(user);
    if (!user?.isSuperAdmin && v2 === ROLES.ING_CAMPO) router.replace("/ops/dashboard");
  }, [user, router]);

  const [stats, setStats] = useState<SlaInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterType, setFilterType] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const from = new Date(Date.now() - 30 * 86400000).toISOString();
      const data = await apiFetch(`sla/insights?from=${from}`, token);
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar cumplimiento de SLA");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const typeLabel: Record<string, string> = { response: "Respuesta", response_open: "Respuesta (abierto)", resolution: "Resolución" };

  const visibleBreaches = useMemo(() => {
    if (!stats) return [];
    let rows = stats.breaches;
    if (filterPriority) rows = rows.filter((b) => b.priority === filterPriority);
    if (filterType) rows = rows.filter((b) => b.type === filterType);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((b) =>
        (b.anNumber ?? "").toLowerCase().includes(q) ||
        (b.titulo ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [stats, searchQ, filterPriority, filterType]);

  const columns: Column<Breach>[] = [
    { key: "anNumber", label: "Ticket", render: (b) => <Tag variant="accent">{b.anNumber ?? `#${b.id}`}</Tag>, width: 100 },
    { key: "titulo", label: "Título", accessor: (b) => b.titulo ?? "—" },
    { key: "priority", label: "Prioridad", render: (b) => <Tag variant={b.priority === "Alta" ? "danger" : b.priority === "Media" ? "warning" : "default"}>{b.priority ?? "—"}</Tag>, width: 100 },
    { key: "type", label: "Tipo de SLA", accessor: (b) => typeLabel[b.type] ?? b.type, width: 140 },
    { key: "hoursLate", label: "Horas de retraso", render: (b) => <span style={{ fontWeight: 700, color: "var(--danger)" }}>{b.hoursLate}h</span>, width: 130 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Soporte"
        title="SLA Command Center"
        subtitle="Cumplimiento, MTTR, backlog aging, productividad por técnico e inbox del portal."
        actions={<Button variant="ghost" onClick={() => void load()}>Actualizar</Button>}
      />

      {loading && <EmptyState icon="⏳" title="Cargando SLA…" description="Calculando cumplimiento de tickets." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && stats && (
        <>
          <StatStrip
            stats={[
              { label: "Tickets 30d", value: stats.total, big: true },
              { label: "SLA respuesta", value: `${stats.responseSla.compliancePct}%`, tone: stats.responseSla.compliancePct >= 90 ? "positive" : "warning" },
              { label: "SLA resolución", value: `${stats.resolutionSla.compliancePct}%`, tone: stats.resolutionSla.compliancePct >= 90 ? "positive" : "warning" },
              { label: "MTTR mediano", value: `${stats.mttr.medianHours}h`, sub: `media ${stats.mttr.meanHours}h · n=${stats.mttr.sampleSize}`, tone: "accent" },
              { label: "Backlog", value: stats.backlog.open, tone: stats.backlog.aging.d7_plus ? "danger" : "default" },
              { label: "Inbox NEW", value: stats.inboxByStatus?.NEW ?? 0, tone: (stats.inboxByStatus?.NEW ?? 0) ? "warning" : "positive" },
            ]}
          />

          {stats.alerts?.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "16px 0" }}>
              {stats.alerts.map((a) => (
                <div key={a.message} style={{
                  padding: "10px 14px", borderRadius: 10, fontSize: 13,
                  background: a.severity === "danger" ? "var(--state-danger-bg)" : "var(--state-warning-bg)",
                  border: `1px solid ${a.severity === "danger" ? "var(--state-danger-border)" : "var(--state-warning-border)"}`,
                  color: a.severity === "danger" ? "var(--state-danger-text)" : "var(--state-warning-text)",
                }}>
                  {a.message}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <DashGrid>
              <DashCol span={6}>
                <DashPanel title="Backlog aging" subtitle="Tickets abiertos por antigüedad">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { label: "<24h", value: stats.backlog.aging.h0_24 },
                      { label: "1–3d", value: stats.backlog.aging.d1_3 },
                      { label: "3–7d", value: stats.backlog.aging.d3_7 },
                      { label: ">7d", value: stats.backlog.aging.d7_plus },
                    ].map((b) => (
                      <div key={b.label} style={{ padding: 12, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{b.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{b.value}</div>
                      </div>
                    ))}
                  </div>
                </DashPanel>
              </DashCol>
              <DashCol span={6}>
                <DashPanel title="Aperturas vs cierres · 14d" subtitle="Flujo neto de tickets">
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72 }}>
                    {stats.trends.opened14d.map((p, i) => {
                      const closed = stats.trends.closed14d[i]?.count ?? 0;
                      const max = Math.max(1, ...stats.trends.opened14d.map((x) => x.count), ...stats.trends.closed14d.map((x) => x.count));
                      return (
                        <div key={p.date} style={{ flex: 1, display: "flex", gap: 1, alignItems: "flex-end" }} title={`${p.date}: +${p.count} / −${closed}`}>
                          <div style={{ flex: 1, height: `${Math.max(2, (p.count / max) * 64)}px`, background: "var(--warning)", borderRadius: 2 }} />
                          <div style={{ flex: 1, height: `${Math.max(2, (closed / max) * 64)}px`, background: "var(--success)", borderRadius: 2 }} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 12, fontSize: 11, color: "var(--text-tertiary)" }}>
                    <span>Aperturas</span><span>Cierres</span>
                  </div>
                </DashPanel>
              </DashCol>
              <DashCol span={6}>
                <DashPanel title="Ranking técnicos" subtitle="Cierres y MTTR">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                    {stats.techRanking.map((t) => (
                      <div key={t.userId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                        <strong>{t.nombre}</strong>
                        <span style={{ color: "var(--text-tertiary)" }}>{t.closed} cerrados · MTTR {t.mttrHours}h</span>
                      </div>
                    ))}
                    {!stats.techRanking.length && <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin cierres en el periodo</span>}
                  </div>
                </DashPanel>
              </DashCol>
              <DashCol span={6}>
                <DashPanel title="Backlog más viejo" subtitle="Priorizar atención">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                    {stats.backlog.oldest.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => router.push(`/ops/activities/${t.id}`)}
                        style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, gap: 8 }}>
                          <span><DashPill tone="accent">{t.anNumber ?? `#${t.id}`}</DashPill> {t.titulo}</span>
                          <span style={{ color: "var(--danger)", whiteSpace: "nowrap" }}>{t.ageHours ?? "—"}h</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </DashPanel>
              </DashCol>
            </DashGrid>
          </div>

          {/* SLA compliance visual bars */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "20px 0" }}>
            {[
              { label: "Respuesta", pct: stats.responseSla.compliancePct, avg: `${stats.responseSla.avgHours}h prom.`, late: stats.responseSla.late },
              { label: "Resolución", pct: stats.resolutionSla.compliancePct, avg: `${stats.resolutionSla.avgHours}h prom.`, late: stats.resolutionSla.late },
            ].map((item) => (
              <div key={item.label} style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>SLA {item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: item.pct >= 90 ? "var(--success)" : "var(--warning)" }}>{item.pct}%</span>
                </div>
                <div style={{ position: "relative", height: 10, background: "var(--surface-2)", borderRadius: 5, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${item.pct}%`, background: item.pct >= 90 ? "var(--success)" : item.pct >= 70 ? "var(--warning)" : "var(--danger)", borderRadius: 5 }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", gap: 12 }}>
                  <span>{item.avg}</span>
                  <span style={{ color: "var(--danger)" }}>{item.late} incumplimientos</span>
                </div>
              </div>
            ))}
          </div>

          {/* Severity distribution */}
          {(stats.bySeverity.high + stats.bySeverity.medium + stats.bySeverity.low) > 0 && (() => {
            const total = stats.bySeverity.high + stats.bySeverity.medium + stats.bySeverity.low;
            const rows = [
              { label: "Alta", count: stats.bySeverity.high, color: "var(--danger)" },
              { label: "Media", count: stats.bySeverity.medium, color: "var(--warning)" },
              { label: "Baja", count: stats.bySeverity.low, color: "var(--primary)" },
            ].filter((r) => r.count > 0);
            return (
              <div style={{ marginBottom: 18, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por severidad</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {rows.map((r) => (
                    <div key={r.label} style={{ display: "grid", gridTemplateColumns: "60px 1fr 36px", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(r.count / total) * 100}%`, background: r.color, borderRadius: 3, transition: "width .4s" }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <Section title={`${visibleBreaches.length} incumplimientos recientes`} subtitle="Ordenados por horas de retraso, los más críticos primero.">
            <FilterToolbar
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por ticket o título…" }}
              selects={[
                {
                  label: "Prioridad",
                  value: filterPriority,
                  onChange: setFilterPriority,
                  options: [{ value: "Alta", label: "Alta" }, { value: "Media", label: "Media" }, { value: "Baja", label: "Baja" }],
                  allowAll: true,
                },
                {
                  label: "Tipo SLA",
                  value: filterType,
                  onChange: setFilterType,
                  options: [
                    { value: "response", label: "Respuesta" },
                    { value: "response_open", label: "Respuesta (abierto)" },
                    { value: "resolution", label: "Resolución" },
                  ],
                  allowAll: true,
                },
              ]}
              onClear={() => { setSearchQ(""); setFilterPriority(""); setFilterType(""); }}
              resultCount={visibleBreaches.length}
              rightActions={stats.breaches.length > 0 ? (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleBreaches, [
                  { key: "anNumber", label: "Ticket" },
                  { key: "titulo", label: "Título" },
                  { key: "priority", label: "Prioridad" },
                  { key: "type", label: "Tipo SLA", format: (v) => typeLabel[String(v)] ?? String(v) },
                  { key: "hoursLate", label: "Horas retraso" },
                ], "sla-incumplimientos")}>Excel</Button>
              ) : undefined}
            />
            <DataTable
              columns={columns}
              rows={visibleBreaches}
              rowKey={(b) => `${b.id}-${b.type}`}
              onRowClick={(b) => router.push(`/ops/activities/${b.id}`)}
              emptyTitle="Sin incumplimientos"
              emptyDescription={searchQ || filterPriority || filterType ? "Sin resultados para ese filtro." : "Ningún ticket rompió su SLA en los últimos 30 días. 🎉"}
            />
          </Section>
        </>
      )}
    </>
  );
}
