"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
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

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Dashboard Contadora — responde: qué pasa, qué está mal, qué reviso ahora.
 * No es una pared de KPIs.
 */
export default function ContabilidadDashboardPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState<WorkspaceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPeriod, setShowPeriod] = useState(false);

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

  const attention = useMemo(() => {
    if (!data) return [] as { label: string; detail: string; href: string; tone: "danger" | "warning" | "info" }[];
    const items: { label: string; detail: string; href: string; tone: "danger" | "warning" | "info" }[] = [];
    if (data.agingPayable.overdue > 0) {
      items.push({
        label: "Pagos vencidos",
        detail: formatMoney(data.agingPayable.overdue),
        href: "/erp/contabilidad/cuentas-por-pagar",
        tone: "danger",
      });
    }
    if (data.agingReceivable.overdue > 0) {
      items.push({
        label: "Cobros vencidos",
        detail: formatMoney(data.agingReceivable.overdue),
        href: "/erp/contabilidad/cuentas-por-cobrar",
        tone: "warning",
      });
    }
    for (const a of data.alerts) {
      if (items.some((i) => i.href === a.href && i.label === a.message)) continue;
      items.push({
        label: a.message,
        detail: a.severity === "danger" ? "Urgente" : a.severity === "warning" ? "Revisar" : "Pendiente",
        href: a.href || "/erp/contabilidad",
        tone: a.severity,
      });
    }
    return items.slice(0, 5);
  }, [data]);

  const primaryHref = attention[0]?.href ?? "/erp/contabilidad/cuentas-por-cobrar";
  const primaryLabel =
    attention.length > 0 ? "Revisar pendientes" : "Ver por cobrar";

  const monthLabel = useMemo(() => {
    try {
      const d = new Date(`${range.from}T12:00:00`);
      return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
    } catch {
      return `${range.from} → ${range.to}`;
    }
  }, [range]);

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Resumen"
        subtitle={loading ? "Cargando el periodo…" : `Qué está pasando en ${monthLabel}.`}
        density="ops"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Button size="sm" variant="ghost" onClick={() => setShowPeriod((v) => !v)}>
              Periodo
            </Button>
            <Link
              href={primaryHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 30,
                padding: "0 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
                color: "#fff",
                background: "var(--primary)",
              }}
            >
              {primaryLabel}
            </Link>
          </div>
        }
      />

      {showPeriod && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--nx-panel-hairline)",
            background: "var(--nx-panel-surface-overlay)",
          }}
        >
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Desde{" "}
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              style={{ marginLeft: 4, fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)" }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Hasta{" "}
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              style={{ marginLeft: 4, fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)" }}
            />
          </label>
          <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
            Aplicar
          </Button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: 12,
            marginBottom: 14,
            borderRadius: 10,
            background: "color-mix(in srgb, var(--danger) 10%, transparent)",
            color: "var(--danger)",
            fontSize: 13,
          }}
        >
          No se pudo cargar el resumen.{" "}
          <button
            type="button"
            onClick={() => void load()}
            style={{
              appearance: "none",
              border: "none",
              background: "transparent",
              color: "inherit",
              fontWeight: 700,
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Reintentar
          </button>
          <div style={{ marginTop: 4, opacity: 0.85, fontSize: 12 }}>{error}</div>
        </div>
      )}

      {/* Nivel 2 — estado (3 cifras, no 8 cards) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 1,
          marginBottom: 18,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid var(--nx-panel-hairline)",
          background: "var(--nx-panel-hairline)",
        }}
      >
        <StatusCell
          label="Disponible"
          value={loading ? "…" : <Money value={data?.cashBalance ?? 0} />}
          href="/erp/contabilidad/conciliacion"
        />
        <StatusCell
          label="Por cobrar"
          value={loading ? "…" : <Money value={data?.accountsReceivablePending ?? 0} />}
          href="/erp/contabilidad/cuentas-por-cobrar"
          emphasize={!!data && data.agingReceivable.overdue > 0}
        />
        <StatusCell
          label="Por pagar"
          value={loading ? "…" : <Money value={data?.accountsPayablePending ?? 0} />}
          href="/erp/contabilidad/cuentas-por-pagar"
          emphasize={!!data && data.agingPayable.overdue > 0}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(240px, 0.8fr)",
          gap: 16,
        }}
        className="nx-contab-dash-grid"
      >
        {/* Excepciones — lo importante */}
        <section aria-labelledby="att-title">
          <h2
            id="att-title"
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            Requiere atención
          </h2>
          {loading ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>Revisando pendientes…</p>
          ) : attention.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
              Nada urgente en este periodo. Puedes seguir con cobros, pagos o conciliación.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {attention.map((item) => (
                <li key={`${item.href}-${item.label}`}>
                  <Link
                    href={item.href}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "baseline",
                      padding: "10px 12px",
                      borderRadius: 10,
                      textDecoration: "none",
                      border: "1px solid var(--nx-panel-hairline)",
                      background: "var(--surface)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color:
                          item.tone === "danger"
                            ? "var(--danger)"
                            : item.tone === "warning"
                              ? "var(--warning)"
                              : "var(--text-tertiary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.detail}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Secundario — contexto del mes */}
        <section aria-labelledby="ctx-title">
          <h2
            id="ctx-title"
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            Este mes
          </h2>
          <dl
            style={{
              margin: 0,
              display: "grid",
              gap: 8,
              fontSize: 13,
            }}
          >
            <CtxRow label="Ingresos" value={loading ? "…" : <Money value={data?.income ?? 0} />} />
            <CtxRow label="Egresos" value={loading ? "…" : <Money value={data?.expense ?? 0} />} />
            <CtxRow label="Flujo neto" value={loading ? "…" : <Money value={data?.netCashflow ?? 0} />} />
            <CtxRow
              label="Facturas"
              value={
                loading
                  ? "…"
                  : `${data?.invoicesPeriod.total ?? 0} (${data?.invoicesPeriod.issued ?? 0} emit. · ${data?.invoicesPeriod.received ?? 0} rec.)`
              }
            />
            {(data?.prenominaDraftTotal ?? 0) > 0 && (
              <CtxRow
                label="Pre-nómina borrador"
                value={<Money value={data!.prenominaDraftTotal} />}
                href="/erp/contabilidad/pre-nomina"
              />
            )}
          </dl>
          <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
            <QuietLink href="/erp/contabilidad/cierres">Cerrar periodo</QuietLink>
            <QuietLink href="/erp/contabilidad/reportes">Reportes</QuietLink>
          </div>
        </section>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .nx-contab-dash-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}

function StatusCell({
  label,
  value,
  href,
  emphasize,
}: {
  label: string;
  value: ReactNode;
  href: string;
  emphasize?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "14px 16px",
        background: "var(--surface)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: emphasize ? "var(--warning)" : "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </Link>
  );
}

function CtxRow({
  label,
  value,
  href,
}: {
  label: string;
  value: ReactNode;
  href?: string;
}) {
  const inner = (
    <>
      <dt style={{ margin: 0, color: "var(--text-secondary)" }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </dd>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 8,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
      {inner}
    </div>
  );
}

function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ fontSize: 12.5, color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>
      {children} →
    </Link>
  );
}
