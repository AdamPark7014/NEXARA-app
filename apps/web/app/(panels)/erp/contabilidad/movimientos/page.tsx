"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import FilterToolbar from "@/components/FilterToolbar";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { SkeletonList } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import {
  NATURALEZA_HINT,
  NATURALEZA_LABELS,
  TIPO_LABELS,
  TIPO_OPTIONS,
  buildLedgerQuery,
  describeOrigen,
  emptyFilters,
  emptyTotals,
  formatLedgerDate,
  formatMetodo,
  hasActiveFilters,
  type LedgerFilters,
  type LedgerResponse,
  type LedgerRow,
} from "./_ledger";

const PAGE_SIZE = 50;

type BankAccountOption = { id: number; name: string; bankName?: string | null };

/**
 * El estado del renglón como punto y palabra. La API manda la cadena libre, así
 * que el tono se deduce de lo que dice: color solo cuando el renglón pide una
 * acción (por autorizar, por conciliar) o algo salió mal (vencido, cancelado).
 * Todo lo demás es flujo normal y se queda neutro.
 */
function tonoEstado(estado: string | null | undefined): StatusTone {
  const e = (estado ?? "").toLowerCase();
  if (!e) return "neutral";
  if (/vencid|rechaz|cancelad|sin comprobante|devuelt/.test(e)) return "danger";
  if (/pendiente|parcial|autoriz|revis|borrador|sin concilia|proceso/.test(e)) return "warning";
  if (/pagad|cobrad|liquidad|conciliad|aplicad|timbrad/.test(e)) return "success";
  return "neutral";
}

export default function MovimientosPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [filters, setFilters] = useState<LedgerFilters>(() => emptyFilters());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<LedgerRow | null>(null);

  const setFilter = useCallback((key: keyof LedgerFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = buildLedgerQuery(filters, { page, pageSize: PAGE_SIZE });
      const res = await erpFetch<LedgerResponse>(
        `accounting/workspace/movimientos${qs ? `?${qs}` : ""}`,
        token,
      );
      setData(res);
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar el libro de movimientos"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Las cuentas alimentan el filtro; si no hay permiso de banca, el filtro
  // simplemente no aparece y el resto de la página sigue funcionando.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    void (async () => {
      try {
        const res = await erpFetch<unknown>("accounting/banking/accounts", token);
        const list = Array.isArray(res) ? res : ((res as { data?: unknown[] })?.data ?? []);
        if (alive) setAccounts(list as BankAccountOption[]);
      } catch {
        if (alive) setAccounts([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const totals = data?.totals ?? emptyTotals();
  const rows = data?.items ?? [];
  const filtrado = hasActiveFilters(filters);

  const exportCsv = useCallback(async () => {
    if (!token) return;
    setExporting(true);
    try {
      const qs = buildLedgerQuery(filters);
      const res = await fetch(
        buildApiUrl(`accounting/workspace/movimientos/export${qs ? `?${qs}` : ""}`),
        { credentials: "include", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(await res.text().catch(() => "No se pudo generar el CSV"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `movimientos-${filters.from}-a-${filters.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(formatApiError(e, "No se pudo exportar el libro"));
    } finally {
      setExporting(false);
    }
  }, [token, filters]);

  const columns: Column<LedgerRow>[] = useMemo(
    () => [
      {
        key: "fecha",
        label: "Fecha",
        width: 108,
        render: (r) => (
          <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {formatLedgerDate(r.fecha)}
          </span>
        ),
      },
      {
        key: "tipo",
        label: "Tipo",
        width: 104,
        // Clasificación normal del flujo: punto neutro. El color se reserva
        // para el estado, que es lo que llega a pedir acción.
        render: (r) => <StatusDot label={TIPO_LABELS[r.tipo]} tone="neutral" />,
      },
      {
        key: "concepto",
        label: "Concepto",
        render: (r) => (
          <div style={{ minWidth: 200 }}>
            <div style={{ fontWeight: 600 }}>{r.concepto}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {describeOrigen(r)}
              {r.naturaleza === "DEVENGADO" ? " · devengado" : ""}
            </div>
          </div>
        ),
      },
      { key: "categoria", label: "Categoría", render: (r) => r.categoria || "—" },
      { key: "cuenta", label: "Cuenta", render: (r) => r.cuenta?.nombre ?? "—" },
      {
        key: "contraparte",
        label: "Contraparte",
        render: (r) => r.contraparte?.nombre ?? "—",
      },
      { key: "proyecto", label: "Proyecto", render: (r) => r.proyecto?.nombre ?? "—" },
      {
        key: "referencia",
        label: "Referencia",
        render: (r) => (
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.referencia ?? "—"}</span>
        ),
      },
      {
        key: "ingreso",
        label: "Ingreso",
        align: "right",
        numeric: true,
        // Sin verde ni rojo: la columna ya dice de qué lado cae el monto, y con
        // cincuenta filas el color convierte el libro en un semáforo.
        render: (r) =>
          r.ingreso ? (
            <Money value={r.ingreso} bold={false} />
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
          ),
      },
      {
        key: "egreso",
        label: "Egreso",
        align: "right",
        numeric: true,
        render: (r) =>
          r.egreso ? (
            <Money value={r.egreso} bold={false} />
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
          ),
      },
      {
        key: "estado",
        label: "Estado",
        render: (r) =>
          r.estado ? (
            <StatusDot label={r.estado} tone={tonoEstado(r.estado)} />
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
          ),
      },
      { key: "registradoPor", label: "Registró", render: (r) => r.registradoPor ?? "—" },
    ],
    [],
  );

  const totalPages = data?.totalPages ?? 1;

  /**
   * La tira de totales. Las pistas NO son decorado: «Ingresos» suma efectivo y
   * devengado, así que una factura y su cobro cuentan las dos veces, a
   * propósito. Sin esa línea la cifra se lee como dinero que entró, y no lo es
   * —para eso está «Efectivo»—. Si algún día se recorta la tira, la pista se
   * queda.
   */
  const totalesStrip: Metric[] = useMemo(
    () => [
      {
        label: "Ingresos",
        value: <Money value={totals.ingresos} />,
        hint: "Facturado y cobrado juntos",
      },
      {
        label: "Egresos",
        value: <Money value={totals.egresos} />,
        hint: "Devengado y pagado juntos",
      },
      {
        label: "Neto",
        value: <Money value={totals.neto} />,
        hint: "Ingresos menos egresos",
      },
      {
        label: "Efectivo",
        value: <Money value={totals.efectivo.neto} />,
        hint: "Ya pasó por banco o caja",
      },
      {
        label: "Devengado",
        value: <Money value={totals.devengado.neto} />,
        hint: "Registrado, aún sin liquidar",
      },
      {
        label: "Movimientos",
        value: totals.conteo.toLocaleString("es-MX"),
        hint: `${totals.transferencias.conteo} traspaso(s) · ${totals.ajustes.conteo} ajuste(s)`,
      },
    ],
    [totals],
  );

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Libro de movimientos"
        subtitle="Cobros, pagos, gastos, nómina, líneas de banco sin conciliar y facturas, en una sola línea de tiempo."
        density="ops"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => void exportCsv()} disabled={exporting || loading}>
              {exporting ? "Generando…" : "Exportar CSV"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              Actualizar
            </Button>
          </>
        }
      />

      {/* Totales pegados arriba: es lo que la contadora cuadra. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 3,
          marginBottom: 10,
          background: "var(--surface)",
          borderRadius: 10,
        }}
      >
        <MetricStrip metrics={totalesStrip} ariaLabel="Totales del periodo filtrado" />
      </div>

      <div style={{ marginBottom: 12 }}>
        <FilterToolbar
          search={{
            value: filters.q,
            onChange: (v) => setFilter("q", v),
            placeholder: "Buscar concepto, referencia, cliente o proveedor…",
          }}
          dates={[
            { label: "Del", value: filters.from, onChange: (v) => setFilter("from", v) },
            { label: "Al", value: filters.to, onChange: (v) => setFilter("to", v) },
          ]}
          selects={[
            {
              label: "Tipo",
              value: filters.tipo,
              onChange: (v) => setFilter("tipo", v),
              options: TIPO_OPTIONS,
              allLabel: "Todos los tipos",
            },
            ...(accounts.length
              ? [
                  {
                    label: "Cuenta",
                    value: filters.cuentaId,
                    onChange: (v: string) => setFilter("cuentaId", v),
                    options: accounts.map((a) => ({
                      value: String(a.id),
                      label: a.bankName ? `${a.name} · ${a.bankName}` : a.name,
                    })),
                    allLabel: "Todas las cuentas",
                  },
                ]
              : []),
          ]}
          onClear={() => {
            setFilters(emptyFilters());
            setPage(1);
          }}
          resultCount={loading ? null : totals.conteo}
        />
      </div>

      {error && <InlineAlert message={error} variant="danger" onDismiss={() => setError(null)} />}

      {loading ? (
        <SkeletonList rows={8} tableLike />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtrado ? "Ningún movimiento con estos filtros" : "Sin movimientos en el periodo"}
          description={
            filtrado
              ? "Quita algún filtro o amplía el rango de fechas. El libro sólo muestra lo que existe en la base, no estimaciones."
              : `Entre el ${formatLedgerDate(filters.from)} y el ${formatLedgerDate(filters.to)} no hay cobros, pagos, gastos, nómina, líneas de banco sin conciliar ni facturas registradas.`
          }
          action={
            filtrado ? (
              <Button
                size="sm"
                onClick={() => {
                  setFilters(emptyFilters());
                  setPage(1);
                }}
              >
                Limpiar filtros
              </Button>
            ) : (
              <Link href="/erp/invoicing" style={{ fontSize: 12.5, fontWeight: 600 }}>
                Ir a facturación
              </Link>
            )
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            density="compact"
            onRowClick={(r) => setDetail(r)}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 10,
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span>
              Página {data?.page ?? page} de {totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>
              {NATURALEZA_HINT}
            </span>
          </div>
        </>
      )}

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? describeOrigen(detail) : ""}
        maxWidth={560}
        footer={
          detail ? (
            <>
              {detail.comprobanteUrl && (
                <a
                  href={detail.comprobanteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12.5, fontWeight: 600 }}
                >
                  Ver comprobante
                </a>
              )}
              {detail.origen.href && (
                <Link href={detail.origen.href} style={{ fontSize: 12.5, fontWeight: 600 }}>
                  Abrir documento origen
                </Link>
              )}
              <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
                Cerrar
              </Button>
            </>
          ) : null
        }
      >
        {detail && (
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", margin: 0, fontSize: 13 }}>
            <DetailRow label="Fecha" value={formatLedgerDate(detail.fecha)} />
            <DetailRow
              label="Tipo"
              value={`${TIPO_LABELS[detail.tipo]} · ${NATURALEZA_LABELS[detail.naturaleza]}`}
            />
            <DetailRow label="Concepto" value={detail.concepto} />
            <DetailRow label="Categoría" value={detail.categoria} />
            <DetailRow label="Cuenta" value={detail.cuenta?.nombre ?? "—"} />
            <DetailRow label="Contraparte" value={detail.contraparte?.nombre ?? "—"} />
            <DetailRow label="Proyecto" value={detail.proyecto?.nombre ?? "—"} />
            <DetailRow label="Referencia" value={detail.referencia ?? "—"} />
            <DetailRow label="Método" value={formatMetodo(detail.metodoPago)} />
            <DetailRow label="Estado" value={detail.estado} />
            <DetailRow label="Registró" value={detail.registradoPor ?? "—"} />
            <DetailRow
              label="Importe"
              value={
                detail.tipo === "INGRESO" ? (
                  <>
                    Ingreso <Money value={detail.ingreso} bold={false} />
                  </>
                ) : detail.tipo === "EGRESO" ? (
                  <>
                    Egreso <Money value={detail.egreso} bold={false} />
                  </>
                ) : (
                  <>
                    <Money value={detail.monto} bold={false} /> (no suma al neto)
                  </>
                )
              }
            />
          </dl>
        )}
      </Modal>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--text-tertiary)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </dt>
      <dd style={{ margin: 0, color: "var(--text-primary)" }}>{value}</dd>
    </>
  );
}
