"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
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
 *
 * El orden de lectura es deliberado y se recorre en cinco segundos:
 *   1. la tira de cifras — cuánto hay, cuánto deben, cuánto se debe;
 *   2. lo que requiere atención — cada renglón con su enlace a donde se resuelve;
 *   3. qué vence — una lectura de columnas, no otra rejilla de tarjetas;
 *   4. el contexto del mes, al margen, para quien lo busque.
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

  /**
   * La tira responde, de izquierda a derecha, las preguntas de la mañana: cuánto
   * hay, cuánto deben, cuánto se debe, cómo va el periodo y qué está mal. El
   * color solo entra cuando algo está vencido o hay algo que resolver.
   */
  const metrics: Metric[] = useMemo(() => {
    const cargando = loading ? "…" : null;
    const cobrosVencidos = data?.agingReceivable.overdue ?? 0;
    const pagosVencidos = data?.agingPayable.overdue ?? 0;
    const tonoAlertas: Metric["tone"] = attention.some((a) => a.tone === "danger")
      ? "danger"
      : attention.length > 0
        ? "warning"
        : "default";

    return [
      {
        label: "Disponible",
        value: cargando ?? <Money value={data?.cashBalance ?? 0} />,
        hint: "En bancos y caja",
        href: "/erp/contabilidad/conciliacion",
      },
      {
        label: "Por cobrar",
        value: cargando ?? <Money value={data?.accountsReceivablePending ?? 0} />,
        hint: cobrosVencidos > 0 ? `${formatMoney(cobrosVencidos)} ya vencidos` : "Nada vencido",
        tone: cobrosVencidos > 0 ? "warning" : "default",
        href: "/erp/contabilidad/cuentas-por-cobrar",
      },
      {
        label: "Por pagar",
        value: cargando ?? <Money value={data?.accountsPayablePending ?? 0} />,
        hint: pagosVencidos > 0 ? `${formatMoney(pagosVencidos)} ya vencidos` : "Nada vencido",
        tone: pagosVencidos > 0 ? "danger" : "default",
        href: "/erp/contabilidad/cuentas-por-pagar",
      },
      {
        label: "Flujo neto",
        value: cargando ?? <Money value={data?.netCashflow ?? 0} />,
        hint: "Ingresos menos egresos del periodo",
      },
      {
        label: "Requiere atención",
        value: loading ? "…" : attention.length,
        hint: attention.length === 0 ? "Nada pendiente" : "Con su enlace, aquí abajo",
        tone: tonoAlertas,
      },
    ];
  }, [loading, data, attention]);

  const agingRows = useMemo(
    () => [
      {
        id: "cobros",
        label: "Cobros",
        href: "/erp/contabilidad/cuentas-por-cobrar",
        vencido: data?.agingReceivable.overdue ?? 0,
        hoy: data?.agingReceivable.dueToday ?? 0,
        next7: data?.agingReceivable.next7 ?? 0,
        next30: data?.agingReceivable.next30 ?? 0,
        tieneHoy: true,
      },
      {
        id: "pagos",
        label: "Pagos",
        href: "/erp/contabilidad/cuentas-por-pagar",
        vencido: data?.agingPayable.overdue ?? 0,
        hoy: 0,
        next7: data?.agingPayable.next7 ?? 0,
        next30: data?.agingPayable.next30 ?? 0,
        // La API no desglosa el «hoy» de cuentas por pagar; no se inventa.
        tieneHoy: false,
      },
    ],
    [data],
  );

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
                height: 32,
                padding: "0 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
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
            gap: 10,
            flexWrap: "wrap",
            alignItems: "flex-end",
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--nx-panel-hairline, var(--border))",
            background: "var(--surface)",
          }}
        >
          <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-tertiary)" }}>
            Desde
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              style={{
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-tertiary)" }}>
            Hasta
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              style={{
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            />
          </label>
          <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
            Aplicar
          </Button>
        </div>
      )}

      {error && (
        <>
          <InlineAlert
            variant="danger"
            message={`No se pudo cargar el resumen. ${error}`}
            onDismiss={() => setError(null)}
          />
          <div style={{ marginTop: -4, marginBottom: 14 }}>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        </>
      )}

      {/* Nivel 1 — la tira: el estado del dinero en una sola línea. */}
      <div style={{ marginBottom: 18 }}>
        <MetricStrip metrics={metrics} ariaLabel="Estado del periodo" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(240px, 0.8fr)",
          gap: 16,
          alignItems: "start",
        }}
        className="nx-contab-dash-grid"
      >
        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          {/* Nivel 2 — excepciones: cada una con el enlace a donde se resuelve. */}
          <section aria-labelledby="att-title">
            <BlockTitle id="att-title">Requiere atención</BlockTitle>
            {loading ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>
                Revisando pendientes…
              </p>
            ) : attention.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  border: "1px solid var(--nx-panel-hairline, var(--border))",
                  borderRadius: 10,
                  background: "var(--surface)",
                }}
              >
                Nada urgente en este periodo. Puedes seguir con cobros, pagos o conciliación.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  border: "1px solid var(--nx-panel-hairline, var(--border))",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "var(--surface)",
                }}
              >
                {attention.map((item, i) => (
                  <li
                    key={`${item.href}-${item.label}`}
                    style={{
                      borderTop:
                        i === 0 ? undefined : "1px solid var(--nx-panel-hairline, var(--border))",
                    }}
                  >
                    <Link
                      href={item.href}
                      className="nx-attention-row"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 14px",
                        textDecoration: "none",
                        color: "var(--text-primary)",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0 }}>
                        {item.label}
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <StatusDot
                          label={item.detail}
                          tone={item.tone === "info" ? "neutral" : (item.tone as StatusTone)}
                        />
                        <ChevronRight
                          size={14}
                          aria-hidden="true"
                          style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Nivel 3 — qué vence: columnas comparables, no otra rejilla de tarjetas. */}
          <section aria-labelledby="aging-title">
            <BlockTitle id="aging-title">Qué vence</BlockTitle>
            <div
              style={{
                border: "1px solid var(--nx-panel-hairline, var(--border))",
                borderRadius: 10,
                overflowX: "auto",
                background: "var(--surface)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  minWidth: 440,
                }}
              >
                <caption
                  style={{
                    captionSide: "bottom",
                    textAlign: "left",
                    padding: "8px 14px 10px",
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                  }}
                >
                  Saldo pendiente por fecha de vencimiento. Los pagos no traen desglose de «hoy».
                </caption>
                <thead>
                  <tr>
                    {["Vencimientos", "Vencido", "Hoy", "Próx. 7 días", "Próx. 30 días"].map(
                      (h, i) => (
                        <th
                          key={h}
                          scope="col"
                          style={{
                            textAlign: i === 0 ? "left" : "right",
                            padding: "8px 14px",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "var(--text-tertiary)",
                            borderBottom: "1px solid var(--nx-panel-hairline, var(--border))",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {agingRows.map((row, i) => (
                    <tr key={row.id}>
                      <th
                        scope="row"
                        style={{
                          textAlign: "left",
                          padding: "10px 14px",
                          fontSize: 13,
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          borderTop:
                            i === 0
                              ? undefined
                              : "1px solid var(--nx-panel-hairline, var(--border))",
                        }}
                      >
                        <Link
                          href={row.href}
                          style={{ color: "var(--text-primary)", textDecoration: "none" }}
                        >
                          {row.label}
                        </Link>
                      </th>
                      <AgingCell
                        value={loading ? null : row.vencido}
                        alert={!loading && row.vencido > 0}
                        first={i === 0}
                      />
                      <AgingCell
                        value={loading ? null : row.tieneHoy ? row.hoy : undefined}
                        first={i === 0}
                      />
                      <AgingCell value={loading ? null : row.next7} first={i === 0} />
                      <AgingCell value={loading ? null : row.next30} first={i === 0} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Secundario — contexto del mes */}
        <section aria-labelledby="ctx-title" style={{ minWidth: 0 }}>
          <BlockTitle id="ctx-title">Este mes</BlockTitle>
          <dl
            style={{
              margin: 0,
              fontSize: 13,
              border: "1px solid var(--nx-panel-hairline, var(--border))",
              borderRadius: 10,
              overflow: "hidden",
              background: "var(--surface)",
            }}
          >
            <CtxRow
              label="Ingresos"
              value={loading ? "…" : <Money value={data?.income ?? 0} bold={false} />}
              first
            />
            <CtxRow
              label="Egresos"
              value={loading ? "…" : <Money value={data?.expense ?? 0} bold={false} />}
            />
            <CtxRow
              label="Flujo neto"
              value={loading ? "…" : <Money value={data?.netCashflow ?? 0} />}
            />
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
                value={<Money value={data!.prenominaDraftTotal} bold={false} />}
                href="/erp/contabilidad/pre-nomina"
              />
            )}
          </dl>
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            <QuietLink href="/erp/contabilidad/cierres">Cerrar periodo</QuietLink>
            <QuietLink href="/erp/contabilidad/reportes">Reportes</QuietLink>
          </div>
        </section>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .nx-contab-dash-grid { grid-template-columns: 1fr !important; }
        }
        .nx-attention-row:hover {
          background: color-mix(in srgb, var(--primary) 5%, transparent);
        }
      `}</style>
    </>
  );
}

/** Encabezado de bloque: discreto, para que las cifras manden. */
function BlockTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        margin: "0 0 8px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-tertiary)",
      }}
    >
      {children}
    </h2>
  );
}

/** Celda de vencimientos. `null` = cargando; `undefined` = la API no lo desglosa. */
function AgingCell({
  value,
  alert,
  first,
}: {
  value: number | null | undefined;
  alert?: boolean;
  first?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: "right",
        padding: "10px 14px",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        borderTop: first ? undefined : "1px solid var(--nx-panel-hairline, var(--border))",
        color: alert ? "var(--state-danger-text, #b91c1c)" : "var(--text-secondary)",
      }}
    >
      {value === null ? (
        "…"
      ) : value === undefined || value === 0 ? (
        <span style={{ color: "var(--text-tertiary)" }}>—</span>
      ) : (
        <Money value={value} bold={false} />
      )}
    </td>
  );
}

function CtxRow({
  label,
  value,
  href,
  first,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  first?: boolean;
}) {
  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 8,
    alignItems: "baseline",
    padding: "9px 12px",
    borderTop: first ? undefined : "1px solid var(--nx-panel-hairline, var(--border))",
  } as const;
  const inner = (
    <>
      <dt style={{ margin: 0, color: "var(--text-secondary)", fontSize: 12.5 }}>{label}</dt>
      <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</dd>
    </>
  );
  if (href) {
    return (
      <Link href={href} style={{ ...rowStyle, textDecoration: "none", color: "inherit" }}>
        {inner}
      </Link>
    );
  }
  return <div style={rowStyle}>{inner}</div>;
}

function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ fontSize: 12.5, color: "var(--primary)", textDecoration: "none" }}>
      {children}
    </Link>
  );
}
