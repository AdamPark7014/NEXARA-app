"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

interface MarginRow { projectType: string; count: number; budget: number; cost: number; margin: number; marginPercent: number }
interface EngineerRow { engineerId: number; engineerName: string; totalActivities: number; completed: number; completionRate: number; avgEfficiency: number | null; avgDurationMin: number | null }
interface ClientRoiRow { clientId: number; clientName: string; projects: number; revenue: number; cost: number; roi: number }

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function BiPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [margin, setMargin] = useState<MarginRow[]>([]);
  const [engineers, setEngineers] = useState<EngineerRow[]>([]);
  const [clientsRoi, setClientsRoi] = useState<ClientRoiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [m, e, c] = await Promise.all([
        apiFetch("analytics/bi/margin-by-type", token),
        apiFetch("analytics/bi/engineers?limit=10", token),
        apiFetch("analytics/bi/clients-roi?limit=10", token),
      ]);
      setMargin(Array.isArray(m) ? m : []);
      setEngineers(Array.isArray(e) ? e : []);
      setClientsRoi(Array.isArray(c) ? c : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar Business Intelligence");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const totalMargin = margin.reduce((s, m) => s + m.margin, 0);
  const totalBudget = margin.reduce((s, m) => s + m.budget, 0);

  const marginCols: Column<MarginRow>[] = [
    { key: "projectType", label: "Línea de negocio", width: 180 },
    { key: "count", label: "Proyectos", width: 90 },
    { key: "budget", label: "Presupuesto", render: (r) => <Money value={r.budget} />, width: 130 },
    { key: "margin", label: "Margen", render: (r) => <Money value={r.margin} />, width: 130 },
    { key: "marginPercent", label: "% margen", render: (r) => <span style={{ fontWeight: 700, color: r.marginPercent >= 0 ? "var(--success)" : "var(--danger)" }}>{r.marginPercent}%</span>, width: 100 },
  ];

  const engCols: Column<EngineerRow>[] = [
    { key: "engineerName", label: "Ingeniero" },
    { key: "totalActivities", label: "OT (90d)", width: 90 },
    { key: "completed", label: "Cerradas", width: 90 },
    { key: "completionRate", label: "% cierre", render: (r) => `${r.completionRate}%`, width: 90 },
    { key: "avgDurationMin", label: "Min/OT prom.", render: (r) => r.avgDurationMin ?? "—", width: 110 },
  ];

  const clientCols: Column<ClientRoiRow>[] = [
    { key: "clientName", label: "Cliente" },
    { key: "projects", label: "Proyectos", width: 90 },
    { key: "revenue", label: "Ingreso", render: (r) => <Money value={r.revenue} />, width: 130 },
    { key: "roi", label: "ROI %", render: (r) => <span style={{ fontWeight: 700 }}>{r.roi}%</span>, width: 90 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Tablero"
        title="Business Intelligence"
        subtitle="Rentabilidad por línea de negocio, eficiencia operativa y ROI por cliente — últimos 12 meses / 90 días."
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      {loading && <EmptyState icon="⏳" title="Cargando BI…" description="Calculando métricas cross-módulo." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Presupuesto total" value={`$${(totalBudget / 1000000).toFixed(1)}M`} icon="💰" />
            <KpiCard label="Margen total" value={`$${(totalMargin / 1000000).toFixed(1)}M`} variant={totalMargin >= 0 ? "positive" : "danger"} icon="📊" />
            <KpiCard label="Ingenieros rankeados" value={engineers.length} icon="🚀" />
          </div>

          <Section title="Margen por línea de negocio">
            <DataTable columns={marginCols} rows={margin} rowKey={(r) => r.projectType} emptyTitle="Sin datos" emptyDescription="No hay proyectos con presupuesto registrado." />
          </Section>

          <Section title="Eficiencia operativa · Top ingenieros (90 días)">
            <DataTable columns={engCols} rows={engineers} rowKey={(r) => r.engineerId} emptyTitle="Sin datos" emptyDescription="No hay actividades cerradas en los últimos 90 días." />
          </Section>

          <Section title="ROI por cliente (12 meses)">
            <DataTable columns={clientCols} rows={clientsRoi} rowKey={(r) => r.clientId} emptyTitle="Sin datos" emptyDescription="No hay proyectos facturados en los últimos 12 meses." />
          </Section>
        </>
      )}
    </>
  );
}
