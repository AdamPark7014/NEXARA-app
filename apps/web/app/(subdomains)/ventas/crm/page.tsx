"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import {
  listSalesLeads,
  listSalesOpportunities,
  type SalesLead,
  type SalesOpportunity,
} from "@/lib/sales-api";
import { getTenderDashboard, type TenderDashboard } from "@/lib/tenders-api";

const STAGES: Array<{ key: string; label: string; color: string; weight: number }> = [
  { key: "DISCOVERY", label: "Descubrimiento", color: "#6b7280", weight: 0.10 },
  { key: "QUALIFICATION", label: "Calificación", color: "#3b82f6", weight: 0.25 },
  { key: "PROPOSAL", label: "Propuesta", color: "#8b5cf6", weight: 0.50 },
  { key: "NEGOTIATION", label: "Negociación", color: "#f59e0b", weight: 0.75 },
  { key: "CLOSING", label: "Cierre", color: "#ef4444", weight: 0.90 },
];

const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSED", "WON", "LOST"];

const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

export default function CrmDashboardPage() {
  const { user } = useUser();
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [opps, setOpps] = useState<SalesOpportunity[]>([]);
  const [tenderDash, setTenderDash] = useState<TenderDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const [l, o, td] = await Promise.all([
        listSalesLeads(user.token).catch(() => []),
        listSalesOpportunities(user.token).catch(() => []),
        getTenderDashboard(user.token).catch(() => null),
      ]);
      setLeads(l as SalesLead[]);
      setOpps(o as SalesOpportunity[]);
      setTenderDash(td);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  // Lead metrics
  const leadsByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    LEAD_STATUSES.forEach((s) => { map[s] = 0; });
    leads.forEach((l) => { map[l.status] = (map[l.status] || 0) + 1; });
    return map;
  }, [leads]);

  const hotLeads = useMemo(
    () => leads.filter((l) => (l.score || 0) >= 60 && l.status === "NEW").slice(0, 6),
    [leads],
  );

  // Opportunity funnel
  const funnel = useMemo(() => {
    return STAGES.map((s) => {
      const stageOpps = opps.filter((o) => o.stage === s.key);
      const value = stageOpps.reduce((acc, o) => acc + Number(o.value || 0), 0);
      const weighted = value * s.weight;
      return { ...s, count: stageOpps.length, value, weighted };
    });
  }, [opps]);

  const forecast = useMemo(() => funnel.reduce((acc, f) => acc + f.weighted, 0), [funnel]);
  const pipelineActive = useMemo(
    () => opps.filter((o) => o.stage !== "WON" && o.stage !== "LOST").reduce((a, o) => a + Number(o.value || 0), 0),
    [opps],
  );
  const won = useMemo(() => opps.filter((o) => o.stage === "WON").reduce((a, o) => a + Number(o.value || 0), 0), [opps]);

  const totalLeads = leads.length;
  const qualifiedLeads = leads.filter((l) => (l.score || 0) >= 60).length;
  const conversionRate = totalLeads > 0 ? (opps.length / totalLeads) * 100 : 0;
  const winRate = opps.length > 0
    ? (opps.filter((o) => o.stage === "WON").length / opps.length) * 100
    : 0;

  const maxFunnelValue = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>📊 CRM Dashboard</h1>
      <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
        Embudo comercial completo: leads, oportunidades, licitaciones y forecast ponderado.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginTop: 16 }}>
        <Kpi label="Leads totales" value={totalLeads} color="#3b82f6" sub={`${qualifiedLeads} calificados`} />
        <Kpi label="Pipeline activo" value={fmt(pipelineActive)} color="#8b5cf6" sub={`${opps.filter((o) => o.stage !== "WON" && o.stage !== "LOST").length} ops`} />
        <Kpi label="Forecast" value={fmt(forecast)} color="#16a34a" sub="ponderado" />
        <Kpi label="Cerrados ganados" value={fmt(won)} color="#22c55e" sub={`${winRate.toFixed(1)}% win rate`} />
        <Kpi label="Licitaciones" value={fmt(tenderDash?.activePipelineValue || 0)} color="#f59e0b" sub={`${tenderDash?.winRate || 0}% win`} />
        <Kpi label="Conversión lead→opp" value={`${conversionRate.toFixed(1)}%`} color="#0ea5e9" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16 }}>
        {/* Funnel visual */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>🔻 Embudo comercial</h3>
          <p style={{ color: "var(--text-secondary)", marginTop: 0, fontSize: 13 }}>
            Visualización del avance de oportunidades por etapa con peso de probabilidad.
          </p>
          {loading ? (
            <p>Cargando…</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {funnel.map((f) => {
                const widthPct = (f.value / maxFunnelValue) * 100;
                return (
                  <div key={f.key} style={{ display: "grid", gridTemplateColumns: "180px 1fr 120px 100px", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, background: f.color, borderRadius: 4, marginRight: 6 }} />
                      {f.label}
                      <span style={{ marginLeft: 6, color: "var(--text-secondary)", fontSize: 11 }}>({f.count})</span>
                    </div>
                    <div style={{ height: 18, background: "var(--bg-secondary)", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ width: `${widthPct}%`, height: "100%", background: f.color }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, textAlign: "right" }}>{fmt(f.value)}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "right" }}>
                      ~ {fmt(f.weighted)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <strong>Total ponderado</strong>
            <strong style={{ color: "#16a34a" }}>{fmt(forecast)}</strong>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <Link href="/pipeline" className="button-primary" style={{ padding: "8px 12px", borderRadius: 8, textDecoration: "none" }}>
              Ver Kanban
            </Link>
            <Link href="/oportunidades" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", textDecoration: "none", color: "inherit" }}>
              Lista de oportunidades
            </Link>
          </div>
        </div>

        {/* Leads card */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>🎯 Leads por estado</h3>
          {loading ? (
            <p>Cargando…</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {LEAD_STATUSES.map((s) => (
                <div key={s} style={{ display: "flex", justifyContent: "space-between", padding: 6, background: "var(--bg-secondary)", borderRadius: 6 }}>
                  <span style={{ fontSize: 13 }}>{s}</span>
                  <strong>{leadsByStatus[s] || 0}</strong>
                </div>
              ))}
            </div>
          )}

          <h4 style={{ marginTop: 16, marginBottom: 6 }}>🔥 Leads calientes (score ≥ 60)</h4>
          {hotLeads.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Sin leads calientes pendientes.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {hotLeads.map((l) => (
                <Link key={l.id} href={`/leads?id=${l.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ padding: 8, background: "var(--bg-secondary)", borderRadius: 6, fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{l.name || l.company || l.email}</strong>
                      <span style={{ color: "#dc2626", fontWeight: 700 }}>{l.score}/100</span>
                    </div>
                    {l.company && <div style={{ color: "var(--text-secondary)" }}>{l.company}</div>}
                    {l.source && <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>📍 {l.source}</div>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tender summary */}
      {tenderDash && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>📋 Resumen licitaciones</h3>
            <Link href="/licitaciones" style={{ color: "var(--primary)", textDecoration: "none", fontSize: 13 }}>
              Ver todas →
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
            {tenderDash.byStatus.slice(0, 8).map((s) => (
              <div key={s.status} style={{ padding: 10, background: "var(--bg-secondary)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.status}</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{s.count}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{fmt(s.value)}</div>
              </div>
            ))}
          </div>
          {tenderDash.upcoming.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>⏰ Próximos vencimientos:</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginTop: 6 }}>
                {tenderDash.upcoming.slice(0, 6).map((u) => (
                  <Link key={u.id} href={`/licitaciones/${u.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}>
                      <strong>{u.tenderNumber}</strong>
                      <div style={{ color: "var(--text-secondary)" }}>{u.title}</div>
                      <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 2 }}>
                        Cierra {u.submissionDeadline ? new Date(u.submissionDeadline).toLocaleDateString("es-MX") : "—"}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}
