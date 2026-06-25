"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag, Money, type Column } from "@/components/ui/DataTable";
import DataTable from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { useCrmManagerGuard } from "@/lib/useCrmManagerGuard";

interface Performance {
  targetId: number;
  ownerId: number;
  ownerName: string;
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
  const token = user?.token ?? "";

  const [rows, setRows] = useState<Performance[]>([]);
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

  const columns: Column<Performance>[] = [
    {
      key: "ownerName", label: "#",
      render: (p) => {
        const idx = rows.findIndex((r) => r.targetId === p.targetId);
        return <span style={{ fontWeight: 800, color: idx === 0 ? "var(--accent)" : "var(--text-tertiary)" }}>{idx + 1}</span>;
      },
      width: 40,
    },
    { key: "ownerName" as keyof Performance, label: "Ejecutivo" },
    { key: "opportunitiesCreated", label: "Oportunidades", width: 120 },
    { key: "newClientsAchieved", label: "Clientes nuevos", width: 120 },
    { key: "revenueAchieved", label: "Vendido (mes)", render: (p) => <Money value={p.revenueAchieved} />, width: 130 },
    { key: "attainmentPct", label: "% cuota", render: (p) => <Tag variant={p.attainmentPct >= 100 ? "positive" : p.attainmentPct >= 60 ? "warning" : "danger"}>{p.attainmentPct}%</Tag>, width: 100 },
    { key: "reachedBonus", label: "Bono", render: (p) => p.reachedBonus ? <Tag variant="positive">🏆 Alcanzado</Tag> : <Tag variant="default">—</Tag>, width: 120 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Equipo y métricas"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      <Section title={loading ? "Cargando…" : `${rows.length} ejecutivos`}>
        {loading && <EmptyState icon="⏳" title="Cargando ranking…" description="Calculando desempeño del equipo." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={rows} rowKey={(p) => p.targetId} emptyTitle="Sin cuotas este mes" emptyDescription="Asigna cuotas al equipo desde Cuotas y metas para ver el ranking." />}
      </Section>
    </>
  );
}
