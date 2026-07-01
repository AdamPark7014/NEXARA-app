"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { filterRowsByScope, getCrmSalesSectionConfig } from "@/lib/section-views";
import {
  createSalesProject,
  formatSalesProjectStatus,
  listSalesOpportunities,
  listSalesProjects,
  updateSalesProject,
  type SalesOpportunity,
  type SalesProjectDetail,
} from "@/lib/sales-api";

const STATUSES = ["PLANNED", "IN_PROGRESS", "ON_HOLD", "CLOSED"] as const;

const emptyForm = {
  opportunityId: 0,
  name: "",
  scopeSummary: "",
  budget: 0,
  status: "PLANNED",
  startDate: "",
  endDate: "",
};

export default function CrmProjectsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "projects"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<SalesProjectDetail[]>([]);
  const [opportunities, setOpportunities] = useState<SalesOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesProjectDetail | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [projects, opps] = await Promise.all([listSalesProjects(token), listSalesOpportunities(token)]);
      setItems(projects);
      setOpportunities(opps);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar los proyectos");
      setItems([]);
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleItems = useMemo(() => {
    const withOwner = items.map((p) => ({ ...p, owner: p.opportunity?.owner ?? null }));
    return filterRowsByScope(withOwner, user, cfg.defaultScope);
  }, [items, user, cfg.defaultScope]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (p: SalesProjectDetail) => {
    setEditing(p);
    setForm({
      opportunityId: p.opportunityId ?? p.opportunity?.id ?? 0,
      name: p.name ?? "",
      scopeSummary: p.scopeSummary ?? "",
      budget: Number(p.budget ?? 0),
      status: p.status ?? "PLANNED",
      startDate: p.startDate?.slice(0, 10) ?? "",
      endDate: p.endDate?.slice(0, 10) ?? "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      const payload = {
        ...form,
        opportunityId: form.opportunityId || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      };
      if (editing) {
        const { opportunityId: _o, ...patch } = payload;
        const updated = await updateSalesProject(token, editing.id, patch);
        setItems((prev) => prev.map((p) => (p.id === editing.id ? { ...p, ...updated } : p)));
      } else {
        if (!form.opportunityId) return;
        const created = await createSalesProject(token, payload as typeof payload & { opportunityId: number });
        setItems((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "No se pudo guardar el proyecto");
    }
  };

  const totalContrato = visibleItems.reduce((s, p) => s + Number(p.budget ?? 0), 0);
  const activos = visibleItems.filter((p) => p.status === "IN_PROGRESS" || p.status === "PLANNED").length;

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--foreground)",
    fontSize: 13,
    boxSizing: "border-box",
  };

  const statusVariant = (s?: string): "accent" | "warning" | "neutral" | "danger" =>
    s === "CLOSED" ? "neutral" : s === "IN_PROGRESS" ? "accent" : s === "ON_HOLD" ? "warning" : "neutral";

  const columns: Column<SalesProjectDetail>[] = [
    {
      key: "name",
      label: "Proyecto",
      render: (p) => (
        <div>
          <Link href={`/crm/projects/${p.id}`} style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>
            {p.name ?? "—"}
          </Link>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {p.opportunity?.client?.legalName ?? p.opportunity?.client?.name ?? p.opportunity?.title}
          </div>
        </div>
      ),
    },
    { key: "budget", label: "Presupuesto", render: (p) => <Money value={Number(p.budget ?? 0)} />, width: 120 },
    {
      key: "startDate",
      label: "Inicio",
      accessor: (p) => (p.startDate ? new Date(p.startDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"),
      width: 90,
    },
    {
      key: "status",
      label: "Estado",
      render: (p) => <Tag variant={statusVariant(p.status)}>{formatSalesProjectStatus(p.status)}</Tag>,
      width: 120,
    },
    {
      key: "margin",
      label: "Margen",
      render: (p) => <Money value={Number(p.margin ?? 0)} />,
      width: 100,
    },
    {
      key: "id",
      label: "",
      render: (p) =>
        cfg.canEdit ? (
          <button onClick={() => openEdit(p)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 8px" }}>
            ✎
          </button>
        ) : null,
      width: 40,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Proyectos"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo proyecto</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Proyectos activos" value={activos} variant={activos > 0 ? "accent" : "default"} icon="🏗️" />
        <KpiCard label="Valor total presupuesto" value={<Money value={totalContrato} compact />} variant="positive" icon="💰" hint="Suma de contratos activos" />
      </div>

      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
          {actionErr}{' '}
          <button type="button" style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer" }} onClick={() => setActionErr(null)}>Cerrar</button>
        </div>
      )}

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {!editing && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                Oportunidad origen *
              </label>
              <select
                value={form.opportunityId}
                onChange={(e) => setForm((f) => ({ ...f, opportunityId: +e.target.value }))}
                style={inp}
              >
                <option value={0}>Selecciona oportunidad…</option>
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title} ({o.stage})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nombre</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Alcance</label>
            <input value={form.scopeSummary} onChange={(e) => setForm((f) => ({ ...f, scopeSummary: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Presupuesto ($)</label>
            <input type="number" min={0} value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inp}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatSalesProjectStatus(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Inicio</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fin</label>
            <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear proyecto"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} proyectos`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={visibleItems} rowKey={(p) => p.id} emptyTitle="Sin proyectos" emptyDescription="Los proyectos se crean desde una oportunidad ganada." />
        )}
      </Section>
    </>
  );
}
