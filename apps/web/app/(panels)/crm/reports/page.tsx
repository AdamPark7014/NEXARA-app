"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
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

  const columns: Column<VendorStat>[] = [
    { key: "userName", label: "Ejecutivo" },
    { key: "revenue", label: "Ingreso", render: (v) => <Money value={v.revenue} />, width: 120 },
    { key: "opportunities", label: "Oportunidades", width: 110 },
    { key: "conversionRate", label: "Conversión", render: (v) => `${v.conversionRate}%`, width: 100 },
    { key: "attainmentRevenue", label: "% cuota", render: (v) => <Tag variant={statusVariant(v.status)}>{v.attainmentRevenue.toFixed(0)}%</Tag>, width: 100 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Equipo y métricas"
        title={viewCfg.title}
        subtitle={viewCfg.subtitle}
        actions={
          <>
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Ingreso cerrado" value={`$${(metrics.totalRevenue / 1000000).toFixed(1)}M`} variant="positive" icon="💰" />
            <KpiCard label="Pipeline abierto" value={`$${(metrics.pipelineValue / 1000000).toFixed(1)}M`} icon="📊" />
            <KpiCard label="Conversión" value={`${metrics.conversionRate}%`} icon="🎯" />
            <KpiCard label="Margen promedio" value={`$${(metrics.averageMargin / 1000).toFixed(0)}k`} icon="📈" />
            <KpiCard label="Clientes nuevos" value={metrics.activeClients} icon="🤝" />
            <KpiCard label="Proyectos cerrados" value={metrics.closedProjects} icon="✅" />
          </div>

          <Section title="Desempeño por ejecutivo">
            <DataTable columns={columns} rows={vendors} rowKey={(v) => v.userId} emptyTitle="Sin datos" emptyDescription="No hay actividad comercial registrada en este periodo." />
          </Section>
        </>
      )}
    </>
  );
}
