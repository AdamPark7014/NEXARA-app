"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Money, Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import { useUser } from "@/components/UserContext";
import { getBiSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES, type RoleKey } from "@/lib/rbac";

const ERP_BI_ROLES = new Set<RoleKey>([
  ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES,
  ROLES.COORD_VENTAS, ROLES.COORD_OPERACIONES,
]);

interface MarginRow { projectType: string; count: number; budget: number; cost: number; margin: number; marginPercent: number }
interface EngineerRow { engineerId: number; engineerName: string; totalActivities: number; completed: number; completionRate: number; avgEfficiency: number | null; avgDurationMin: number | null }
interface ClientRoiRow { clientId: number; clientName: string; projects: number; revenue: number; cost: number; roi: number }

type Period = "month" | "quarter" | "year";

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function BiPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getBiSectionConfig(user), [user]);
  const router = useRouter();
  const token = user?.token ?? "";

  useEffect(() => {
    if (!user) return;
    if (user.isSuperAdmin) return;
    const v2 = resolveV2RoleKey(user);
    if (v2 && !ERP_BI_ROLES.has(v2)) router.replace("/erp/dashboard");
  }, [user, router]);

  const [period, setPeriod] = useState<Period>("month");
  const [margin, setMargin] = useState<MarginRow[]>([]);
  const [engineers, setEngineers] = useState<EngineerRow[]>([]);
  const [clientsRoi, setClientsRoi] = useState<ClientRoiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [engSearch, setEngSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [m, e, c] = await Promise.all([
        apiFetch(`analytics/bi/margin-by-type?period=${period}`, token),
        apiFetch(`analytics/bi/engineers?limit=20&period=${period}`, token),
        apiFetch(`analytics/bi/clients-roi?limit=20&period=${period}`, token),
      ]);
      setMargin(Array.isArray(m) ? m : []);
      setEngineers(Array.isArray(e) ? e : []);
      setClientsRoi(Array.isArray(c) ? c : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar Business Intelligence");
    } finally { setLoading(false); }
  }, [token, period]);

  useEffect(() => { void load(); }, [load]);

  const totalMargin = margin.reduce((s, m) => s + m.margin, 0);
  const totalBudget = margin.reduce((s, m) => s + m.budget, 0);
  const avgMarginPct = margin.length > 0 ? +(margin.reduce((s, m) => s + m.marginPercent, 0) / margin.length).toFixed(1) : 0;
  const topClient = clientsRoi.length > 0 ? [...clientsRoi].sort((a, b) => b.roi - a.roi)[0] : null;
  const avgCompletion = engineers.length > 0 ? Math.round(engineers.reduce((s, e) => s + e.completionRate, 0) / engineers.length) : 0;

  const visibleEngineers = useMemo(() => {
    if (!engSearch.trim()) return engineers;
    const q = engSearch.toLowerCase();
    return engineers.filter((e) => e.engineerName.toLowerCase().includes(q));
  }, [engineers, engSearch]);

  const visibleClients = useMemo(() => {
    if (!clientSearch.trim()) return clientsRoi;
    const q = clientSearch.toLowerCase();
    return clientsRoi.filter((c) => c.clientName.toLowerCase().includes(q));
  }, [clientsRoi, clientSearch]);

  const marginCols: Column<MarginRow>[] = [
    { key: "projectType", label: "Línea de negocio", width: 180 },
    { key: "count", label: "Proyectos", width: 90 },
    { key: "budget", label: "Presupuesto", render: (r) => <Money value={r.budget} />, width: 130 },
    { key: "cost", label: "Costo", render: (r) => <Money value={r.cost} />, width: 130 },
    { key: "margin", label: "Margen", render: (r) => <Money value={r.margin} />, width: 130 },
    {
      key: "marginPercent", label: "% margen",
      render: (r) => (
        <Tag variant={r.marginPercent >= 20 ? "positive" : r.marginPercent >= 10 ? "warning" : "danger"}>
          {r.marginPercent}%
        </Tag>
      ),
      width: 100,
    },
  ];

  const engCols: Column<EngineerRow>[] = [
    { key: "engineerName", label: "Ingeniero" },
    { key: "totalActivities", label: "OT (90d)", width: 90 },
    { key: "completed", label: "Cerradas", width: 90 },
    {
      key: "completionRate", label: "% cierre",
      render: (r) => <Tag variant={r.completionRate >= 80 ? "positive" : r.completionRate >= 60 ? "warning" : "danger"}>{r.completionRate}%</Tag>,
      width: 90,
    },
    { key: "avgDurationMin", label: "Min/OT prom.", render: (r) => r.avgDurationMin != null ? String(r.avgDurationMin) : "—", width: 110 },
  ];

  const clientCols: Column<ClientRoiRow>[] = [
    { key: "clientName", label: "Cliente" },
    { key: "projects", label: "Proyectos", width: 90 },
    { key: "revenue", label: "Ingreso", render: (r) => <Money value={r.revenue} />, width: 130 },
    { key: "cost", label: "Costo", render: (r) => <Money value={r.cost} />, width: 130 },
    {
      key: "roi", label: "ROI",
      render: (r) => <Tag variant={r.roi >= 20 ? "positive" : r.roi >= 0 ? "warning" : "danger"}>{r.roi}%</Tag>,
      width: 90,
    },
  ];

  const periodLabel = period === "month" ? "Último mes" : period === "quarter" ? "Último trimestre" : "Último año";

  return (
    <>
      <PageHeader
        eyebrow="ERP · Tablero"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
            >
              <option value="month">Último mes</option>
              <option value="quarter">Último trimestre</option>
              <option value="year">Último año</option>
            </select>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
          </>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando BI…" description="Calculando métricas cross-módulo." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Presupuesto total" value={<Money value={totalBudget} compact />} icon="💰" hint={periodLabel} />
            <KpiCard label="Margen total" value={<Money value={totalMargin} compact />} variant={totalMargin >= 0 ? "positive" : "danger"} icon="📊" hint={periodLabel} />
            <KpiCard label="Margen promedio" value={`${avgMarginPct}%`} variant={avgMarginPct >= 20 ? "positive" : avgMarginPct >= 10 ? "warning" : "danger"} icon="📈" hint="Por línea de negocio" />
            <KpiCard label="Ingenieros rankeados" value={engineers.length} icon="🚀" hint="Últimos 90 días" />
            <KpiCard label="% cierre promedio" value={`${avgCompletion}%`} variant={avgCompletion >= 80 ? "positive" : avgCompletion >= 60 ? "warning" : "danger"} icon="✅" hint="OTs cerradas vs totales" />
            {topClient && (
              <KpiCard label="Top cliente ROI" value={`${topClient.roi}%`} variant="accent" icon="🏆" hint={topClient.clientName} />
            )}
          </div>

          <Section eyebrow="Finanzas" title="Margen por línea de negocio" subtitle={periodLabel}>
            <FilterToolbar
              onClear={() => {}}
              resultCount={margin.length}
              rightActions={margin.length > 0 ? (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(margin, [
                  { key: "projectType", label: "Línea de negocio" },
                  { key: "count", label: "Proyectos" },
                  { key: "budget", label: "Presupuesto (MXN)" },
                  { key: "cost", label: "Costo (MXN)" },
                  { key: "margin", label: "Margen (MXN)" },
                  { key: "marginPercent", label: "% Margen", format: (v) => `${String(v)}%` },
                ], `bi-margen-${period}`)}>CSV</Button>
              ) : undefined}
            />
            <DataTable columns={marginCols} rows={margin} rowKey={(r) => r.projectType} emptyTitle="Sin datos" emptyDescription="No hay proyectos con presupuesto registrado." />
          </Section>

          <Section eyebrow="Operaciones" title="Eficiencia operativa · Top ingenieros" subtitle="Últimos 90 días">
            <FilterToolbar
              search={{ value: engSearch, onChange: setEngSearch, placeholder: "Buscar ingeniero…" }}
              onClear={() => setEngSearch("")}
              resultCount={visibleEngineers.length}
              rightActions={engineers.length > 0 ? (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleEngineers, [
                  { key: "engineerName", label: "Ingeniero" },
                  { key: "totalActivities", label: "OT (90d)" },
                  { key: "completed", label: "Cerradas" },
                  { key: "completionRate", label: "% Cierre", format: (v) => `${String(v)}%` },
                  { key: "avgDurationMin", label: "Min/OT prom." },
                ], "bi-ingenieros")}>CSV</Button>
              ) : undefined}
            />
            <DataTable columns={engCols} rows={visibleEngineers} rowKey={(r) => r.engineerId} emptyTitle="Sin datos" emptyDescription="No hay actividades cerradas en los últimos 90 días." />
          </Section>

          <Section eyebrow="Clientes" title="ROI por cliente" subtitle={periodLabel}>
            <FilterToolbar
              search={{ value: clientSearch, onChange: setClientSearch, placeholder: "Buscar cliente…" }}
              onClear={() => setClientSearch("")}
              resultCount={visibleClients.length}
              rightActions={clientsRoi.length > 0 ? (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleClients, [
                  { key: "clientName", label: "Cliente" },
                  { key: "projects", label: "Proyectos" },
                  { key: "revenue", label: "Ingreso (MXN)" },
                  { key: "cost", label: "Costo (MXN)" },
                  { key: "roi", label: "ROI (%)", format: (v) => `${String(v)}%` },
                ], `bi-clientes-roi-${period}`)}>CSV</Button>
              ) : undefined}
            />
            <DataTable columns={clientCols} rows={visibleClients} rowKey={(r) => r.clientId} emptyTitle="Sin datos" emptyDescription="No hay proyectos facturados en el periodo seleccionado." />
          </Section>
        </>
      )}
    </>
  );
}
