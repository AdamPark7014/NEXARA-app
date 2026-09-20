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
import Section from "@/components/ui/Section";
import FilterToolbar from "@/components/FilterToolbar";
import { useUser } from "@/components/UserContext";
import { erpFetch, financeStatusVariant, formatApiError } from "@/lib/erp-api";
import { financeStatusLabel } from "@/lib/finance-status-labels";

/**
 * Estado financiero por proyecto.
 *
 * La versión anterior agrupaba facturas por `inv.projectId`, un campo que no
 * existe en el modelo Invoice: todo caía en «sin vínculo». Ahora el API arma
 * el estado real (`GET /accounting/workspace/proyectos`) siguiendo los caminos
 * que sí existen —actividad y orden de venta— y el detalle baja hasta la
 * transacción que forma cada categoría de costo.
 */

// ── Contrato con la API ─────────────────────────────────────────────────────

type ProjectKind = "operacional" | "obra";

type ProjectRow = {
  key: string;
  id: number;
  tipo: ProjectKind;
  titulo: string;
  cliente: string | null;
  estatus: string;
  inicio: string | null;
  fin: string | null;
  moneda: string;
  presupuesto: number | null;
  ingresos: number;
  cobrado: number;
  porCobrar: number;
  costoTotal: number;
  costoPagado: number;
  costoPendiente: number;
  margen: number;
  margenPct: number | null;
  categorias: number;
  avance?: number | null;
};

type ProjectList = {
  items: ProjectRow[];
  totales: {
    proyectos: number;
    conFacturacion: number;
    ingresos: number;
    cobrado: number;
    costoTotal: number;
    margen: number;
  };
};

type CostCategory = {
  key: string;
  label: string;
  fuente: string;
  monto: number;
  pagado: number;
  pendiente: number;
  conteo: number;
  participacionPct: number;
};

type CostTransaction = {
  key: string;
  tipo: string;
  documento: string;
  fecha: string | null;
  concepto: string;
  monto: number;
  pagado: number;
  estatus: string;
  categoriaKey: string;
  refId: number;
};

type ProjectDetail = {
  proyecto: {
    key: string;
    id: number;
    tipo: ProjectKind;
    titulo: string;
    estatus: string;
    objetivo: string | null;
    alcance: string | null;
    cliente: string | null;
    responsable: string | null;
    inicioPlaneado: string | null;
    finPlaneado: string | null;
    inicioReal: string | null;
    finReal: string | null;
    moneda: string;
    avance?: number | null;
  };
  resumen: {
    ingresos: number;
    cobrado: number;
    porCobrar: number;
    costoTotal: number;
    costoPagado: number;
    costoPendiente: number;
    margen: number;
    margenPct: number | null;
  };
  presupuesto: {
    autorizado: number | null;
    comprometido: number;
    pagado: number;
    disponible: number | null;
    origen: string;
  };
  categorias: CostCategory[];
  transacciones: CostTransaction[];
  ingresosDetalle: {
    id: number;
    folio: string;
    fecha: string | null;
    total: number;
    cobrado: number;
    saldo: number;
    estatus: string;
  }[];
  bitacora?: {
    id: number;
    etiqueta: string;
    avance: number | null;
    nota: string | null;
    fecha: string | null;
  }[];
};

// ── Utilidades de presentación ──────────────────────────────────────────────

const fecha = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};

const FUENTE_LABEL: Record<string, string> = {
  facturas: "Facturas de proveedor",
  gastos: "Gastos registrados",
  viaticos: "Viáticos",
  almacen: "Salidas de almacén",
  nomina: "Nómina de obra",
};

const TIPO_TX: Record<string, string> = {
  factura: "Factura",
  gasto: "Gasto",
  viatico: "Viático",
  almacen: "Almacén",
  nomina: "Nómina",
};

/**
 * Porcentaje del margen: el número que decide si el proyecto sirvió.
 *
 * El verde se fue: un proyecto sano no necesita felicitarse en cada renglón.
 * Queda el color donde hay algo que mirar —margen negativo o apretado— y el
 * resto se lee en el color del texto.
 */
function MargenPct({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Sin facturar</span>;
  }
  const color =
    pct < 0
      ? "var(--state-danger-text, #b91c1c)"
      : pct < 15
        ? "var(--state-warning-text, #b45309)"
        : "var(--text-primary)";
  return (
    <span
      style={{ color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
      title={pct < 0 ? "El proyecto costó más de lo que facturó" : undefined}
    >
      {pct.toFixed(1)} %
    </span>
  );
}

/** El estatus que manda el API, como punto y palabra. */
const TONO_ESTATUS: Record<string, StatusTone> = {
  positive: "success",
  warning: "warning",
  danger: "danger",
  accent: "info",
  default: "neutral",
};

function EstatusDot({ estatus }: { estatus: string }) {
  return (
    <StatusDot
      label={financeStatusLabel(estatus)}
      tone={TONO_ESTATUS[financeStatusVariant(estatus)] ?? "neutral"}
    />
  );
}

/** Barra proporcional: el ancho ES el porcentaje, no un adorno. */
function BarraCategoria({ categoria }: { categoria: CostCategory }) {
  const pagadoPct =
    categoria.monto > 0 ? Math.max(0, Math.min(100, (categoria.pagado / categoria.monto) * 100)) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{categoria.label}</span>
        <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {categoria.participacionPct.toFixed(1)} %
          </span>
          <Money value={categoria.monto} />
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 10,
          borderRadius: 5,
          background: "var(--surface-2)",
          border: "1px solid var(--nx-panel-hairline)",
          overflow: "hidden",
        }}
        role="img"
        aria-label={`${categoria.label}: ${categoria.participacionPct} por ciento del costo`}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, categoria.participacionPct))}%`,
            height: "100%",
            background: "var(--text-secondary)",
            opacity: 0.35,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${(Math.max(0, Math.min(100, categoria.participacionPct)) * pagadoPct) / 100}%`,
            height: "100%",
            background: "var(--text-secondary)",
          }}
        />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
        {FUENTE_LABEL[categoria.fuente] ?? categoria.fuente} · {categoria.conteo} movimiento(s) ·
        pagado{" "}
        {categoria.pagado.toLocaleString("es-MX", {
          style: "currency",
          currency: "MXN",
          maximumFractionDigits: 0,
        })}
        {categoria.pendiente > 0 && (
          <>
            {" "}
            · pendiente{" "}
            {categoria.pendiente.toLocaleString("es-MX", {
              style: "currency",
              currency: "MXN",
              maximumFractionDigits: 0,
            })}
          </>
        )}
      </div>
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

/** Etiqueta arriba, dato abajo. Sin negritas gritando dentro del párrafo. */
function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function ContabilidadProyectosPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [data, setData] = useState<ProjectList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");

  const [abierto, setAbierto] = useState<ProjectRow | null>(null);
  const [detalle, setDetalle] = useState<ProjectDetail | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState<string | null>(null);
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null);
  const [documento, setDocumento] = useState<CostTransaction | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await erpFetch<ProjectList>("accounting/workspace/proyectos", token);
      setData(res);
    } catch (e) {
      setError(formatApiError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const abrir = useCallback(
    async (row: ProjectRow) => {
      setAbierto(row);
      setDetalle(null);
      setDetalleError(null);
      setCategoriaAbierta(null);
      setDetalleLoading(true);
      try {
        const res = await erpFetch<ProjectDetail>(
          `accounting/workspace/proyectos/${row.id}?tipo=${row.tipo}`,
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
    return items.filter((r) => {
      if (tipoFiltro && r.tipo !== tipoFiltro) return false;
      if (!needle) return true;
      return (
        r.titulo.toLowerCase().includes(needle) ||
        String(r.cliente ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, q, tipoFiltro]);

  const columns: Column<ProjectRow>[] = useMemo(
    () => [
      {
        key: "titulo",
        label: "Proyecto",
        render: (r) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontWeight: 600 }}>{r.titulo}</span>
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                {r.cliente ?? "Sin cliente registrado"}
              </span>
              {r.tipo === "obra" && (
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>· Obra</span>
              )}
              {/* Avance y presupuesto llegaban en la lista y no se pintaban. */}
              {r.avance != null && (
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                  · {r.avance} % de avance
                </span>
              )}
              {r.presupuesto != null && (
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                  · presupuesto {pesos(r.presupuesto)}
                </span>
              )}
            </span>
          </div>
        ),
      },
      {
        key: "estatus",
        label: "Estatus",
        render: (r) => (
          <EstatusDot estatus={r.estatus} />
        ),
      },
      {
        key: "ingresos",
        label: "Ingresos facturados",
        align: "right",
        numeric: true,
        render: (r) =>
          r.ingresos > 0 ? (
            <Money value={r.ingresos} />
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Sin facturar</span>
          ),
      },
      {
        key: "cobrado",
        label: "Cobrado",
        align: "right",
        numeric: true,
        render: (r) => <Money value={r.cobrado} />,
      },
      {
        key: "costoTotal",
        label: "Costo",
        align: "right",
        numeric: true,
        render: (r) => <Money value={r.costoTotal} />,
      },
      {
        key: "margen",
        label: "Margen",
        align: "right",
        numeric: true,
        render: (r) => <Money value={r.margen} />,
      },
      {
        key: "margenPct",
        label: "% margen",
        align: "right",
        numeric: true,
        render: (r) => <MargenPct pct={r.margenPct} />,
      },
    ],
    [],
  );

  const totales = data?.totales;
  const transaccionesDeCategoria = useMemo(() => {
    if (!detalle || !categoriaAbierta) return [];
    return detalle.transacciones.filter((t) => t.categoriaKey === categoriaAbierta);
  }, [detalle, categoriaAbierta]);

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Proyectos"
        subtitle="Qué se facturó, qué costó y qué quedó. Abre un proyecto para ver de dónde sale cada peso de costo."
        density="ops"
        actions={
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            Actualizar
          </Button>
        }
      />

      {error && (
        <InlineAlert
          message={`No se pudieron cargar los proyectos. ${error}`}
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      )}

      {totales && !loading && (
        <div style={{ marginBottom: 14 }}>
          <MetricStrip
            ariaLabel="Resumen de proyectos"
            metrics={[
              cifra(
                "Ingresos facturados",
                totales.ingresos,
                `${totales.conFacturacion} de ${totales.proyectos} proyectos con factura`,
              ),
              cifra("Cobrado", totales.cobrado, "ya entró al banco"),
              cifra("Costo total", totales.costoTotal, "compras, gastos, viáticos y almacén"),
              cifra(
                "Margen",
                totales.margen,
                "ingresos menos costo",
                totales.margen < 0 ? "danger" : "default",
              ),
            ]}
          />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <FilterToolbar
          search={{ value: q, onChange: setQ, placeholder: "Buscar por proyecto o cliente…" }}
          selects={[
            {
              label: "Tipo",
              value: tipoFiltro,
              onChange: setTipoFiltro,
              allowAll: true,
              allLabel: "Todos",
              options: [
                { value: "operacional", label: "Proyectos de servicio" },
                { value: "obra", label: "Obras" },
              ],
            },
          ]}
          onClear={
            q || tipoFiltro
              ? () => {
                  setQ("");
                  setTipoFiltro("");
                }
              : undefined
          }
          resultCount={rows.length}
        />
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }} aria-busy="true">
          {token ? "Cargando proyectos…" : "Esperando la sesión para pedir los proyectos…"}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={q || tipoFiltro ? "Ningún proyecto coincide" : "Todavía no hay proyectos"}
          description={
            q || tipoFiltro
              ? "Cambia la búsqueda o el filtro de tipo."
              : "Los proyectos se dan de alta en Operaciones. Aquí aparecen en cuanto existan, aunque aún no tengan facturas ni costos."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          onRowClick={(r) => void abrir(r)}
          density="compact"
        />
      )}

      <Modal
        open={abierto != null}
        onClose={() => setAbierto(null)}
        title={abierto?.titulo ?? "Proyecto"}
        maxWidth={1040}
      >
        {detalleLoading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }} aria-busy="true">
            Cargando desglose…
          </p>
        ) : detalleError ? (
          <InlineAlert
            message={`No se pudo abrir el desglose. ${detalleError}`}
            action={
              abierto ? (
                <Button size="sm" variant="secondary" onClick={() => void abrir(abierto)}>
                  Reintentar
                </Button>
              ) : undefined
            }
          />
        ) : !detalle ? null : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <MetricStrip
              ariaLabel="Resumen del proyecto"
              metrics={[
                cifra(
                  "Ingresos facturados",
                  detalle.resumen.ingresos,
                  `por cobrar ${pesos(detalle.resumen.porCobrar)}`,
                ),
                cifra(
                  "Costo total",
                  detalle.resumen.costoTotal,
                  `pendiente de pagar ${pesos(detalle.resumen.costoPendiente)}`,
                ),
                cifra(
                  "Margen",
                  detalle.resumen.margen,
                  "ingresos menos costo",
                  detalle.resumen.margen < 0 ? "danger" : "default",
                ),
                {
                  label: "% de margen",
                  value: <MargenPct pct={detalle.resumen.margenPct} />,
                  hint: "sobre lo facturado",
                },
              ]}
            />

            {/* Solo cuando de verdad no hay facturación: antes el aviso salía
                en toda obra, incluso con facturas al cliente en la pantalla. */}
            {detalle.proyecto.tipo === "obra" && detalle.ingresosDetalle.length === 0 && (
              <InlineAlert
                variant="info"
                message="Esta obra no tiene facturación ligada en el sistema: solo se muestran sus costos registrados."
              />
            )}

            <Section title="Ficha" dense>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                }}
              >
                <Dato label="Cliente" value={detalle.proyecto.cliente ?? "—"} />
                <Dato label="Responsable" value={detalle.proyecto.responsable ?? "—"} />
                <Dato label="Inicio planeado" value={fecha(detalle.proyecto.inicioPlaneado)} />
                <Dato label="Fin planeado" value={fecha(detalle.proyecto.finPlaneado)} />
                {/* Fechas reales, avance y moneda venían del API y no se
                    pintaban: el plan sin lo real no dice si se cumplió. */}
                <Dato label="Inicio real" value={fecha(detalle.proyecto.inicioReal)} />
                <Dato label="Fin real" value={fecha(detalle.proyecto.finReal)} />
                <Dato
                  label="Avance"
                  value={
                    detalle.proyecto.avance != null ? (
                      `${detalle.proyecto.avance} %`
                    ) : (
                      <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>
                        Sin reportar
                      </span>
                    )
                  }
                />
                <Dato label="Moneda" value={detalle.proyecto.moneda || "—"} />
                <Dato
                  label="Estatus"
                  value={<EstatusDot estatus={detalle.proyecto.estatus} />}
                />
              </div>
              {detalle.proyecto.objetivo && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 10 }}>
                  {detalle.proyecto.objetivo}
                </p>
              )}
              {detalle.proyecto.alcance && (
                <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 6 }}>
                  {detalle.proyecto.alcance}
                </p>
              )}
            </Section>

            {detalle.presupuesto.autorizado == null ? (
              <Section
                title="Presupuesto"
                subtitle={`Sin presupuesto autorizado en ${detalle.presupuesto.origen || "el proyecto"}.`}
                dense
              >
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>
                  Este proyecto no tiene tope autorizado, así que no hay «disponible» que calcular.
                  Ya se comprometieron {pesos(detalle.presupuesto.comprometido)} y salieron de caja{" "}
                  {pesos(detalle.presupuesto.pagado)}.
                </p>
              </Section>
            ) : (
              <Section
                title="Presupuesto"
                subtitle={`Autorizado en ${detalle.presupuesto.origen || "el proyecto"}, contra lo que ya se comprometió y lo que ya salió.`}
                dense
              >
                <MetricStrip
                  ariaLabel="Presupuesto del proyecto"
                  metrics={[
                    cifra("Autorizado", detalle.presupuesto.autorizado, "tope del proyecto"),
                    cifra("Comprometido", detalle.presupuesto.comprometido, "ya se ordenó"),
                    cifra("Pagado", detalle.presupuesto.pagado, "ya salió de caja"),
                    cifra(
                      "Disponible",
                      detalle.presupuesto.disponible ?? 0,
                      (detalle.presupuesto.disponible ?? 0) < 0
                        ? "el costo ya rebasó el presupuesto"
                        : "queda por comprometer",
                      (detalle.presupuesto.disponible ?? 0) < 0 ? "danger" : "default",
                    ),
                  ]}
                />
              </Section>
            )}

            <Section
              title="Costos por categoría"
              subtitle="El ancho de cada barra es su parte del costo. Haz clic para ver las transacciones que la forman."
              dense
            >
              {detalle.categorias.length === 0 ? (
                <EmptyState
                  title="Sin costos registrados"
                  description="Este proyecto todavía no tiene facturas de proveedor, gastos, viáticos ni salidas de almacén."
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {detalle.categorias.map((c) => {
                    const abierta = categoriaAbierta === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        aria-expanded={abierta}
                        // Pulsar la categoría ya abierta la cierra: antes no
                        // producía nada y parecía que el clic se perdía.
                        onClick={() => setCategoriaAbierta(abierta ? null : c.key)}
                        style={{
                          textAlign: "left",
                          background: abierta
                            ? "color-mix(in srgb, var(--primary) 6%, transparent)"
                            : "transparent",
                          border: "none",
                          borderLeft: `2px solid ${abierta ? "var(--primary)" : "transparent"}`,
                          padding: "4px 2px 4px 8px",
                          cursor: "pointer",
                          borderRadius: 8,
                          color: "inherit",
                          font: "inherit",
                        }}
                      >
                        <BarraCategoria categoria={c} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* El desglose, justo debajo de la categoría que se pulsó: antes
                  aparecía tras la tabla de facturas y el clic no se veía. */}
              {categoriaAbierta && (
                <div style={{ marginTop: 14 }}>
                  <Section
                    title={
                      detalle.categorias.find((c) => c.key === categoriaAbierta)?.label ??
                      "Transacciones"
                    }
                    subtitle={`${transaccionesDeCategoria.length} movimiento(s) · haz clic en un renglón para ver el documento.`}
                    dense
                    flush
                    actions={
                      <Button size="sm" variant="ghost" onClick={() => setCategoriaAbierta(null)}>
                        Cerrar desglose
                      </Button>
                    }
                  >
                    <DataTable
                      rows={transaccionesDeCategoria}
                      rowKey={(t) => t.key}
                      density="compact"
                      stickyHeader={false}
                      onRowClick={(t) => setDocumento(t)}
                      emptyTitle="Sin transacciones"
                      emptyDescription="Esta categoría no tiene movimientos individuales registrados."
                      columns={[
                        { key: "fecha", label: "Fecha", render: (t) => fecha(t.fecha) },
                        {
                          key: "tipo",
                          label: "Tipo",
                          render: (t) => (
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                              {TIPO_TX[t.tipo] ?? t.tipo}
                            </span>
                          ),
                        },
                        { key: "documento", label: "Documento" },
                        { key: "concepto", label: "Concepto" },
                        {
                          key: "monto",
                          label: "Monto",
                          align: "right",
                          numeric: true,
                          render: (t) => <Money value={t.monto} />,
                        },
                        {
                          key: "pagado",
                          label: "Pagado",
                          align: "right",
                          numeric: true,
                          render: (t) => <Money value={t.pagado} />,
                        },
                        {
                          key: "estatus",
                          label: "Estatus",
                          render: (t) => <EstatusDot estatus={t.estatus} />,
                        },
                      ]}
                    />
                  </Section>
                </div>
              )}
            </Section>

            {detalle.ingresosDetalle.length > 0 && (
              <Section title="Facturas al cliente" dense flush>
                <DataTable
                  rows={detalle.ingresosDetalle}
                  rowKey={(f) => f.id}
                  density="compact"
                  stickyHeader={false}
                  columns={[
                    { key: "folio", label: "Folio" },
                    { key: "fecha", label: "Emisión", render: (f) => fecha(f.fecha) },
                    {
                      key: "total",
                      label: "Total",
                      align: "right",
                      numeric: true,
                      render: (f) => <Money value={f.total} />,
                    },
                    {
                      key: "cobrado",
                      label: "Cobrado",
                      align: "right",
                      numeric: true,
                      render: (f) => <Money value={f.cobrado} />,
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
                        <EstatusDot estatus={f.estatus} />
                      ),
                    },
                  ]}
                />
              </Section>
            )}

            {detalle.bitacora && detalle.bitacora.length > 0 && (
              <Section title="Bitácora de obra" dense flush>
                <DataTable
                  rows={detalle.bitacora}
                  rowKey={(b) => b.id}
                  density="compact"
                  stickyHeader={false}
                  columns={[
                    { key: "fecha", label: "Fecha", render: (b) => fecha(b.fecha) },
                    { key: "etiqueta", label: "Avance" },
                    {
                      key: "avance",
                      label: "%",
                      align: "right",
                      numeric: true,
                      render: (b) => (b.avance != null ? `${b.avance} %` : "—"),
                    },
                    { key: "nota", label: "Nota", render: (b) => b.nota ?? "—" },
                  ]}
                />
              </Section>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={documento != null}
        onClose={() => setDocumento(null)}
        title={documento ? `${TIPO_TX[documento.tipo] ?? documento.tipo} ${documento.documento}` : ""}
        maxWidth={520}
      >
        {documento && (
          <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
            <Dato label="Concepto" value={documento.concepto} />
            <MetricStrip
              ariaLabel="Importes del documento"
              metrics={[
                cifra("Monto", documento.monto),
                cifra("Pagado", documento.pagado),
                cifra("Pendiente", documento.monto - documento.pagado),
              ]}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
              }}
            >
              <Dato label="Fecha" value={fecha(documento.fecha)} />
              <Dato label="Estatus" value={<EstatusDot estatus={documento.estatus} />} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
              Registro #{documento.refId} en {TIPO_TX[documento.tipo] ?? documento.tipo}.
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
