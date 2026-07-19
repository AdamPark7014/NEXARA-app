"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import { Tag, Money, type Column } from "@/components/ui/DataTable";
import DataTable from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { useCrmManagerGuard } from "@/lib/useCrmManagerGuard";
import { getCrmManagerSubmoduleConfig } from "@/lib/section-views";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";

interface Performance {
  targetId: number;
  ownerId: number;
  ownerName: string;
  hasQuota?: boolean;
  revenueTarget: number;
  revenueAchieved: number;
  attainmentPct: number;
  opportunitiesCreated: number;
  newClientsAchieved: number;
  reachedBonus: boolean;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function TeamPage() {
  const { user } = useUser();
  const cfg = useCrmManagerGuard();
  const viewCfg = useMemo(() => getCrmManagerSubmoduleConfig(user, "team"), [user]);
  const token = user?.token ?? "";

  const [rows, setRows] = useState<Performance[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("sales-targets/performance", token);
      setRows(Array.isArray(data?.performance) ? data.performance : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el equipo de ventas");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (!cfg.canAccess) return null;

  const teamTotals = useMemo(() => ({
    revenue: rows.reduce((s, r) => s + r.revenueAchieved, 0),
    opportunities: rows.reduce((s, r) => s + r.opportunitiesCreated, 0),
    onQuota: rows.filter((r) => r.attainmentPct >= 100).length,
    withBonus: rows.filter((r) => r.reachedBonus).length,
    avgAttainment: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.attainmentPct, 0) / rows.length) : 0,
  }), [rows]);

  const visibleRows = useMemo(() => {
    if (!searchQ.trim()) return rows;
    const q = searchQ.toLowerCase();
    return rows.filter((r) => (r.ownerName ?? "").toLowerCase().includes(q));
  }, [rows, searchQ]);

  const columns: Column<Performance>[] = [
    {
      key: "ownerName", label: "#",
      render: (p) => {
        const idx = rows.findIndex((r) => r.targetId === p.targetId);
        return <span style={{ fontWeight: 800, color: idx === 0 ? "var(--accent)" : "var(--text-tertiary)" }}>{idx + 1}</span>;
      },
      width: 40,
    },
    { key: "ownerName" as keyof Performance, label: "Ejecutivo", render: (p) => (
      <div>
        <div style={{ fontWeight: 600 }}>{p.ownerName}</div>
        {!p.hasQuota && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>Sin cuota asignada</div>}
      </div>
    ) },
    { key: "opportunitiesCreated", label: "Oportunidades", width: 120 },
    { key: "newClientsAchieved", label: "Clientes nuevos", width: 120 },
    { key: "revenueAchieved", label: "Vendido (mes)", render: (p) => <Money value={p.revenueAchieved} />, width: 130 },
    {
      key: "attainmentPct", label: "% cuota",
      render: (p) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 130 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, p.attainmentPct)}%`, background: p.attainmentPct >= 100 ? "var(--success)" : p.attainmentPct >= 60 ? "var(--primary)" : "var(--warning)", borderRadius: 3, transition: "width .3s" }} />
          </div>
          <Tag variant={p.attainmentPct >= 100 ? "positive" : p.attainmentPct >= 60 ? "warning" : "danger"}>{p.attainmentPct}%</Tag>
        </div>
      ),
      width: 180,
    },
    { key: "reachedBonus", label: "Bono", render: (p) => p.reachedBonus ? <Tag variant="positive">🏆 Alcanzado</Tag> : <Tag variant="default">—</Tag>, width: 120 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Equipo y métricas"
        title={viewCfg.title}
        subtitle={viewCfg.subtitle}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      {!loading && !error && rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
          <KpiCard label="Vendido total (equipo)" value={<Money value={teamTotals.revenue} compact />} hint="Ingresos cerrados este mes" variant="positive" icon="💰" />
          <KpiCard label="Oportunidades creadas" value={teamTotals.opportunities} hint="Suma del equipo" icon="🎯" />
          <KpiCard label="% cuota promedio" value={`${teamTotals.avgAttainment}%`} variant={teamTotals.avgAttainment >= 100 ? "positive" : teamTotals.avgAttainment >= 60 ? "warning" : "danger"} icon="📊" />
          <KpiCard label="Alcanzaron cuota" value={`${teamTotals.onQuota}/${rows.length}`} hint="Ejecutivos sobre el 100%" variant={teamTotals.onQuota > 0 ? "positive" : "warning"} icon="🏆" />
          <KpiCard label="Con bono desbloqueado" value={teamTotals.withBonus} variant={teamTotals.withBonus > 0 ? "accent" : "default"} icon="🎁" />
        </div>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar ejecutivo…" }}
        onClear={() => setSearchQ("")}
        resultCount={loading ? null : visibleRows.length}
        rightActions={rows.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleRows, [
            { key: "ownerName", label: "Ejecutivo" },
            { key: "opportunitiesCreated", label: "Oportunidades" },
            { key: "newClientsAchieved", label: "Clientes nuevos" },
            { key: "revenueAchieved", label: "Vendido" },
            { key: "attainmentPct", label: "% Cuota", format: (v) => `${v}%` },
            { key: "reachedBonus", label: "Bono", format: (v) => v ? "Sí" : "No" },
          ], "equipo-ventas")}>Excel</Button>
        ) : undefined}
      />
      <Section title={loading ? "Cargando…" : `${visibleRows.length} ejecutivos`}>
        {loading && <EmptyState icon="⏳" title="Cargando ranking…" description="Calculando desempeño del equipo." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={visibleRows} rowKey={(p) => p.ownerId} emptyTitle="Sin ejecutivos de ventas" emptyDescription="Asigna el rol vendedor o acceso al panel de ventas, y opcionalmente cuotas en Cuotas y metas." />}
      </Section>
    </>
  );
}
