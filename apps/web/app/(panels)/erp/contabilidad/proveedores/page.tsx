"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import Modal from "@/components/ui/Modal";
import PanelTabs from "@/components/ui/PanelTabs";
import Section from "@/components/ui/Section";
import FilterToolbar from "@/components/FilterToolbar";
import { useUser } from "@/components/UserContext";
import { erpFetch, financeStatusVariant, formatApiError } from "@/lib/erp-api";

/**
 * Proveedores de Contabilidad.
 *
 * Antes esta página agrupaba facturas por `receptorName`: un proveedor dado de
 * alta sin facturas no existía, y el mismo proveedor escrito distinto en dos
 * CFDI salía dos veces. Ahora la lista viene del modelo Supplier
 * (`GET /accounting/workspace/proveedores`) y cada renglón abre su 360°.
 */

// ── Contrato con la API ─────────────────────────────────────────────────────

type VendorRow = {
  id: number;
  nombre: string;
  rfc: string | null;
  activo: boolean;
  esMayorista: boolean;
  creditoDias: number | null;
  limiteCredito: number | null;
  saldoPorPagar: number;
  vencido: number;
  porVencer: number;
  totalAnio: number;
  facturas: number;
  facturasAbiertas: number;
  ultimaCompra: string | null;
  ordenesCompra: number;
  montoOrdenes: number;
  ultimaOrden: string | null;
  excedeCredito: boolean;
};

type VendorList = {
  items: VendorRow[];
  totales: {
    proveedores: number;
    saldoPorPagar: number;
    vencido: number;
    totalAnio: number;
    conSaldo: number;
  };
};

type VendorDetail = {
  proveedor: {
    id: number;
    nombre: string;
    rfc: string | null;
    descripcion: string | null;
    activo: boolean;
    alta: string | null;
    actualizado: string | null;
  };
  condiciones: {
    esMayorista: boolean;
    creditoDias: number | null;
    limiteCredito: number | null;
    descuentoBase: number | null;
    leadTimeDias: number | null;
    pedidoMinimo: number | null;
    productosEnCatalogo: number;
  };
  resumen: {
    saldoPorPagar: number;
    vencido: number;
    porVencer: number;
    facturas: number;
    facturasAbiertas: number;
    comprado: number;
    pagado: number;
    ordenesCompra: number;
    excedeCredito: boolean;
  };
  facturas: {
    id: number;
    folio: string;
    tipo: string;
    estatus: string;
    emision: string | null;
    vencimiento: string | null;
    total: number;
    pagado: number;
    saldo: number;
    moneda: string;
    uuid: string | null;
    cancelada: boolean;
    proyecto: { id: number; titulo: string } | null;
  }[];
  ordenesCompra: {
    id: number;
    folio: string;
    estatus: string;
    fecha: string | null;
    esperada: string | null;
    total: number;
    moneda: string;
    partidas: number;
    facturas: number;
  }[];
  cuentasPorPagar: {
    facturas: {
      id: number;
      folio: string;
      emision: string | null;
      vencimiento: string | null;
      total: number;
      pagado: number;
      saldo: number;
      diasVencido: number;
      estatus: string;
    }[];
    antiguedad: { key: string; label: string; monto: number; conteo: number }[];
  };
  pagos: {
    id: number;
    fecha: string | null;
    monto: number;
    metodo: string;
    referencia: string | null;
    facturaId: number;
    factura: string | null;
  }[];
  proyectos: { id: number; titulo: string; estatus: string; facturas: number; monto: number }[];
  evaluaciones: {
    id: number;
    fecha: string | null;
    calidad: number;
    entrega: number;
    precio: number;
    servicio: number;
    global: number;
    notas: string | null;
  }[];
  historial: {
    key: string;
    tipo: string;
    fecha: string | null;
    titulo: string;
    detalle: string;
    monto: number;
    estatus: string;
  }[];
};

// ── Utilidades de presentación ──────────────────────────────────────────────

const fecha = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};

const TIPO_HISTORIAL: Record<string, string> = {
  factura: "Factura",
  orden: "Orden de compra",
  pago: "Pago",
  evaluacion: "Evaluación",
};

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 150 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-tertiary)",
          fontWeight: 700,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13.5, color: "var(--foreground)" }}>{value}</div>
    </div>
  );
}

/** Una celda de dinero para `MetricStrip`, con su pista de qué la compone. */
function cifra(
  label: string,
  value: number,
  hint?: string,
  tone: Metric["tone"] = "default",
): Metric {
  return { label, value: <Money value={value} />, hint, tone };
}

/** Pesos redondeados, para las pistas de la tira. */
const pesos = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** El estatus que manda el API, como punto y palabra. */
const TONO_ESTATUS: Record<string, StatusTone> = {
  positive: "success",
  warning: "warning",
  danger: "danger",
  accent: "info",
  default: "neutral",
};

function EstatusDot({ estatus, tono }: { estatus: string; tono?: StatusTone }) {
  return (
    <StatusDot
      label={estatus}
      tone={tono ?? TONO_ESTATUS[financeStatusVariant(estatus)] ?? "neutral"}
    />
  );
}

type TabKey =
  | "fiscal"
  | "facturas"
  | "compras"
  | "porPagar"
  | "pagos"
  | "proyectos"
  | "historial";

// ── Página ──────────────────────────────────────────────────────────────────

export default function ProveedoresPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [data, setData] = useState<VendorList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);

  const [abierto, setAbierto] = useState<VendorRow | null>(null);
  const [detalle, setDetalle] = useState<VendorDetail | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("fiscal");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (soloActivos) params.set("soloActivos", "1");
      const qs = params.toString();
      const res = await erpFetch<VendorList>(
        `accounting/workspace/proveedores${qs ? `?${qs}` : ""}`,
        token,
      );
      setData(res);
    } catch (e) {
      setError(formatApiError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, soloActivos]);

  useEffect(() => {
    void load();
  }, [load]);

  const abrir = useCallback(
    async (row: VendorRow) => {
      setAbierto(row);
      setTab("fiscal");
      setDetalle(null);
      setDetalleError(null);
      setDetalleLoading(true);
      try {
        const res = await erpFetch<VendorDetail>(
          `accounting/workspace/proveedores/${row.id}`,
          token,
        );
        setDetalle(res);
      } catch (e) {
        setDetalleError(formatApiError(e));
      } finally {
        setDetalleLoading(false);
      }
    },
    [token],
  );

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (r) =>
        r.nombre.toLowerCase().includes(needle) ||
        String(r.rfc ?? "").toLowerCase().includes(needle),
    );
  }, [data, q]);

  const columns: Column<VendorRow>[] = useMemo(
    () => [
      {
        key: "nombre",
        label: "Proveedor",
        render: (r) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontWeight: 600 }}>{r.nombre}</span>
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                {r.rfc ? `RFC ${r.rfc}` : "Sin RFC registrado"}
              </span>
              {r.esMayorista && (
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>· Mayorista</span>
              )}
              {!r.activo && <StatusDot label="Inactivo" tone="neutral" />}
            </span>
          </div>
        ),
      },
      {
        key: "saldoPorPagar",
        label: "Saldo por pagar",
        align: "right",
        numeric: true,
        render: (r) => <Money value={r.saldoPorPagar} />,
      },
      {
        key: "vencido",
        label: "Vencido",
        align: "right",
        numeric: true,
        render: (r) =>
          r.vencido > 0 ? (
            <span style={{ color: "var(--danger)" }}>
              <Money value={r.vencido} />
            </span>
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
          ),
      },
      {
        key: "totalAnio",
        label: "Comprado este año",
        align: "right",
        numeric: true,
        render: (r) => <Money value={r.totalAnio} />,
      },
      {
        key: "facturas",
        label: "Facturas",
        align: "right",
        numeric: true,
        render: (r) => (
          <span>
            {r.facturas}
            {r.facturasAbiertas > 0 && (
              <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>
                {" "}
                ({r.facturasAbiertas} abiertas)
              </span>
            )}
          </span>
        ),
      },
      {
        key: "ultimaCompra",
        label: "Última compra",
        render: (r) => (
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            {fecha(r.ultimaCompra)}
          </span>
        ),
      },
      {
        key: "credito",
        label: "Crédito",
        render: (r) =>
          r.limiteCredito != null && r.limiteCredito > 0 ? (
            <span style={{ fontSize: 12.5 }}>
              {r.excedeCredito ? (
                <StatusDot
                  label="Rebasa el tope"
                  tone="danger"
                  title={`Límite de crédito ${pesos(r.limiteCredito)}`}
                />
              ) : (
                <span style={{ color: "var(--text-secondary)" }}>
                  {r.creditoDias != null ? `${r.creditoDias} días` : "Con tope"}
                </span>
              )}
            </span>
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
              {r.creditoDias ? `${r.creditoDias} días` : "Contado"}
            </span>
          ),
      },
    ],
    [],
  );

  const totales = data?.totales;

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Proveedores"
        subtitle="Cada proveedor dado de alta, con lo que le debes y lo que ya venció. Abre uno para ver su expediente completo."
        density="ops"
        actions={
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            Actualizar
          </Button>
        }
      />

      {error && <InlineAlert message={error} onDismiss={() => setError(null)} />}

      {totales && !loading && (
        <div style={{ marginBottom: 14 }}>
          <MetricStrip
            ariaLabel="Resumen de proveedores"
            metrics={[
              cifra(
                "Saldo por pagar",
                totales.saldoPorPagar,
                `${totales.conSaldo} de ${totales.proveedores} proveedores con saldo`,
              ),
              cifra(
                "Vencido",
                totales.vencido,
                totales.vencido > 0 ? "ya pasó la fecha de pago" : "nada pasado de fecha",
                totales.vencido > 0 ? "danger" : "default",
              ),
              cifra(
                "Comprado este año",
                totales.totalAnio,
                "facturas de proveedor del ejercicio",
              ),
            ]}
          />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <FilterToolbar
          search={{ value: q, onChange: setQ, placeholder: "Buscar por nombre o RFC…" }}
          toggles={[{ label: "Solo activos", value: soloActivos, onChange: setSoloActivos }]}
          onClear={
            q || soloActivos
              ? () => {
                  setQ("");
                  setSoloActivos(false);
                }
              : undefined
          }
          resultCount={rows.length}
        />
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando proveedores…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={q || soloActivos ? "Ningún proveedor coincide" : "Todavía no hay proveedores"}
          description={
            q || soloActivos
              ? "Cambia la búsqueda o quita el filtro de activos."
              : "Los proveedores se dan de alta en Compras. En cuanto exista uno, aquí aparece con su saldo aunque aún no tenga facturas."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => void abrir(r)}
          density="compact"
        />
      )}

      <Modal
        open={abierto != null}
        onClose={() => setAbierto(null)}
        title={abierto?.nombre ?? "Proveedor"}
        maxWidth={1040}
      >
        {detalleLoading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando expediente…</p>
        ) : detalleError ? (
          <InlineAlert message={detalleError} />
        ) : !detalle ? null : (
          <>
            <div style={{ marginBottom: 14 }}>
              <MetricStrip
                ariaLabel="Expediente del proveedor"
                metrics={[
                  cifra(
                    "Saldo por pagar",
                    detalle.resumen.saldoPorPagar,
                    `${detalle.resumen.facturasAbiertas} factura(s) abierta(s)`,
                  ),
                  cifra(
                    "Vencido",
                    detalle.resumen.vencido,
                    `por vencer ${pesos(detalle.resumen.porVencer)}`,
                    detalle.resumen.vencido > 0 ? "danger" : "default",
                  ),
                  cifra(
                    "Comprado (histórico)",
                    detalle.resumen.comprado,
                    `${detalle.resumen.facturas} factura(s) registradas`,
                  ),
                  cifra(
                    "Pagado",
                    detalle.resumen.pagado,
                    `${detalle.resumen.ordenesCompra} orden(es) de compra`,
                  ),
                ]}
              />
            </div>

            {detalle.resumen.excedeCredito && (
              <InlineAlert
                variant="warning"
                message="El saldo por pagar rebasa el límite de crédito pactado con este proveedor."
              />
            )}

            <PanelTabs<TabKey>
              value={tab}
              onChange={setTab}
              ariaLabel="Secciones del proveedor"
              tabs={[
                { key: "fiscal", label: "Fiscal y condiciones" },
                { key: "facturas", label: "Facturas", badge: detalle.facturas.length || undefined },
                {
                  key: "compras",
                  label: "Compras",
                  badge: detalle.ordenesCompra.length || undefined,
                },
                {
                  key: "porPagar",
                  label: "Por pagar",
                  badge: detalle.cuentasPorPagar.facturas.length || undefined,
                },
                { key: "pagos", label: "Pagos", badge: detalle.pagos.length || undefined },
                {
                  key: "proyectos",
                  label: "Proyectos",
                  badge: detalle.proyectos.length || undefined,
                },
                { key: "historial", label: "Historial" },
              ]}
            />

            {tab === "fiscal" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Section title="Datos fiscales" dense>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <Dato label="Razón social" value={detalle.proveedor.nombre} />
                    <Dato
                      label="RFC"
                      value={
                        detalle.proveedor.rfc ?? (
                          <span style={{ color: "var(--text-tertiary)" }}>
                            Sin RFC — no entra a DIOT
                          </span>
                        )
                      }
                    />
                    <Dato
                      label="Estatus"
                      value={
                        <StatusDot
                          label={detalle.proveedor.activo ? "Activo" : "Inactivo"}
                          tone={detalle.proveedor.activo ? "success" : "neutral"}
                        />
                      }
                    />
                    <Dato label="Alta" value={fecha(detalle.proveedor.alta)} />
                    <Dato label="Última actualización" value={fecha(detalle.proveedor.actualizado)} />
                  </div>
                  {detalle.proveedor.descripcion && (
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
                      {detalle.proveedor.descripcion}
                    </p>
                  )}
                </Section>

                <Section
                  title="Condiciones comerciales"
                  subtitle="Lo pactado con el proveedor, no lo calculado."
                  dense
                >
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <Dato
                      label="Tipo"
                      value={detalle.condiciones.esMayorista ? "Mayorista con convenio" : "Proveedor puntual"}
                    />
                    <Dato
                      label="Crédito"
                      value={
                        detalle.condiciones.creditoDias
                          ? `${detalle.condiciones.creditoDias} días`
                          : "Contado"
                      }
                    />
                    <Dato
                      label="Límite de crédito"
                      value={
                        detalle.condiciones.limiteCredito != null ? (
                          <Money value={detalle.condiciones.limiteCredito} bold={false} />
                        ) : (
                          "Sin tope"
                        )
                      }
                    />
                    <Dato
                      label="Descuento de convenio"
                      value={
                        detalle.condiciones.descuentoBase != null
                          ? `${detalle.condiciones.descuentoBase} %`
                          : "—"
                      }
                    />
                    <Dato
                      label="Tiempo de entrega"
                      value={
                        detalle.condiciones.leadTimeDias != null
                          ? `${detalle.condiciones.leadTimeDias} días`
                          : "—"
                      }
                    />
                    <Dato
                      label="Pedido mínimo"
                      value={
                        detalle.condiciones.pedidoMinimo != null ? (
                          <Money value={detalle.condiciones.pedidoMinimo} bold={false} />
                        ) : (
                          "—"
                        )
                      }
                    />
                    <Dato
                      label="Productos en catálogo"
                      value={detalle.condiciones.productosEnCatalogo}
                    />
                  </div>
                </Section>

                {detalle.evaluaciones.length > 0 && (
                  <Section title="Evaluaciones" dense flush>
                    <DataTable
                      rows={detalle.evaluaciones}
                      rowKey={(e) => e.id}
                      density="compact"
                      stickyHeader={false}
                      columns={[
                        { key: "fecha", label: "Fecha", render: (e) => fecha(e.fecha) },
                        { key: "calidad", label: "Calidad", align: "right", numeric: true },
                        { key: "entrega", label: "Entrega", align: "right", numeric: true },
                        { key: "precio", label: "Precio", align: "right", numeric: true },
                        { key: "servicio", label: "Servicio", align: "right", numeric: true },
                        {
                          key: "global",
                          label: "Global",
                          align: "right",
                          numeric: true,
                          render: (e) => <strong>{e.global}</strong>,
                        },
                      ]}
                    />
                  </Section>
                )}
              </div>
            )}

            {tab === "facturas" && (
              <DataTable
                rows={detalle.facturas}
                rowKey={(f) => f.id}
                density="compact"
                stickyHeader={false}
                emptyTitle="Sin facturas"
                emptyDescription="Este proveedor todavía no tiene facturas registradas."
                columns={[
                  {
                    key: "folio",
                    label: "Folio",
                    render: (f) => (
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>{f.folio}</span>
                        {f.uuid && (
                          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                            UUID {f.uuid.slice(0, 8)}…
                          </span>
                        )}
                      </span>
                    ),
                  },
                  {
                    key: "tipo",
                    label: "Tipo",
                    render: (f) => (f.tipo === "ACCOUNTS_PAYABLE" ? "Por pagar" : "Por cobrar"),
                  },
                  { key: "emision", label: "Emisión", render: (f) => fecha(f.emision) },
                  { key: "vencimiento", label: "Vence", render: (f) => fecha(f.vencimiento) },
                  {
                    key: "total",
                    label: "Total",
                    align: "right",
                    numeric: true,
                    render: (f) => <Money value={f.total} />,
                  },
                  {
                    key: "saldo",
                    label: "Saldo",
                    align: "right",
                    numeric: true,
                    render: (f) => <Money value={f.saldo} />,
                  },
                  {
                    key: "estatus",
                    label: "Estatus",
                    render: (f) => (
                      <EstatusDot
                        estatus={f.cancelada ? "Cancelada" : f.estatus}
                        tono={f.cancelada ? "danger" : undefined}
                      />
                    ),
                  },
                  {
                    key: "proyecto",
                    label: "Proyecto",
                    render: (f) =>
                      f.proyecto ? (
                        f.proyecto.titulo
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>Sin proyecto</span>
                      ),
                  },
                ]}
              />
            )}

            {tab === "compras" && (
              <DataTable
                rows={detalle.ordenesCompra}
                rowKey={(o) => o.id}
                density="compact"
                stickyHeader={false}
                emptyTitle="Sin órdenes de compra"
                emptyDescription="No se le ha emitido ninguna orden de compra a este proveedor."
                columns={[
                  { key: "folio", label: "Orden" },
                  { key: "fecha", label: "Fecha", render: (o) => fecha(o.fecha) },
                  { key: "esperada", label: "Entrega esperada", render: (o) => fecha(o.esperada) },
                  { key: "partidas", label: "Partidas", align: "right", numeric: true },
                  {
                    key: "total",
                    label: "Total",
                    align: "right",
                    numeric: true,
                    render: (o) => <Money value={o.total} />,
                  },
                  {
                    key: "facturas",
                    label: "Facturas ligadas",
                    align: "right",
                    numeric: true,
                  },
                  {
                    key: "estatus",
                    label: "Estatus",
                    render: (o) => (
                      <EstatusDot estatus={o.estatus} />
                    ),
                  },
                ]}
              />
            )}

            {tab === "porPagar" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Section
                  title="Antigüedad del saldo"
                  subtitle="Cuánto lleva esperando cada peso que se le debe."
                  dense
                >
                  <MetricStrip
                    ariaLabel="Antigüedad del saldo"
                    metrics={detalle.cuentasPorPagar.antiguedad.map((b) => ({
                      label: b.label,
                      value: <Money value={b.monto} />,
                      hint: `${b.conteo} factura(s)`,
                      tone:
                        b.monto > 0 && b.key !== "porVencer"
                          ? ("danger" as const)
                          : ("default" as const),
                    }))}
                  />
                </Section>
                <DataTable
                  rows={detalle.cuentasPorPagar.facturas}
                  rowKey={(f) => f.id}
                  density="compact"
                  stickyHeader={false}
                  emptyTitle="Nada por pagar"
                  emptyDescription="No hay facturas abiertas de este proveedor."
                  columns={[
                    { key: "folio", label: "Folio" },
                    { key: "vencimiento", label: "Vence", render: (f) => fecha(f.vencimiento) },
                    {
                      key: "diasVencido",
                      label: "Días vencido",
                      align: "right",
                      numeric: true,
                      render: (f) =>
                        f.diasVencido > 0 ? (
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              fontVariantNumeric: "tabular-nums",
                              color: "var(--state-danger-text, #b91c1c)",
                              whiteSpace: "nowrap",
                            }}
                            title={`Lleva ${f.diasVencido} día(s) pasada de fecha`}
                          >
                            {f.diasVencido} {f.diasVencido === 1 ? "día" : "días"}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                            Al corriente
                          </span>
                        ),
                    },
                    {
                      key: "total",
                      label: "Total",
                      align: "right",
                      numeric: true,
                      render: (f) => <Money value={f.total} />,
                    },
                    {
                      key: "pagado",
                      label: "Pagado",
                      align: "right",
                      numeric: true,
                      render: (f) => <Money value={f.pagado} />,
                    },
                    {
                      key: "saldo",
                      label: "Saldo",
                      align: "right",
                      numeric: true,
                      render: (f) => <Money value={f.saldo} />,
                    },
                  ]}
                />
              </div>
            )}

            {tab === "pagos" && (
              <DataTable
                rows={detalle.pagos}
                rowKey={(p) => p.id}
                density="compact"
                stickyHeader={false}
                emptyTitle="Sin pagos aplicados"
                emptyDescription="Todavía no se registra ningún pago a este proveedor."
                columns={[
                  { key: "fecha", label: "Fecha", render: (p) => fecha(p.fecha) },
                  { key: "factura", label: "Factura", render: (p) => p.factura ?? `#${p.facturaId}` },
                  { key: "metodo", label: "Método" },
                  {
                    key: "referencia",
                    label: "Referencia",
                    render: (p) => p.referencia ?? <span style={{ color: "var(--text-tertiary)" }}>—</span>,
                  },
                  {
                    key: "monto",
                    label: "Monto",
                    align: "right",
                    numeric: true,
                    render: (p) => <Money value={p.monto} />,
                  },
                ]}
              />
            )}

            {tab === "proyectos" && (
              <DataTable
                rows={detalle.proyectos}
                rowKey={(p) => p.id}
                density="compact"
                stickyHeader={false}
                emptyTitle="Sin proyectos ligados"
                emptyDescription="Ninguna factura de este proveedor está ligada a una actividad de proyecto."
                columns={[
                  { key: "titulo", label: "Proyecto" },
                  { key: "estatus", label: "Estatus" },
                  { key: "facturas", label: "Facturas", align: "right", numeric: true },
                  {
                    key: "monto",
                    label: "Facturado al proyecto",
                    align: "right",
                    numeric: true,
                    render: (p) => <Money value={p.monto} />,
                  },
                ]}
              />
            )}

            {tab === "historial" && (
              <DataTable
                rows={detalle.historial}
                rowKey={(h) => h.key}
                density="compact"
                stickyHeader={false}
                emptyTitle="Sin movimientos"
                emptyDescription="No hay facturas, órdenes ni pagos registrados con este proveedor."
                columns={[
                  { key: "fecha", label: "Fecha", render: (h) => fecha(h.fecha) },
                  {
                    key: "tipo",
                    label: "Tipo",
                    render: (h) => (
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {TIPO_HISTORIAL[h.tipo] ?? h.tipo}
                      </span>
                    ),
                  },
                  { key: "titulo", label: "Movimiento" },
                  {
                    key: "detalle",
                    label: "Detalle",
                    render: (h) => (
                      <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                        {h.detalle || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "monto",
                    label: "Monto",
                    align: "right",
                    numeric: true,
                    render: (h) =>
                      h.monto ? <Money value={h.monto} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>,
                  },
                  { key: "estatus", label: "Estatus" },
                ]}
              />
            )}
          </>
        )}
      </Modal>
    </>
  );
}
