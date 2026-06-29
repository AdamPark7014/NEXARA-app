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
import { buildApiUrl } from "@/lib/api-base";
import { createOperationalProject, formatOperationalProjectStatus, listOperationalProjects, type OperationalProject } from "@/lib/ops-operational-api";

interface ServiceClient { id: number; name: string }

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
  borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

export default function OpsProjectsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "projects"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<OperationalProject[]>([]);
  const [clients, setClients] = useState<ServiceClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", scopeSummary: "", clientId: "", startDate: new Date().toISOString().slice(0, 10) });

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

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token || !showForm) return;
    fetch(buildApiUrl("service-clients"), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setClients(Array.isArray(d) ? d : (d.data ?? [])))
      .catch(() => setClients([]));
  }, [token, showForm]);

  const save = async () => {
    if (!token || !user?.id || !form.title.trim() || !form.clientId) return;
    setSaving(true);
    try {
      await createOperationalProject(token, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        scopeSummary: form.scopeSummary.trim() || undefined,
        vendorId: user.id,
        clientId: Number(form.clientId),
        startDate: form.startDate,
      });
      setShowForm(false);
      setForm({ title: "", description: "", scopeSummary: "", clientId: "", startDate: new Date().toISOString().slice(0, 10) });
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo crear el proyecto");
    } finally {
      setSaving(false);
    }
  };

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
        subtitle="Proyectos de campo vinculados a clientes de servicio."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nuevo proyecto</Button>
            )}
            <Button variant="ghost" onClick={() => void load()}>Actualizar</Button>
          </div>
        }
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13 }}>Nuevo proyecto operativo</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ gridColumn: "1 / -1", display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Título *</span>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Instalación CCTV — Planta Norte" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Cliente de servicio *</span>
              <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} style={inp}>
                <option value="">Seleccionar…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha inicio</span>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} style={inp} />
            </label>
            <label style={{ gridColumn: "1 / -1", display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Alcance</span>
              <input value={form.scopeSummary} onChange={(e) => setForm((f) => ({ ...f, scopeSummary: e.target.value }))} placeholder="Resumen del trabajo en sitio" style={inp} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Creando…" : "Crear proyecto"}</Button>
          </div>
        </div>
      )}

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
          <DataTable columns={columns} rows={displayItems} rowKey={(p) => p.id} emptyTitle="Sin proyectos" emptyDescription="Crea un proyecto operativo vinculado a un cliente de servicio." />
        )}
      </Section>
    </>
  );
}
