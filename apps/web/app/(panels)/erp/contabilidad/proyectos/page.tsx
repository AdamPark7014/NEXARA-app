"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PercentOutlinedIcon from "@mui/icons-material/PercentOutlined";
import PriceCheckOutlinedIcon from "@mui/icons-material/PriceCheckOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  DataTable,
  EmptyState,
  LinkButton,
  ListCard,
  ModuleToolbar,
  SearchInput,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  type Column,
  type StatTone,
  type Tone,
} from "@/components/base";
import { Money } from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { useUser } from "@/components/UserContext";
import { erpFetch, financeStatusVariant, formatApiError } from "@/lib/erp-api";
import { financeStatusLabel } from "@/lib/finance-status-labels";
import { DESTINOS, VacioConPrimerPaso } from "../_arranque";
import s from "./proyectos.module.css";

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
    return <span className={s.sinFacturar}>Sin facturar</span>;
  }
  const tono = pct < 0 ? s.margenNegativo : pct < 15 ? s.margenApretado : s.margenSano;
  return (
    <span
      className={`${s.margen} ${tono}`}
      title={pct < 0 ? "El proyecto costó más de lo que facturó" : undefined}
    >
      {pct.toFixed(1)} %
    </span>
  );
}

/** El estatus que manda el API, como punto y palabra. */
const TONO_ESTATUS: Record<string, Tone> = {
  positive: "success",
  warning: "warning",
  danger: "danger",
  accent: "info",
  default: "neutral",
};

function EstatusDot({ estatus }: { estatus: string }) {
  return (
    <Badge dot size="sm" tone={TONO_ESTATUS[financeStatusVariant(estatus)] ?? "neutral"}>
      {financeStatusLabel(estatus)}
    </Badge>
  );
}

/** Barra proporcional: el ancho ES el porcentaje, no un adorno. */
function BarraCategoria({ categoria }: { categoria: CostCategory }) {
  const pagadoPct =
    categoria.monto > 0 ? Math.max(0, Math.min(100, (categoria.pagado / categoria.monto) * 100)) : 0;
  return (
    <div className={s.barraCategoria}>
      <div className={s.categoriaCabeza}>
        <span className={s.categoriaNombre}>{categoria.label}</span>
        <span className={s.categoriaLado}>
          <span className={s.categoriaPct}>{categoria.participacionPct.toFixed(1)} %</span>
          <Money value={categoria.monto} />
        </span>
      </div>
      <div
        className={s.pista}
        role="img"
        aria-label={`${categoria.label}: ${categoria.participacionPct} por ciento del costo`}
      >
        <div
          className={s.pistaTotal}
          style={{ width: `${Math.max(0, Math.min(100, categoria.participacionPct))}%` }}
        />
        <div
          className={s.pistaPagada}
          style={{
            width: `${(Math.max(0, Math.min(100, categoria.participacionPct)) * pagadoPct) / 100}%`,
          }}
        />
      </div>
      <div className={s.categoriaPie}>
        {FUENTE_LABEL[categoria.fuente] ?? categoria.fuente} · {categoria.conteo} movimiento(s) ·
        pagado <Money value={categoria.pagado} bold={false} />
        {categoria.pendiente > 0 && (
          <>
            {" "}
            · pendiente <Money value={categoria.pendiente} bold={false} />
          </>
        )}
      </div>
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

/** Etiqueta arriba, dato abajo. Sin negritas gritando dentro del párrafo. */
function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={s.dato}>
      <div className={s.datoEtiqueta}>{label}</div>
      <div className={s.datoValor}>{value}</div>
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
          <div className={s.celdaTitulo}>
            <span className={s.titulo}>{r.titulo}</span>
            <span className={s.sub}>
              <span>{r.cliente ?? "Sin cliente registrado"}</span>
              {r.tipo === "obra" && <span>· Obra</span>}
              {/* Avance y presupuesto llegaban en la lista y no se pintaban. */}
              {r.avance != null && <span>· {r.avance} % de avance</span>}
              {r.presupuesto != null && (
                <span>
                  · presupuesto <Money value={r.presupuesto} bold={false} />
                </span>
              )}
            </span>
          </div>
        ),
      },
      {
        key: "estatus",
        label: "Estado",
        render: (r) => <EstatusDot estatus={r.estatus} />,
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
            <span className={s.sinFacturar}>Sin facturar</span>
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
        label: "% de margen",
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

  const hayFiltros = Boolean(q || tipoFiltro);
  const limpiarFiltros = () => {
    setQ("");
    setTipoFiltro("");
  };

  /** Mientras llega la lista: el texto de siempre, con renglones de mentira debajo. */
  const cargandoLista = (
    <div aria-busy="true">
      <p className={s.cargando}>
        {token ? "Cargando proyectos…" : "Esperando la sesión para pedir los proyectos…"}
      </p>
      <SkeletonRows rows={4} label="Cargando proyectos" />
    </div>
  );

  return (
    <MesaPagina
      titulo="Proyectos"
      descripcion="Qué se facturó, qué costó y qué quedó. Abre un proyecto para ver de dónde sale cada peso de costo."
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
          {`No se pudieron cargar los proyectos. ${error} Reintenta; si sigue igual, avisa a soporte.`}
        </Alert>
      ) : null}

      {/* Sin un solo proyecto, las cuatro cifras son cero por definición. */}
      {totales && !loading && totales.proyectos > 0 ? (
        <StatRow variant="strip" ariaLabel="Resumen de proyectos">
          <Cifra
            label="Ingresos facturados"
            value={totales.ingresos}
            hint={`${totales.conFacturacion} de ${totales.proyectos} proyectos con factura`}
            icon={<ReceiptLongOutlinedIcon />}
          />
          <Cifra
            label="Cobrado"
            value={totales.cobrado}
            hint="ya entró al banco"
            icon={<PaymentsOutlinedIcon />}
          />
          <Cifra
            label="Costo total"
            value={totales.costoTotal}
            hint="compras, gastos, viáticos y almacén"
            icon={<ShoppingCartOutlinedIcon />}
          />
          <Cifra
            label="Margen"
            value={totales.margen}
            hint="ingresos menos costo"
            tone={totales.margen < 0 ? "danger" : "default"}
            icon={<TrendingUpOutlinedIcon />}
          />
        </StatRow>
      ) : null}

      <ListCard
        listLabel="Proyectos"
        toolbar={
          <ModuleToolbar
            search={
              <SearchInput
                aria-label="Buscar por proyecto o cliente…"
                placeholder="Buscar por proyecto o cliente…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            }
            end={
              <>
                {q.trim() || tipoFiltro ? (
                  <LinkButton onClick={limpiarFiltros}>Limpiar</LinkButton>
                ) : null}
                {data ? (
                  <span className={s.conteo} role="status">
                    {rows.length} resultado{rows.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </>
            }
          >
            <Select
              aria-label="Tipo"
              title="Tipo"
              controlSize="sm"
              wrapperClassName={s.filtroTipo}
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="operacional">Proyectos de servicio</option>
              <option value="obra">Obras</option>
            </Select>
          </ModuleToolbar>
        }
        empty={loading || rows.length === 0}
        emptyState={
          loading ? (
            cargandoLista
          ) : hayFiltros ? (
            {
              icon: <FilterAltOffOutlinedIcon />,
              title: "Ningún proyecto coincide",
              description: "Cambia la búsqueda o el filtro de tipo.",
              tone: "neutral",
              action: <Button onClick={limpiarFiltros}>Limpiar filtros</Button>,
            }
          ) : (
            <VacioConPrimerPaso
              title="Todavía no hay proyectos"
              description="Esta pantalla compara, proyecto por proyecto, lo facturado contra lo que costó. Los proyectos y las obras se dan de alta en Operaciones; en cuanto exista uno aparece aquí, aunque aún no tenga facturas ni costos."
              destino={DESTINOS.proyecto}
            />
          )
        }
      >
        <DataTable
          flush
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          onRowClick={(r) => void abrir(r)}
          ariaLabel="Listado de proyectos"
        />
      </ListCard>

      <Modal
        open={abierto != null}
        onClose={() => setAbierto(null)}
        title={abierto?.titulo ?? "Proyecto"}
        maxWidth={1040}
      >
        {detalleLoading ? (
          <div aria-busy="true">
            <p className={s.cargando}>Cargando desglose…</p>
            <SkeletonRows rows={3} label="Cargando desglose" />
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
            {`No se pudo abrir el desglose de ${abierto?.titulo ?? "este proyecto"}. ${detalleError} Reintenta; el resto de la lista sigue disponible.`}
          </Alert>
        ) : !detalle ? null : (
          <div className={s.detalle}>
            <StatRow variant="strip" ariaLabel="Resumen del proyecto">
              <Cifra
                label="Ingresos facturados"
                value={detalle.resumen.ingresos}
                hint={
                  <>
                    por cobrar <Money value={detalle.resumen.porCobrar} bold={false} />
                  </>
                }
                icon={<ReceiptLongOutlinedIcon />}
              />
              <Cifra
                label="Costo total"
                value={detalle.resumen.costoTotal}
                hint={
                  <>
                    pendiente de pagar <Money value={detalle.resumen.costoPendiente} bold={false} />
                  </>
                }
                icon={<ShoppingCartOutlinedIcon />}
              />
              <Cifra
                label="Margen"
                value={detalle.resumen.margen}
                hint="ingresos menos costo"
                tone={detalle.resumen.margen < 0 ? "danger" : "default"}
                icon={<TrendingUpOutlinedIcon />}
              />
              <Stat
                label="% de margen"
                value={<MargenPct pct={detalle.resumen.margenPct} />}
                hint="sobre lo facturado"
                icon={<PercentOutlinedIcon />}
                iconTone="neutral"
              />
            </StatRow>

            {/* Solo cuando de verdad no hay facturación: antes el aviso salía
                en toda obra, incluso con facturas al cliente en la pantalla. */}
            {detalle.proyecto.tipo === "obra" && detalle.ingresosDetalle.length === 0 ? (
              <Alert className={s.aviso} tone="info" role="alert">
                Esta obra no tiene facturación ligada en el sistema: solo se muestran sus costos
                registrados.
              </Alert>
            ) : null}

            <Card>
              <CardHead title="Ficha" />
              <div className={s.cuerpo}>
                <div className={s.ficha}>
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
                        <span className={s.datoSuave}>Sin reportar</span>
                      )
                    }
                  />
                  <Dato label="Moneda" value={detalle.proyecto.moneda || "—"} />
                  <Dato label="Estado" value={<EstatusDot estatus={detalle.proyecto.estatus} />} />
                </div>
                {detalle.proyecto.objetivo && (
                  <p className={s.objetivo}>{detalle.proyecto.objetivo}</p>
                )}
                {detalle.proyecto.alcance && <p className={s.alcance}>{detalle.proyecto.alcance}</p>}
              </div>
            </Card>

            {detalle.presupuesto.autorizado == null ? (
              <Card>
                <CardHead
                  title="Presupuesto"
                  subtitle={`Sin presupuesto autorizado en ${detalle.presupuesto.origen || "el proyecto"}.`}
                />
                <div className={s.cuerpo}>
                  <p className={s.textoCorto}>
                    Este proyecto no tiene tope autorizado, así que no hay «disponible» que
                    calcular. Ya se comprometieron{" "}
                    <Money value={detalle.presupuesto.comprometido} bold={false} /> y salieron de
                    caja <Money value={detalle.presupuesto.pagado} bold={false} />.
                  </p>
                </div>
              </Card>
            ) : (
              <section className={s.bloque} aria-labelledby="proyecto-presupuesto">
                <h3 id="proyecto-presupuesto" className={s.bloqueTitulo}>
                  Presupuesto
                </h3>
                <p className={s.bloqueSub}>
                  {`Autorizado en ${detalle.presupuesto.origen || "el proyecto"}, contra lo que ya se comprometió y lo que ya salió.`}
                </p>
                <StatRow variant="strip" ariaLabel="Presupuesto del proyecto">
                  <Cifra
                    label="Autorizado"
                    value={detalle.presupuesto.autorizado}
                    hint="tope del proyecto"
                    icon={<AccountBalanceWalletOutlinedIcon />}
                  />
                  <Cifra
                    label="Comprometido"
                    value={detalle.presupuesto.comprometido}
                    hint="ya se ordenó"
                    icon={<ShoppingCartOutlinedIcon />}
                  />
                  <Cifra
                    label="Pagado"
                    value={detalle.presupuesto.pagado}
                    hint="ya salió de caja"
                    icon={<PriceCheckOutlinedIcon />}
                  />
                  <Cifra
                    label="Disponible"
                    value={detalle.presupuesto.disponible ?? 0}
                    hint={
                      (detalle.presupuesto.disponible ?? 0) < 0
                        ? "el costo ya rebasó el presupuesto"
                        : "queda por comprometer"
                    }
                    tone={(detalle.presupuesto.disponible ?? 0) < 0 ? "danger" : "default"}
                    icon={<SavingsOutlinedIcon />}
                  />
                </StatRow>
              </section>
            )}

            <Card>
              <CardHead
                title="Costos por categoría"
                subtitle="El ancho de cada barra es su parte del costo. Haz clic para ver los movimientos que la forman."
              />
              {detalle.categorias.length === 0 ? (
                <EmptyState
                  size="compact"
                  tone="neutral"
                  icon={<ShoppingCartOutlinedIcon />}
                  title="Sin costos registrados"
                  description="Este proyecto todavía no tiene facturas de proveedor, gastos, viáticos ni salidas de almacén."
                />
              ) : (
                <div className={s.categorias}>
                  {detalle.categorias.map((c) => {
                    const abierta = categoriaAbierta === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        aria-expanded={abierta}
                        className={s.categoria}
                        // Pulsar la categoría ya abierta la cierra: antes no
                        // producía nada y parecía que el clic se perdía.
                        onClick={() => setCategoriaAbierta(abierta ? null : c.key)}
                      >
                        <BarraCategoria categoria={c} />
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* El desglose, justo debajo de la categoría que se pulsó: antes
                aparecía tras la tabla de facturas y el clic no se veía. */}
            {categoriaAbierta ? (
              <ListCard
                listLabel="Movimientos de la categoría"
                toolbar={
                  <CardHead
                    title={
                      detalle.categorias.find((c) => c.key === categoriaAbierta)?.label ??
                      "Movimientos"
                    }
                    subtitle={`${transaccionesDeCategoria.length} ${
                      transaccionesDeCategoria.length === 1 ? "movimiento" : "movimientos"
                    } · abre uno para ver su documento.`}
                    actions={
                      <Button size="sm" variant="ghost" onClick={() => setCategoriaAbierta(null)}>
                        Cerrar desglose
                      </Button>
                    }
                  />
                }
              >
                <DataTable
                  flush
                  rows={transaccionesDeCategoria}
                  rowKey={(t) => t.key}
                  density="compact"
                  stickyHeader={false}
                  ariaLabel="Movimientos por categoría"
                  onRowClick={(t) => setDocumento(t)}
                  emptyTitle="Sin movimientos"
                  emptyDescription="Esta categoría no tiene movimientos individuales registrados."
                  columns={[
                    { key: "fecha", label: "Fecha", render: (t) => fecha(t.fecha) },
                    {
                      key: "tipo",
                      label: "Tipo",
                      render: (t) => <span className={s.secundario}>{TIPO_TX[t.tipo] ?? t.tipo}</span>,
                    },
                    { key: "documento", label: "Documento", render: (t) => t.documento },
                    { key: "concepto", label: "Concepto", render: (t) => t.concepto },
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
                      label: "Estado",
                      render: (t) => <EstatusDot estatus={t.estatus} />,
                    },
                  ]}
                />
              </ListCard>
            ) : null}

            {detalle.ingresosDetalle.length > 0 && (
              <ListCard
                listLabel="Facturas al cliente"
                toolbar={<CardHead title="Facturas al cliente" />}
              >
                <DataTable
                  flush
                  rows={detalle.ingresosDetalle}
                  rowKey={(f) => f.id}
                  density="compact"
                  stickyHeader={false}
                  ariaLabel="Facturas al cliente"
                  columns={[
                    { key: "folio", label: "Folio", render: (f) => f.folio },
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
                      label: "Estado",
                      render: (f) => <EstatusDot estatus={f.estatus} />,
                    },
                  ]}
                />
              </ListCard>
            )}

            {detalle.bitacora && detalle.bitacora.length > 0 && (
              <ListCard listLabel="Bitácora de obra" toolbar={<CardHead title="Bitácora de obra" />}>
                <DataTable
                  flush
                  rows={detalle.bitacora}
                  rowKey={(b) => b.id}
                  density="compact"
                  stickyHeader={false}
                  ariaLabel="Bitácora de obra"
                  columns={[
                    { key: "fecha", label: "Fecha", render: (b) => fecha(b.fecha) },
                    { key: "etiqueta", label: "Avance", render: (b) => b.etiqueta },
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
              </ListCard>
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
          <div className={s.documento}>
            <Dato label="Concepto" value={documento.concepto} />
            <StatRow variant="strip" ariaLabel="Importes del documento">
              <Cifra label="Monto" value={documento.monto} icon={<ReceiptLongOutlinedIcon />} />
              <Cifra label="Pagado" value={documento.pagado} icon={<PriceCheckOutlinedIcon />} />
              <Cifra
                label="Pendiente"
                value={documento.monto - documento.pagado}
                icon={<ScheduleOutlinedIcon />}
              />
            </StatRow>
            <div className={s.ficha}>
              <Dato label="Fecha" value={fecha(documento.fecha)} />
              <Dato label="Estado" value={<EstatusDot estatus={documento.estatus} />} />
            </div>
            <div className={s.registro}>
              Registro #{documento.refId} en {TIPO_TX[documento.tipo] ?? documento.tipo}.
            </div>
          </div>
        )}
      </Modal>
    </MesaPagina>
  );
}
