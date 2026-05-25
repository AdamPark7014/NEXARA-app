"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type FinancialDashboard = {
  cash: { totalBalance: number; accounts: Array<{ id: number; name: string; bankName: string; currentBalance: number; currency: string }> };
  profitAndLoss: {
    month: { revenue: number; expenses: number; profit: number; marginPct: number; growthVsPrev: number };
    ytd: { revenue: number; expenses: number; profit: number; marginPct: number };
  };
  accountsReceivable: { total: number; collected: number; pending: number };
  accountsPayable: { total: number; paid: number; pending: number };
  workingCapital: number;
  overdueInvoices: number;
  invoices: { month: number; ytd: number };
  topReceivables: Array<{ name: string; total: number; paid: number; pending: number }>;
  topPayables: Array<{ name: string; total: number; paid: number; pending: number }>;
};

const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

export default function FinancialDashboardPage() {
  const { user } = useUser();
  const [data, setData] = useState<FinancialDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("accounting/invoices/financial-dashboard"), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as FinancialDashboard;
      setData(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading && !data) return <div>Cargando dashboard financiero…</div>;
  if (error && !data) return <div style={{ color: "#b91c1c" }}>{error}</div>;
  if (!data) return null;

  const m = data.profitAndLoss.month;
  const y = data.profitAndLoss.ytd;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>💼 Resumen ejecutivo financiero</h2>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            P&L mensual y anual, flujo de efectivo, AR/AP y working capital.
          </p>
        </div>
        <button type="button" onClick={refresh} className="button-primary" style={{ padding: "8px 14px" }}>🔄 Actualizar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <Kpi label="Caja consolidada" value={fmt(data.cash.totalBalance)} color="#16a34a" />
        <Kpi label="Working capital" value={fmt(data.workingCapital)} color={data.workingCapital >= 0 ? "#16a34a" : "#dc2626"} />
        <Kpi label="Por cobrar (AR)" value={fmt(data.accountsReceivable.pending)} color="#3b82f6" sub={`${fmt(data.accountsReceivable.total)} total`} />
        <Kpi label="Por pagar (AP)" value={fmt(data.accountsPayable.pending)} color="#f59e0b" sub={`${fmt(data.accountsPayable.total)} total`} />
        <Kpi label="Facturas vencidas" value={data.overdueInvoices} color={data.overdueInvoices > 0 ? "#dc2626" : "#16a34a"} />
        <Kpi label="Facturas mes" value={data.invoices.month} color="#6b7280" sub={`${data.invoices.ytd} YTD`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>📈 P&L del mes</h3>
          <Row label="Ingresos" value={fmt(m.revenue)} />
          <Row label="Gastos" value={fmt(m.expenses)} />
          <Row label="Utilidad" value={<strong style={{ color: m.profit >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(m.profit)}</strong>} />
          <Row label="Margen" value={`${m.marginPct}%`} />
          <Row label="Crecimiento vs mes anterior" value={<span style={{ color: m.growthVsPrev >= 0 ? "#16a34a" : "#dc2626" }}>{m.growthVsPrev >= 0 ? "+" : ""}{m.growthVsPrev}%</span>} />
        </div>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>📊 P&L YTD</h3>
          <Row label="Ingresos" value={fmt(y.revenue)} />
          <Row label="Gastos" value={fmt(y.expenses)} />
          <Row label="Utilidad" value={<strong style={{ color: y.profit >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(y.profit)}</strong>} />
          <Row label="Margen" value={`${y.marginPct}%`} />
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>🏦 Cuentas bancarias</h3>
        {data.cash.accounts.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>Sin cuentas activas.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><Th>Cuenta</Th><Th>Banco</Th><Th>Moneda</Th><Th align="right">Saldo</Th></tr>
            </thead>
            <tbody>
              {data.cash.accounts.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <Td>{a.name}</Td>
                  <Td>{a.bankName}</Td>
                  <Td>{a.currency}</Td>
                  <Td align="right" style={{ fontWeight: 600 }}>{fmt(Number(a.currentBalance))}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>💰 Top cuentas por cobrar</h3>
          {data.topReceivables.length === 0 ? <p style={{ color: "var(--text-secondary)" }}>Sin AR pendiente.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><Th>Cliente</Th><Th align="right">Total</Th><Th align="right">Pendiente</Th></tr></thead>
              <tbody>
                {data.topReceivables.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td>{r.name || "—"}</Td>
                    <Td align="right">{fmt(r.total)}</Td>
                    <Td align="right" style={{ color: "#dc2626", fontWeight: 600 }}>{fmt(r.pending)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>💸 Top cuentas por pagar</h3>
          {data.topPayables.length === 0 ? <p style={{ color: "var(--text-secondary)" }}>Sin AP pendiente.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><Th>Proveedor</Th><Th align="right">Total</Th><Th align="right">Pendiente</Th></tr></thead>
              <tbody>
                {data.topPayables.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td>{r.name || "—"}</Td>
                    <Td align="right">{fmt(r.total)}</Td>
                    <Td align="right" style={{ color: "#f59e0b", fontWeight: 600 }}>{fmt(r.pending)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 10, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <th style={{ textAlign: align || "left", padding: 8, background: "var(--bg-secondary)", fontSize: 12 }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: "right"; style?: React.CSSProperties }) {
  return <td style={{ padding: 8, textAlign: align || "left", fontSize: 13, ...style }}>{children}</td>;
}

const cardStyle: React.CSSProperties = {
  padding: 16,
  background: "var(--bg-primary)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  marginTop: 16,
};
