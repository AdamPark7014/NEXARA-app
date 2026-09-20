"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
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
 * Qué está mal en el rango, dicho como se corrige. Devuelve el campo culpable
 * para poder marcarlo: un error al pie de una pantalla larga no se lee.
 */
function validarRango(from: string, to: string): { campo: "from" | "to"; mensaje: string } | null {
  if (!from) {
    return { campo: "from", mensaje: "Falta la fecha de inicio. Elige un día para poder consultar." };
  }
  if (!to) {
    return { campo: "to", mensaje: "Falta la fecha final. Elige un día para poder consultar." };
  }
  if (from > to) {
    return {
      campo: "to",
      mensaje: "La fecha final es anterior a la inicial. Ponla en el mismo día o después.",
    };
  }
  return null;
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
  const { user, isContextReady } = useUser();
  const token = user?.token ?? "";
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState<WorkspaceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPeriod, setShowPeriod] = useState(false);
  const periodoId = useId();

  // Solo el rango vigente dispara la consulta: el panel de periodo trabaja
  // sobre un borrador y se aplica a mano, para no lanzar una petición por cada
  // tecleo en las fechas ni consultar un rango invertido a medio capturar.
  const [borrador, setBorrador] = useState(range);
  const [errorRango, setErrorRango] = useState<{ campo: "from" | "to"; mensaje: string } | null>(
    null,
  );

  // La última petición gana. Sin esto, dos rangos seguidos podían pintarse en
  // desorden y dejar en pantalla cifras de un periodo que ya nadie pidió.
  const peticion = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const turno = ++peticion.current;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      const res = await fetch(buildApiUrl(`accounting/workspace/dashboard?${qs}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as WorkspaceDashboard;
      if (turno !== peticion.current) return;
      setData(json);
    } catch (e) {
      if (turno !== peticion.current) return;
      setError(formatApiError(e));
      setData(null);
    } finally {
      if (turno === peticion.current) setLoading(false);
    }
  }, [token, range.from, range.to]);

  useEffect(() => {
    if (!isContextReady) return;
    // Sin sesión no hay a quién preguntarle: se corta el esqueleto y se dice
    // por qué, en vez de dejar «Cargando…» girando para siempre.
    if (!token) {
      setLoading(false);
      return;
    }
    void load();
  }, [isContextReady, token, load]);

  const aplicarPeriodo = useCallback(() => {
    const problema = validarRango(borrador.from, borrador.to);
    setErrorRango(problema);
    if (problema) return;
    setRange(borrador);
    setShowPeriod(false);
  }, [borrador]);

  const abrirPeriodo = useCallback(() => {
    setShowPeriod((v) => {
      if (!v) {
        setBorrador(range);
        setErrorRango(null);
      }
      return !v;
    });
  }, [range]);

  const sinSesion = isContextReady && !token;

  /** Valor de contexto: «…» cargando, «—» sin respuesta, la cifra si la hay. */
  const ctx = (valor: ReactNode): ReactNode =>
    loading ? "…" : data ? valor : <span style={{ color: "var(--text-tertiary)" }}>—</span>;

  /**
   * `href` opcional: la API manda alertas sin destino (`alerts[].href`), y un
   * renglón que parece enlace y no lleva a ningún lado es de los peores
   * silencios de una pantalla. Sin destino se pinta como texto, no como enlace.
   */
  type Atencion = {
    label: string;
    detail: string;
    href?: string;
    tone: "danger" | "warning" | "info";
  };

  const attention = useMemo(() => {
    if (!data) return [] as Atencion[];
    const items: Atencion[] = [];
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
        href: a.href || undefined,
        tone: a.severity,
      });
    }
    return items.slice(0, 5);
  }, [data]);

  const primaryHref =
    attention.find((a) => a.href)?.href ?? "/erp/contabilidad/cuentas-por-cobrar";
  const primaryLabel = attention.some((a) => a.href) ? "Revisar pendientes" : "Ver por cobrar";

  /**
   * El periodo que contestó el servidor, no el que se pidió: la API normaliza
   * el rango (`period` en la respuesta) y si difiere, lo que manda es el suyo.
   */
  const periodoVigente = data?.period ?? range;

  const monthLabel = useMemo(() => {
    const { from, to } = periodoVigente;
    const d = new Date(`${from}T12:00:00`);
    if (Number.isNaN(d.getTime())) return `${from} → ${to}`;
    const mismoMes = from.slice(0, 7) === to.slice(0, 7);
    if (!mismoMes) return `${from} → ${to}`;
    return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  }, [periodoVigente]);

  /**
   * La tira responde, de izquierda a derecha, las preguntas de la mañana: cuánto
   * hay, cuánto deben, cuánto se debe, cómo va el periodo y qué está mal. El
   * color solo entra cuando algo está vencido o hay algo que resolver.
   */
  const metrics: Metric[] = useMemo(() => {
    // Tres estados distintos, tres señales distintas: «…» mientras carga, «—»
    // cuando no hubo respuesta (sin sesión o error) y la cifra cuando la hay.
    // Pintar «$0» sin datos sería inventarse un saldo.
    const cargando: ReactNode | null = loading ? "…" : data ? null : "—";
    const cobrosVencidos = data?.agingReceivable.overdue ?? 0;
    const pagosVencidos = data?.agingPayable.overdue ?? 0;
    const tonoAlertas: Metric["tone"] = attention.some((a) => a.tone === "danger")
      ? "danger"
      : attention.length > 0
        ? "warning"
        : "default";

    return [
      // `href`, no `onClick`: navegar con un manejador rompe ctrl+clic y «abrir
      // en pestaña nueva», que es justo lo que se hace para comparar dos cosas.
      {
        label: "Disponible",
        value: cargando ?? <Money value={data?.cashBalance ?? 0} />,
        hint: "En bancos y caja",
        href: "/erp/contabilidad/conciliacion",
      },
      {
        label: "Por cobrar",
        value: cargando ?? <Money value={data?.accountsReceivablePending ?? 0} />,
        hint: !data
          ? "Sin dato"
          : cobrosVencidos > 0
            ? `${formatMoney(cobrosVencidos)} ya vencidos`
            : "Nada vencido",
        tone: cobrosVencidos > 0 ? "warning" : "default",
        href: "/erp/contabilidad/cuentas-por-cobrar",
      },
      {
        label: "Por pagar",
        value: cargando ?? <Money value={data?.accountsPayablePending ?? 0} />,
        hint: !data
          ? "Sin dato"
          : pagosVencidos > 0
            ? `${formatMoney(pagosVencidos)} ya vencidos`
            : "Nada vencido",
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
        value: cargando ?? attention.length,
        hint: !data
          ? "Sin respuesta del servidor"
          : attention.length === 0
            ? "Nada pendiente"
            : "Con su enlace, aquí abajo",
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
        subtitle={
          sinSesion
            ? "Sin sesión activa."
            : loading
              ? "Cargando el periodo…"
              : `Qué está pasando en ${monthLabel}.`
        }
        density="ops"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={abrirPeriodo}
              aria-expanded={showPeriod}
              aria-controls={periodoId}
            >
              Periodo
            </Button>
            <Link href={primaryHref} className="nx-contab-cta">
              {primaryLabel}
            </Link>
          </div>
        }
      />

      {showPeriod && (
        <form
          id={periodoId}
          onSubmit={(e) => {
            e.preventDefault();
            aplicarPeriodo();
          }}
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--nx-panel-hairline, var(--border))",
            background: "var(--surface)",
          }}
        >
          <CampoFecha
            label="Desde"
            value={borrador.from}
            onChange={(v) => {
              setBorrador((b) => ({ ...b, from: v }));
              setErrorRango(null);
            }}
            error={errorRango?.campo === "from" ? errorRango.mensaje : null}
          />
          <CampoFecha
            label="Hasta"
            value={borrador.to}
            onChange={(v) => {
              setBorrador((b) => ({ ...b, to: v }));
              setErrorRango(null);
            }}
            error={errorRango?.campo === "to" ? errorRango.mensaje : null}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 17 }}>
            <Button size="sm" variant="ghost" onClick={() => setShowPeriod(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={loading}>
              {loading ? "Consultando…" : "Aplicar"}
            </Button>
          </div>
        </form>
      )}

      {sinSesion && (
        <InlineAlert
          variant="warning"
          message="No hay sesión activa, así que no se puede consultar el resumen. Vuelve a entrar con tu cuenta y la pantalla se llenará sola."
          action={
            <Link href="/login" style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
              Ir a entrar
            </Link>
          }
        />
      )}

      {error && (
        <InlineAlert
          variant="danger"
          message={`No se pudo cargar el resumen del ${periodoVigente.from} al ${periodoVigente.to}. ${error} Reintenta; si vuelve a fallar, prueba con un rango más corto.`}
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
              {loading ? "Reintentando…" : "Reintentar"}
            </Button>
          }
        />
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
            {sinSesion ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>
                No se pudo revisar: no hay sesión.
              </p>
            ) : loading ? (
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
                {attention.map((item, i) => {
                  const cuerpo = (
                    <>
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
                        {item.href ? (
                          <span aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>
                            ›
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            sin pantalla asociada
                          </span>
                        )}
                      </span>
                    </>
                  );
                  const filaStyle = {
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                    padding: "10px 14px",
                    textDecoration: "none",
                    color: "var(--text-primary)",
                  } as const;
                  return (
                    <li
                      key={`${item.href ?? "sin-destino"}-${item.label}`}
                      style={{
                        borderTop:
                          i === 0 ? undefined : "1px solid var(--nx-panel-hairline, var(--border))",
                      }}
                    >
                      {item.href ? (
                        <Link href={item.href} className="nx-attention-row" style={filaStyle}>
                          {cuerpo}
                        </Link>
                      ) : (
                        <div style={filaStyle}>{cuerpo}</div>
                      )}
                    </li>
                  );
                })}
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
                        value={loading ? null : data ? row.vencido : undefined}
                        alert={!loading && row.vencido > 0}
                        first={i === 0}
                      />
                      <AgingCell
                        value={loading ? null : data && row.tieneHoy ? row.hoy : undefined}
                        first={i === 0}
                      />
                      <AgingCell
                        value={loading ? null : data ? row.next7 : undefined}
                        first={i === 0}
                      />
                      <AgingCell
                        value={loading ? null : data ? row.next30 : undefined}
                        first={i === 0}
                      />
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
              value={ctx(<Money value={data?.income ?? 0} bold={false} />)}
              first
            />
            <CtxRow label="Egresos" value={ctx(<Money value={data?.expense ?? 0} bold={false} />)} />
            <CtxRow label="Flujo neto" value={ctx(<Money value={data?.netCashflow ?? 0} />)} />
            <CtxRow
              label="Facturas"
              value={ctx(
                `${data?.invoicesPeriod.total ?? 0} (${data?.invoicesPeriod.issued ?? 0} emit. · ${data?.invoicesPeriod.received ?? 0} rec.)`,
              )}
            />
            {/* El renglón se queda aunque el borrador esté en cero: si aparece
                y desaparece solo, deja de poderse consultar «¿cómo va?». */}
            <CtxRow
              label="Pre-nómina borrador"
              value={ctx(<Money value={data?.prenominaDraftTotal ?? 0} bold={false} />)}
              href="/erp/contabilidad/pre-nomina"
            />
          </dl>
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            <QuietLink href="/erp/contabilidad/cierres">Cerrar periodo</QuietLink>
            <QuietLink href="/erp/contabilidad/reportes">Reportes</QuietLink>
          </div>
        </section>
      </div>

      {/* A 1024px la columna de contexto ya no cabe junto a la tabla de
          vencimientos sin estrangular las dos: se apila, que es lo que pide
          leer, en vez de encoger la tipografía. */}
      <style>{`
        @media (max-width: 1024px) {
          .nx-contab-dash-grid { grid-template-columns: 1fr !important; }
        }
        .nx-attention-row:hover {
          background: color-mix(in srgb, var(--primary) 5%, transparent);
        }
        .nx-attention-row:focus-visible,
        .nx-contab-quiet:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: -2px;
          border-radius: 6px;
        }
        .nx-contab-cta {
          display: inline-flex;
          align-items: center;
          height: 32px;
          padding: 0 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          color: #fff;
          background: var(--primary);
        }
        .nx-contab-cta:hover { background: var(--primary-strong, var(--primary)); }
        .nx-contab-cta:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent);
        }
      `}</style>
    </>
  );
}

/**
 * Campo de fecha del panel de periodo. El error va pegado al control y ligado
 * por `aria-describedby`: quien navega con lector de pantalla se entera de qué
 * pasa en el campo, no al final de la pantalla.
 */
function CampoFecha({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div style={{ display: "grid", gap: 4, maxWidth: 220 }}>
      <label htmlFor={id} style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{
          fontSize: 13,
          padding: "6px 8px",
          borderRadius: 8,
          border: `1px solid ${error ? "var(--state-danger-text, #b91c1c)" : "var(--border)"}`,
          background: "var(--surface)",
          color: "var(--text-primary)",
        }}
      />
      {error ? (
        <span
          id={errorId}
          role="alert"
          style={{ fontSize: 11, color: "var(--state-danger-text, #b91c1c)", lineHeight: 1.35 }}
        >
          {error}
        </span>
      ) : null}
    </div>
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
      <Link
        href={href}
        className="nx-contab-quiet"
        style={{ ...rowStyle, textDecoration: "none", color: "inherit" }}
      >
        {inner}
      </Link>
    );
  }
  return <div style={rowStyle}>{inner}</div>;
}

function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="nx-contab-quiet"
      style={{ fontSize: 12.5, color: "var(--primary)", textDecoration: "none" }}
    >
      {children} →
    </Link>
  );
}
