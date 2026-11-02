"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHead,
  DateInput,
  EmptyState,
  Field,
  SkeletonRows,
  Stat,
  StatRow,
} from "@/components/base";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { useUser } from "@/components/UserContext";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { Money } from "@/components/ui/DataTable";
import {
  DESTINOS,
  PuestaEnMarcha,
  VacioConPrimerPaso,
  usePuedeAbrir,
  type PasoArranque,
} from "./_arranque";
import s from "./hoy.module.css";

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

/** `YYYY-MM-DD` en hora local: `toISOString` salta al día siguiente por la noche. */
function isoLocal(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from: isoLocal(from), to: isoLocal(to) };
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
      const json = await erpFetch<WorkspaceDashboard>(
        `accounting/workspace/dashboard?${qs}`,
        token,
      );
      if (turno !== peticion.current) return;
      setData(json);
    } catch (e) {
      if (turno !== peticion.current) return;
      // Las cifras anteriores se quedan: el aviso dice qué periodo falló y
      // `periodoVigente` sigue rotulando el que sí está en pantalla.
      setError(formatApiError(e, "El servidor no respondió."));
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
    data ? valor : loading ? "…" : <span className={s.sinDato}>—</span>;

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

  /**
   * ¿Detrás de estas cifras no hay absolutamente nada? No es lo mismo que «dio
   * cero»: se exige que TODO lo que el resumen sabe mirar esté vacío —el
   * disponible, la cartera abierta de los dos lados, las facturas del periodo,
   * la nómina en borrador, el mes y las alertas—. Con eso, pintar cinco ceros
   * y una tabla de guiones no informa de nada: ocupa el sitio del primer paso.
   */
  const sinCifras = useMemo(() => {
    if (!data) return false;
    return (
      data.cashBalance === 0 &&
      data.accountsReceivablePending === 0 &&
      data.accountsPayablePending === 0 &&
      data.invoicesPeriod.total === 0 &&
      data.prenominaDraftTotal === 0 &&
      data.income === 0 &&
      data.expense === 0 &&
      data.alerts.length === 0
    );
  }, [data]);

  /**
   * Qué falta para poder operar. El dashboard NO lo dice —manda sumas, no si
   * existen cuentas, periodos o bancos—, así que cuando no hay cifras se
   * preguntan los tres catálogos que ya sirven al resto del hub. Solo entonces:
   * en un mes con movimiento no se gasta ni una petición de más.
   *
   * Lo que falla o no se puede consultar queda en `desconocido`; adivinar que
   * «no hay» porque un 403 no contestó sería inventarse el estado de la empresa.
   */
  type EstadoPaso = PasoArranque["estado"];
  const [arranque, setArranque] = useState<{
    cuentas: EstadoPaso;
    periodo: EstadoPaso;
    banco: EstadoPaso;
  } | null>(null);

  useEffect(() => {
    if (!sinCifras || !token) return;
    let vivo = true;
    const pedirLista = async (path: string): Promise<unknown[] | null> => {
      try {
        const res = await erpFetch<unknown>(path, token);
        if (Array.isArray(res)) return res;
        const caja = res as { data?: unknown; items?: unknown };
        if (Array.isArray(caja?.data)) return caja.data;
        if (Array.isArray(caja?.items)) return caja.items;
        return null;
      } catch {
        return null;
      }
    };
    void (async () => {
      const [cuentas, periodos, bancos] = await Promise.all([
        pedirLista("accounting/accounts"),
        pedirLista("accounting/accounts/fiscal-periods"),
        pedirLista("accounting/banking/accounts"),
      ]);
      if (!vivo) return;
      const hay = (lista: unknown[] | null): EstadoPaso =>
        lista === null ? "desconocido" : lista.length > 0 ? "listo" : "pendiente";
      setArranque({
        cuentas: hay(cuentas),
        // Un periodo cerrado no sirve para trabajar el mes: cuenta el abierto.
        periodo:
          periodos === null
            ? "desconocido"
            : periodos.some((p) => !(p as { isClosed?: boolean })?.isClosed)
              ? "listo"
              : "pendiente",
        banco: hay(bancos),
      });
    })();
    return () => {
      vivo = false;
    };
  }, [sinCifras, token]);

  const pasos: PasoArranque[] = useMemo(
    () => [
      {
        id: "cuentas",
        titulo: "Listar las cuentas del negocio",
        porque: "Es la lista de bolsillos (banco, clientes, gastos…). Sin eso no se anota nada.",
        destino: DESTINOS.catalogoCuentas,
        estado: arranque?.cuentas ?? "desconocido",
      },
      {
        id: "periodo",
        titulo: "Abrir el mes en curso",
        porque: "Define de qué fechas estamos hablando al cobrar y pagar.",
        destino: DESTINOS.periodoFiscal,
        estado: arranque?.periodo ?? "desconocido",
      },
      {
        id: "banco",
        titulo: "Registrar la cuenta bancaria",
        porque: "Para ver cuánto hay disponible y cuadrar el estado de cuenta.",
        destino: DESTINOS.cuentaBancaria,
        estado: arranque?.banco ?? "desconocido",
      },
    ],
    [arranque],
  );

  const faltaConfigurar = pasos.some((p) => p.estado === "pendiente");
  /**
   * Que ningún paso salga «pendiente» no siempre significa que esté todo: si
   * los tres quedaron en «desconocido» es que no se pudo preguntar. Con al
   * menos uno comprobado se puede afirmar algo; sin ninguno, no.
   */
  const configVerificada = pasos.some((p) => p.estado === "listo");
  const modoArranque = sinCifras && faltaConfigurar;
  const puedeAbrir = usePuedeAbrir();

  const primerPasoPendiente = pasos.find(
    (p) => p.estado === "pendiente" && puedeAbrir(p.destino.href),
  );

  const primaryHref = modoArranque
    ? (primerPasoPendiente?.destino.href ?? "/erp/contabilidad/polizas?tab=cuentas")
    : (attention.find((a) => a.href)?.href ?? "/erp/contabilidad/cuentas-por-cobrar");
  const primaryLabel = modoArranque
    ? (primerPasoPendiente?.destino.etiqueta ?? "Empezar")
    : attention.some((a) => a.href)
      ? "Resolver lo pendiente"
      : "Ver a quién cobrar";

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
  const metrics = useMemo(() => {
    // Tres estados distintos, tres señales distintas: «…» mientras carga, «—»
    // cuando no hubo respuesta (sin sesión o error) y la cifra cuando la hay.
    // Pintar «$0» sin datos sería inventarse un saldo.
    const cargando: ReactNode | null = data ? null : loading ? "…" : "—";
    const cobrosVencidos = data?.agingReceivable.overdue ?? 0;
    const pagosVencidos = data?.agingPayable.overdue ?? 0;

    return [
      {
        label: "En el banco",
        icon: <AccountBalanceOutlinedIcon />,
        iconTone: "neutral" as const,
        value: cargando ?? <Money value={data?.cashBalance ?? 0} />,
        hint: "Lo que hay disponible hoy",
        href: "/erp/contabilidad/conciliacion",
      },
      {
        label: "Me deben",
        icon: <PaymentsOutlinedIcon />,
        iconTone: "neutral" as const,
        value: cargando ?? <Money value={data?.accountsReceivablePending ?? 0} />,
        hint: !data
          ? "Sin dato"
          : cobrosVencidos > 0
            ? `${formatMoney(cobrosVencidos)} ya se atrasaron`
            : "Nadie atrasado",
        tone: cobrosVencidos > 0 ? ("warning" as const) : ("default" as const),
        href: "/erp/contabilidad/cuentas-por-cobrar",
      },
      {
        label: "Debo pagar",
        icon: <ReceiptOutlinedIcon />,
        iconTone: "neutral" as const,
        value: cargando ?? <Money value={data?.accountsPayablePending ?? 0} />,
        hint: !data
          ? "Sin dato"
          : pagosVencidos > 0
            ? `${formatMoney(pagosVencidos)} ya se atrasaron`
            : "Nada atrasado",
        tone: pagosVencidos > 0 ? ("danger" as const) : ("default" as const),
        href: "/erp/contabilidad/cuentas-por-pagar",
      },
      {
        label: "Facturas del periodo",
        icon: <ReceiptLongOutlinedIcon />,
        iconTone: "neutral" as const,
        value: cargando ?? (data?.invoicesPeriod.total ?? 0).toLocaleString("es-MX"),
        hint: data
          ? `${data.invoicesPeriod.issued} emitidas · ${data.invoicesPeriod.received} recibidas`
          : "Sin dato",
        href: "/erp/contabilidad/facturas",
      },
    ];
  }, [loading, data]);

  const pasosListos = pasos.filter((p) => p.estado === "listo").length;

  return (
    <MesaPagina
      titulo="¿Qué hay que hacer hoy?"
      descripcion={
        sinSesion
          ? "Entra con tu cuenta para ver cobros, pagos y banco."
          : loading && !data
            ? "Cargando…"
            : modoArranque
              ? "Todavía falta preparar lo básico. Empieza por el primer paso."
              : `Resumen de ${monthLabel} — toca una cifra para entrar.`
      }
      secundarias={
        <Button onClick={abrirPeriodo} aria-expanded={showPeriod} aria-controls={periodoId}>
          Cambiar fechas
        </Button>
      }
      primaria={
        <ButtonLink variant="primary" href={primaryHref}>
          {primaryLabel}
        </ButtonLink>
      }
    >
      {showPeriod && (
        <Card pad as="div">
          <form
            id={periodoId}
            className={s.periodo}
            onSubmit={(e) => {
              e.preventDefault();
              aplicarPeriodo();
            }}
          >
            <Field label="Desde" error={errorRango?.campo === "from" ? errorRango.mensaje : null}>
              <DateInput
                value={borrador.from}
                onChange={(e) => {
                  const v = e.target.value;
                  setBorrador((b) => ({ ...b, from: v }));
                  setErrorRango(null);
                }}
              />
            </Field>
            <Field label="Hasta" error={errorRango?.campo === "to" ? errorRango.mensaje : null}>
              <DateInput
                value={borrador.to}
                onChange={(e) => {
                  const v = e.target.value;
                  setBorrador((b) => ({ ...b, to: v }));
                  setErrorRango(null);
                }}
              />
            </Field>
            <div className={s.periodoAcciones}>
              <Button variant="ghost" onClick={() => setShowPeriod(false)}>
                Cancelar
              </Button>
              <Button variant="tonal" type="submit" disabled={loading}>
                {loading ? "Consultando…" : "Aplicar"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {sinSesion && (
        <Alert
          tone="warning"
          role="alert"
          action={
            <ButtonLink size="sm" href="/login">
              Ir a entrar
            </ButtonLink>
          }
        >
          No hay sesión activa, así que no se puede consultar el resumen. Vuelve a entrar con tu
          cuenta y la pantalla se llenará sola.
        </Alert>
      )}

      {error && (
        <Alert
          tone="danger"
          role="alert"
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? "Reintentando…" : "Reintentar"}
            </Button>
          }
        >
          {`No se pudo cargar el resumen del ${periodoVigente.from} al ${periodoVigente.to}. ${error} Reintenta; si vuelve a fallar, prueba con un rango más corto.`}
        </Alert>
      )}

      {/* Sin una sola cifra detrás, la pantalla deja de ser un tablero y pasa a
          ser la puesta en marcha: qué falta, en qué orden, y a dónde ir. */}
      {sinCifras ? (
        <Card aria-label="Puesta en marcha">
          <CardHead
            title={modoArranque ? "Para empezar" : "Aún no hay movimiento"}
            subtitle={
              modoArranque
                ? `En ${monthLabel} todavía no hay dinero registrado. Antes de ver cifras hay que dejar listo lo básico, en este orden.`
                : undefined
            }
            actions={
              modoArranque ? (
                <Badge tone={pasosListos > 0 ? "success" : "neutral"}>
                  {pasosListos} de {pasos.length} listos
                </Badge>
              ) : null
            }
          />

          {arranque === null ? (
            <div className={s.revisando} aria-busy="true">
              <SkeletonRows rows={3} label="Revisando qué falta para empezar" />
            </div>
          ) : modoArranque ? (
            <>
              <PuestaEnMarcha pasos={pasos} />
              <p className={s.notaPie}>
                En cuanto exista el primer movimiento, esta pantalla vuelve sola a las cifras del
                periodo.
              </p>
            </>
          ) : (
            <VacioConPrimerPaso
              title={
                configVerificada
                  ? "Todo está listo y todavía no pasa nada"
                  : "Sin nada registrado en este periodo"
              }
              description={
                configVerificada
                  ? `La contabilidad ya está configurada, pero del ${periodoVigente.from} al ${periodoVigente.to} no hay facturas, cobros, pagos ni saldo en bancos. Emite la primera factura: aparecerá aquí, en Por cobrar y en el libro de movimientos.`
                  : `Del ${periodoVigente.from} al ${periodoVigente.to} no hay facturas, cobros, pagos ni saldo en bancos. Si falta configurar algo no se pudo comprobar desde tu cuenta, así que empieza por lo que sí es tuyo: la primera factura.`
              }
              destino={DESTINOS.factura}
              extra={
                <Button variant="ghost" onClick={abrirPeriodo}>
                  Cambiar el periodo
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <>
          {/* Nivel 1 — el estado del dinero en una sola línea. */}
          <StatRow variant="strip" ariaLabel="En el banco, me deben, debo pagar y facturas del periodo">
            {metrics.map((m) => (
              <Stat key={m.href} {...m} />
            ))}
          </StatRow>

          <div className={s.columnas}>
            <div className={s.columna}>
              {/* Nivel 2 — excepciones: cada una con el enlace a donde se resuelve. */}
              <Card aria-label="Lo que no puede esperar">
                <CardHead title="Lo que no puede esperar" />
                {sinSesion ? (
                  <EmptyState size="compact" tone="neutral" title="No se pudo revisar: no hay sesión." />
                ) : loading && !data ? (
                  <div className={s.revisando} aria-busy="true">
                    <SkeletonRows rows={2} label="Revisando pendientes" />
                  </div>
                ) : attention.length === 0 ? (
                  <EmptyState
                    size="compact"
                    tone="success"
                    icon={<CheckCircleOutlineRoundedIcon />}
                    title="Nada urgente"
                    description="Puedes cobrar, pagar o cuadrar el banco cuando quieras."
                  />
                ) : (
                  <ul className={s.pendientes}>
                    {attention.map((item) => {
                      const cuerpo = (
                        <>
                          <span>{item.label}</span>
                          <span className={s.pendienteLado}>
                            <Badge dot size="sm" tone={item.tone === "info" ? "neutral" : item.tone}>
                              {item.detail}
                            </Badge>
                            {item.href ? (
                              <ChevronRightRoundedIcon className={s.flecha} aria-hidden="true" />
                            ) : (
                              <span className={s.sinPantalla}>sin pantalla asociada</span>
                            )}
                          </span>
                        </>
                      );
                      return (
                        <li key={`${item.href ?? "sin-destino"}-${item.label}`}>
                          {item.href ? (
                            <Link href={item.href} className={s.pendiente}>
                              {cuerpo}
                            </Link>
                          ) : (
                            <div className={s.pendiente}>{cuerpo}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              {/* Tres puertas claras — no una tabla de vencimientos tipo Excel. */}
              <section aria-labelledby="hacer-title">
                <h2 id="hacer-title" className={s.tituloBloque}>
                  Atajos del día
                </h2>
                <div className={s.atajos}>
                  {(
                    [
                      {
                        href: "/erp/contabilidad/cuentas-por-cobrar",
                        title: "Cobrar",
                        icon: <PaymentsOutlinedIcon />,
                        detail:
                          loading && !data
                            ? "…"
                            : data
                              ? data.agingReceivable.overdue > 0
                                ? `${formatMoney(data.agingReceivable.overdue)} atrasados`
                                : "Clientes al corriente"
                              : "—",
                      },
                      {
                        href: "/erp/contabilidad/cuentas-por-pagar",
                        title: "Pagar",
                        icon: <ReceiptOutlinedIcon />,
                        detail:
                          loading && !data
                            ? "…"
                            : data
                              ? data.agingPayable.overdue > 0
                                ? `${formatMoney(data.agingPayable.overdue)} atrasados`
                                : "Proveedores al corriente"
                              : "—",
                      },
                      {
                        href: "/erp/contabilidad/conciliacion",
                        title: "Cuadrar banco",
                        icon: <AccountBalanceOutlinedIcon />,
                        detail: "Que el estado de cuenta coincida",
                      },
                      {
                        href: "/erp/contabilidad/cierres",
                        title: "Cerrar el mes",
                        icon: <EventAvailableOutlinedIcon />,
                        detail: "Revisar pendientes y bloquear el periodo",
                      },
                    ] as const
                  ).map((card) => (
                    <Link key={card.href} href={card.href} className={s.atajo}>
                      <span className={s.atajoIco} aria-hidden="true">
                        {card.icon}
                      </span>
                      <span className={s.atajoTexto}>
                        <span className={s.atajoTitulo}>{card.title}</span>
                        <span className={s.atajoDetalle}>{card.detail}</span>
                      </span>
                      <ChevronRightRoundedIcon className={s.flecha} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </section>
            </div>

            {/* Secundario — contexto del mes */}
            <Card aria-label="Del mes, en corto">
              <CardHead title="Del mes, en corto" />
              <dl className={s.contexto}>
                <CtxRow label="Entró" value={ctx(<Money value={data?.income ?? 0} bold={false} />)} />
                <CtxRow label="Salió" value={ctx(<Money value={data?.expense ?? 0} bold={false} />)} />
                <CtxRow label="Quedó" value={ctx(<Money value={data?.netCashflow ?? 0} />)} />
                <CtxRow
                  label="Facturas"
                  value={ctx(
                    `${data?.invoicesPeriod.total ?? 0} (${data?.invoicesPeriod.issued ?? 0} hechas · ${data?.invoicesPeriod.received ?? 0} recibidas)`,
                  )}
                />
                <CtxRow
                  label="Nómina en borrador"
                  value={ctx(<Money value={data?.prenominaDraftTotal ?? 0} bold={false} />)}
                  href="/erp/contabilidad/pre-nomina"
                />
              </dl>
              <div className={s.contextoPie}>
                <ButtonLink variant="tertiary" size="sm" href="/erp/contabilidad/reportes">
                  Ver informes
                </ButtonLink>
                <ButtonLink variant="tertiary" size="sm" href="/erp/contabilidad/polizas">
                  Ver pólizas
                </ButtonLink>
              </div>
            </Card>
          </div>
        </>
      )}
    </MesaPagina>
  );
}

function CtxRow({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const inner = (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={s.contextoFila}>
        {inner}
      </Link>
    );
  }
  return <div className={s.contextoFila}>{inner}</div>;
}
