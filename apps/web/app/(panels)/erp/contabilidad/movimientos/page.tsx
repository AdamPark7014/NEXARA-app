"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { withTenantHeaders } from "@/lib/tenant";
import { financeStatusLabel } from "@/lib/finance-status-labels";
import {
  METODO_LABELS,
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

/**
 * La API rechaza con 400 cualquier página cuyo final pase del movimiento 2000
 * (`MAX_MERGE_SCAN`): fusiona seis tablas en memoria y más allá de eso no puede
 * garantizar el orden. Se topa aquí para que el botón no lleve a un error.
 */
const MAX_SCAN = 2000;
const MAX_PAGE = Math.floor(MAX_SCAN / PAGE_SIZE);

/** Tope de renglones del CSV en la API (`MAX_EXPORT_ROWS`). */
const MAX_EXPORT_ROWS = 5000;

type BankAccountOption = { id: number; name: string; bankName?: string | null };

/** Opciones del filtro de método: el mismo catálogo cerrado que valida la API. */
const METODO_OPTIONS = Object.entries(METODO_LABELS).map(([value, label]) => ({ value, label }));

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
  const { user, isContextReady } = useUser();
  const token = user?.token ?? "";

  const [filters, setFilters] = useState<LedgerFilters>(() => emptyFilters());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportAviso, setExportAviso] = useState<{
    tono: "success" | "warning" | "danger";
    texto: string;
  } | null>(null);
  const [detail, setDetail] = useState<LedgerRow | null>(null);
  const [angosto, setAngosto] = useState(false);

  // La última consulta pedida es la que se pinta. Teclear en el buscador lanza
  // una petición por letra y sin esto la respuesta lenta de «fac» podía llegar
  // después de la de «factura» y dejar en la tabla un resultado que ya no se
  // corresponde con lo que dicen los filtros.
  const peticion = useRef(0);

  const setFilter = useCallback((key: keyof LedgerFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const turno = ++peticion.current;
    setLoading(true);
    setError(null);
    try {
      const qs = buildLedgerQuery(filters, { page, pageSize: PAGE_SIZE });
      const res = await erpFetch<LedgerResponse>(
        `accounting/workspace/movimientos${qs ? `?${qs}` : ""}`,
        token,
      );
      if (turno !== peticion.current) return;
      setData(res);
    } catch (e) {
      if (turno !== peticion.current) return;
      setError(
        `${formatApiError(e, "No se pudo cargar el libro de movimientos")} Reintenta con «Actualizar»; si persiste, acorta el rango de fechas.`,
      );
      setData(null);
    } finally {
      if (turno === peticion.current) setLoading(false);
    }
  }, [token, filters, page]);

  useEffect(() => {
    if (!isContextReady) return;
    // Sin sesión el esqueleto se quedaba girando para siempre sin decir por qué.
    if (!token) {
      setLoading(false);
      return;
    }
    void load();
  }, [isContextReady, token, load]);

  // Con doce columnas, por debajo de 1200px la tabla solo cabía a base de
  // scroll horizontal. Lo secundario baja bajo el concepto en vez de perderse.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1200px)");
    const sync = () => setAngosto(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const sinSesion = isContextReady && !token;

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

  /**
   * Exportar dejaba de decir qué había pasado: ni al terminar ni —peor— cuando
   * la API recorta. El CSV se topa en {@link MAX_EXPORT_ROWS} renglones y lo
   * avisa en `X-Ledger-Truncated`; una contadora que cuadra el mes con un
   * archivo recortado y sin avisar cuadra mal.
   */
  const exportCsv = useCallback(async () => {
    if (!token || exporting) return;
    setExporting(true);
    setExportAviso(null);
    try {
      const qs = buildLedgerQuery(filters);
      const res = await fetch(
        buildApiUrl(`accounting/workspace/movimientos/export${qs ? `?${qs}` : ""}`),
        {
          credentials: "include",
          headers: withTenantHeaders({ Authorization: `Bearer ${token}` }),
        },
      );
      if (!res.ok) throw new Error(await res.text().catch(() => "No se pudo generar el CSV"));
      const renglones = Number(res.headers.get("X-Ledger-Rows"));
      const recortado = res.headers.get("X-Ledger-Truncated") === "true";
      const nombre = `movimientos-${filters.from}-a-${filters.to}.csv`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      const cuantos = Number.isFinite(renglones) && renglones > 0 ? `${renglones} ` : "";
      setExportAviso(
        recortado
          ? {
              tono: "warning",
              texto: `Se descargó ${nombre}, pero está recortado: el CSV llega hasta ${MAX_EXPORT_ROWS.toLocaleString("es-MX")} movimientos y el filtro trae más. Parte el periodo en tramos más cortos y exporta cada uno.`,
            }
          : {
              tono: "success",
              texto: `Se descargó ${nombre} con ${cuantos}movimientos, los mismos que muestran los filtros de arriba.`,
            },
      );
    } catch (e) {
      setExportAviso({
        tono: "danger",
        texto: `No se pudo exportar el libro. ${formatApiError(e, "El servidor no devolvió el archivo")} Vuelve a intentarlo; si sigue fallando, reduce el rango de fechas.`,
      });
    } finally {
      setExporting(false);
    }
  }, [token, filters, exporting]);

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
        render: (r) => {
          // En pantalla angosta, el contexto que identifica el renglón baja
          // aquí en 11px; el resto no se pierde, vive en el detalle del
          // renglón, que se abre con un clic o con Enter.
          const meta = [
            describeOrigen(r),
            r.naturaleza === "DEVENGADO" ? "devengado" : null,
            ...(angosto
              ? [
                  r.contraparte?.nombre ?? null,
                  r.cuenta?.nombre ?? null,
                  r.referencia ? `Ref. ${r.referencia}` : null,
                ]
              : []),
          ].filter(Boolean);
          return (
            <div style={{ minWidth: angosto ? 160 : 200 }}>
              <div style={{ fontWeight: 600 }}>{r.concepto}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.35 }}>
                {meta.join(" · ")}
              </div>
            </div>
          );
        },
      },
      ...(angosto
        ? []
        : [
            {
              key: "categoria",
              label: "Categoría",
              render: (r: LedgerRow) => r.categoria || "—",
            },
            {
              key: "cuenta",
              label: "Cuenta",
              render: (r: LedgerRow) => r.cuenta?.nombre ?? "—",
            },
            {
              key: "contraparte",
              label: "Contraparte",
              render: (r: LedgerRow) => r.contraparte?.nombre ?? "—",
            },
            {
              key: "proyecto",
              label: "Proyecto",
              render: (r: LedgerRow) => r.proyecto?.nombre ?? "—",
            },
            {
              key: "referencia",
              label: "Referencia",
              render: (r: LedgerRow) => (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {r.referencia ?? "—"}
                </span>
              ),
            },
          ]),
      {
        key: "ingreso",
        label: "Ingreso",
        align: "right",
        numeric: true,
        // Sin verde ni rojo: la columna ya dice de qué lado cae el monto, y con
        // cincuenta filas el color convierte el libro en un semáforo.
        render: (r) => {
          const ingreso = Number(r.ingreso) || 0;
          const egreso = Number(r.egreso) || 0;
          const monto = Number(r.monto) || 0;
          // Traspaso/ajuste: API deja ingreso/egreso en 0 y manda el importe en `monto`.
          if (ingreso > 0) return <Money value={ingreso} bold={false} />;
          if (egreso === 0 && monto > 0 && (r.tipo === "TRANSFERENCIA" || r.tipo === "AJUSTE")) {
            return <Money value={monto} bold={false} />;
          }
          return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
        },
      },
      {
        key: "egreso",
        label: "Egreso",
        align: "right",
        numeric: true,
        render: (r) => {
          const egreso = Number(r.egreso) || 0;
          if (egreso > 0) return <Money value={egreso} bold={false} />;
          return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
        },
      },
      {
        key: "estado",
        label: "Estado",
        render: (r) =>
          r.estado ? (
            <StatusDot label={financeStatusLabel(r.estado)} tone={tonoEstado(r.estado)} />
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
          ),
      },
      ...(angosto
        ? []
        : [
            {
              key: "registradoPor",
              label: "Registró",
              render: (r: LedgerRow) => r.registradoPor ?? "—",
            },
          ]),
    ],
    [angosto],
  );

  const totalPages = data?.totalPages ?? 1;
  // El servidor rechaza pasar del movimiento 2000; navegar más allá solo
  // produciría un 400, así que la última página alcanzable se dice aquí.
  const ultimaPagina = Math.min(totalPages, MAX_PAGE);
  const topeAlcanzado = totalPages > MAX_PAGE;

  /**
   * La tira de totales. Las pistas NO son decorado: «Ingresos» suma efectivo y
   * devengado, así que una factura y su cobro cuentan las dos veces, a
   * propósito. Sin esa línea la cifra se lee como dinero que entró, y no lo es
   * —para eso está «Efectivo»—. Si algún día se recorta la tira, la pista se
   * queda.
   */
  const totalesStrip: Metric[] = useMemo(() => {
    // Cifras cortas: la pista vive en 11px dentro de una celda de 150px y la
    // tira va fija arriba; escrita entera ocupaba tres renglones por celda.
    const dinero = (n: number) => {
      const abs = Math.abs(n);
      const signo = n < 0 ? "−" : "";
      if (abs >= 1_000_000) return `${signo}$${(abs / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${signo}$${Math.round(abs / 1000)}k`;
      return `${signo}$${Math.round(abs).toLocaleString("es-MX")}`;
    };
    return [
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
      // Efectivo y devengado traían el desglose completo desde la API y solo se
      // pintaba el neto: de qué está hecho cada neto se lee en la pista.
      {
        label: "Efectivo",
        value: <Money value={totals.efectivo.neto} />,
        hint: `${totals.efectivo.conteo} mov · ${dinero(totals.efectivo.ingresos)} entró, ${dinero(totals.efectivo.egresos)} salió`,
      },
      {
        label: "Devengado",
        value: <Money value={totals.devengado.neto} />,
        hint: `${totals.devengado.conteo} mov · ${dinero(totals.devengado.ingresos)} por cobrar, ${dinero(totals.devengado.egresos)} por pagar`,
      },
      {
        label: "Movimientos",
        value: totals.conteo.toLocaleString("es-MX"),
        // Traspasos y ajustes no suman al neto, pero su importe sí explica
        // huecos al cuadrar; llegaba en la respuesta y no se veía.
        hint: `${totals.transferencias.conteo} traspasos (${dinero(totals.transferencias.monto)}) · ${totals.ajustes.conteo} ajustes (${dinero(totals.ajustes.monto)}), no suman al neto`,
      },
    ];
  }, [totals]);

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Libro de movimientos"
        subtitle="Cobros, pagos, gastos, nómina, líneas de banco sin conciliar y facturas, en una sola línea de tiempo."
        density="ops"
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void exportCsv()}
              disabled={exporting || loading || sinSesion}
            >
              {exporting ? "Generando…" : "Exportar CSV"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void load()}
              disabled={loading || sinSesion}
            >
              {loading ? "Actualizando…" : "Actualizar"}
            </Button>
          </>
        }
      />

      {/* El resultado de exportar, pegado a la acción que lo produjo. */}
      {exportAviso && (
        <InlineAlert
          variant={exportAviso.tono}
          message={exportAviso.texto}
          onDismiss={() => setExportAviso(null)}
        />
      )}

      {sinSesion && (
        <InlineAlert
          variant="warning"
          message="No hay sesión activa, así que el libro no se puede consultar. Vuelve a entrar con tu cuenta para ver los movimientos."
          action={
            <Link href="/login" style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
              Ir a entrar
            </Link>
          }
        />
      )}

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
            {
              label: "Método",
              value: filters.metodoPago,
              onChange: (v: string) => setFilter("metodoPago", v),
              options: METODO_OPTIONS,
              allLabel: "Todos los métodos",
            },
          ]}
          onClear={() => {
            setFilters(emptyFilters());
            setPage(1);
          }}
          resultCount={loading ? null : totals.conteo}
        />
      </div>

      {error && (
        <InlineAlert
          message={error}
          variant="danger"
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
              {loading ? "Reintentando…" : "Reintentar"}
            </Button>
          }
        />
      )}

      {sinSesion ? null : loading ? (
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
            {/* `loading` también bloquea: dos clics seguidos en «Siguiente»
                disparaban dos consultas y se saltaban una página. */}
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <span>
              Página {data?.page ?? page} de {ultimaPagina}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= ultimaPagina || loading}
              onClick={() => setPage((p) => Math.min(ultimaPagina, p + 1))}
            >
              Siguiente
            </Button>
            {topeAlcanzado && (
              <span style={{ fontSize: 11, color: "var(--state-warning-text, #b45309)" }}>
                Hasta aquí llega la paginación ({MAX_SCAN.toLocaleString("es-MX")} movimientos).
                Filtra o acorta el periodo para ver el resto.
              </span>
            )}
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
            <DetailRow label="Estado" value={financeStatusLabel(detail.estado)} />
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

/** `—` cuando el campo viene vacío: una celda en blanco no dice si falta el
 *  dato o si falló el render. */
function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const vacio = !value || (typeof value === "string" && !value.trim());
  return (
    <>
      <dt style={{ color: "var(--text-tertiary)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </dt>
      <dd style={{ margin: 0, color: vacio ? "var(--text-tertiary)" : "var(--text-primary)" }}>
        {vacio ? "—" : value}
      </dd>
    </>
  );
}
