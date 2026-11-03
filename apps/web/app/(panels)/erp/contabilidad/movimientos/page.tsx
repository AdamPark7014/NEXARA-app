"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CalculateOutlinedIcon from "@mui/icons-material/CalculateOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  DataTable,
  DateInput,
  LinkButton,
  ListCard,
  ListFooter,
  ModuleToolbar,
  SearchInput,
  Select,
  Stat,
  StatRow,
  buttonClass,
  type Column,
  type Tone,
} from "@/components/base";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import Modal from "@/components/ui/Modal";
import { Money } from "@/components/ui/DataTable";
import { enlaceSeguro } from "@/lib/enlace-seguro";
import { useUser } from "@/components/UserContext";
import { saveBlob } from "@/components/finance/download";
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
import { DESTINOS, VacioConPrimerPaso } from "../_arranque";
import s from "./movimientos.module.css";

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

/** Una cifra de la tira de totales: lo que se pinta en cada `Stat`. */
type Cifra = { label: string; icon: ReactNode; value: ReactNode; hint: string };

/** Opciones del filtro de método: el mismo catálogo cerrado que valida la API. */
const METODO_OPTIONS = Object.entries(METODO_LABELS).map(([value, label]) => ({ value, label }));

/**
 * El estado del renglón como punto y palabra. La API manda la cadena libre, así
 * que el tono se deduce de lo que dice: color solo cuando el renglón pide una
 * acción (por autorizar, por conciliar) o algo salió mal (vencido, cancelado).
 * Todo lo demás es flujo normal y se queda neutro.
 */
function tonoEstado(estado: string | null | undefined): Tone {
  const e = (estado ?? "").toLowerCase();
  if (!e) return "neutral";
  if (/vencid|rechaz|cancelad|sin comprobante|devuelt/.test(e)) return "danger";
  if (/pendiente|parcial|autoriz|revis|borrador|sin concilia|proceso/.test(e)) return "warning";
  if (/pagad|cobrad|liquidad|conciliad|aplicad|timbrad/.test(e)) return "success";
  return "neutral";
}

/** Texto de una celda del libro: dos renglones como mucho; completo al pasar el ratón y en el detalle. */
function TextoCelda({ valor }: { valor: string }) {
  return (
    <span className={s.celdaTexto} title={valor}>
      {valor}
    </span>
  );
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
  // A 390 px la frase no cabe al lado de Anterior / Siguiente.
  const [avisoAbajo, setAvisoAbajo] = useState(false);

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
    // El marco del panel quita 300 px: con doce columnas, por debajo de 1600 px Egreso y Estado se iban fuera de la vista.
    const mq = window.matchMedia("(max-width: 1600px)");
    const sync = () => setAngosto(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const sync = () => setAvisoAbajo(mq.matches);
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
      saveBlob(await res.blob(), nombre);
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
        render: (r) => <span className={s.celdaFecha}>{formatLedgerDate(r.fecha)}</span>,
      },
      {
        key: "tipo",
        label: "Tipo",
        width: 104,
        // Clasificación normal del flujo: punto neutro. El color se reserva
        // para el estado, que es lo que llega a pedir acción.
        render: (r) => (
          <Badge dot size="sm" tone="neutral">
            {TIPO_LABELS[r.tipo]}
          </Badge>
        ),
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
            <div className={angosto ? s.conceptoAngosto : s.concepto}>
              <div className={s.conceptoNombre}>{r.concepto}</div>
              <div className={s.conceptoMeta}>{meta.join(" · ")}</div>
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
              render: (r: LedgerRow) => <TextoCelda valor={r.categoria || "—"} />,
            },
            {
              key: "cuenta",
              label: "Cuenta",
              render: (r: LedgerRow) => <TextoCelda valor={r.cuenta?.nombre ?? "—"} />,
            },
            {
              key: "contraparte",
              label: "Contraparte",
              render: (r: LedgerRow) => <TextoCelda valor={r.contraparte?.nombre ?? "—"} />,
            },
            {
              key: "proyecto",
              label: "Proyecto",
              render: (r: LedgerRow) => <TextoCelda valor={r.proyecto?.nombre ?? "—"} />,
            },
            {
              key: "referencia",
              label: "Referencia",
              render: (r: LedgerRow) => <span className={s.referencia}>{r.referencia ?? "—"}</span>,
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
          return <span className={s.sinDato}>—</span>;
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
          return <span className={s.sinDato}>—</span>;
        },
      },
      {
        key: "estado",
        label: "Estado",
        render: (r) =>
          r.estado ? (
            <Badge dot size="sm" tone={tonoEstado(r.estado)}>
              {financeStatusLabel(r.estado)}
            </Badge>
          ) : (
            <span className={s.sinDato}>—</span>
          ),
      },
      ...(angosto
        ? []
        : [
            {
              key: "registradoPor",
              label: "Registró",
              render: (r: LedgerRow) => <TextoCelda valor={r.registradoPor ?? "—"} />,
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
  const totalesStrip: Cifra[] = useMemo(() => {
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
        icon: <TrendingUpOutlinedIcon />,
        value: <Money value={totals.ingresos} />,
        hint: "Facturado y cobrado juntos",
      },
      {
        label: "Egresos",
        icon: <TrendingDownOutlinedIcon />,
        value: <Money value={totals.egresos} />,
        hint: "Devengado y pagado juntos",
      },
      {
        label: "Neto",
        icon: <CalculateOutlinedIcon />,
        value: <Money value={totals.neto} />,
        hint: "Ingresos menos egresos",
      },
      // Efectivo y devengado traían el desglose completo desde la API y solo se
      // pintaba el neto: de qué está hecho cada neto se lee en la pista.
      {
        label: "Efectivo",
        icon: <PaymentsOutlinedIcon />,
        value: <Money value={totals.efectivo.neto} />,
        hint: `${totals.efectivo.conteo} mov · ${dinero(totals.efectivo.ingresos)} entró, ${dinero(totals.efectivo.egresos)} salió`,
      },
      {
        label: "Devengado",
        icon: <ReceiptLongOutlinedIcon />,
        value: <Money value={totals.devengado.neto} />,
        hint: `${totals.devengado.conteo} mov · ${dinero(totals.devengado.ingresos)} por cobrar, ${dinero(totals.devengado.egresos)} por pagar`,
      },
      {
        label: "Movimientos",
        icon: <SwapHorizOutlinedIcon />,
        value: totals.conteo.toLocaleString("es-MX"),
        // Traspasos y ajustes no suman al neto, pero su importe sí explica
        // huecos al cuadrar; llegaba en la respuesta y no se veía.
        hint: `${totals.transferencias.conteo} traspasos (${dinero(totals.transferencias.monto)}) · ${totals.ajustes.conteo} ajustes (${dinero(totals.ajustes.monto)}), no suman al neto`,
      },
    ];
  }, [totals]);

  /** Lo que enciende «Limpiar»: el mismo criterio que usaba la barra de filtros de antes. */
  const hayFiltrosActivos =
    filters.q.trim().length > 0 ||
    filters.from !== "" ||
    filters.to !== "" ||
    [filters.tipo, accounts.length ? filters.cuentaId : "", filters.metodoPago].some(
      (v) => v !== "" && v !== "all",
    );
  const limpiarFiltros = () => {
    setFilters(emptyFilters());
    setPage(1);
  };
  const hayFilas = !sinSesion && !loading && rows.length > 0;

  return (
    <MesaPagina
      titulo="Libro de movimientos"
      descripcion="Cobros, pagos, gastos, nómina, líneas de banco sin conciliar y facturas, en una sola línea de tiempo."
      terciarias={
        <>
          <Button
            variant="ghost"
            onClick={() => void exportCsv()}
            disabled={exporting || loading || sinSesion}
          >
            {exporting ? "Generando…" : "Exportar CSV"}
          </Button>
          <Button variant="ghost" onClick={() => void load()} disabled={loading || sinSesion}>
            {loading ? "Actualizando…" : "Actualizar"}
          </Button>
        </>
      }
    >
      {data?.nominaOculta ? (
        <Alert tone="info" role="status" className={s.alerta}>
          {data.nominaOculta === 1
            ? "1 pago de nómina no sale aquí ni en los totales: los pagos por persona son de dirección."
            : `${data.nominaOculta} pagos de nómina no salen aquí ni en los totales: los pagos por persona son de dirección.`}
        </Alert>
      ) : null}
      {/* El resultado de exportar, pegado a la acción que lo produjo. */}
      {exportAviso && (
        <Alert
          tone={exportAviso.tono}
          role="alert"
          className={s.alerta}
          onDismiss={() => setExportAviso(null)}
        >
          {exportAviso.texto}
        </Alert>
      )}

      {sinSesion && (
        <Alert
          tone="warning"
          role="alert"
          className={s.alerta}
          action={
            <ButtonLink size="sm" href="/login">
              Ir a entrar
            </ButtonLink>
          }
        >
          No hay sesión activa, así que el libro no se puede consultar. Vuelve a entrar con tu cuenta para ver los movimientos.
        </Alert>
      )}

      {error && (
        <Alert
          tone="danger"
          role="alert"
          className={s.alerta}
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? "Reintentando…" : "Reintentar"}
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Totales arriba: es lo que la contadora cuadra. Sin un solo movimiento
          detrás no se pinta: seis ceros no son un total, son ruido encima del
          renglón que sí explica por qué la pantalla está vacía. */}
      {data && totals.conteo > 0 && (
        <StatRow variant="strip" ariaLabel="Totales del periodo filtrado" className={s.totales}>
          {totalesStrip.map((c) => (
            <Stat
              key={c.label}
              label={c.label}
              value={c.value}
              hint={c.hint}
              icon={c.icon}
              iconTone="neutral"
            />
          ))}
        </StatRow>
      )}

      <ListCard
        listLabel="Libro de movimientos"
        toolbar={
          <ModuleToolbar
            search={
              <SearchInput
                aria-label="Buscar concepto, referencia, cliente o proveedor…"
                placeholder="Buscar concepto, referencia, cliente o proveedor…"
                value={filters.q}
                onChange={(e) => setFilter("q", e.target.value)}
              />
            }
            end={
              loading ? undefined : (
                <span className={s.conteo} role="status">
                  {totals.conteo} resultado{totals.conteo === 1 ? "" : "s"}
                </span>
              )
            }
          >
            <label className={s.campoFecha}>
              <span>Del</span>
              <DateInput
                aria-label="Del"
                className={s.fecha}
                controlSize="sm"
                value={filters.from}
                onChange={(e) => setFilter("from", e.target.value)}
              />
            </label>
            <label className={s.campoFecha}>
              <span>Al</span>
              <DateInput
                aria-label="Al"
                className={s.fecha}
                controlSize="sm"
                value={filters.to}
                onChange={(e) => setFilter("to", e.target.value)}
              />
            </label>
            <Select
              aria-label="Tipo"
              title="Tipo"
              wrapperClassName={s.filtroSelect}
              controlSize="sm"
              value={filters.tipo}
              onChange={(e) => setFilter("tipo", e.target.value)}
            >
              <option value="">Todos los tipos</option>
              {TIPO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            {accounts.length ? (
              <Select
                aria-label="Cuenta"
                title="Cuenta"
                wrapperClassName={s.filtroSelect}
                controlSize="sm"
                value={filters.cuentaId}
                onChange={(e) => setFilter("cuentaId", e.target.value)}
              >
                <option value="">Todas las cuentas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.bankName ? `${a.name} · ${a.bankName}` : a.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select
              aria-label="Método"
              title="Método"
              wrapperClassName={s.filtroSelect}
              controlSize="sm"
              value={filters.metodoPago}
              onChange={(e) => setFilter("metodoPago", e.target.value)}
            >
              <option value="">Todos los métodos</option>
              {METODO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            {hayFiltrosActivos ? <LinkButton onClick={limpiarFiltros}>Limpiar</LinkButton> : null}
          </ModuleToolbar>
        }
        loading={loading && !sinSesion}
        loadingRows={8}
        empty={!sinSesion && !loading && rows.length === 0}
        /* Dos vacíos distintos, y solo uno es culpa del filtro. */
        emptyState={
          filtrado ? {
            icon: <FilterAltOffOutlinedIcon />,
            title: "Ningún movimiento con estos filtros",
            description:
              "Quita algún filtro o amplía el rango de fechas. El libro sólo muestra lo que existe en la base, no estimaciones.",
            action: (
              <Button size="sm" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            ),
          } : (
            <VacioConPrimerPaso
              title="Sin movimientos en el periodo"
              description={`Entre el ${formatLedgerDate(filters.from)} y el ${formatLedgerDate(filters.to)} no hay cobros, pagos, gastos, nómina, líneas de banco sin conciliar ni facturas. El libro no se captura: cada renglón entra solo cuando se registra en su módulo. Empieza por una factura y aquí aparece.`}
              destino={DESTINOS.factura}
            />
          )
        }
        footer={
          hayFilas ? (
            <ListFooter>
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
              <span className={s.paginaTexto}>
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
                <span className={s.tope}>
                  Hasta aquí llega la paginación ({MAX_SCAN.toLocaleString("es-MX")} movimientos).
                  Filtra o acorta el periodo para ver el resto.
                </span>
              )}
              <span className={avisoAbajo ? s.notaAbajo : s.nota}>{NATURALEZA_HINT}</span>
            </ListFooter>
          ) : undefined
        }
      >
        {sinSesion ? null : (
          <DataTable
            flush
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            density="compact"
            ariaLabel="Movimientos del libro"
            onRowClick={(r) => setDetail(r)}
          />
        )}
      </ListCard>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? describeOrigen(detail) : ""}
        maxWidth={560}
        footer={
          detail ? (
            <>
              {enlaceSeguro(detail.comprobanteUrl) && (
                <a
                  href={enlaceSeguro(detail.comprobanteUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass("tertiary", { size: "sm" })}
                >
                  Ver comprobante
                </a>
              )}
              {detail.origen.href && (
                <ButtonLink variant="tertiary" size="sm" href={detail.origen.href}>
                  Abrir documento origen
                </ButtonLink>
              )}
              <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
                Cerrar
              </Button>
            </>
          ) : null
        }
      >
        {detail && (
          <dl className={s.detalle}>
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
    </MesaPagina>
  );
}

/** `—` cuando el campo viene vacío: una celda en blanco no dice si falta el
 *  dato o si falló el render. */
function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const vacio = !value || (typeof value === "string" && !value.trim());
  return (
    <>
      <dt className={s.detalleEtiqueta}>{label}</dt>
      <dd className={`${s.detalleValor} ${vacio ? s.detalleVacio : ""}`}>{vacio ? "—" : value}</dd>
    </>
  );
}
