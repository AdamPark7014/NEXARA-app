"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
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
  type LedgerTipo,
} from "./_ledger";

const PAGE_SIZE = 50;

type BankAccountOption = { id: number; name: string; bankName?: string | null };

const TIPO_COLOR: Record<LedgerTipo, string> = {
  INGRESO: "var(--success)",
  EGRESO: "var(--danger)",
  TRANSFERENCIA: "var(--text-secondary)",
  AJUSTE: "var(--text-tertiary)",
};

function TotalTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "in" | "out" | "net";
}) {
  const color =
    tone === "in" ? "var(--success)" : tone === "out" ? "var(--danger)" : "var(--text-primary)";
  return (
    <div
      style={{
        flex: "1 1 150px",
        minWidth: 140,
        padding: "8px 12px",
        borderRight: "1px solid var(--nx-panel-hairline, var(--border))",
      }}
      title={hint}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-tertiary)",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 17, marginTop: 2, color }}>
        <Money value={value} />
      </div>
      {hint && (
        <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 1 }}>{hint}</div>
      )}
    </div>
  );
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
        width: 96,
        render: (r) => (
          <span style={{ fontSize: 12, fontWeight: 700, color: TIPO_COLOR[r.tipo] }}>
            {TIPO_LABELS[r.tipo]}
          </span>
        ),
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
        render: (r) =>
          r.ingreso ? (
            <span style={{ color: "var(--success)" }}>
              <Money value={r.ingreso} />
            </span>
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
            <span style={{ color: "var(--danger)" }}>
              <Money value={r.egreso} />
            </span>
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
          ),
      },
      { key: "estado", label: "Estado", render: (r) => r.estado || "—" },
      { key: "registradoPor", label: "Registró", render: (r) => r.registradoPor ?? "—" },
    ],
    [],
  );

  const totalPages = data?.totalPages ?? 1;

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
          display: "flex",
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          zIndex: 3,
          marginBottom: 10,
          background: "var(--surface)",
          border: "1px solid var(--nx-panel-hairline, var(--border))",
          borderRadius: 10,
          boxShadow: "var(--nx-panel-elev-1)",
        }}
      >
        <TotalTile label="Ingresos" value={totals.ingresos} tone="in" />
        <TotalTile label="Egresos" value={totals.egresos} tone="out" />
        <TotalTile label="Neto" value={totals.neto} tone="net" />
        <TotalTile
          label="Efectivo"
          value={totals.efectivo.neto}
          hint="Ya pasó por banco o caja"
        />
        <TotalTile
          label="Devengado"
          value={totals.devengado.neto}
          hint="Registrado, aún sin liquidar"
        />
        <div style={{ flex: "1 1 150px", minWidth: 140, padding: "8px 12px" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-tertiary)",
            }}
          >
            Movimientos
          </div>
          <div style={{ fontSize: 17, marginTop: 2, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
            {totals.conteo.toLocaleString("es-MX")}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 1 }}>
            {totals.transferencias.conteo} traspaso(s) · {totals.ajustes.conteo} ajuste(s)
          </div>
        </div>
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
                detail.tipo === "INGRESO"
                  ? `Ingreso $${detail.ingreso.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`
                  : detail.tipo === "EGRESO"
                    ? `Egreso $${detail.egreso.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`
                    : `$${detail.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })} (no suma al neto)`
              }
            />
          </dl>
        )}
      </Modal>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ color: "var(--text-tertiary)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </dt>
      <dd style={{ margin: 0, color: "var(--text-primary)" }}>{value}</dd>
    </>
  );
}
