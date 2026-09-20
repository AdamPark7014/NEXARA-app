"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { Money } from "@/components/ui/DataTable";

type WorkspaceDashboard = {
  period: { from: string; to: string };
  cashBalance: number;
  accountsReceivablePending: number;
  accountsPayablePending: number;
  invoicesPeriod: { issued: number; received: number; total: number };
  prenominaDraftTotal: number;
  income: number;
  expense: number;
  netCashflow: number;
  agingReceivable: { overdue: number; dueToday: number; next7: number; next30: number };
  agingPayable: { overdue: number; next7: number; next30: number };
  alerts: { id: string; severity: "warning" | "danger" | "info"; message: string; href?: string }[];
};

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function ContabilidadDashboardPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState<WorkspaceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      const res = await fetch(buildApiUrl(`accounting/workspace/dashboard?${qs}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setError(formatApiError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const subtitle = useMemo(
    () => `Periodo ${range.from} → ${range.to}. Dinero, obligaciones y pendientes de revisión.`,
    [range],
  );

  return (
    <>
      <PageHeader
        eyebrow="ERP · Contabilidad"
        title="Resumen financiero"
        subtitle={subtitle}
        density="ops"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              style={{ fontSize: 12, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)" }}
            />
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              style={{ fontSize: 12, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)" }}
            />
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              Actualizar
            </Button>
            <Button size="sm" variant="secondary" href="/erp/contabilidad/cierres">
              Cerrar periodo
            </Button>
          </div>
        }
      />

      {error && (
        <div style={{ padding: 12, marginBottom: 12, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Saldo disponible" value={loading ? "…" : <Money value={data?.cashBalance ?? 0} />} icon="🏦" />
        <KpiCard label="Por cobrar" value={loading ? "…" : <Money value={data?.accountsReceivablePending ?? 0} />} icon="📥" variant="warning" />
        <KpiCard label="Por pagar" value={loading ? "…" : <Money value={data?.accountsPayablePending ?? 0} />} icon="📤" variant="accent" />
        <KpiCard
          label="Facturas periodo"
          value={loading ? "…" : String(data?.invoicesPeriod.total ?? 0)}
          hint={data ? `${data.invoicesPeriod.issued} emit. · ${data.invoicesPeriod.received} rec.` : undefined}
          icon="🧾"
        />
        <KpiCard label="Pre-nómina" value={loading ? "…" : <Money value={data?.prenominaDraftTotal ?? 0} />} icon="👥" />
        <KpiCard label="Ingresos" value={loading ? "…" : <Money value={data?.income ?? 0} />} icon="📊" variant="positive" />
        <KpiCard label="Egresos" value={loading ? "…" : <Money value={data?.expense ?? 0} />} icon="💸" />
        <KpiCard label="Flujo neto" value={loading ? "…" : <Money value={data?.netCashflow ?? 0} />} icon="📈" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        <Section title="Cuentas por cobrar" dense>
          <AgingRows
            rows={[
              { label: "Vencido", value: data?.agingReceivable.overdue },
              { label: "Vence hoy", value: data?.agingReceivable.dueToday },
              { label: "Próximos 7 días", value: data?.agingReceivable.next7 },
              { label: "Próximos 30 días", value: data?.agingReceivable.next30 },
            ]}
            href="/erp/contabilidad/cuentas-por-cobrar"
          />
        </Section>
        <Section title="Cuentas por pagar" dense>
          <AgingRows
            rows={[
              { label: "Vencido", value: data?.agingPayable.overdue },
              { label: "Próximos 7 días", value: data?.agingPayable.next7 },
              { label: "Próximos 30 días", value: data?.agingPayable.next30 },
            ]}
            href="/erp/contabilidad/cuentas-por-pagar"
          />
        </Section>
        <Section title="Alertas" dense>
          {(data?.alerts?.length ?? 0) === 0 && !loading ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>Sin alertas en el periodo.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 13 }}>
              {(data?.alerts ?? []).map((a) => (
                <li key={a.id} style={{ color: a.severity === "danger" ? "var(--danger)" : a.severity === "warning" ? "var(--warning)" : "var(--text-secondary)" }}>
                  {a.href ? <Link href={a.href}>{a.message}</Link> : a.message}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

function AgingRows({
  rows,
  href,
}: {
  rows: { label: string; value?: number }[];
  href: string;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "var(--text-secondary)" }}>{r.label}</span>
          <strong><Money value={r.value ?? 0} /></strong>
        </div>
      ))}
      <Link href={href} style={{ fontSize: 12, color: "var(--primary)", marginTop: 4 }}>
        Ver detalle →
      </Link>
    </div>
  );
}
