"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { toast } from "@/components/Toast";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { filterRowsByScope, getCrmSalesSectionConfig } from "@/lib/section-views";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
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
  const [searchQ, setSearchQ] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesOpportunity | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

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
    setLoadError(null);
    try {
      setItems(await listSalesOpportunities(token));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleItems = useMemo(() => {
    let rows = filterRowsByScope(items, user, cfg.defaultScope);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((o) =>
        (o.title ?? "").toLowerCase().includes(q) ||
        (o.clientName ?? "").toLowerCase().includes(q) ||
        (o.client?.name ?? "").toLowerCase().includes(q) ||
        (o.owner?.nombre ?? "").toLowerCase().includes(q)
      );
    }
    if (filterStage) rows = rows.filter((o) => o.stage === filterStage);
    return rows;
  }, [items, user, cfg.defaultScope, searchQ, filterStage]);

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la oportunidad");
    }
  };

  const remove = (id: number) => {
    if (!token) return;
    setConfirmState({ message: "¿Eliminar esta oportunidad?", fn: async () => {
      try {
        await deleteSalesOpportunity(token, id);
        setItems((prev) => prev.filter((o) => o.id !== id));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar la oportunidad");
      }
    } });
  };

  const patchStage = async (id: number, stage: string) => {
    if (!token) return;
    try {
      const updated = await updateSalesOpportunityStage(token, id, stage);
      setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar la etapa");
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
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      <PageHeader
        eyebrow="CRM · Pipeline"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva oportunidad</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Pipeline total" value={<Money value={pipelineTotal} compact />} variant="accent" icon="📊" hint={`${active.length} oportunidades activas`} />
        <KpiCard label="Valor ponderado" value={<Money value={weighted} compact />} icon="🎯" hint="Ajustado por probabilidad" />
        <KpiCard label="En cierre" value={enCierre} variant={enCierre > 0 ? "positive" : "default"} icon="🔥" hint="Etapa caliente" />
        <KpiCard label="Ganadas" value={visibleItems.filter((o) => o.stage === "WON").length} variant="positive" icon="🏆" />
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

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por título, cliente o responsable…" }}
        selects={[{
          label: "Etapa",
          value: filterStage,
          onChange: setFilterStage,
          options: ALL_OPPORTUNITY_STAGES.map((s) => ({ value: s.id, label: s.label })),
          allowAll: true,
        }]}
        onClear={() => { setSearchQ(""); setFilterStage(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleItems, [
            { key: "title", label: "Título" },
            { key: "clientName", label: "Cliente" },
            { key: "stage", label: "Etapa", format: (v) => formatOpportunityStage(String(v ?? "")) },
            { key: "value", label: "Valor ($)" },
            { key: "probability", label: "Probabilidad (%)" },
            { key: "owner", label: "Responsable", format: (v) => (v as SalesOpportunity["owner"])?.nombre ?? "—" },
            { key: "expectedCloseDate", label: "Cierre esperado", format: (v) => v ? String(v).slice(0, 10) : "" },
          ], "oportunidades")}>CSV</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${visibleItems.length} oportunidades`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={visibleItems} rowKey={(o) => o.id} emptyTitle={loadError ? `⚠ ${loadError}` : "Sin oportunidades"} emptyDescription="Agrega la primera oportunidad al pipeline." />
        )}
      </Section>
    </>
  );
}
