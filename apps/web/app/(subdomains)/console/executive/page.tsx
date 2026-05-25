"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type CLevelPayload = {
  generatedAt: string;
  headlineKpis: {
    revenueMtd: number;
    revenuePrevMonth: number;
    revenueMoMChange: number;
    revenueYtd: number;
    wonOppsMtd: number;
    pipelineValue: number;
    pipelineCount: number;
    cashOnHand: number;
    arOutstanding: number;
    apOutstanding: number;
    workingCapital: number;
  };
  sales: { hotLeads: number; tendersOpen: number; tendersWon: number };
  operations: { activeProjects: number; otOpen: number; otOverdue: number; otCompletedMtd: number; ticketsOpen: number; ticketsClosedMtd: number };
  finance: { invoicedMtd: number; invoicesCountMtd: number; overdueInvoices: number };
  maintenance: { activeContracts: number; upcomingVisits: number };
  procurement: { pendingRequisitions: number; pendingPOs: number; lowStockItems: number };
  clientsCount: number;
  teamSize: number;
  topSellers: Array<{ ownerId: number; ownerName: string; revenue: number; wonCount: number }>;
  projectTypeBreakdown: Array<{ type: string; count: number }>;
  alerts: Array<{ level: 'critical' | 'warning' | 'info'; icon: string; title: string; message: string }>;
};

const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;
const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};

export default function ExecutiveDashboardPage() {
  const { user } = useUser();
  const [data, setData] = useState<CLevelPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("executive/c-level"), { headers: { Authorization: `Bearer ${user.token}` } });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading && !data) return <div style={{ padding: 24 }}>Cargando dashboard ejecutivo…</div>;
  if (err) return <div style={{ padding: 24, color: "#dc2626" }}>Error: {err}</div>;
  if (!data) return null;

  const { headlineKpis: h } = data;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>📊 Dashboard ejecutivo C-Level</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Visión 360° en tiempo real · Generado {new Date(data.generatedAt).toLocaleString("es-MX")}
          </p>
        </div>
        <button type="button" onClick={refresh} className="button-primary">🔄 Refrescar</button>
      </div>

      {data.alerts.length > 0 && (
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
          {data.alerts.map((a, i) => (
            <div key={i} style={{
              padding: 12,
              background: a.level === "critical" ? "#fee2e2" : a.level === "warning" ? "#fef3c7" : "#dbeafe",
              borderLeft: `4px solid ${a.level === "critical" ? "#dc2626" : a.level === "warning" ? "#f59e0b" : "#3b82f6"}`,
              borderRadius: 8,
              color: a.level === "critical" ? "#7f1d1d" : a.level === "warning" ? "#78350f" : "#1e3a8a",
            }}>
              <strong>{a.icon} {a.title}</strong>
              <div style={{ fontSize: 12, marginTop: 2 }}>{a.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* HEADLINE KPIs */}
      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>📈 Headline KPIs</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 8 }}>
          <BigKpi label="Revenue MTD" value={fmtCompact(h.revenueMtd)} delta={h.revenueMoMChange} color="#0ea5e9" />
          <BigKpi label="Revenue YTD" value={fmtCompact(h.revenueYtd)} color="#16a34a" />
          <BigKpi label="Pipeline" value={fmtCompact(h.pipelineValue)} sub={`${h.pipelineCount} oportunidades`} color="#8b5cf6" />
          <BigKpi label="Cash on hand" value={fmtCompact(h.cashOnHand)} color="#f59e0b" />
          <BigKpi label="Cuentas x cobrar" value={fmtCompact(h.arOutstanding)} color="#10b981" />
          <BigKpi label="Cuentas x pagar" value={fmtCompact(h.apOutstanding)} color="#dc2626" />
          <BigKpi label="Capital de trabajo" value={fmtCompact(h.workingCapital)} color={h.workingCapital >= 0 ? "#16a34a" : "#dc2626"} />
          <BigKpi label="Cerradas MTD" value={String(h.wonOppsMtd)} color="#06b6d4" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 24 }}>
        <Section title="💼 Comercial" color="#0ea5e9">
          <Row label="Leads calientes" value={data.sales.hotLeads} />
          <Row label="Licitaciones abiertas" value={data.sales.tendersOpen} />
          <Row label="Licitaciones ganadas" value={data.sales.tendersWon} />
          <Row label="Clientes activos" value={data.clientsCount} />
        </Section>

        <Section title="🏗️ Operaciones" color="#16a34a">
          <Row label="Proyectos activos" value={data.operations.activeProjects} />
          <Row label="OT abiertas" value={data.operations.otOpen} />
          <Row label="OT vencidas" value={data.operations.otOverdue} alert={data.operations.otOverdue > 0} />
          <Row label="OT completadas MTD" value={data.operations.otCompletedMtd} />
        </Section>

        <Section title="🎫 Tickets / Servicio" color="#8b5cf6">
          <Row label="Tickets abiertos" value={data.operations.ticketsOpen} />
          <Row label="Tickets cerrados MTD" value={data.operations.ticketsClosedMtd} />
        </Section>

        <Section title="💵 Finanzas" color="#f59e0b">
          <Row label="Facturado MTD" value={fmt(data.finance.invoicedMtd)} />
          <Row label="Facturas emitidas MTD" value={data.finance.invoicesCountMtd} />
          <Row label="Facturas vencidas" value={data.finance.overdueInvoices} alert={data.finance.overdueInvoices > 0} />
        </Section>

        <Section title="🔧 Mantenimiento" color="#06b6d4">
          <Row label="Contratos activos" value={data.maintenance.activeContracts} />
          <Row label="Visitas en 30 días" value={data.maintenance.upcomingVisits} />
        </Section>

        <Section title="📦 Compras / Inventario" color="#ef4444">
          <Row label="Requisiciones pendientes" value={data.procurement.pendingRequisitions} />
          <Row label="OC por aprobar" value={data.procurement.pendingPOs} />
          <Row label="Stock bajo" value={data.procurement.lowStockItems} alert={data.procurement.lowStockItems > 0} />
        </Section>

        <Section title="👥 Equipo" color="#a855f7">
          <Row label="Usuarios activos" value={data.teamSize} />
        </Section>
      </div>

      {/* TOP SELLERS */}
      {data.topSellers.length > 0 && (
        <div style={{ marginTop: 24, padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>🏆 Top vendedores del mes</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>#</Th><Th>Vendedor</Th><Th align="right">Cerradas</Th><Th align="right">Revenue</Th>
              </tr>
            </thead>
            <tbody>
              {data.topSellers.map((s, i) => (
                <tr key={s.ownerId} style={{ borderTop: "1px solid var(--border)" }}>
                  <Td>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}</Td>
                  <Td><strong>{s.ownerName}</strong></Td>
                  <Td align="right">{s.wonCount}</Td>
                  <Td align="right" style={{ color: "#16a34a", fontWeight: 700 }}>{fmt(s.revenue)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PROJECT TYPE BREAKDOWN */}
      {data.projectTypeBreakdown.length > 0 && (
        <div style={{ marginTop: 16, padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>🛠️ Distribución de proyectos por tipo (YTD)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {data.projectTypeBreakdown.map((p) => (
              <div key={p.type} style={{ padding: 10, background: "var(--bg-secondary)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.type}</div>
                <strong style={{ fontSize: 20 }}>{p.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BigKpi({ label, value, delta, sub, color }: { label: string; value: string; delta?: number; sub?: string; color: string }) {
  return (
    <div style={{ padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderTop: `4px solid ${color}`, borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{sub}</div>}
      {delta !== undefined && (
        <div style={{ fontSize: 12, marginTop: 4, color: delta >= 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs mes anterior
        </div>
      )}
    </div>
  );
}
function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderTop: `3px solid ${color}`, borderRadius: 10 }}>
      <strong style={{ fontSize: 14 }}>{title}</strong>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}
function Row({ label, value, alert }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px dashed var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <strong style={{ fontSize: 14, color: alert ? "#dc2626" : "var(--text-primary)" }}>{value}</strong>
    </div>
  );
}
function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <th style={{ textAlign: align || "left", padding: 8, background: "var(--bg-secondary)", fontSize: 12 }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: "right"; style?: React.CSSProperties }) {
  return <td style={{ padding: 8, textAlign: align || "left", fontSize: 13, ...style }}>{children}</td>;
}
