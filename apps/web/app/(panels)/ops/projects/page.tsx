"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { formatOperationalProjectStatus, listOperationalProjects, type OperationalProject } from "@/lib/ops-operational-api";

export default function OpsProjectsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "projects"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<OperationalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      setItems(await listOperationalProjects(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar proyectos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const displayItems = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    if (Number.isNaN(id)) return items;
    return [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  const kpis = useMemo(() => ({
    activos: items.filter((p) => p.status === "ACTIVE").length,
    enPausa: items.filter((p) => p.status === "ON_HOLD").length,
    completados: items.filter((p) => p.status === "COMPLETED").length,
    totalOTs: items.reduce((s, p) => s + (p.activities?.length ?? 0), 0),
  }), [items]);

  const statusVariant = (s?: string): "accent" | "warning" | "neutral" | "danger" =>
    s === "COMPLETED" ? "neutral" : s === "ACTIVE" ? "accent" : s === "ON_HOLD" ? "warning" : "neutral";

  const columns: Column<OperationalProject>[] = [
    {
      key: "title",
      label: "Proyecto",
      render: (p) => (
        <div>
          <Link href={`/ops/projects/${p.id}`} style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>
            {p.title}
          </Link>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.client?.name ?? p.scopeSummary?.slice(0, 50)}</div>
        </div>
      ),
    },
    { key: "vendor", label: "Responsable", accessor: (p) => p.vendor?.nombre ?? "—", width: 140 },
    {
      key: "startDate",
      label: "Inicio",
      accessor: (p) => (p.startDate ? new Date(p.startDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"),
      width: 90,
    },
    {
      key: "status",
      label: "Estado",
      render: (p) => <Tag variant={statusVariant(p.status)}>{formatOperationalProjectStatus(p.status)}</Tag>,
      width: 110,
    },
    {
      key: "activities",
      label: "OTs",
      accessor: (p) => String(p.activities?.length ?? 0),
      width: 60,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Proyectos"
        title="Proyectos operativos"
        subtitle="Proyectos de campo vinculados a clientes de servicio. Se provisionan desde CRM o se crean en operaciones."
        actions={<Button variant="ghost" onClick={load}>Actualizar</Button>}
      />

      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
          <KpiCard label="Proyectos activos" value={kpis.activos} variant={kpis.activos > 0 ? "accent" : "default"} icon="🟢" />
          <KpiCard label="En pausa" value={kpis.enPausa} variant={kpis.enPausa > 0 ? "warning" : "default"} icon="⏸️" />
          <KpiCard label="Completados" value={kpis.completados} icon="✅" />
          <KpiCard label="OTs totales" value={kpis.totalOTs} icon="📋" />
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${displayItems.length} proyectos`}>
        {highlightId && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando proyecto <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando proyectos operativos." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && (
          <DataTable columns={columns} rows={displayItems} rowKey={(p) => p.id} emptyTitle="Sin proyectos" emptyDescription="Provisiona un proyecto comercial o crea uno operativo." />
        )}
      </Section>
    </>
  );
}
