"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import {
  listSalesOpportunities,
  updateSalesOpportunityStage,
  type SalesOpportunity,
} from "@/lib/sales-api";

type Stage = "DISCOVERY" | "QUALIFICATION" | "PROPOSAL" | "NEGOTIATION" | "CLOSING" | "WON" | "LOST";

const STAGES: Array<{ key: Stage; label: string; color: string; defaultProb: number }> = [
  { key: "DISCOVERY", label: "Descubrimiento", color: "#6b7280", defaultProb: 10 },
  { key: "QUALIFICATION", label: "Calificación", color: "#3b82f6", defaultProb: 25 },
  { key: "PROPOSAL", label: "Propuesta", color: "#8b5cf6", defaultProb: 50 },
  { key: "NEGOTIATION", label: "Negociación", color: "#f59e0b", defaultProb: 75 },
  { key: "CLOSING", label: "Cierre", color: "#ef4444", defaultProb: 90 },
  { key: "WON", label: "Ganada", color: "#16a34a", defaultProb: 100 },
  { key: "LOST", label: "Perdida", color: "#dc2626", defaultProb: 0 },
];

const money = (n: number | string) =>
  `$${Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

export default function PipelinePage() {
  const { user } = useUser();
  const [opps, setOpps] = useState<SalesOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<{ id: number; from: Stage } | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const data = await listSalesOpportunities(user.token);
      setOpps(data);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const grouped = useMemo(() => {
    const groups: Record<Stage, SalesOpportunity[]> = {
      DISCOVERY: [],
      QUALIFICATION: [],
      PROPOSAL: [],
      NEGOTIATION: [],
      CLOSING: [],
      WON: [],
      LOST: [],
    };
    opps.forEach((o) => {
      const stage = (o.stage || "DISCOVERY") as Stage;
      if (groups[stage]) groups[stage].push(o);
    });
    return groups;
  }, [opps]);

  const handleDrop = async (stage: Stage) => {
    if (!drag) return;
    if (drag.from === stage) {
      setDrag(null);
      return;
    }
    setUpdating(drag.id);
    try {
      await updateSalesOpportunityStage(user?.token || "", drag.id, stage);
      setOpps((prev) =>
        prev.map((o) => (o.id === drag.id ? { ...o, stage } : o)),
      );
      setMsg(`Oportunidad #${drag.id} movida a ${STAGES.find((s) => s.key === stage)?.label}`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setDrag(null);
      setUpdating(null);
    }
  };

  const totalPipelineActive = useMemo(() => {
    return opps
      .filter((o) => o.stage !== "WON" && o.stage !== "LOST")
      .reduce((acc, o) => acc + Number(o.value || 0), 0);
  }, [opps]);

  const weightedForecast = useMemo(() => {
    return opps
      .filter((o) => o.stage !== "WON" && o.stage !== "LOST")
      .reduce((acc, o) => acc + Number(o.value || 0) * (Number(o.probability || 0) / 100), 0);
  }, [opps]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🧭 Pipeline comercial (Kanban)</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Arrastra oportunidades entre etapas para actualizar el embudo. Cierres mensuales en tiempo real.
          </p>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <Stat label="Pipeline activo" value={money(totalPipelineActive)} color="#3b82f6" />
          <Stat label="Forecast ponderado" value={money(weightedForecast)} color="#16a34a" />
          <Stat label="Total oportunidades" value={opps.length} color="#6b7280" />
        </div>
      </div>

      {msg && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "#dcfce7", color: "#166534" }}>{msg}</div>
      )}

      {loading ? (
        <p>Cargando pipeline…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12, marginTop: 16, overflowX: "auto" }}>
          {STAGES.map((stage) => {
            const cards = grouped[stage.key];
            const stageTotal = cards.reduce((acc, o) => acc + Number(o.value || 0), 0);
            return (
              <div
                key={stage.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(stage.key)}
                style={{
                  minWidth: 200,
                  background: "var(--bg-secondary)",
                  borderRadius: 12,
                  padding: 10,
                  borderTop: `4px solid ${stage.color}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: stage.color, fontWeight: 700, textTransform: "uppercase" }}>{stage.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{cards.length} ops</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "right" }}>{money(stageTotal)}</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 120 }}>
                  {cards.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", fontStyle: "italic", textAlign: "center", padding: 12 }}>
                      Sin oportunidades
                    </div>
                  ) : (
                    cards.map((opp) => (
                      <div
                        key={opp.id}
                        draggable
                        onDragStart={() => setDrag({ id: opp.id, from: stage.key })}
                        style={{
                          padding: 10,
                          background: "var(--bg-primary)",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          cursor: "grab",
                          opacity: updating === opp.id ? 0.5 : 1,
                          boxShadow: drag?.id === opp.id ? "0 0 0 2px var(--primary)" : "none",
                        }}
                      >
                        <Link href={`/oportunidades?id=${opp.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{opp.title}</div>
                          {opp.client && (
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{opp.client.name}</div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                            <strong style={{ color: stage.color, fontSize: 13 }}>{money(opp.value)}</strong>
                            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{opp.probability}%</span>
                          </div>
                          {opp.owner && (
                            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>👤 {opp.owner.nombre}</div>
                          )}
                          {opp.expectedCloseDate && (
                            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>📅 {new Date(opp.expectedCloseDate).toLocaleDateString("es-MX")}</div>
                          )}
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ minWidth: 140, padding: 10, borderRadius: 8, background: "var(--bg-secondary)", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
