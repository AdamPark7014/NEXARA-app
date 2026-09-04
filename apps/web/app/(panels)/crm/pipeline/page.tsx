"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Money, Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import FilterToolbar from "@/components/FilterToolbar";
import { filterRowsByScope, getCrmSalesSectionConfig } from "@/lib/section-views";
import { exportToExcel } from "@/lib/export-excel";
import {
  PIPELINE_STAGES,
  isClosedOpportunityStage,
  listSalesOpportunities,
  updateSalesOpportunityStage,
  type SalesOpportunity,
} from "@/lib/sales-api";
import chrome from "@/components/crm/crm-chrome.module.css";

function daysAgo(iso?: string): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "Hoy" : `${d}d`;
}

export default function PipelinePage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "pipeline"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<SalesOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [moveErr, setMoveErr] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listSalesOpportunities(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el pipeline");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const scopedItems = useMemo(
    () => filterRowsByScope(items, user, cfg.defaultScope),
    [items, user, cfg.defaultScope],
  );

  const filteredItems = useMemo(() => {
    if (!searchQ.trim()) return scopedItems;
    const q = searchQ.toLowerCase();
    return scopedItems.filter((o) =>
      (o.title ?? "").toLowerCase().includes(q) ||
      (o.client?.name ?? o.clientName ?? "").toLowerCase().includes(q) ||
      (o.owner?.nombre ?? "").toLowerCase().includes(q)
    );
  }, [scopedItems, searchQ]);

  const byStage = useMemo(() => {
    const map = new Map<string, SalesOpportunity[]>();
    for (const s of PIPELINE_STAGES) map.set(s.id, []);
    for (const o of filteredItems) {
      if (isClosedOpportunityStage(o.stage)) continue;
      const key = PIPELINE_STAGES.some((s) => s.id === o.stage) ? o.stage : "DISCOVERY";
      map.get(key)!.push(o);
    }
    return map;
  }, [filteredItems]);

  const moveStage = async (id: number, stage: string) => {
    if (!token || !cfg.canEdit) return;
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, stage } : o)));
    try {
      await updateSalesOpportunityStage(token, id, stage);
    } catch (e) {
      setMoveErr(e instanceof Error ? e.message : "Error al mover oportunidad");
      void load();
    }
  };

  const totalPipeline = scopedItems
    .filter((o) => !isClosedOpportunityStage(o.stage))
    .reduce((s, o) => s + Number(o.value ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="CRM · Pipeline"
        title={cfg.title}
        subtitle={cfg.canEdit ? "Arrastra una tarjeta para cambiar de etapa." : "Vista de solo lectura."}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && (
              <Link href="/crm/opportunities?new=1" style={{ textDecoration: "none" }}>
                <Button variant="primary" iconLeft="+">Nueva oportunidad</Button>
              </Link>
            )}
          </>
        }
      />

      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Oportunidades activas" value={scopedItems.filter((o) => !isClosedOpportunityStage(o.stage)).length} icon="📊" variant="accent" />
          <KpiCard label="Valor en pipeline" value={<Money value={totalPipeline} compact />} icon="💰" variant="positive" hint={`${scopedItems.length} total incluyendo cerradas`} />
          <KpiCard label="Ganadas" value={scopedItems.filter((o) => o.stage === "WON").length} icon="🏆" variant="positive" />
          <KpiCard label="Perdidas" value={scopedItems.filter((o) => o.stage === "LOST").length} icon="❌" variant={scopedItems.filter((o) => o.stage === "LOST").length > 0 ? "danger" : "default"} />
        </div>
      )}

      {!loading && !error && scopedItems.length > 0 && (() => {
        const active = scopedItems.filter((o) => !isClosedOpportunityStage(o.stage));
        const byStageCount = new Map<string, number>();
        for (const o of active) byStageCount.set(o.stage, (byStageCount.get(o.stage) ?? 0) + 1);
        const stageRows = PIPELINE_STAGES
          .filter((s) => (byStageCount.get(s.id) ?? 0) > 0)
          .map((s) => ({ label: s.label, count: byStageCount.get(s.id) ?? 0 }));
        const total = active.length || 1;
        const stageColors = ["var(--primary)", "var(--warning)", "var(--success)", "#a855f7", "#f97316", "#0ea5e9"];
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por etapa</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {stageRows.map((s, i) => (
                <div key={s.label} style={{ display: "grid", gridTemplateColumns: "130px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(s.count / total) * 100}%`, background: stageColors[i % stageColors.length], borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {moveErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{moveErr}</span>
          <button type="button" onClick={() => setMoveErr(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}
      {loading && <EmptyState icon="⏳" title="Cargando pipeline…" description="Consultando oportunidades." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <FilterToolbar
          search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por cliente, título o ejecutivo…" }}
          onClear={() => setSearchQ("")}
          resultCount={filteredItems.filter((o) => !isClosedOpportunityStage(o.stage)).length}
          rightActions={filteredItems.length > 0 ? (
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(filteredItems, [
              { key: "title", label: "Oportunidad" },
              { key: "stage", label: "Etapa" },
              { key: "value", label: "Valor", format: (v) => Number(v).toFixed(2) },
              { key: "probability", label: "Probabilidad %" },
              { key: "owner", label: "Ejecutivo", format: (v) => (v as { nombre?: string })?.nombre ?? "" },
            ], "pipeline-crm")}>Excel</Button>
          ) : undefined}
        />
      )}

      {!loading && !error && (
        <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12 }}>
          {PIPELINE_STAGES.map((stage) => {
            const opps = byStage.get(stage.id) ?? [];
            const stageTotal = opps.reduce((s, o) => s + Number(o.value ?? 0), 0);
            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (cfg.canEdit && dragId != null) void moveStage(dragId, stage.id);
                  setDragId(null);
                }}
                style={{ minWidth: 270, flex: "1 0 270px", background: "color-mix(in srgb, var(--surface-2) 50%, transparent)", border: "1px solid var(--border)", borderRadius: 14, padding: 12 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: stage.color }} />
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{stage.label}</div>
                  <Tag variant="default">{opps.length}</Tag>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 10 }}>{stage.description}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 10 }}>
                  <Money value={stageTotal} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                  {opps.map((o) => (
                    <Link key={o.id} href={`/crm/opportunities/${o.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <article
                        draggable={cfg.canEdit}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          setDragId(o.id);
                        }}
                        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, cursor: cfg.canEdit ? "grab" : "pointer" }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>{o.client?.name ?? o.clientName ?? o.title}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 8 }}>{o.title}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>
                            <Money value={Number(o.value ?? 0)} />
                          </span>
                          <Tag variant={o.probability && o.probability >= 70 ? "positive" : o.probability && o.probability >= 40 ? "warning" : "default"}>
                            {o.probability ?? 0}%
                          </Tag>
                        </div>
                        <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "var(--surface-2)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${o.probability ?? 0}%`, background: (o.probability ?? 0) >= 70 ? "var(--success)" : (o.probability ?? 0) >= 40 ? "var(--primary)" : "var(--warning)", borderRadius: 2 }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                          <span>{o.owner?.nombre ?? "—"}</span>
                          <span>{daysAgo(o.createdAt)}</span>
                        </div>
                      </article>
                    </Link>
                  ))}
                  {opps.length === 0 && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "center", padding: 12 }}>Sin oportunidades</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
