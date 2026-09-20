"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import FilterScale, { type ScaleItem } from "@/components/ui/FilterScale";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import {
  FinanceField,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";
import FilterToolbar from "@/components/FilterToolbar";
import Modal from "@/components/ui/Modal";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";
import TruncatedId from "@/components/ui/TruncatedId";

type InvoiceRow = {
  id: number;
  invoiceNumber: string;
  type: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  totalAmount: number | string;
  paidAmount?: number | string;
  receptorName?: string | null;
  emisorName?: string | null;
  cfdiUuid?: string | null;
  cfdiXml?: string | null;
};

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function pendingOf(row: InvoiceRow) {
  return Number(row.totalAmount || 0) - Number(row.paidAmount || 0);
}

function daysOverdue(due?: string | null) {
  if (!due) return null;
  const d = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / 86_400_000);
}

/** Claves del modelo → español. Nunca mostrar DRAFT/SENT/PAID crudos. */
const ESTATUS_FACTURA: Record<string, string> = {
  DRAFT: "Borrador",
  STAMPING: "Timbrando",
  SENT: "Enviada",
  PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
  CREDITED: "Nota de crédito",
};

const TIPO_FACTURA: Record<string, string> = {
  ACCOUNTS_RECEIVABLE: "Emitida",
  INCOME: "Emitida",
  ACCOUNTS_PAYABLE: "Recibida",
  EXPENSE: "Recibida",
};

function tipoFacturaLabel(type: string): string {
  return TIPO_FACTURA[type] ?? "Documento";
}

/** Estado para humanos — nunca enums crudos. */
function statusLabel(row: InvoiceRow): { text: string; tone: "ok" | "warn" | "bad" | "mute" } {
  const pend = pendingOf(row);
  const od = daysOverdue(row.dueDate);
  if (row.status === "CANCELLED") return { text: ESTATUS_FACTURA.CANCELLED, tone: "mute" };
  if (row.status === "DRAFT") return { text: ESTATUS_FACTURA.DRAFT, tone: "mute" };
  if (pend <= 0.01 || row.status === "PAID") return { text: ESTATUS_FACTURA.PAID, tone: "ok" };
  if (od != null && od > 0) return { text: `Vencida · ${od}d`, tone: "bad" };
  if (Number(row.paidAmount || 0) > 0 || row.status === "PARTIALLY_PAID") {
    return { text: ESTATUS_FACTURA.PARTIALLY_PAID, tone: "warn" };
  }
  return { text: ESTATUS_FACTURA[row.status] ?? "Pendiente", tone: "mute" };
}

/** El tono del estado, en el vocabulario de `StatusDot`: punto y palabra. */
const TONO_ESTADO: Record<"ok" | "warn" | "bad" | "mute", StatusTone> = {
  ok: "success",
  warn: "warning",
  bad: "danger",
  mute: "neutral",
};

type Mode = "cxc" | "cxp" | "all";

export default function ContabilidadInvoicesView({
  mode = "all",
  title,
  subtitle,
}: {
  mode?: Mode;
  title?: string;
  subtitle?: string;
}) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [aging, setAging] = useState<"" | "vencido" | "hoy" | "d7">("");
  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const [paying, setPaying] = useState(false);
  /**
   * El registro de pago vivía en un `window.prompt`: una caja gris del
   * navegador, sin saldo a la vista ni forma de corregir el dato. Ahora es un
   * formulario, con el mismo envío y la misma validación de antes.
   */
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  /** Error del servidor dentro del formulario — no solo toast que se va. */
  const [payErr, setPayErr] = useState<string | null>(null);
  /** Tras pulsar Guardar, el monto vacío también se señala bajo el campo. */
  const [intentado, setIntentado] = useState(false);
  /** Cerrojo síncrono: el botón deshabilitado no alcanza contra doble clic. */
  const payingRef = useRef(false);

  const typeParam =
    mode === "cxc" ? "ACCOUNTS_RECEIVABLE" : mode === "cxp" ? "ACCOUNTS_PAYABLE" : "";

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Esperando sesión. Vuelve a entrar si esto no se resuelve.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (typeParam) qs.set("type", typeParam);
      qs.set("limit", "200");
      const data = await apiFetch(`accounting/invoices?${qs}`, token);
      const rows = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setItems(rows);
    } catch (e) {
      setError(formatApiError(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, typeParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const baseRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = items;
    if (mode !== "all") {
      rows = rows.filter(
        (r) => pendingOf(r) > 0.01 && !["PAID", "CANCELLED", "DRAFT"].includes(r.status),
      );
    }
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.invoiceNumber, r.receptorName, r.emisorName, r.cfdiUuid]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [items, q, mode]);

  /** Antigüedad sin el filtro activo: la escala no debe colapsar al filtrar. */
  const calendar = useMemo(() => {
    if (mode !== "cxp") return null;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const buckets = { today: 0, d7: 0, overdue: 0 };
    for (const r of baseRows) {
      const due = r.dueDate ? new Date(r.dueDate) : null;
      const pend = pendingOf(r);
      if (!due) continue;
      const diff = Math.floor((due.getTime() - start.getTime()) / 86_400_000);
      if (diff < 0) buckets.overdue += pend;
      else if (diff === 0) buckets.today += pend;
      else if (diff <= 7) buckets.d7 += pend;
    }
    return buckets;
  }, [baseRows, mode]);

  const filtered = useMemo(() => {
    if (!aging) return baseRows;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return baseRows.filter((r) => {
      const due = r.dueDate ? new Date(r.dueDate) : null;
      if (!due) return false;
      const diff = Math.floor((due.getTime() - start.getTime()) / 86_400_000);
      if (aging === "vencido") return diff < 0;
      if (aging === "hoy") return diff === 0;
      return diff > 0 && diff <= 7;
    });
  }, [baseRows, aging]);

  function abrirPago(row: InvoiceRow) {
    const pend = pendingOf(row);
    if (pend <= 0) return;
    setPayAmount(pend.toFixed(2));
    setPayErr(null);
    setIntentado(false);
    setPayOpen(true);
  }

  async function registerPayment(row: InvoiceRow) {
    if (payingRef.current) return;
    setIntentado(true);
    const pend = pendingOf(row);
    if (pend <= 0) {
      setPayErr("Esta factura ya no tiene saldo pendiente.");
      return;
    }
    const amount = Number(payAmount);
    // El motivo se queda bajo el campo (`errorMonto`), no en un toast que se va.
    if (!Number.isFinite(amount) || amount <= 0) return;
    payingRef.current = true;
    setPaying(true);
    setPayErr(null);
    try {
      await apiFetch(`accounting/invoices/${row.id}/payments`, token, {
        method: "POST",
        body: JSON.stringify({
          amount,
          paymentDate: new Date().toISOString().slice(0, 10),
          method: "SPEI",
        }),
      });
      toast.success("Pago registrado");
      setPayOpen(false);
      setPayAmount("");
      setPayErr(null);
      setIntentado(false);
      setSelected(null);
      await load();
    } catch (e) {
      // El formulario NO se cierra: si se cerrara, nadie sabría si el dinero quedó aplicado.
      setPayErr(`No se pudo registrar el pago. ${formatApiError(e)}`);
      toast.error(formatApiError(e));
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  }

  const partyLabel = mode === "cxp" ? "Proveedor" : mode === "cxc" ? "Cliente" : "Contraparte";

  /** El mismo criterio que aplica `registerPayment`, mostrado bajo el campo. */
  const errorMonto = (() => {
    if (!payOpen) return null;
    if (payAmount.trim() === "") {
      return intentado ? "Escribe cuánto se está pagando." : null;
    }
    const monto = Number(payAmount);
    if (!Number.isFinite(monto) || monto <= 0) return "Indica un monto mayor a cero.";
    return null;
  })();

  const escalaCalendario: ScaleItem[] = calendar
    ? (() => {
        const base = calendar.overdue + calendar.today + calendar.d7;
        return [
          {
            key: "vencido",
            label: "Vencido",
            value: <Money value={calendar.overdue} />,
            tone: calendar.overdue > 0 ? "danger" : "mute",
            hint: calendar.overdue > 0 ? "ya debió salir" : "nada atrasado",
            share: base > 0 ? calendar.overdue / base : 0,
          },
          {
            key: "hoy",
            label: "Hoy",
            value: <Money value={calendar.today} />,
            tone: calendar.today > 0 ? "warning" : "mute",
            hint: "sale hoy",
            share: base > 0 ? calendar.today / base : 0,
          },
          {
            key: "d7",
            label: "Próximos 7 días",
            value: <Money value={calendar.d7} />,
            tone: "mute",
            hint: "esta semana",
            share: base > 0 ? calendar.d7 / base : 0,
          },
        ];
      })()
    : [];

  const columns: Column<InvoiceRow>[] = [
    {
      key: "party",
      label: partyLabel,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.receptorName || r.emisorName || "Sin nombre"}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.invoiceNumber}</div>
        </div>
      ),
    },
    ...(mode === "all"
      ? [
          {
            key: "tipo",
            label: "Tipo",
            render: (r: InvoiceRow) => (
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                {tipoFacturaLabel(r.type)}
              </span>
            ),
          } as Column<InvoiceRow>,
        ]
      : []),
    {
      key: "due",
      label: "Vence",
      render: (r) => {
        const od = daysOverdue(r.dueDate);
        const vencida = od != null && od > 0;
        return (
          <span style={{ display: "grid", gap: 1 }}>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                color: vencida ? "var(--state-danger-text, #b91c1c)" : undefined,
                fontWeight: vencida ? 600 : undefined,
              }}
            >
              {r.dueDate ? new Date(r.dueDate).toLocaleDateString("es-MX") : "—"}
            </span>
            {vencida && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--state-danger-text, #b91c1c)",
                }}
              >
                {od} {od === 1 ? "día vencida" : "días vencida"}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "saldo",
      label: "Saldo",
      align: "right",
      numeric: true,
      render: (r) => <Money value={pendingOf(r)} />,
    },
    {
      key: "estado",
      label: "Estado",
      render: (r) => {
        const s = statusLabel(r);
        return <StatusDot label={s.text} tone={TONO_ESTADO[s.tone]} />;
      },
    },
  ];

  const pageTitle =
    title ??
    (mode === "cxc" ? "Por cobrar" : mode === "cxp" ? "Por pagar" : "Facturas");

  const pageSubtitle =
    subtitle ??
    (mode === "cxc"
      ? "Quién te debe y qué urge cobrar."
      : mode === "cxp"
        ? "Qué debes pagar y cuándo."
        : "Documentos emitidos y recibidos.");

  const emptyTitle =
    mode === "cxc"
      ? "Nada por cobrar"
      : mode === "cxp"
        ? "Nada por pagar"
        : "Sin facturas";
  const emptyDesc =
    mode === "all"
      ? "Cuando registres o recibas una factura, aparecerá aquí."
      : "No hay saldos abiertos con estos filtros.";

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title={pageTitle}
        subtitle={pageSubtitle}
        density="ops"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {mode === "all" && (
              <Link
                href="/erp/invoicing"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: "var(--primary)",
                  color: "#fff",
                  textDecoration: "none",
                }}
              >
                Nueva factura
              </Link>
            )}
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              Actualizar
            </Button>
          </div>
        }
      />

      {calendar && (calendar.overdue > 0 || calendar.today > 0 || calendar.d7 > 0) && (
        <div style={{ marginBottom: 12 }}>
          <FilterScale
            ariaLabel="Qué sale de caja"
            items={escalaCalendario}
            active={aging}
            onSelect={(clave) => setAging((clave || "") as "" | "vencido" | "hoy" | "d7")}
            minCellWidth={128}
          />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <FilterToolbar
          search={{
            value: q,
            onChange: setQ,
            placeholder: `Buscar ${partyLabel.toLowerCase()} o folio…`,
          }}
          resultCount={filtered.length}
        />
      </div>

      {error && (
        <>
          <InlineAlert variant="danger" message={`No se pudo cargar la lista. ${error}`} />
          <div style={{ margin: "-4px 0 12px" }}>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        </>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDesc}
          action={
            mode === "all" ? (
              <Link href="/erp/invoicing" style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
                Ir a facturación
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          density="compact"
          onRowClick={(r) => setSelected(r)}
        />
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.invoiceNumber || "Factura"}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cerrar
            </Button>
            {selected && pendingOf(selected) > 0.01 && (
              <Button variant="primary" onClick={() => selected && abrirPago(selected)}>
                Registrar pago
              </Button>
            )}
          </div>
        }
      >
        {selected && (
          <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
            <MetricStrip
              ariaLabel="Saldo de la factura"
              metrics={[
                {
                  label: "Total",
                  value: <Money value={Number(selected.totalAmount || 0)} />,
                  hint: "facturado",
                },
                {
                  label: "Saldo",
                  value: <Money value={pendingOf(selected)} />,
                  tone: pendingOf(selected) > 0.01 ? "warning" : "success",
                  hint: pendingOf(selected) > 0.01 ? "pendiente de cobro" : "liquidada",
                },
              ]}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              <Dato etiqueta={partyLabel}>
                {selected.receptorName || selected.emisorName || "—"}
              </Dato>
              <Dato etiqueta="Emisión">
                {selected.issueDate
                  ? new Date(selected.issueDate).toLocaleDateString("es-MX")
                  : "—"}
              </Dato>
              <Dato etiqueta="Vence">
                {selected.dueDate ? new Date(selected.dueDate).toLocaleDateString("es-MX") : "—"}
              </Dato>
              <Dato etiqueta="Estado">
                <StatusDot
                  label={statusLabel(selected).text}
                  tone={TONO_ESTADO[statusLabel(selected).tone]}
                />
              </Dato>
              {selected.cfdiUuid ? (
                <Dato etiqueta="UUID CFDI">
                  <TruncatedId value={selected.cfdiUuid} label="UUID CFDI" keep={8} />
                </Dato>
              ) : null}
            </div>

            <div style={{ fontSize: 12.5 }}>
              {selected.cfdiXml || selected.cfdiUuid ? (
                <StatusDot label="CFDI con XML" tone="neutral" />
              ) : (
                <StatusDot
                  label="Sin XML — completar cuando exista"
                  tone="warning"
                  title="La factura no tiene el CFDI timbrado adjunto"
                />
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Registro de pago — antes era un window.prompt del navegador */}
      <Modal
        open={payOpen}
        onClose={() => {
          setPayOpen(false);
          setPayErr(null);
          setIntentado(false);
        }}
        title="Registrar pago"
        maxWidth={440}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
            <Button
              variant="ghost"
              onClick={() => {
                setPayOpen(false);
                setPayErr(null);
                setIntentado(false);
              }}
              disabled={paying}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={paying}
              onClick={() => selected && void registerPayment(selected)}
            >
              Guardar
            </Button>
          </div>
        }
      >
        {selected && (
          <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
            {payErr && (
              <InlineAlert
                variant="danger"
                message={payErr}
                style={{ marginBottom: 0 }}
                onDismiss={() => setPayErr(null)}
              />
            )}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--surface-2)",
                border: "1px solid var(--nx-panel-hairline, var(--border))",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Saldo pendiente de <strong>{selected.invoiceNumber}</strong>
              </span>
              <Money value={pendingOf(selected)} />
            </div>
            <FinanceField
              label="Monto"
              hint="Pesos, con IVA incluido. Se registra con la fecha de hoy y forma de pago SPEI."
              error={errorMonto}
            >
              <input
                type="number"
                min="0"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={pendingOf(selected).toFixed(2)}
                style={financeInputStyle}
              />
            </FinanceField>
          </div>
        )}
      </Modal>
    </>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>{etiqueta}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{children}</div>
    </div>
  );
}
