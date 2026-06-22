"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Money, Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface Opportunity {
  id: number;
  nombre?: string;
  concepto?: string;
  monto?: number;
  probabilidad?: number;
  etapa?: string;
  cierreEsperado?: string;
  cliente?: { razonSocial?: string };
  owner?: { nombre?: string };
  createdAt?: string;
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

const STAGES: { id: string; name: string; color: string; description: string }[] = [
  { id: "Discovery", name: "Discovery", color: "#94a3b8", description: "Detectar necesidad real" },
  { id: "Calificado", name: "Calificado", color: "#0ea5e9", description: "Presupuesto y autoridad confirmados" },
  { id: "Cotización", name: "Cotización", color: "#6366f1", description: "Propuesta formal enviada" },
  { id: "Negociación", name: "Negociación", color: "#f59e0b", description: "Ajustando precio o alcance" },
  { id: "Cierre", name: "Cierre", color: "#10b981", description: "Firma o PO en proceso" },
];

function daysAgo(iso?: string): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "Hoy" : `${d}d`;
}

export default function PipelinePage() {
  const { user } = useUser();
  const { canEdit } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("ventas/oportunidades", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el pipeline");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>();
    for (const s of STAGES) map.set(s.id, []);
    for (const o of items) {
      const key = o.etapa ?? "Discovery";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return map;
  }, [items]);

  const moveStage = async (id: number, etapa: string) => {
    if (!token) return;
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, etapa } : o)));
    try {
      await apiFetch(`ventas/oportunidades/${id}`, token, { method: "PATCH", body: JSON.stringify({ etapa }) });
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
      void load();
    }
  };

  const totalPipeline = items.filter((o) => o.etapa !== "Perdido" && o.etapa !== "Ganado").reduce((s, o) => s + (o.monto ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="CRM · Pipeline"
        title="Pipeline visual"
        subtitle={`${items.length} oportunidades · $${(totalPipeline / 1000000).toFixed(1)}M en juego. Arrastra una tarjeta para cambiar de etapa.`}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      {loading && <EmptyState icon="⏳" title="Cargando pipeline…" description="Consultando oportunidades." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12 }}>
          {STAGES.map((stage) => {
            const opps = byStage.get(stage.id) ?? [];
            const stageTotal = opps.reduce((s, o) => s + (o.monto ?? 0), 0);
            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (canEdit && dragId != null) void moveStage(dragId, stage.id); setDragId(null); }}
                style={{ minWidth: 270, flex: "1 0 270px", background: "color-mix(in srgb, var(--surface-2) 50%, transparent)", border: "1px solid var(--border)", borderRadius: 14, padding: 12 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: stage.color }} />
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{stage.name}</div>
                  <Tag variant="default">{opps.length}</Tag>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 10 }}>{stage.description}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 10 }}>
                  <Money value={stageTotal} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                  {opps.map((o) => (
                    <article
                      key={o.id}
                      draggable={canEdit}
                      onDragStart={() => setDragId(o.id)}
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, cursor: canEdit ? "grab" : "default" }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>{o.cliente?.razonSocial ?? o.nombre ?? "—"}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 8 }}>{o.concepto?.slice(0, 50) ?? ""}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}><Money value={o.monto ?? 0} /></span>
                        <Tag variant={o.probabilidad && o.probabilidad >= 70 ? "positive" : o.probabilidad && o.probabilidad >= 40 ? "warning" : "default"}>{o.probabilidad ?? 0}%</Tag>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                        <span>{o.owner?.nombre ?? "—"}</span>
                        <span>{daysAgo(o.createdAt)}</span>
                      </div>
                    </article>
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
