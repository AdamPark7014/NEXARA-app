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
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";

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
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
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
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((p) =>
        (p.title ?? "").toLowerCase().includes(q) ||
        (p.client?.name ?? "").toLowerCase().includes(q) ||
        (p.vendor?.nombre ?? "").toLowerCase().includes(q)
      );
    }
    if (filterStatus) rows = rows.filter((p) => p.status === filterStatus);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return rows;
  }, [items, highlightId, searchQ, filterStatus]);

  const kpis = useMemo(() => ({
    activos: items.filter((p) => p.status === "ACTIVE").length,
    enPausa: items.filter((p) => p.status === "ON_HOLD").length,
    completados: items.filter((p) => p.status === "COMPLETED").length,
    totalOTs: items.reduce((s, p) => s + (p.activities?.length ?? 0), 0),
    clientes: new Set(items.map((p) => p.client?.name).filter(Boolean)).size,
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
      width: 80,
    },
    {
      key: "endDate",
      label: "Cierre est.",
      render: (p) => {
        if (!p.endDate) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const daysLeft = Math.ceil((new Date(p.endDate).getTime() - Date.now()) / 86400000);
        const isActive = p.status === "ACTIVE";
        const color = !isActive ? "var(--text-tertiary)" : daysLeft < 0 ? "var(--danger)" : daysLeft <= 7 ? "var(--danger)" : daysLeft <= 21 ? "var(--warning)" : "var(--text-secondary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color }}>{new Date(p.endDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
            {isActive && <span style={{ fontSize: 10.5, fontWeight: daysLeft <= 21 ? 700 : 400, color }}>{daysLeft < 0 ? "VENCIDO" : `${daysLeft}d`}</span>}
          </div>
        );
      },
      width: 90,
    },
    {
      key: "status",
      label: "Estado",
      render: (p) => <Tag variant={statusVariant(p.status)}>{formatOperationalProjectStatus(p.status)}</Tag>,
      width: 110,
    },
    {
      key: "salesProject",
      label: "CRM",
      render: (p) =>
        p.salesProjectId || p.salesProject ? (
          <a
            href={`https://sales.nexara.com.mx/crm/projects/${p.salesProject?.id ?? p.salesProjectId}`}
            style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}
          >
            Comercial →
          </a>
        ) : (
          <Tag variant="warning">Sin CRM</Tag>
        ),
      width: 110,
    },
    {
      key: "client",
      label: "Cliente",
      render: (p) => p.client ? (
        <Link href={`/ops/service-clients/${p.client.id}`} style={{ fontSize: 12, color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>
          {p.client.name}
        </Link>
      ) : <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>—</span>,
      width: 140,
    },
    {
      key: "activities",
      label: "OTs",
      render: (p) => {
        const total = p.activities?.length ?? 0;
        const done = p.activities?.filter((a) => a.estatus === "COMPLETADA" || a.estatus === "COMPLETED" || a.estatus === "DONE").length ?? 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <div style={{ minWidth: 80 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{done}/{total}</div>
            <div style={{ height: 4, borderRadius: 2, background: "var(--surface-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "var(--success)" : pct >= 50 ? "var(--primary)" : "var(--warning)", borderRadius: 2 }} />
            </div>
          </div>
        );
      },
      width: 100,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Proyectos"
        title="Proyectos operativos"
        subtitle="Misma entrega que CRM: campo, OTs e ingenieros. Columna CRM muestra el vínculo comercial."
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
          <KpiCard label="Proyectos activos" value={kpis.activos} variant={kpis.activos > 0 ? "accent" : "default"} icon="🟢" hint={`${kpis.clientes} clientes distintos`} />
          <KpiCard label="En pausa" value={kpis.enPausa} variant={kpis.enPausa > 0 ? "warning" : "default"} icon="⏸️" hint={kpis.enPausa > 0 ? "Requieren seguimiento" : "Sin proyectos pausados"} />
          <KpiCard label="Completados" value={kpis.completados} variant={kpis.completados > 0 ? "positive" : "default"} icon="✅" />
          <KpiCard label="OTs registradas" value={kpis.totalOTs} icon="📋" hint="Actividades en todos los proyectos" />
        </div>
      )}

      {!loading && !error && items.length > 0 && (() => {
        const byStatus: Record<string, number> = {};
        for (const p of items) { const s = p.status ?? "ACTIVE"; byStatus[s] = (byStatus[s] ?? 0) + 1; }
        const statusColors: Record<string, string> = { ACTIVE: "var(--success)", ON_HOLD: "var(--warning)", COMPLETED: "var(--primary)", CANCELLED: "var(--danger)" };
        const statusLabels: Record<string, string> = { ACTIVE: "Activo", ON_HOLD: "En pausa", COMPLETED: "Completado", CANCELLED: "Cancelado" };
        const total = items.length;
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por estado</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
                <div key={s} style={{ display: "grid", gridTemplateColumns: "100px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{statusLabels[s] ?? s}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: statusColors[s] ?? "var(--primary)", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por título, cliente o responsable…" }}
        selects={[{
          label: "Estado",
          value: filterStatus,
          onChange: setFilterStatus,
          options: [
            { value: "ACTIVE", label: "Activo" },
            { value: "ON_HOLD", label: "En pausa" },
            { value: "COMPLETED", label: "Completado" },
            { value: "CANCELLED", label: "Cancelado" },
          ],
          allowAll: true,
        }]}
        onClear={() => { setSearchQ(""); setFilterStatus(""); }}
        resultCount={loading ? null : displayItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(displayItems, [
            { key: "title", label: "Proyecto" },
            { key: "client", label: "Cliente", format: (v) => (v as OperationalProject["client"])?.name ?? "—" },
            { key: "vendor", label: "Responsable", format: (v) => (v as OperationalProject["vendor"])?.nombre ?? "—" },
            { key: "status", label: "Estado", format: (v) => formatOperationalProjectStatus(String(v ?? "")) },
            { key: "startDate", label: "Inicio", format: (v) => v ? String(v).slice(0, 10) : "" },
          ], "proyectos-operativos")}>Excel</Button>
        ) : undefined}
      />

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
