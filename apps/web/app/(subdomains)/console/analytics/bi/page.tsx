"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";

type MarginByType = {
  projectType: string;
  count: number;
  budget: number;
  cost: number;
  margin: number;
  marginPercent: number;
  closed: number;
  avgMarginPerProject: number;
};

type EngineerRow = {
  engineerId: number;
  engineerName: string;
  totalActivities: number;
  completed: number;
  completionRate: number;
  avgEfficiency: number | null;
  avgDurationMin: number | null;
};

type ClientRoi = {
  clientId: number;
  clientName: string;
  projects: number;
  revenue: number;
  cost: number;
  margin: number;
  roi: number;
  marginPercent: number;
  closed: number;
};

type BranchRow = {
  clientName: string;
  branchName: string | null;
  total: number;
  completed: number;
  completionRate: number;
  avgEfficiency: number | null;
};

type ContractsKpis = {
  activeContracts: number;
  totalContracts: number;
  monthlyRecurringRevenue: number;
  upcomingVisits: number;
  generatedVisits: number;
};

type ExecutiveBi = {
  generatedAt: string;
  summary: {
    revenue: number | string;
    expenses: number | string;
    openPurchaseOrders: number;
    pendingMaintenanceOrders: number;
    lowStockAlerts: number;
  };
  contracts: ContractsKpis;
  marginByType: MarginByType[];
  engineers: EngineerRow[];
  clientRoi: ClientRoi[];
  branches: BranchRow[];
};

const PROJECT_TYPE_LABEL: Record<string, string> = {
  INSTALACION_CCTV: "Instalación CCTV",
  CABLEADO_ESTRUCTURADO: "Cableado estructurado",
  CONTROL_ACCESO: "Control de acceso",
  REDES_WIFI: "Redes / WiFi",
  COMPUTO: "Cómputo",
  AUDITORIA_NODOS: "Auditoría nodos",
  MANTENIMIENTO: "Mantenimiento",
  SUSTITUCION_EQUIPOS: "Sustitución equipos",
  PROYECTO_INTEGRAL: "Proyecto integral",
  OTRO: "Otro",
};

const fmtMoney = (n: number | string) => `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function ExecutiveBiPage() {
  const { user } = useUser();
  const [data, setData] = useState<ExecutiveBi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("analytics/bi/executive"), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();
      setData(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "No se pudo cargar BI ejecutivo");
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading && !data) {
    return <div style={{ padding: 24 }}>Cargando dashboard ejecutivo…</div>;
  }
  if (error && !data) {
    return <div style={{ padding: 24, color: "#b91c1c" }}>{error}</div>;
  }
  if (!data) return null;

  const totalMargin = data.marginByType.reduce((acc, m) => acc + m.margin, 0);
  const totalRevenue = data.marginByType.reduce((acc, m) => acc + m.budget, 0);
  const overallMarginPct = totalRevenue > 0 ? +((totalMargin / totalRevenue) * 100).toFixed(1) : 0;

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0 }}>📊 BI Ejecutivo</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Visión consolidada de margen, productividad operativa y ROI por cliente · actualizado{" "}
            {new Date(data.generatedAt).toLocaleString("es-MX")}
          </p>
        </div>
        <button type="button" className="button-primary" onClick={refresh} disabled={loading}>
          {loading ? "Actualizando…" : "🔄 Refrescar"}
        </button>
      </div>

      {/* Top KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 16 }}>
        <KpiCard label="Ingreso aprobado" value={fmtMoney(data.summary.revenue)} color="#16a34a" sub="Cotizaciones aprobadas" />
        <KpiCard label="Margen global" value={`${overallMarginPct}%`} color={overallMarginPct >= 20 ? "#16a34a" : overallMarginPct >= 10 ? "#f59e0b" : "#dc2626"} sub={fmtMoney(totalMargin)} />
        <KpiCard label="MRR contratos" value={fmtMoney(data.contracts.monthlyRecurringRevenue)} color="#3b82f6" sub={`${data.contracts.activeContracts} activos`} />
        <KpiCard label="Visitas próximas" value={data.contracts.upcomingVisits} color="#f59e0b" sub={`${data.contracts.generatedVisits} OT generadas`} />
        <KpiCard label="OT mantenimiento" value={data.summary.pendingMaintenanceOrders} color="#0ea5e9" sub={`${data.summary.lowStockAlerts} alertas stock`} />
      </div>

      {/* Margen por tipo */}
      <Section title="💼 Margen por tipo de proyecto" subtitle="Rentabilidad real vs presupuestada agrupada por línea de servicio">
        {data.marginByType.length === 0 ? (
          <Empty />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Tipo</Th>
                <Th align="right">Proyectos</Th>
                <Th align="right">Cerrados</Th>
                <Th align="right">Ingreso</Th>
                <Th align="right">Costo</Th>
                <Th align="right">Margen</Th>
                <Th align="right">% Margen</Th>
                <Th>Visualización</Th>
              </tr>
            </thead>
            <tbody>
              {data.marginByType.map((m) => (
                <tr key={m.projectType} style={trStyle}>
                  <Td><strong>{PROJECT_TYPE_LABEL[m.projectType] || m.projectType}</strong></Td>
                  <Td align="right">{m.count}</Td>
                  <Td align="right">{m.closed}</Td>
                  <Td align="right">{fmtMoney(m.budget)}</Td>
                  <Td align="right">{fmtMoney(m.cost)}</Td>
                  <Td align="right" style={{ color: m.margin >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{fmtMoney(m.margin)}</Td>
                  <Td align="right">
                    <Badge color={m.marginPercent >= 20 ? "#16a34a" : m.marginPercent >= 10 ? "#f59e0b" : "#dc2626"}>
                      {m.marginPercent}%
                    </Badge>
                  </Td>
                  <Td>
                    <Bar value={m.marginPercent} max={50} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Ranking ingenieros */}
      <Section title="🛠 Ranking de ingenieros (90 días)" subtitle="Productividad, eficiencia promedio y tiempo de resolución por técnico">
        {data.engineers.length === 0 ? (
          <Empty />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Ingeniero</Th>
                <Th align="right">Total OT</Th>
                <Th align="right">Cerradas</Th>
                <Th align="right">% Cierre</Th>
                <Th align="right">Eficiencia</Th>
                <Th align="right">Tiempo prom.</Th>
              </tr>
            </thead>
            <tbody>
              {data.engineers.map((e, idx) => (
                <tr key={e.engineerId} style={trStyle}>
                  <Td>{idx + 1}</Td>
                  <Td><strong>{e.engineerName}</strong></Td>
                  <Td align="right">{e.totalActivities}</Td>
                  <Td align="right">{e.completed}</Td>
                  <Td align="right">
                    <Badge color={e.completionRate >= 80 ? "#16a34a" : e.completionRate >= 60 ? "#f59e0b" : "#dc2626"}>
                      {e.completionRate}%
                    </Badge>
                  </Td>
                  <Td align="right">{e.avgEfficiency != null ? `${e.avgEfficiency}/100` : "—"}</Td>
                  <Td align="right">{e.avgDurationMin != null ? `${Math.round(e.avgDurationMin / 60 * 10) / 10} h` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ROI por cliente */}
      <Section title="🏢 ROI por cliente (12 meses)" subtitle="Ingreso vs costo operativo neto · ordenado por margen">
        {data.clientRoi.length === 0 ? (
          <Empty />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th align="right">Proyectos</Th>
                <Th align="right">Cerrados</Th>
                <Th align="right">Ingreso</Th>
                <Th align="right">Costo</Th>
                <Th align="right">Margen</Th>
                <Th align="right">% Margen</Th>
                <Th align="right">ROI</Th>
              </tr>
            </thead>
            <tbody>
              {data.clientRoi.map((c) => (
                <tr key={c.clientId} style={trStyle}>
                  <Td><strong>{c.clientName}</strong></Td>
                  <Td align="right">{c.projects}</Td>
                  <Td align="right">{c.closed}</Td>
                  <Td align="right">{fmtMoney(c.revenue)}</Td>
                  <Td align="right">{fmtMoney(c.cost)}</Td>
                  <Td align="right" style={{ color: c.margin >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{fmtMoney(c.margin)}</Td>
                  <Td align="right">
                    <Badge color={c.marginPercent >= 20 ? "#16a34a" : c.marginPercent >= 10 ? "#f59e0b" : "#dc2626"}>
                      {c.marginPercent}%
                    </Badge>
                  </Td>
                  <Td align="right">
                    <Badge color={c.roi >= 30 ? "#16a34a" : c.roi >= 10 ? "#f59e0b" : "#dc2626"}>
                      {c.roi}%
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Sucursales */}
      <Section title="📍 Sucursales con más actividad (180 días)" subtitle="Volumen de OT por sucursal cliente y tasa de cierre">
        {data.branches.length === 0 ? (
          <Empty />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Sucursal</Th>
                <Th align="right">Total OT</Th>
                <Th align="right">Cerradas</Th>
                <Th align="right">% Cierre</Th>
                <Th align="right">Eficiencia</Th>
              </tr>
            </thead>
            <tbody>
              {data.branches.map((b, idx) => (
                <tr key={`${b.clientName}-${b.branchName}-${idx}`} style={trStyle}>
                  <Td>{b.clientName}</Td>
                  <Td><strong>{b.branchName || "Sin sucursal"}</strong></Td>
                  <Td align="right">{b.total}</Td>
                  <Td align="right">{b.completed}</Td>
                  <Td align="right">
                    <Badge color={b.completionRate >= 80 ? "#16a34a" : b.completionRate >= 60 ? "#f59e0b" : "#dc2626"}>
                      {b.completionRate}%
                    </Badge>
                  </Td>
                  <Td align="right">{b.avgEfficiency != null ? `${b.avgEfficiency}/100` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

// ── helpers UI ────────────────────────────────────────────────────────

function KpiCard({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16, marginTop: 18 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {subtitle && <p style={{ color: "var(--text-secondary)", marginTop: 4, marginBottom: 12, fontSize: 13 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function Empty() {
  return <p style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>Sin datos en el periodo evaluado.</p>;
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      style={{
        textAlign: align || "left",
        padding: 10,
        background: "var(--bg-secondary)",
        fontSize: 12,
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align, style }: { children: React.ReactNode; align?: "right"; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: 10, textAlign: align || "left", fontSize: 13, ...style }}>
      {children}
    </td>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        background: `${color}22`,
        color,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

function Bar({ value, max = 100 }: { value: number; max?: number }) {
  const clamped = Math.max(0, Math.min(value, max));
  const width = (clamped / max) * 100;
  const color = value >= 20 ? "#16a34a" : value >= 10 ? "#f59e0b" : "#dc2626";
  return (
    <div style={{ width: 140, height: 8, background: "var(--bg-secondary)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${width}%`, height: "100%", background: color }} />
    </div>
  );
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const trStyle: React.CSSProperties = { borderTop: "1px solid var(--border)" };
