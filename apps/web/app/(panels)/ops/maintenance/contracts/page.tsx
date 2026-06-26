"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

interface Contract {
  id: number;
  contractNumber: string;
  title: string;
  frequency: string;
  slaResponseHours: number;
  slaResolutionHours: number;
  monthlyFee: number | string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "EXPIRED" | "CANCELLED";
  nextVisitDate?: string | null;
  client?: { id: number; name: string };
  branch?: { id: number; name: string } | null;
  owner?: { id: number; nombre: string } | null;
  _count?: { visits: number };
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export default function MaintenanceContractsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "maintenance-contracts"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("maintenance-contracts", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar contratos");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const activos = items.filter((c) => c.status === "ACTIVE").length;
  const mrr = items.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + Number(c.monthlyFee), 0);
  const proximaSemana = items.filter((c) => c.nextVisitDate && new Date(c.nextVisitDate) <= new Date(Date.now() + 7 * 86400000)).length;

  const statusVariant = (s: string): "positive" | "warning" | "danger" | "default" => {
    if (s === "ACTIVE") return "positive";
    if (s === "EXPIRED" || s === "CANCELLED") return "danger";
    if (s === "PAUSED") return "warning";
    return "default";
  };

  const setStatus = async (c: Contract, status: string) => {
    if (!token) return;
    try {
      await apiFetch(`maintenance-contracts/${c.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems((prev) => prev.map((i) => (i.id === c.id ? { ...i, status: status as Contract["status"] } : i)));
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const columns: Column<Contract>[] = [
    { key: "contractNumber", label: "Folio", render: (c) => <code style={{ fontSize: 11.5 }}>{c.contractNumber}</code>, width: 120 },
    {
      key: "title", label: "Contrato",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.client?.name ?? "—"} · {c.branch?.name ?? "Todas las sucursales"}</div>
        </div>
      ),
    },
    { key: "frequency", label: "Frecuencia", accessor: (c) => c.frequency, width: 100 },
    { key: "slaResponseHours", label: "SLA resp.", accessor: (c) => `${c.slaResponseHours}h`, width: 90 },
    { key: "monthlyFee", label: "Cuota mensual", render: (c) => <Money value={Number(c.monthlyFee)} />, width: 120 },
    { key: "nextVisitDate", label: "Próx. visita", render: (c) => <span style={{ fontSize: 12 }}>{c.nextVisitDate ? new Date(c.nextVisitDate).toLocaleDateString("es-MX") : "—"}</span>, width: 100 },
    {
      key: "status", label: "Estado",
      render: (c) => cfg.canEdit ? (
        <select value={c.status} onChange={(e) => void setStatus(c, e.target.value)} style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)" }}>
          {["DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : <Tag variant={statusVariant(c.status)}>{c.status}</Tag>,
      width: 130,
    },
    { key: "_count" as keyof Contract, label: "Visitas", accessor: (c) => c._count?.visits ?? 0, width: 80 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Servicio continuo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/ops/maintenance">
              <Button variant="ghost">← Órdenes de mantenimiento</Button>
            </Link>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Contratos activos" value={activos} icon="📑" />
        <KpiCard label="Ingreso recurrente (MRR)" value={`$${(mrr / 1000).toFixed(1)}k`} variant="positive" icon="💰" />
        <KpiCard label="Visitas próx. 7 días" value={proximaSemana} icon="📅" />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} contratos`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando contratos de mantenimiento." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(c) => c.id} emptyTitle="Sin contratos" emptyDescription="Los contratos de mantenimiento se crean desde una oportunidad ganada en CRM." />}
      </Section>
    </>
  );
}
