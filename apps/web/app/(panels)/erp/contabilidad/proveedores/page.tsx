"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PriceCheckOutlinedIcon from "@mui/icons-material/PriceCheckOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  DataTable,
  FilterChip,
  FilterChips,
  LinkButton,
  ListCard,
  ModuleToolbar,
  SearchInput,
  SkeletonRows,
  Stat,
  StatRow,
  type Column,
  type StatTone,
  type Tone,
} from "@/components/base";
import { Money } from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import PanelTabs from "@/components/ui/PanelTabs";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { useUser } from "@/components/UserContext";
import { erpFetch, financeStatusVariant, formatApiError } from "@/lib/erp-api";
import { financeStatusLabel, paymentMethodLabel } from "@/lib/finance-status-labels";
import { DESTINOS, VacioConPrimerPaso } from "../_arranque";
import s from "./proveedores.module.css";
import { formatoFechaLocal } from "@/lib/fecha-calendario";

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

const fecha = (iso: string | null | undefined): string => formatoFechaLocal(iso, { day: "2-digit", month: "short", year: "numeric" });

const TIPO_HISTORIAL: Record<string, string> = {
  factura: "Factura",
  orden: "Orden de compra",
  pago: "Pago",
  evaluacion: "Evaluación",
};

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={s.dato}>
      <div className={s.datoEtiqueta}>{label}</div>
      <div className={s.datoValor}>{value}</div>
    </div>
  );
}

/** Una cifra de dinero para la tira, con su pista de qué la compone. */
function Cifra({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: number;
  hint?: ReactNode;
  tone?: StatTone;
  icon: ReactNode;
}) {
  return (
    <Stat
      label={label}
      value={<Money value={value} />}
      hint={hint}
      tone={tone}
      icon={icon}
      iconTone="neutral"
    />
  );
}

/** Pesos en texto plano — solo para `title`/atributos string. */
const pesos = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** El estatus que manda el API, como punto y palabra. */
const TONO_ESTATUS: Record<string, Tone> = {
  positive: "success",
  warning: "warning",
  danger: "danger",
  accent: "info",
  default: "neutral",
};

function EstatusDot({ estatus, tono }: { estatus: string; tono?: Tone }) {
  return (
    <Badge
      dot
      size="sm"
      tone={tono ?? TONO_ESTATUS[financeStatusVariant(estatus)] ?? "neutral"}
    >
      {financeStatusLabel(estatus)}
    </Badge>
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
  const [agingKey, setAgingKey] = useState("");

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
      setAgingKey("");
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
          <div className={s.celdaNombre}>
            <span className={s.nombre}>{r.nombre}</span>
            <span className={s.sub}>
              <span>{r.rfc ? `RFC ${r.rfc}` : "Sin RFC registrado"}</span>
              {r.esMayorista && <span>· Mayorista</span>}
              {!r.activo && (
                <Badge dot size="sm" tone="neutral">
                  Inactivo
                </Badge>
              )}
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
        render: (r) => (
          <span className={s.apilado}>
            {r.vencido > 0 ? (
              <span className={s.peligro}>
                <Money value={r.vencido} />
              </span>
            ) : (
              <span className={s.tenue}>—</span>
            )}
            {/* «Por vencer» venía en cada renglón y no se enseñaba: sin él,
                vencido a cero parece que no hay nada que pagar. */}
            {r.porVencer > 0 && (
              <span className={s.nota}>
                por vencer <Money value={r.porVencer} bold={false} />
              </span>
            )}
          </span>
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
              <span className={s.nota}>
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
          <span className={s.apilado}>
            <span className={s.fechaCelda}>{fecha(r.ultimaCompra)}</span>
            {/* Órdenes de compra y su última fecha: el API las manda en la
                lista y solo se veían al abrir el expediente. */}
            {r.ordenesCompra > 0 && (
              <span className={s.nota}>
                {r.ordenesCompra} {r.ordenesCompra === 1 ? "orden" : "órdenes"} ·{" "}
                <Money value={r.montoOrdenes} bold={false} />
                {r.ultimaOrden ? ` · últ. ${fecha(r.ultimaOrden)}` : ""}
              </span>
            )}
          </span>
        ),
      },
      {
        key: "credito",
        label: "Crédito",
        render: (r) =>
          r.limiteCredito != null && r.limiteCredito > 0 ? (
            <span className={s.credito}>
              {r.excedeCredito ? (
                <Badge
                  dot
                  size="sm"
                  tone="danger"
                  title={`Límite de crédito ${pesos(r.limiteCredito)}`}
                >
                  Rebasa el tope
                </Badge>
              ) : (
                <span className={s.secundario}>
                  {r.creditoDias != null ? `${r.creditoDias} días` : "Con tope"}
                </span>
              )}
            </span>
          ) : (
            <span className={`${s.credito} ${s.tenue}`}>
              {r.creditoDias ? `${r.creditoDias} días` : "Contado"}
            </span>
          ),
      },
    ],
    [],
  );

  const totales = data?.totales;
  const hayFiltros = Boolean(q || soloActivos);
  const limpiarFiltros = () => {
    setQ("");
    setSoloActivos(false);
  };

  /** Mientras llega la lista: el texto de siempre, con renglones de mentira debajo. */
  const cargandoLista = (
    <div aria-busy="true">
      <p className={s.cargando}>
        {token ? "Cargando proveedores…" : "Esperando la sesión para pedir los proveedores…"}
      </p>
      <SkeletonRows rows={4} label="Cargando proveedores" />
    </div>
  );

  return (
    <MesaPagina
      titulo="Proveedores"
      descripcion="Cada proveedor dado de alta, con lo que le debes y lo que ya venció. Abre uno para ver su expediente completo."
      terciarias={
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Actualizar
        </Button>
      }
    >
      {error ? (
        <Alert
          className={s.aviso}
          tone="danger"
          role="alert"
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        >
          {`No se pudieron cargar los proveedores. ${error} Reintenta; si sigue igual, avisa a soporte.`}
        </Alert>
      ) : null}

      {/* Sin un solo proveedor dado de alta, los tres importes son cero por
          definición: la tira no informa y le quita el sitio al primer paso. */}
      {totales && !loading && totales.proveedores > 0 ? (
        <StatRow variant="strip" ariaLabel="Resumen de proveedores">
          <Cifra
            label="Saldo por pagar"
            value={totales.saldoPorPagar}
            hint={`${totales.conSaldo} de ${totales.proveedores} proveedores con saldo`}
            icon={<PaymentsOutlinedIcon />}
          />
          <Cifra
            label="Vencido"
            value={totales.vencido}
            hint={totales.vencido > 0 ? "ya pasó la fecha de pago" : "nada pasado de fecha"}
            tone={totales.vencido > 0 ? "danger" : "default"}
            icon={<EventBusyOutlinedIcon />}
          />
          <Cifra
            label="Comprado este año"
            value={totales.totalAnio}
            hint="facturas de proveedor del ejercicio"
            icon={<ShoppingCartOutlinedIcon />}
          />
        </StatRow>
      ) : null}

      <ListCard
        listLabel="Proveedores"
        toolbar={
          <ModuleToolbar
            search={
              <SearchInput
                aria-label="Buscar por nombre o RFC…"
                placeholder="Buscar por nombre o RFC…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            }
            chips={
              <FilterChips ariaLabel="Filtros">
                <FilterChip active={soloActivos} onClick={() => setSoloActivos((v) => !v)}>
                  Solo activos
                </FilterChip>
              </FilterChips>
            }
            end={
              <>
                {q.trim() || soloActivos ? (
                  <LinkButton onClick={limpiarFiltros}>Limpiar</LinkButton>
                ) : null}
                {data ? (
                  <span className={s.conteo} role="status">
                    {rows.length} resultado{rows.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </>
            }
          />
        }
        empty={loading || rows.length === 0}
        emptyState={
          loading ? (
            cargandoLista
          ) : hayFiltros ? (
            {
              icon: <FilterAltOffOutlinedIcon />,
              title: "Ningún proveedor coincide",
              description: "Cambia la búsqueda o quita el filtro de activos.",
              tone: "neutral",
              action: <Button onClick={limpiarFiltros}>Limpiar filtros</Button>,
            }
          ) : (
            <VacioConPrimerPaso
              title="Todavía no hay proveedores"
              description="Aquí vive el expediente de cada proveedor: lo que le debes, lo que ya venció, sus facturas y sus órdenes. Se dan de alta en Compras, al levantar la orden de compra; en cuanto exista uno aparece aquí, aunque todavía no tenga facturas."
              destino={DESTINOS.proveedor}
            />
          )
        }
      >
        <DataTable
          flush
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => void abrir(r)}
          ariaLabel="Listado de proveedores"
        />
      </ListCard>

      <Modal
        open={abierto != null}
        onClose={() => {
          setAbierto(null);
          setAgingKey("");
        }}
        title={abierto?.nombre ?? "Proveedor"}
        maxWidth={1040}
      >
        {detalleLoading ? (
          <div aria-busy="true">
            <p className={s.cargando}>Cargando expediente…</p>
            <SkeletonRows rows={3} label="Cargando expediente" />
          </div>
        ) : detalleError ? (
          <Alert
            className={s.aviso}
            tone="danger"
            role="alert"
            action={
              abierto ? (
                <Button size="sm" onClick={() => void abrir(abierto)}>
                  Reintentar
                </Button>
              ) : undefined
            }
          >
            {`No se pudo abrir el expediente de ${abierto?.nombre ?? "este proveedor"}. ${detalleError} Reintenta; el resto de la lista sigue disponible.`}
          </Alert>
        ) : !detalle ? null : (
          <>
            <div className={s.expedienteTop}>
              <StatRow variant="strip" ariaLabel="Expediente del proveedor">
                <Cifra
                  label="Saldo por pagar"
                  value={detalle.resumen.saldoPorPagar}
                  hint={`${detalle.resumen.facturasAbiertas} ${
                    detalle.resumen.facturasAbiertas === 1 ? "factura abierta" : "facturas abiertas"
                  }`}
                  icon={<PaymentsOutlinedIcon />}
                />
                <Cifra
                  label="Vencido"
                  value={detalle.resumen.vencido}
                  hint={
                    <>
                      por vencer <Money value={detalle.resumen.porVencer} bold={false} />
                    </>
                  }
                  tone={detalle.resumen.vencido > 0 ? "danger" : "default"}
                  icon={<EventBusyOutlinedIcon />}
                />
                <Cifra
                  label="Comprado (histórico)"
                  value={detalle.resumen.comprado}
                  hint={`${detalle.resumen.facturas} ${
                    detalle.resumen.facturas === 1 ? "factura registrada" : "facturas registradas"
                  }`}
                  icon={<ShoppingCartOutlinedIcon />}
                />
                <Cifra
                  label="Pagado"
                  value={detalle.resumen.pagado}
                  hint={`${detalle.resumen.ordenesCompra} ${
                    detalle.resumen.ordenesCompra === 1 ? "orden de compra" : "órdenes de compra"
                  }`}
                  icon={<PriceCheckOutlinedIcon />}
                />
              </StatRow>

              {detalle.resumen.excedeCredito ? (
                <Alert className={s.aviso} tone="warning" role="alert">
                  El saldo por pagar rebasa el límite de crédito pactado con este proveedor.
                </Alert>
              ) : null}
            </div>

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

            <div className={s.pestana}>
              {tab === "fiscal" && (
                <>
                  <Card>
                    <CardHead title="Datos fiscales" />
                    <div className={s.cuerpo}>
                      <div className={s.datos}>
                        <Dato label="Razón social" value={detalle.proveedor.nombre} />
                        <Dato
                          label="RFC"
                          value={
                            detalle.proveedor.rfc ?? (
                              <span className={s.tenue}>
                                Sin RFC — no entra en la declaración mensual de proveedores
                              </span>
                            )
                          }
                        />
                        <Dato
                          label="Estado"
                          value={
                            <Badge
                              dot
                              size="sm"
                              tone={detalle.proveedor.activo ? "success" : "neutral"}
                            >
                              {detalle.proveedor.activo ? "Activo" : "Inactivo"}
                            </Badge>
                          }
                        />
                        <Dato label="Alta" value={fecha(detalle.proveedor.alta)} />
                        <Dato
                          label="Última actualización"
                          value={fecha(detalle.proveedor.actualizado)}
                        />
                      </div>
                      {detalle.proveedor.descripcion && (
                        <p className={s.descripcion}>{detalle.proveedor.descripcion}</p>
                      )}
                    </div>
                  </Card>

                  <Card>
                    <CardHead
                      title="Condiciones comerciales"
                      subtitle="Lo pactado con el proveedor, no lo calculado."
                    />
                    <div className={s.cuerpo}>
                      <div className={s.datos}>
                        <Dato
                          label="Tipo"
                          value={
                            detalle.condiciones.esMayorista
                              ? "Mayorista con convenio"
                              : "Proveedor puntual"
                          }
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
                    </div>
                  </Card>

                  {detalle.evaluaciones.length > 0 && (
                    <ListCard listLabel="Evaluaciones" toolbar={<CardHead title="Evaluaciones" />}>
                      <DataTable
                        flush
                        rows={detalle.evaluaciones}
                        rowKey={(e) => e.id}
                        density="compact"
                        stickyHeader={false}
                        ariaLabel="Evaluaciones del proveedor"
                        columns={[
                          { key: "fecha", label: "Fecha", render: (e) => fecha(e.fecha) },
                          { key: "calidad", label: "Calidad", align: "right", numeric: true, render: (e) => e.calidad },
                          { key: "entrega", label: "Entrega", align: "right", numeric: true, render: (e) => e.entrega },
                          { key: "precio", label: "Precio", align: "right", numeric: true, render: (e) => e.precio },
                          { key: "servicio", label: "Servicio", align: "right", numeric: true, render: (e) => e.servicio },
                          {
                            key: "global",
                            label: "Global",
                            align: "right",
                            numeric: true,
                            render: (e) => <strong>{e.global}</strong>,
                          },
                          {
                            // La nota de la evaluación llegaba y no se veía: es
                            // lo único que explica por qué la calificación.
                            key: "notas",
                            label: "Nota",
                            render: (e) =>
                              e.notas ? (
                                <span className={s.secundario}>{e.notas}</span>
                              ) : (
                                <span className={s.tenue}>—</span>
                              ),
                          },
                        ]}
                      />
                    </ListCard>
                  )}
                </>
              )}

              {tab === "facturas" && (
                <DataTable
                  rows={detalle.facturas}
                  rowKey={(f) => f.id}
                  density="compact"
                  stickyHeader={false}
                  ariaLabel="Facturas del proveedor"
                  emptyTitle="Sin facturas"
                  emptyDescription="Este proveedor todavía no tiene facturas registradas."
                  columns={[
                    {
                      key: "folio",
                      label: "Folio",
                      render: (f) => (
                        <span className={s.folio}>
                          <span className={s.nombre}>{f.folio}</span>
                          {f.uuid && (
                            <span className={s.folioFiscal} title={`Folio fiscal ${f.uuid}`}>
                              Folio fiscal {f.uuid.slice(0, 8)}…
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
                      render: (f) => (
                        <span className={s.apilado}>
                          <Money value={f.total} />
                          {f.moneda && f.moneda !== "MXN" && (
                            <span className={s.nota}>{f.moneda}</span>
                          )}
                        </span>
                      ),
                    },
                    {
                      // Lo pagado venía en cada factura y no se mostraba: sin
                      // ello, total y saldo no explican qué se abonó.
                      key: "pagado",
                      label: "Pagado",
                      align: "right",
                      numeric: true,
                      render: (f) =>
                        f.pagado > 0 ? (
                          <Money value={f.pagado} bold={false} />
                        ) : (
                          <span className={s.tenue}>—</span>
                        ),
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
                      label: "Estado",
                      render: (f) => (
                        <EstatusDot
                          estatus={f.cancelada ? "CANCELLED" : f.estatus}
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
                          <span className={s.tenue}>Sin proyecto</span>
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
                  ariaLabel="Órdenes de compra del proveedor"
                  emptyTitle="Sin órdenes de compra"
                  emptyDescription="No se le ha emitido ninguna orden de compra a este proveedor."
                  columns={[
                    { key: "folio", label: "Orden", render: (o) => o.folio },
                    { key: "fecha", label: "Fecha", render: (o) => fecha(o.fecha) },
                    {
                      key: "esperada",
                      label: "Entrega esperada",
                      render: (o) => fecha(o.esperada),
                    },
                    { key: "partidas", label: "Partidas", align: "right", numeric: true, render: (o) => o.partidas },
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
                      render: (o) => o.facturas,
                    },
                    {
                      key: "estatus",
                      label: "Estado",
                      render: (o) => <EstatusDot estatus={o.estatus} />,
                    },
                  ]}
                />
              )}

              {tab === "porPagar" && (
                <ListCard
                  listLabel="Antigüedad del saldo"
                  toolbar={
                    <>
                      <CardHead
                        title="Antigüedad del saldo"
                        subtitle="Cuánto lleva esperando cada peso que se le debe."
                      />
                      <div className={s.barraChips}>
                        <FilterChips ariaLabel="Antigüedad del saldo">
                          {detalle.cuentasPorPagar.antiguedad.map((b) => (
                            <FilterChip
                              key={b.key}
                              active={agingKey === b.key}
                              count={b.conteo}
                              dot={b.monto > 0 && b.key !== "porVencer" ? "danger" : "neutral"}
                              title={`${b.conteo} ${b.conteo === 1 ? "factura" : "facturas"}`}
                              onClick={() => setAgingKey(agingKey === b.key ? "" : b.key)}
                            >
                              {b.label} · <Money value={b.monto} bold={false} />
                            </FilterChip>
                          ))}
                        </FilterChips>
                      </div>
                    </>
                  }
                >
                  <DataTable
                    flush
                    rows={detalle.cuentasPorPagar.facturas.filter((f) => {
                      if (!agingKey) return true;
                      const d = f.diasVencido;
                      if (agingKey === "porVencer") return d <= 0;
                      if (agingKey === "d1_30") return d > 0 && d <= 30;
                      if (agingKey === "d31_60") return d > 30 && d <= 60;
                      if (agingKey === "d61_90") return d > 60 && d <= 90;
                      if (agingKey === "d90") return d > 90;
                      return true;
                    })}
                    rowKey={(f) => f.id}
                    density="compact"
                    stickyHeader={false}
                    ariaLabel="Cuentas por pagar del proveedor"
                    emptyTitle="Nada por pagar"
                    emptyDescription="No hay facturas abiertas de este proveedor."
                    columns={[
                      { key: "folio", label: "Folio", render: (f) => f.folio },
                      { key: "vencimiento", label: "Vence", render: (f) => fecha(f.vencimiento) },
                      {
                        key: "diasVencido",
                        label: "Vencida",
                        align: "right",
                        numeric: true,
                        render: (f) =>
                          f.diasVencido > 0 ? (
                            <span
                              className={s.vencida}
                              title={`Lleva ${f.diasVencido} ${
                                f.diasVencido === 1 ? "día" : "días"
                              } pasada de fecha`}
                            >
                              {f.diasVencido} {f.diasVencido === 1 ? "día" : "días"}
                            </span>
                          ) : (
                            <span className={s.nota}>Al corriente</span>
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
                </ListCard>
              )}

              {tab === "pagos" && (
                <DataTable
                  rows={detalle.pagos}
                  rowKey={(p) => p.id}
                  density="compact"
                  stickyHeader={false}
                  ariaLabel="Pagos al proveedor"
                  emptyTitle="Sin pagos aplicados"
                  emptyDescription="Todavía no se registra ningún pago a este proveedor."
                  columns={[
                    { key: "fecha", label: "Fecha", render: (p) => fecha(p.fecha) },
                    {
                      key: "factura",
                      label: "Factura",
                      render: (p) => p.factura ?? `#${p.facturaId}`,
                    },
                    {
                      key: "metodo",
                      label: "Forma de pago",
                      render: (p) => paymentMethodLabel(p.metodo),
                    },
                    {
                      key: "referencia",
                      label: "Referencia",
                      render: (p) => p.referencia ?? <span className={s.tenue}>—</span>,
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
                  ariaLabel="Proyectos ligados al proveedor"
                  emptyTitle="Sin proyectos ligados"
                  emptyDescription="Ninguna factura de este proveedor está ligada a una actividad de proyecto."
                  columns={[
                    { key: "titulo", label: "Proyecto", render: (p) => p.titulo },
                    {
                      key: "estatus",
                      label: "Estado",
                      render: (p) => <EstatusDot estatus={p.estatus} />,
                    },
                    { key: "facturas", label: "Facturas", align: "right", numeric: true, render: (p) => p.facturas },
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
                  ariaLabel="Historial del proveedor"
                  emptyTitle="Sin movimientos"
                  emptyDescription="No hay facturas, órdenes ni pagos registrados con este proveedor."
                  columns={[
                    { key: "fecha", label: "Fecha", render: (h) => fecha(h.fecha) },
                    {
                      key: "tipo",
                      label: "Tipo",
                      render: (h) => (
                        <span className={s.secundario}>{TIPO_HISTORIAL[h.tipo] ?? h.tipo}</span>
                      ),
                    },
                    { key: "titulo", label: "Movimiento", render: (h) => h.titulo },
                    {
                      key: "detalle",
                      label: "Detalle",
                      render: (h) => <span className={s.secundario}>{h.detalle || "—"}</span>,
                    },
                    {
                      key: "monto",
                      label: "Monto",
                      align: "right",
                      numeric: true,
                      render: (h) =>
                        h.monto ? <Money value={h.monto} /> : <span className={s.tenue}>—</span>,
                    },
                    {
                      key: "estatus",
                      label: "Estado",
                      render: (h) => <EstatusDot estatus={h.estatus} />,
                    },
                  ]}
                />
              )}
            </div>
          </>
        )}
      </Modal>
    </MesaPagina>
  );
}
