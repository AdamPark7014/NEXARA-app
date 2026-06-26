"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { filterRowsByScope, getCrmSalesSectionConfig } from "@/lib/section-views";
import {
  ALL_OPPORTUNITY_STAGES,
  createSalesOpportunity,
  deleteSalesOpportunity,
  formatOpportunityStage,
  isClosedOpportunityStage,
  isHotOpportunityStage,
  listSalesOpportunities,
  updateSalesOpportunity,
  updateSalesOpportunityStage,
  type SalesOpportunity,
} from "@/lib/sales-api";

const STAGE_IDS = ALL_OPPORTUNITY_STAGES.map((s) => s.id);

const emptyForm = {
  title: "",
  description: "",
  value: 0,
  probability: 20,
  stage: "DISCOVERY",
  expectedCloseDate: "",
};

export default function OpportunitiesPage() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "opportunities"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<SalesOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesOpportunity | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    if (searchParams.get("new") === "1" && cfg.canCreate) {
      setEditing(null);
      setForm({ ...emptyForm });
      setShowForm(true);
    }
  }, [searchParams, cfg.canCreate]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setItems(await listSalesOpportunities(token));
    } catch {
      /* skip */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleItems = useMemo(
    () => filterRowsByScope(items, user, cfg.defaultScope),
    [items, user, cfg.defaultScope],
  );

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (o: SalesOpportunity) => {
    setEditing(o);
    setForm({
      title: o.title ?? "",
      description: o.description ?? "",
      value: Number(o.value ?? 0),
      probability: o.probability ?? 20,
      stage: o.stage ?? "DISCOVERY",
      expectedCloseDate: o.expectedCloseDate?.slice(0, 10) ?? "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      const payload = {
        ...form,
        expectedCloseDate: form.expectedCloseDate || undefined,
      };
      if (editing) {
        const updated = await updateSalesOpportunity(token, editing.id, payload);
        setItems((prev) => prev.map((o) => (o.id === editing.id ? { ...o, ...updated } : o)));
      } else {
        const created = await createSalesOpportunity(token, payload);
        setItems((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch {
      /* skip */
    }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar esta oportunidad?")) return;
    try {
      await deleteSalesOpportunity(token, id);
      setItems((prev) => prev.filter((o) => o.id !== id));
    } catch {
      /* skip */
    }
  };

  const patchStage = async (id: number, stage: string) => {
    if (!token) return;
    try {
      const updated = await updateSalesOpportunityStage(token, id, stage);
      setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    } catch {
      /* skip */
    }
  };

  const active = visibleItems.filter((o) => !isClosedOpportunityStage(o.stage));
  const pipelineTotal = active.reduce((s, o) => s + Number(o.value ?? 0), 0);
  const weighted = active.reduce((s, o) => s + Number(o.value ?? 0) * ((o.probability ?? 0) / 100), 0);
  const enCierre = visibleItems.filter((o) => isHotOpportunityStage(o.stage)).length;

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

  const stageVariant = (stage?: string): "accent" | "warning" | "neutral" | "danger" =>
    stage === "WON" ? "neutral" : stage === "LOST" ? "danger" : isHotOpportunityStage(stage) ? "accent" : "warning";

  const columns: Column<SalesOpportunity>[] = [
    {
      key: "title",
      label: "Oportunidad",
      render: (o) => (
        <div>
          <Link href={`/crm/opportunities/${o.id}`} style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>
            {o.title || "—"}
          </Link>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {o.client?.name ?? o.clientName ?? o.owner?.nombre}
          </div>
        </div>
      ),
    },
    { key: "value", label: "Monto", render: (o) => <Money value={Number(o.value ?? 0)} />, width: 120 },
    { key: "probability", label: "Prob.", accessor: (o) => `${o.probability ?? 0}%`, width: 70 },
    {
      key: "stage",
      label: "Etapa",
      render: (o) =>
        cfg.canEdit ? (
          <select
            value={o.stage ?? "DISCOVERY"}
            onChange={(e) => patchStage(o.id, e.target.value)}
            style={{
              fontSize: 12,
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "3px 6px",
              background: "var(--surface)",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
          >
            {STAGE_IDS.map((s) => (
              <option key={s} value={s}>
                {formatOpportunityStage(s)}
              </option>
            ))}
          </select>
        ) : (
          <Tag variant={stageVariant(o.stage)}>{formatOpportunityStage(o.stage)}</Tag>
        ),
      width: 140,
    },
    {
      key: "expectedCloseDate",
      label: "Cierre est.",
      accessor: (o) =>
        o.expectedCloseDate ? new Date(o.expectedCloseDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—",
      width: 90,
    },
    {
      key: "id",
      label: "",
      render: (o) => (
        <div style={{ display: "flex", gap: 4 }}>
          {cfg.canEdit && (
            <button onClick={() => openEdit(o)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>
              ✎
            </button>
          )}
          {cfg.canDelete && (
            <button onClick={() => remove(o.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>
              ✕
            </button>
          )}
        </div>
      ),
      width: 60,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Pipeline"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva oportunidad</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Pipeline total" value={`$${(pipelineTotal / 1000000).toFixed(1)}M`} />
        <KpiCard label="Ponderado" value={`$${(weighted / 1000000).toFixed(1)}M`} />
        <KpiCard label="En cierre" value={enCierre} />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Título</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Nombre de la oportunidad" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Descripción</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Alcance o plan de acción" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monto ($)</label>
            <input type="number" min={0} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Probabilidad (%)</label>
            <input type="number" min={0} max={100} value={form.probability} onChange={(e) => setForm((f) => ({ ...f, probability: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Etapa</label>
            <select value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))} style={inp}>
              {STAGE_IDS.map((s) => (
                <option key={s} value={s}>
                  {formatOpportunityStage(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Cierre esperado</label>
            <input type="date" value={form.expectedCloseDate} onChange={(e) => setForm((f) => ({ ...f, expectedCloseDate: e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear oportunidad"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} oportunidades`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={visibleItems} rowKey={(o) => o.id} emptyTitle="Sin oportunidades" emptyDescription="Agrega la primera oportunidad al pipeline." />
        )}
      </Section>
    </>
  );
}
