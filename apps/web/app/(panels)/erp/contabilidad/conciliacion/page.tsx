"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import TouchAppOutlinedIcon from "@mui/icons-material/TouchAppOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHead,
  DataTable,
  DateInput,
  EmptyState,
  FilterChip,
  FilterChips,
  ListCard,
  ListFooter,
  ModuleToolbar,
  SkeletonRows,
  Select,
  type Column,
  type Tone,
} from "@/components/base";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";
import { DESTINOS, VacioConPrimerPaso } from "../_arranque";
import styles from "./conciliacion.module.css";

/**
 * Conciliación bancaria — pantalla dividida.
 * Izquierda: el movimiento del banco. Derecha: lo que NEXARA cree que es,
 * con su score y el porqué. La API hace el matching
 * (`/accounting/workspace/conciliacion/sugerencias`); aquí solo se revisa
 * y se confirma.
 */

type Estado =
  | "CONCILIADO"
  | "SUGERENCIA_ALTA"
  | "SUGERENCIA_MULTIPLE"
  | "DISCREPANCIA"
  | "PENDIENTE";

type Candidato = {
  id: number;
  tipo: "INVOICE" | "PAYMENT";
  folio: string;
  fecha: string;
  vencimiento: string | null;
  monto: number;
  sentido: "IN" | "OUT";
  contraparte: string | null;
  contraparteRfc: string | null;
  proyecto: string | null;
  facturaId: number | null;
  factura: string | null;
  score: number;
  razones: string[];
  diferenciaMonto: number;
  diferenciaDias: number;
};

type Movimiento = {
  id: number;
  fecha: string;
  monto: number;
  esCargo: boolean;
  descripcion: string;
  referencia: string | null;
  speiTrackingKey: string | null;
  concepto: string | null;
  contraparte: string | null;
  contraparteRfc: string | null;
  estado: Estado;
  conciliacion: {
    id: number;
    estado: string;
    montoConciliado: number;
    notas: string | null;
    conciliadoEn: string | null;
    conciliadoPor: { id: number; nombre: string } | null;
  } | null;
  candidatos: Candidato[];
};

type Cuenta = { id: number; nombre: string; banco: string; moneda: string; saldo: number };

type Respuesta = {
  cuentas: Cuenta[];
  cuentaSeleccionada: number | null;
  cuenta: { id: number; nombre: string; banco: string; moneda: string } | null;
  rango: { from: string | null; to: string | null };
  parametros: {
    toleranciaMonto: number;
    toleranciaPorcentaje: number;
    ventanaDias: number;
    scoreAlto: number;
  };
  resumen: {
    total: number;
    conciliados: number;
    sugerenciaAlta: number;
    sugerenciaMultiple: number;
    discrepancias: number;
    pendientes: number;
    sugeridos: number;
  };
  movimientos: Movimiento[];
};

type Filtro = "TODOS" | Estado;

const ESTADO_LABEL: Record<Estado, string> = {
  CONCILIADO: "Conciliado",
  SUGERENCIA_ALTA: "Sugerencia alta",
  SUGERENCIA_MULTIPLE: "Varias opciones",
  DISCREPANCIA: "Discrepancia",
  PENDIENTE: "Pendiente",
};

/**
 * Punto y palabra, no pastilla rellena: con cien movimientos una columna de
 * pastillas es un semáforo y deja de verse cuál pide trabajo. Color solo donde
 * hay algo que hacer —revisar varias opciones, resolver una discrepancia—; el
 * flujo normal se queda neutro.
 */
const ESTADO_TONO: Record<Estado, Tone> = {
  CONCILIADO: "success",
  SUGERENCIA_ALTA: "info",
  SUGERENCIA_MULTIPLE: "warning",
  DISCREPANCIA: "danger",
  PENDIENTE: "neutral",
};

/** Enums crudos del banco/API (`BankReconciliationStatus` / match) → español. */
const RECON_STATUS_LABEL: Record<string, string> = {
  MATCHED: "Conciliado",
  PENDING: "Pendiente",
  UNMATCHED: "Sin conciliar",
  IGNORED: "Ignorado",
  PARTIAL: "Parcial",
  VARIANCE: "Discrepancia",
};

function estadoTexto(estado: string | null | undefined): string {
  if (!estado) return "—";
  const key = String(estado).trim().toUpperCase();
  return (
    ESTADO_LABEL[key as Estado] ??
    RECON_STATUS_LABEL[key] ??
    key
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ")
  );
}

function fechaCorta(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" });
}

/** Pesos en texto plano — solo para las frases de los avisos (`Alert`) que se arman como texto. */
const formatPesos = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

/**
 * La diferencia entre el movimiento y el candidato, en palabras.
 *
 * El API la manda en cada candidato (`diferenciaMonto`, `diferenciaDias`) y no
 * se pintaba en ningún sitio: la pantalla decía «los montos no son idénticos»
 * sin decir por cuánto, que es justo lo que hay que mirar para saber si es una
 * comisión bancaria o un pago equivocado.
 */
function textoDiferenciaMonto(diferencia: number): ReactNode {
  const d = Math.abs(Number(diferencia) || 0);
  if (d < 0.005) return "Coincide al centavo";
  return (
    <>
      <Money value={d} bold={false} /> de diferencia
    </>
  );
}

function textoDiferenciaDias(dias: number) {
  const d = Math.abs(Math.round(Number(dias) || 0));
  if (d === 0) return "mismo día";
  return d === 1 ? "1 día de separación" : `${d} días de separación`;
}

type NivelPuntaje = "alto" | "medio" | "bajo";

/** El nivel decide el color (en el CSS, por `data-nivel`) y el punto de la coincidencia. */
function nivelPuntaje(score: number, alto: number): NivelPuntaje {
  if (score >= alto) return "alto";
  if (score >= alto - 20) return "medio";
  return "bajo";
}

const TONO_PUNTAJE: Record<NivelPuntaje, Tone> = {
  alto: "success",
  medio: "warning",
  bajo: "neutral",
};

export default function ConciliacionPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [data, setData] = useState<Respuesta | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [movimientoId, setMovimientoId] = useState<number | null>(null);
  const [candidatoIdx, setCandidatoIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Lo que falló al conciliar: aviso junto al botón (además del toast). */
  const [errorAplicar, setErrorAplicar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cargaRef = useRef(0);
  /**
   * Cerrojo síncrono del envío. `aplicando` deshabilita el botón, pero entre el
   * clic y el repintado cabe un segundo clic —y sobre todo un segundo Enter,
   * que se repite solo si se deja pulsado—. Conciliar dos veces el mismo
   * movimiento no es un parpadeo: es un apunte duplicado.
   */
  const enVueloRef = useRef(false);
  const listaRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    const turno = ++cargaRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", String(accountId));
      if (desde) params.set("from", desde);
      if (hasta) params.set("to", hasta);
      const qs = params.toString();
      const res = await erpFetch<Respuesta>(
        `accounting/workspace/conciliacion/sugerencias${qs ? `?${qs}` : ""}`,
        token,
      );
      if (turno !== cargaRef.current) return;
      setData(res);
      if (res?.cuentaSeleccionada && res.cuentaSeleccionada !== accountId) {
        setAccountId(res.cuentaSeleccionada);
      }
    } catch (e) {
      if (turno !== cargaRef.current) return;
      setError(formatApiError(e));
      setData(null);
    } finally {
      if (turno === cargaRef.current) setLoading(false);
    }
  }, [token, accountId, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const movimientos = data?.movimientos ?? [];
  const resumen = data?.resumen;
  const scoreAlto = data?.parametros.scoreAlto ?? 80;

  const visibles = useMemo(
    () => (filtro === "TODOS" ? movimientos : movimientos.filter((m) => m.estado === filtro)),
    [movimientos, filtro],
  );

  const seleccionado = useMemo(() => {
    if (visibles.length === 0) return null;
    return visibles.find((m) => m.id === movimientoId) ?? visibles[0];
  }, [visibles, movimientoId]);

  useEffect(() => {
    setCandidatoIdx(0);
    setErrorAplicar(null);
    setAviso(null);
  }, [seleccionado?.id]);

  const candidatos = seleccionado?.candidatos ?? [];
  const candidato = candidatos[Math.min(candidatoIdx, Math.max(candidatos.length - 1, 0))] ?? null;

  const seleccionar = useCallback(
    (delta: number) => {
      if (visibles.length === 0) return;
      const actual = visibles.findIndex((m) => m.id === (seleccionado?.id ?? -1));
      const next = Math.min(Math.max((actual < 0 ? 0 : actual) + delta, 0), visibles.length - 1);
      setMovimientoId(visibles[next].id);
      // La lista tiene su propio scroll: sin esto, bajar con el teclado movía
      // la selección fuera de la vista y parecía que no pasaba nada.
      const fila = listaRef.current?.querySelectorAll("tbody tr")[next];
      fila?.scrollIntoView({ block: "nearest" });
    },
    [visibles, seleccionado],
  );

  const conciliar = useCallback(
    async (mov: Movimiento, cand: Candidato) => {
      if (enVueloRef.current) return;
      if (!token) {
        const msg = "No hay sesión activa. Vuelve a entrar para poder conciliar.";
        setErrorAplicar(msg);
        toast.error(msg);
        return;
      }
      if (mov.estado === "CONCILIADO") {
        setAviso("Este movimiento ya está conciliado. Elige otro de la lista.");
        return;
      }
      enVueloRef.current = true;
      setAplicando(true);
      setErrorAplicar(null);
      setAviso(null);
      try {
        await erpFetch("accounting/workspace/conciliacion/aplicar", token, {
          method: "POST",
          body: JSON.stringify({
            transactionId: mov.id,
            candidateKind: cand.tipo,
            candidateId: cand.id,
            score: cand.score,
          }),
        });
        toast.success(`Movimiento conciliado con ${cand.folio}`);
        await cargar();
      } catch (e) {
        // Toast inmediato + aviso junto al botón (el motivo debe quedar
        // visible al releer la pantalla).
        const msg = `No se pudo conciliar con ${cand.folio}. ${formatApiError(e)}`;
        setErrorAplicar(msg);
        toast.error(msg);
      } finally {
        enVueloRef.current = false;
        setAplicando(false);
      }
    },
    [token, cargar],
  );

  // Navegación de teclado: j/k o flechas para moverse, [ ] para cambiar de
  // candidato, Enter para conciliar el que está a la vista.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea" || target?.isContentEditable) {
        return;
      }
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        seleccionar(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        seleccionar(-1);
      } else if (e.key === "]" || e.key === "ArrowRight") {
        if (candidatos.length > 1) {
          e.preventDefault();
          setCandidatoIdx((i) => Math.min(i + 1, candidatos.length - 1));
        }
      } else if (e.key === "[" || e.key === "ArrowLeft") {
        if (candidatos.length > 1) {
          e.preventDefault();
          setCandidatoIdx((i) => Math.max(i - 1, 0));
        }
      } else if (e.key === "Enter") {
        if (!seleccionado) return;
        e.preventDefault();
        // Enter siempre contesta algo: conciliar, o por qué no se puede.
        if (seleccionado.estado === "CONCILIADO") {
          setAviso("Este movimiento ya está conciliado. Elige otro de la lista.");
        } else if (!candidato) {
          setAviso(
            "Este movimiento no se parece a ninguna factura ni pago registrado, así que no hay con qué conciliarlo. Captura el documento que falta y vuelve a esta pantalla.",
          );
        } else {
          void conciliar(seleccionado, candidato);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seleccionar, candidatos.length, seleccionado, candidato, conciliar]);

  const columnas: Column<Movimiento>[] = [
    {
      key: "fecha",
      label: "Fecha",
      width: 96,
      render: (r) => {
        const elegido = r.id === seleccionado?.id;
        return (
          <span className={styles.celdaFecha}>
            <span
              aria-hidden="true"
              className={`${styles.marca} ${elegido ? styles.marcaActiva : ""}`}
            />
            <span className={elegido ? styles.fechaActiva : styles.fechaTexto}>
              {fechaCorta(r.fecha)}
            </span>
          </span>
        );
      },
    },
    {
      key: "descripcion",
      label: "Movimiento",
      render: (r) => (
        <span className={styles.celdaMov}>
          <span className={styles.movNombre}>{r.descripcion || "Sin descripción"}</span>
          <span className={styles.movSub}>
            {[r.referencia, r.contraparte, r.speiTrackingKey].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
      ),
    },
    {
      key: "monto",
      label: "Monto",
      align: "right",
      numeric: true,
      width: 130,
      render: (r) => <Money value={r.esCargo ? -Math.abs(r.monto) : Math.abs(r.monto)} />,
    },
    {
      key: "estado",
      label: "Estado",
      width: 150,
      render: (r) => (
        <Badge
          dot
          size="sm"
          tone={ESTADO_TONO[r.estado]}
          title={
            r.candidatos.length > 0
              ? `${r.candidatos.length} ${
                  r.candidatos.length === 1 ? "posible coincidencia" : "posibles coincidencias"
                } · mejor puntaje ${r.candidatos[0].score} de 100`
              : "No se parece a ninguna factura ni pago"
          }
        >
          {estadoTexto(r.estado)}
        </Badge>
      ),
    },
  ];

  /**
   * Los contadores filtran la lista del banco. Cada chip lleva su cifra y el
   * punto del mismo tono que el estado de la fila; con cero, el punto se
   * apaga. La frase que los acompañaba («hay que elegir», «el monto no
   * cuadra»…) queda como ayuda al pasar el cursor.
   */
  const total = resumen?.total ?? 0;
  const contadores: Array<{ key: Filtro; label: string; value: number; hint?: string }> = [
    {
      key: "TODOS",
      label: "Todos",
      value: total,
      hint: resumen ? `${resumen.sugeridos} con sugerencia` : undefined,
    },
    {
      key: "SUGERENCIA_ALTA",
      label: "Sugerencia alta",
      value: resumen?.sugerenciaAlta ?? 0,
      hint: `puntaje ${scoreAlto} o más`,
    },
    {
      key: "SUGERENCIA_MULTIPLE",
      label: "Varias opciones",
      value: resumen?.sugerenciaMultiple ?? 0,
      hint: "hay que elegir",
    },
    {
      key: "DISCREPANCIA",
      label: "Discrepancias",
      value: resumen?.discrepancias ?? 0,
      hint: "el monto no cuadra",
    },
    {
      key: "PENDIENTE",
      label: "Pendientes",
      value: resumen?.pendientes ?? 0,
      hint: "sin coincidencia",
    },
    {
      key: "CONCILIADO",
      label: "Conciliados",
      value: resumen?.conciliados ?? 0,
      hint: "ya aplicados",
    },
  ];

  const sinCuentas = !loading && !error && (data?.cuentas.length ?? 0) === 0;
  /**
   * Hay cuenta, pero ni una línea del banco. No es lo mismo que no tener
   * cuenta: ya se puede operar y lo que falta es subir el estado de cuenta.
   * Los seis contadores en cero no lo dicen; una frase sí.
   */
  const sinMovimientos =
    !loading && !error && !sinCuentas && (data?.resumen.total ?? 0) === 0;
  const rango = data?.rango;
  const cuentaActiva = (data?.cuentas ?? []).find((c) => c.id === data?.cuenta?.id) ?? null;
  const parametros = data?.parametros;

  return (
    <MesaPagina
      titulo="Conciliación bancaria"
      descripcion="El banco a la izquierda, lo que NEXARA cree que es a la derecha. Tú confirmas."
      secundarias={<ButtonLink href="/erp/banking">Bancos</ButtonLink>}
    >
      {!sinCuentas ? (
        <Card as="div">
          <ModuleToolbar
            end={
              <Button variant="ghost" size="sm" onClick={() => void cargar()} disabled={loading}>
                Actualizar
              </Button>
            }
          >
            <Select
              aria-label="Cuenta bancaria"
              wrapperClassName={styles.filtroCuenta}
              controlSize="sm"
              value={accountId ?? ""}
              onChange={(e) => {
                setAccountId(Number(e.target.value) || null);
                setMovimientoId(null);
              }}
              disabled={(data?.cuentas.length ?? 0) === 0}
            >
              {(data?.cuentas ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {c.banco}
                </option>
              ))}
            </Select>
            <DateInput
              aria-label="Desde"
              className={styles.filtroFecha}
              controlSize="sm"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
            <DateInput
              aria-label="Hasta"
              className={styles.filtroFecha}
              controlSize="sm"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </ModuleToolbar>
        </Card>
      ) : null}

      {error && (
        <Alert
          tone="danger"
          role="alert"
          className={styles.alerta}
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        >
          {`No se pudieron cargar los movimientos del banco. ${error} Reintenta; si sigue igual, avisa a soporte.`}
        </Alert>
      )}

      {sinCuentas ? (
        <ListCard
          listLabel="Conciliación bancaria"
          empty
          emptyState={{
            icon: <AccountBalanceOutlinedIcon />,
            title: "Todavía no hay cuentas bancarias",
            description:
              "Para conciliar hace falta una cuenta con movimientos. Crea la cuenta en Bancos y sube el estado de cuenta (CSV); en cuanto haya movimientos, aquí aparecerán las sugerencias.",
            action: (
              <ButtonLink size="sm" href="/erp/banking">
                Ir a Bancos
              </ButtonLink>
            ),
          }}
        />
      ) : sinMovimientos ? (
        <ListCard
          listLabel="Conciliación bancaria"
          empty
          emptyState={
            <VacioConPrimerPaso
              title="La cuenta todavía no tiene movimientos"
              description={`${
                data?.cuenta ? `${data.cuenta.nombre} · ${data.cuenta.banco}` : "La cuenta elegida"
              } no trae ninguna línea${
                rango?.from || rango?.to
                  ? ` entre el ${fechaCorta(rango?.from)} y el ${fechaCorta(rango?.to)}`
                  : ""
              }. Sube el estado de cuenta en Bancos —o cambia las fechas de arriba— y aquí aparecerá cada cargo y abono con la factura o el pago que NEXARA cree que le corresponde.`}
              destino={DESTINOS.bancos}
            />
          }
        />
      ) : (
        <>
          <div className={styles.split}>
            <ListCard
              listLabel="Movimientos del banco"
              toolbar={
                <>
                  <CardHead
                    title="Movimientos del banco"
                    subtitle={
                      data?.cuenta ? (
                        <>
                          {data.cuenta.nombre} · {data.cuenta.banco} · {data.cuenta.moneda}
                          {cuentaActiva ? (
                            <>
                              {" "}
                              · saldo <Money value={cuentaActiva.saldo} bold={false} />
                            </>
                          ) : null}
                        </>
                      ) : undefined
                    }
                  />
                  <ModuleToolbar
                    chips={
                      <FilterChips ariaLabel="Filtrar por estado">
                        {contadores.map((c) => (
                          <FilterChip
                            key={c.key}
                            active={filtro === c.key}
                            count={c.value}
                            dot={
                              c.key === "TODOS" || c.value === 0 ? undefined : ESTADO_TONO[c.key]
                            }
                            title={c.hint}
                            onClick={() => {
                              setFiltro(filtro === c.key ? "TODOS" : c.key);
                              setMovimientoId(null);
                            }}
                          >
                            {c.label}
                          </FilterChip>
                        ))}
                      </FilterChips>
                    }
                  />
                </>
              }
              footer={
                // Qué periodo se está mirando: el API resuelve el rango cuando las
                // fechas van vacías, y hasta ahora no lo decía en ningún sitio.
                rango?.from || rango?.to ? (
                  <ListFooter>
                    <span>
                      Movimientos del {fechaCorta(rango?.from)} al {fechaCorta(rango?.to)}
                      {parametros ? (
                        <>
                          {" "}
                          · empareja con ±
                          <Money value={parametros.toleranciaMonto} bold={false} /> o ±
                          {parametros.toleranciaPorcentaje}% dentro de {parametros.ventanaDias} días
                        </>
                      ) : null}
                      .
                    </span>
                  </ListFooter>
                ) : undefined
              }
            >
              {loading ? (
                <div aria-busy="true">
                  <p className={styles.estado}>
                    {token
                      ? "Cargando movimientos y buscando coincidencias…"
                      : "Esperando la sesión para pedir los movimientos…"}
                  </p>
                  <SkeletonRows rows={4} label="Cargando movimientos" />
                </div>
              ) : (
                <div ref={listaRef}>
                  <DataTable
                    flush
                    columns={columnas}
                    rows={visibles}
                    rowKey={(r) => r.id}
                    density="compact"
                    ariaLabel="Conciliación bancaria"
                    onRowClick={(r) => setMovimientoId(r.id)}
                    emptyTitle={
                      filtro === "TODOS" ? "Sin movimientos" : "Sin resultados con este filtro"
                    }
                    emptyDescription={
                      filtro === "TODOS"
                        ? "No hay movimientos en el rango elegido. Cambia las fechas o importa el estado de cuenta desde Bancos."
                        : "Ningún movimiento está en ese estado ahora mismo. Elige otro de los estados de arriba."
                    }
                  />
                </div>
              )}
            </ListCard>

            <div className={styles.match}>
              <Card aria-label="Coincidencia en NEXARA">
                <CardHead title="Coincidencia en NEXARA" subtitle={<AyudaTeclado />} />
                {!seleccionado ? (
                  <EmptyState
                    size="compact"
                    icon={<TouchAppOutlinedIcon />}
                    title="Elige un movimiento"
                    description="Selecciona un movimiento del banco para ver con qué factura o pago coincide."
                  />
                ) : (
                  <div className={styles.cuerpo}>
                    <div className={styles.movimiento}>
                      <span className={styles.movimientoRotulo}>
                        Movimiento del banco · {seleccionado.esCargo ? "cargo" : "abono"}
                      </span>
                      <strong className={styles.movimientoTitulo}>
                        {seleccionado.descripcion || "Sin descripción"}
                      </strong>
                      <span className={styles.movimientoMeta}>
                        {fechaCorta(seleccionado.fecha)} ·{" "}
                        <Money
                          value={
                            seleccionado.esCargo
                              ? -Math.abs(seleccionado.monto)
                              : Math.abs(seleccionado.monto)
                          }
                          bold={false}
                        />
                        {seleccionado.referencia ? ` · ref. ${seleccionado.referencia}` : ""}
                      </span>
                      {/* Concepto, RFC y clave de rastreo venían del API y no se
                          pintaban en ningún sitio; son lo que permite reconocer
                          un cargo cuando la descripción del banco no dice nada. */}
                      {(seleccionado.concepto ||
                        seleccionado.contraparte ||
                        seleccionado.contraparteRfc ||
                        seleccionado.speiTrackingKey) && (
                        <span className={styles.movimientoExtra}>
                          {[
                            seleccionado.concepto,
                            seleccionado.contraparte,
                            seleccionado.contraparteRfc,
                            seleccionado.speiTrackingKey
                              ? `clave ${seleccionado.speiTrackingKey}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </div>

                    {/* La respuesta del último intento, donde se pulsó. */}
                    {errorAplicar && (
                      <Alert
                        tone="danger"
                        role="alert"
                        className={styles.alerta}
                        onDismiss={() => setErrorAplicar(null)}
                        action={
                          <Button size="sm" onClick={() => void cargar()}>
                            Reintentar
                          </Button>
                        }
                      >
                        {errorAplicar}
                      </Alert>
                    )}
                    {aviso && (
                      <Alert
                        tone="info"
                        role="alert"
                        className={styles.alerta}
                        onDismiss={() => setAviso(null)}
                      >
                        {aviso}
                      </Alert>
                    )}

                    {seleccionado.estado === "CONCILIADO" ? (
                      <Alert tone="success" role="alert" className={styles.alerta}>
                        {`Conciliado${
                          seleccionado.conciliacion
                            ? ` por ${formatPesos(seleccionado.conciliacion.montoConciliado)}`
                            : ""
                        }${
                          seleccionado.conciliacion?.conciliadoPor
                            ? ` · ${seleccionado.conciliacion.conciliadoPor.nombre}`
                            : ""
                        }${
                          seleccionado.conciliacion?.conciliadoEn
                            ? ` · ${fechaCorta(seleccionado.conciliacion.conciliadoEn)}`
                            : ""
                        }${seleccionado.conciliacion?.notas ? ` · ${seleccionado.conciliacion.notas}` : ""}`}
                      </Alert>
                    ) : candidatos.length === 0 ? (
                      <EmptyState
                        size="compact"
                        icon={<LinkOffOutlinedIcon />}
                        title="Sin coincidencias"
                        description={
                          <>
                            No hay factura ni pago con un monto parecido (±
                            <Money value={parametros?.toleranciaMonto ?? 0} bold={false} /> o ±
                            {parametros?.toleranciaPorcentaje ?? 0}%) dentro de{" "}
                            {parametros?.ventanaDias ?? 0} días. Revisa si falta capturar el
                            documento en NEXARA.
                          </>
                        }
                      />
                    ) : (
                      <>
                        {seleccionado.estado === "DISCREPANCIA" && candidato && (
                          <Alert tone="warning" role="alert" className={styles.alerta}>
                            {`Los montos no son idénticos: ${
                              Math.abs(Number(candidato.diferenciaMonto) || 0) < 0.005
                                ? "Coincide al centavo"
                                : `${formatPesos(Math.abs(Number(candidato.diferenciaMonto) || 0))} de diferencia`
                            } contra ${candidato.folio}. Revisa comisiones o retenciones antes de conciliar.`}
                          </Alert>
                        )}
                        {candidatos.length > 1 && (
                          <div className={styles.coincidencias}>
                            <span className={styles.coincidenciasRotulo}>
                              Coincidencia {Math.min(candidatoIdx, candidatos.length - 1) + 1} de{" "}
                              {candidatos.length} · ordenadas de más a menos parecida
                            </span>
                            <FilterChips ariaLabel="Coincidencias posibles">
                              {candidatos.map((c, i) => (
                                <FilterChip
                                  key={`${c.tipo}-${c.id}`}
                                  active={i === candidatoIdx}
                                  count={c.score}
                                  dot={TONO_PUNTAJE[nivelPuntaje(c.score, scoreAlto)]}
                                  onClick={() => setCandidatoIdx(i)}
                                >
                                  {c.folio}
                                </FilterChip>
                              ))}
                            </FilterChips>
                          </div>
                        )}

                        {candidato && (
                          <div className={styles.candidato}>
                            <div className={styles.candidatoCabeza}>
                              <div className={styles.candidatoDatos}>
                                <strong className={styles.candidatoTitulo}>
                                  {candidato.tipo === "INVOICE" ? "Factura" : "Pago"} {candidato.folio}
                                </strong>
                                <span className={styles.candidatoParte}>
                                  {candidato.contraparte || "Sin nombre registrado"}
                                  {candidato.contraparteRfc ? ` · ${candidato.contraparteRfc}` : ""}
                                </span>
                                {candidato.proyecto && (
                                  <span className={styles.candidatoDetalle}>
                                    Proyecto: {candidato.proyecto}
                                  </span>
                                )}
                                {candidato.tipo === "PAYMENT" && candidato.factura && (
                                  <span className={styles.candidatoDetalle}>
                                    Aplica a la factura {candidato.factura}
                                  </span>
                                )}
                                <span className={styles.candidatoDetalle}>
                                  {fechaCorta(candidato.fecha)}
                                  {candidato.vencimiento
                                    ? ` · vence ${fechaCorta(candidato.vencimiento)}`
                                    : ""}
                                </span>
                              </div>
                              <div className={styles.candidatoMonto}>
                                <Money value={candidato.monto} />
                                <Puntaje score={candidato.score} alto={scoreAlto} />
                              </div>
                            </div>

                            {/* En qué se separan el movimiento y el candidato. El
                                API lo manda por candidato y no se pintaba: sin
                                esto, «no son idénticos» no dice por cuánto. */}
                            <div
                              className={`${styles.diferencias} ${
                                Math.abs(candidato.diferenciaMonto) >= 0.005
                                  ? styles.diferenciasAlerta
                                  : ""
                              }`}
                            >
                              <span>{textoDiferenciaMonto(candidato.diferenciaMonto)}</span>
                              <span className={styles.diferenciaDias}>
                                {textoDiferenciaDias(candidato.diferenciaDias)}
                              </span>
                              <span className={styles.diferenciaSentido}>
                                {candidato.sentido === "IN" ? "entra dinero" : "sale dinero"}
                              </span>
                            </div>

                            <div className={styles.razones}>
                              <span className={styles.razonesTitulo}>Por qué coinciden</span>
                              <ul className={styles.razonesLista}>
                                {candidato.razones.length === 0 ? (
                                  <li className={styles.razonSin}>
                                    NEXARA no anotó en qué se parecen. Compara el monto y la
                                    fecha antes de conciliar.
                                  </li>
                                ) : (
                                  candidato.razones.map((r) => (
                                    <li key={r} className={styles.razon}>
                                      <span aria-hidden="true" className={styles.razonPunto}>
                                        ·
                                      </span>
                                      <span>{r}</span>
                                    </li>
                                  ))
                                )}
                              </ul>
                            </div>

                            <Button
                              size="sm"
                              variant="primary"
                              fullWidth
                              loading={aplicando}
                              disabled={aplicando}
                              onClick={() => void conciliar(seleccionado, candidato)}
                            >
                              {aplicando
                                ? "Conciliando…"
                                : `Conciliar con ${candidato.folio}`}
                            </Button>
                            <span className={styles.notaAtajo}>
                              {aplicando ? "Aplicando el movimiento, no cierres la pantalla." : "o pulsa Enter"}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Al moverse con el teclado, la selección cambia en una tabla que
              no tiene foco: sin esto, un lector de pantalla no se entera. */}
          <p aria-live="polite" className={styles.srOnly}>
            {seleccionado
              ? `Movimiento seleccionado: ${seleccionado.descripcion || "sin descripción"}, ${
                  estadoTexto(seleccionado.estado)
                }, ${candidatos.length} ${
                  candidatos.length === 1 ? "coincidencia posible" : "coincidencias posibles"
                }.`
              : "Ningún movimiento seleccionado."}
          </p>
        </>
      )}
    </MesaPagina>
  );
}

/**
 * El puntaje, con la barra debajo: el número dice cuánto confía el sistema y
 * la barra lo vuelve comparable entre candidatos sin leer dos cifras.
 */
function Puntaje({ score, alto }: { score: number; alto: number }) {
  const ancho = Math.max(0, Math.min(100, score));
  return (
    <span className={styles.puntaje} data-nivel={nivelPuntaje(score, alto)}>
      <span
        className={styles.puntajeCifra}
        title={score >= alto ? "Coincidencia fuerte" : "Revisa antes de conciliar"}
      >
        {score} / 100
      </span>
      <span aria-hidden="true" className={styles.puntajeBarra}>
        <span className={styles.puntajeRelleno} style={{ width: `${ancho}%` }} />
      </span>
    </span>
  );
}

function Tecla({ children }: { children: ReactNode }) {
  return <kbd className={styles.tecla}>{children}</kbd>;
}

/** La navegación por teclado existe; aquí se ve, en una línea discreta. */
function AyudaTeclado() {
  return (
    <span className={styles.ayuda}>
      <span className={styles.ayudaGrupo}>
        <Tecla>↑</Tecla>
        <Tecla>↓</Tecla> movimiento
      </span>
      <span className={styles.ayudaGrupo}>
        <Tecla>[</Tecla>
        <Tecla>]</Tecla> coincidencia
      </span>
      <span className={styles.ayudaGrupo}>
        <Tecla>Enter</Tecla> concilia
      </span>
    </span>
  );
}
