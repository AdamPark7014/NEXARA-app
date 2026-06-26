"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Money, Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { filterRowsByScope, getCrmSalesSectionConfig } from "@/lib/section-views";
import {
  PIPELINE_STAGES,
  isClosedOpportunityStage,
  listSalesOpportunities,
  updateSalesOpportunityStage,
  type SalesOpportunity,
} from "@/lib/sales-api";

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

  const byStage = useMemo(() => {
    const map = new Map<string, SalesOpportunity[]>();
    for (const s of PIPELINE_STAGES) map.set(s.id, []);
    for (const o of scopedItems) {
      if (isClosedOpportunityStage(o.stage)) continue;
      const key = PIPELINE_STAGES.some((s) => s.id === o.stage) ? o.stage : "DISCOVERY";
      map.get(key)!.push(o);
    }
    return map;
  }, [scopedItems]);

  const moveStage = async (id: number, stage: string) => {
    if (!token || !cfg.canEdit) return;
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, stage } : o)));
    try {
      await updateSalesOpportunityStage(token, id, stage);
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
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
        subtitle={`${scopedItems.length} oportunidades · $${(totalPipeline / 1000000).toFixed(1)}M en juego. ${cfg.canEdit ? "Arrastra una tarjeta para cambiar de etapa." : "Vista de solo lectura."}`}
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

      {loading && <EmptyState icon="⏳" title="Cargando pipeline…" description="Consultando oportunidades." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

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
