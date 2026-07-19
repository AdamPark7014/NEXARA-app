"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { useCrmManagerGuard } from "@/lib/useCrmManagerGuard";
import { getCrmManagerSubmoduleConfig } from "@/lib/section-views";

interface Metrics {
  totalRevenue: number;
  opportunityCount: number;
  projectCount: number;
  averageMargin: number;
  conversionRate: number;
  pipelineValue: number;
  closedProjects: number;
  activeClients: number;
  wonCount?: number;
  lostCount?: number;
  avgDealSize?: number;
  avgDaysToClose?: number;
}

interface VendorStat {
  userId: number;
  userName: string;
  revenue: number;
  opportunities: number;
  margin: number;
  conversionRate: number;
  attainmentRevenue: number;
  status: "on-track" | "risk" | "off-track";
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

type Period = "week" | "month" | "year";

export default function ReportsPage() {
  const { user } = useUser();
  const cfg = useCrmManagerGuard();
  const viewCfg = useMemo(() => getCrmManagerSubmoduleConfig(user, "reports"), [user]);
  const token = user?.token ?? "";

  const [period, setPeriod] = useState<Period>("month");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [vendors, setVendors] = useState<VendorStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [m, v] = await Promise.all([
        apiFetch(`ventas/reportes/metricas?period=${period}`, token),
        apiFetch(`ventas/reportes/vendedores?period=${period}`, token).catch(() => []),
      ]);
      setMetrics(m);
      setVendors(Array.isArray(v) ? v : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar reportes comerciales");
    } finally { setLoading(false); }
  }, [token, period]);

  useEffect(() => { void load(); }, [load]);

  if (!cfg.canAccess) return null;

  const statusVariant = (s: string): "positive" | "warning" | "danger" =>
    s === "on-track" ? "positive" : s === "risk" ? "warning" : "danger";

  const visibleVendors = useMemo(() => {
    let rows = vendors;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((v) => v.userName.toLowerCase().includes(q));
    }
    if (filterStatus) rows = rows.filter((v) => v.status === filterStatus);
    return rows;
  }, [vendors, searchQ, filterStatus]);

  const columns: Column<VendorStat>[] = [
    { key: "userName", label: "Ejecutivo" },
    { key: "revenue", label: "Ingreso", render: (v) => <Money value={v.revenue} />, width: 120 },
    { key: "opportunities", label: "Oportunidades", width: 110 },
    { key: "conversionRate", label: "Conversión", render: (v) => <Tag variant={v.conversionRate >= 30 ? "positive" : v.conversionRate >= 15 ? "warning" : "danger"}>{v.conversionRate}%</Tag>, width: 110 },
    {
      key: "attainmentRevenue", label: "% cuota",
      render: (v) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 130 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, v.attainmentRevenue)}%`, background: v.status === "on-track" ? "var(--success)" : v.status === "risk" ? "var(--primary)" : "var(--warning)", borderRadius: 3 }} />
          </div>
          <Tag variant={statusVariant(v.status)}>{v.attainmentRevenue.toFixed(0)}%</Tag>
        </div>
      ),
      width: 180,
    },
    { key: "status", label: "Semáforo", render: (v) => <Tag variant={statusVariant(v.status)}>{v.status === "on-track" ? "En meta" : v.status === "risk" ? "En riesgo" : "Fuera de meta"}</Tag>, width: 130 },
  ];

  const wonCount = metrics?.wonCount ?? 0;
  const lostCount = metrics?.lostCount ?? 0;
  const totalClosed = wonCount + lostCount;
  const winRate = totalClosed > 0 ? +((wonCount / totalClosed) * 100).toFixed(1) : metrics?.conversionRate ?? 0;

  const periodLabel = period === "month" ? "Este mes" : period === "week" ? "Esta semana" : "Este año";

  return (
    <>
      <PageHeader
        eyebrow="CRM · Equipo y métricas"
        title={viewCfg.title}
        subtitle={viewCfg.subtitle}
        actions={
          <>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
            >
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
              <option value="year">Este año</option>
            </select>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
          </>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando reportes…" description="Calculando métricas comerciales." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && metrics && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Ingreso cerrado" value={<Money value={metrics.totalRevenue} compact />} hint={periodLabel} variant="positive" icon="💰" />
            <KpiCard label="Pipeline abierto" value={<Money value={metrics.pipelineValue} compact />} hint={`${metrics.opportunityCount} oportunidades activas`} icon="📊" variant="accent" />
            <KpiCard label="Win rate" value={`${winRate}%`} variant={winRate >= 30 ? "positive" : winRate >= 15 ? "warning" : "danger"} icon="🎯" hint={totalClosed > 0 ? `${wonCount} ganadas / ${lostCount} perdidas` : "Tasa de cierre"} />
            <KpiCard label="Margen promedio" value={<Money value={metrics.averageMargin} compact />} icon="📈" />
            <KpiCard label="Clientes activos" value={metrics.activeClients} icon="🤝" variant={metrics.activeClients > 0 ? "accent" : "default"} />
            <KpiCard label="Proyectos cerrados" value={metrics.closedProjects} variant={metrics.closedProjects > 0 ? "positive" : "default"} icon="✅" hint={periodLabel} />
            {metrics.avgDealSize !== undefined && (
              <KpiCard label="Ticket promedio" value={<Money value={metrics.avgDealSize} compact />} icon="🏷️" hint="Por oportunidad ganada" />
            )}
            {metrics.avgDaysToClose !== undefined && (
              <KpiCard label="Días promedio cierre" value={metrics.avgDaysToClose} icon="⏱️" hint="Desde creación a cerrado" />
            )}
          </div>

          {/* Won/lost funnel */}
          {totalClosed > 0 && (
            <Section eyebrow="Embudo" title="Ganadas vs. Perdidas" subtitle={periodLabel}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: "14px 18px", borderRadius: 10, background: "color-mix(in srgb, var(--success) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--success) 30%, var(--border))" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--success)", textTransform: "uppercase", marginBottom: 4 }}>Ganadas</div>
                  <div style={{ fontFamily: "var(--nx-font-display)", fontSize: 28, fontWeight: 700 }}>{wonCount}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{winRate}% del total cerrado</div>
                </div>
                <div style={{ padding: "14px 18px", borderRadius: 10, background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 25%, var(--border))" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--danger)", textTransform: "uppercase", marginBottom: 4 }}>Perdidas</div>
                  <div style={{ fontFamily: "var(--nx-font-display)", fontSize: 28, fontWeight: 700 }}>{lostCount}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{(100 - winRate).toFixed(1)}% del total cerrado</div>
                </div>
              </div>
            </Section>
          )}

          <Section title="Desempeño por ejecutivo">
            {vendors.length > 0 && (
              <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                {vendors.slice(0, 8).map((v) => (
                  <div key={v.userId} style={{ display: "grid", gridTemplateColumns: "140px 1fr 60px 64px", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.userName}</span>
                    <div style={{ position: "relative", height: 16, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, v.attainmentRevenue)}%`, background: v.status === "on-track" ? "var(--success)" : v.status === "risk" ? "var(--warning)" : "var(--danger)", borderRadius: 4, opacity: 0.7 }} />
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, textAlign: "right" }}>{v.attainmentRevenue.toFixed(0)}%</span>
                    <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 5, textAlign: "center", background: v.status === "on-track" ? "color-mix(in srgb, var(--success) 15%, transparent)" : v.status === "risk" ? "color-mix(in srgb, var(--warning) 15%, transparent)" : "color-mix(in srgb, var(--danger) 12%, transparent)", color: v.status === "on-track" ? "var(--success)" : v.status === "risk" ? "var(--warning)" : "var(--danger)", fontWeight: 600 }}>
                      {v.status === "on-track" ? "✓" : v.status === "risk" ? "!" : "✗"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <FilterToolbar
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por ejecutivo…" }}
              selects={[
                {
                  label: "Semáforo",
                  value: filterStatus,
                  onChange: setFilterStatus,
                  options: [
                    { value: "on-track", label: "En meta" },
                    { value: "risk", label: "En riesgo" },
                    { value: "off-track", label: "Fuera de meta" },
                  ],
                  allowAll: true,
                },
              ]}
              onClear={() => { setSearchQ(""); setFilterStatus(""); }}
              resultCount={loading ? null : visibleVendors.length}
              rightActions={vendors.length > 0 ? (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleVendors, [
                  { key: "userName", label: "Ejecutivo" },
                  { key: "revenue", label: "Ingreso (MXN)" },
                  { key: "opportunities", label: "Oportunidades" },
                  { key: "conversionRate", label: "Conversión (%)", format: (v) => `${String(v)}%` },
                  { key: "attainmentRevenue", label: "% Cuota", format: (v) => `${Number(v).toFixed(1)}%` },
                  { key: "status", label: "Semáforo" },
                ], `reporte-ejecutivos-${period}`)}>Excel</Button>
              ) : undefined}
            />
            <DataTable
              columns={columns}
              rows={visibleVendors}
              rowKey={(v) => v.userId}
              emptyTitle="Sin datos"
              emptyDescription="No hay actividad comercial registrada en este periodo."
            />
          </Section>
        </>
      )}
    </>
  );
}
