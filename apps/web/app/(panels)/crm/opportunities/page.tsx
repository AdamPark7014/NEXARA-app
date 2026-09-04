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
import { exportToExcel } from "@/lib/export-excel";
import EmptyState from "@/components/ui/EmptyState";
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
import chrome from "@/components/crm/crm-chrome.module.css";

const STAGE_IDS = ALL_OPPORTUNITY_STAGES.map((s) => s.id);

const emptyForm = {
  title: "",
  description: "",
  value: 0,
  probability: 20,
  stage: "DISCOVERY",
  expectedCloseDate: "",
  clientId: 0 as number | undefined,
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
      const deepClientId = Number(searchParams.get("clientId") || 0);
      setEditing(null);
      setForm({
        ...emptyForm,
        clientId: deepClientId > 0 ? deepClientId : undefined,
      });
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
    setForm({ ...emptyForm, clientId: undefined });
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
      clientId: o.clientId ?? undefined,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      const payload = {
        title: form.title,
        description: form.description,
        value: form.value,
        probability: form.probability,
        stage: form.stage,
        expectedCloseDate: form.expectedCloseDate || undefined,
        ...(form.clientId ? { clientId: form.clientId } : {}),
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

  const stageVariant = (stage?: string): "accent" | "warning" | "neutral" | "danger" | "positive" =>
    stage === "WON" ? "positive" : stage === "LOST" ? "danger" : isHotOpportunityStage(stage) ? "accent" : "warning";

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
    {
      key: "probability", label: "Prob.",
      render: (o) => {
        const p = o.probability ?? 0;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 90 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p}%`, background: p >= 70 ? "var(--success)" : p >= 40 ? "var(--primary)" : "var(--warning)", borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 32 }}>{p}%</span>
          </div>
        );
      },
      width: 110,
    },
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
      render: (o) => {
        if (!o.expectedCloseDate) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const daysLeft = Math.ceil((new Date(o.expectedCloseDate).getTime() - Date.now()) / 86400000);
        const isClosed = isClosedOpportunityStage(o.stage);
        const color = isClosed ? "var(--text-tertiary)" : daysLeft < 0 ? "var(--danger)" : daysLeft <= 7 ? "var(--danger)" : daysLeft <= 21 ? "var(--warning)" : "var(--text-secondary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color }}>{new Date(o.expectedCloseDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
            {!isClosed && <span style={{ fontSize: 10.5, fontWeight: 700, color }}>{daysLeft < 0 ? "VENCIDO" : `${daysLeft}d`}</span>}
          </div>
        );
      },
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
        eyebrow="CRM · Oportunidades"
        title={cfg.title}
        subtitle={cfg.subtitle ?? "Pipeline comercial: monto, probabilidad y cierre estimado."}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva oportunidad</Button> : null}
          </>
        }
      />

      {!loading && visibleItems.length > 0 && (() => {
        const byStage = ALL_OPPORTUNITY_STAGES
          .map((s) => ({ label: formatOpportunityStage(s.id), count: visibleItems.filter((o) => o.stage === s.id).length }))
          .filter((x) => x.count > 0);
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 14 }}>
              <KpiCard label="Pipeline total" value={<Money value={pipelineTotal} compact />} variant="accent" icon="📊" hint={`${active.length} oportunidades activas`} />
              <KpiCard label="Valor ponderado" value={<Money value={weighted} compact />} icon="🎯" hint="Ajustado por probabilidad" />
              <KpiCard label="En cierre" value={enCierre} variant={enCierre > 0 ? "positive" : "default"} icon="🔥" hint="Etapa caliente" />
              <KpiCard label="Ganadas" value={visibleItems.filter((o) => o.stage === "WON").length} variant="positive" icon="🏆" />
            </div>
            {byStage.length > 0 && (
              <div className={chrome.distCard}>
                <div className={chrome.distLabel}>Pipeline por etapa</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {byStage.map(({ label, count }) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "140px 1fr 32px", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{label}</span>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / visibleItems.length) * 100}%`, background: "var(--primary)", borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {showForm && (
        <div className={chrome.formPanel}>
          <p className={chrome.formPanelTitle}>{editing ? "Editar oportunidad" : "Nueva oportunidad"}</p>
          <div className={chrome.formFull}>
            <label className={chrome.fieldLabel}>Título</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Nombre de la oportunidad" className={chrome.fieldInput} />
          </div>
          <div className={chrome.formFull}>
            <label className={chrome.fieldLabel}>Descripción</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Alcance o plan de acción" className={chrome.fieldInput} />
          </div>
          <div>
            <label className={chrome.fieldLabel}>Monto ($)</label>
            <input type="number" min={0} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: +e.target.value }))} className={chrome.fieldInput} />
          </div>
          <div>
            <label className={chrome.fieldLabel}>Probabilidad (%)</label>
            <input type="number" min={0} max={100} value={form.probability} onChange={(e) => setForm((f) => ({ ...f, probability: +e.target.value }))} className={chrome.fieldInput} />
          </div>
          <div>
            <label className={chrome.fieldLabel}>Etapa</label>
            <select value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))} className={chrome.fieldInput}>
              {STAGE_IDS.map((s) => (
                <option key={s} value={s}>{formatOpportunityStage(s)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={chrome.fieldLabel}>Cierre esperado</label>
            <input type="date" value={form.expectedCloseDate} onChange={(e) => setForm((f) => ({ ...f, expectedCloseDate: e.target.value }))} className={chrome.fieldInput} />
          </div>
          {form.clientId ? (
            <div className={chrome.formFull} style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Cliente vinculado: <strong>#{form.clientId}</strong>
            </div>
          ) : null}
          <div className={chrome.formActions}>
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
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "title", label: "Título" },
            { key: "clientName", label: "Cliente" },
            { key: "stage", label: "Etapa", format: (v) => formatOpportunityStage(String(v ?? "")) },
            { key: "value", label: "Valor ($)" },
            { key: "probability", label: "Probabilidad (%)" },
            { key: "owner", label: "Responsable", format: (v) => (v as SalesOpportunity["owner"])?.nombre ?? "—" },
            { key: "expectedCloseDate", label: "Cierre esperado", format: (v) => v ? String(v).slice(0, 10) : "" },
          ], "oportunidades")}>Excel</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${visibleItems.length} oportunidad${visibleItems.length === 1 ? "" : "es"}`}>
        {loading && (
          <EmptyState icon="⏳" title="Cargando oportunidades…" description="Consultando el pipeline comercial." />
        )}
        {!loading && loadError && (
          <EmptyState
            icon="⚠️"
            title="No se pudo cargar"
            description={loadError}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {!loading && !loadError && (
          <DataTable
            columns={columns}
            rows={visibleItems}
            rowKey={(o) => o.id}
            emptyTitle="Sin oportunidades"
            emptyDescription="Agrega la primera oportunidad al pipeline."
            emptyAction={
              cfg.canCreate ? (
                <Button size="sm" variant="primary" iconLeft="+" onClick={openNew}>Nueva oportunidad</Button>
              ) : undefined
            }
          />
        )}
      </Section>
    </>
  );
}
