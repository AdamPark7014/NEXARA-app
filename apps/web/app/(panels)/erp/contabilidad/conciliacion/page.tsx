"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import FilterScale, { type ScaleItem } from "@/components/ui/FilterScale";
import { useUser } from "@/components/UserContext";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";
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
const ESTADO_TONO: Record<Estado, StatusTone> = {
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

/** Pesos en texto plano — solo para `message`/atributos string de InlineAlert. */
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

function scoreColor(score: number, alto: number) {
  if (score >= alto) return "var(--state-success-text, #15803d)";
  if (score >= alto - 20) return "var(--state-warning-text, #b45309)";
  return "var(--text-secondary)";
}

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
  /** Lo que falló al conciliar: InlineAlert junto al botón (además del toast). */
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
        // Toast inmediato + InlineAlert junto al botón (el motivo debe quedar
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
          setAviso("Este movimiento no tiene candidatos: no hay nada con qué conciliarlo.");
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
      render: (r) => (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden="true"
            style={{
              width: 3,
              height: 16,
              borderRadius: 2,
              background: r.id === seleccionado?.id ? "var(--primary)" : "transparent",
            }}
          />
          <span style={{ fontWeight: r.id === seleccionado?.id ? 700 : 500 }}>
            {fechaCorta(r.fecha)}
          </span>
        </span>
      ),
    },
    {
      key: "descripcion",
      label: "Movimiento",
      render: (r) => (
        <span style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{r.descripcion || "Sin descripción"}</span>
          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
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
        <StatusDot
          label={estadoTexto(r.estado)}
          tone={ESTADO_TONO[r.estado]}
          title={
            r.candidatos.length > 0
              ? `${r.candidatos.length} candidato(s) · mejor puntaje ${r.candidatos[0].score}`
              : "Sin candidatos"
          }
        />
      ),
    },
  ];

  /**
   * Los contadores son la misma pieza que la escala de antigüedad de la
   * cartera: se había escrito dos veces. Ahora los dos sitios usan
   * `FilterScale`, para que la tercera vez no salga distinta.
   */
  const total = resumen?.total ?? 0;
  const parte = (n: number) => (total > 0 ? n / total : undefined);
  const contadores: Array<ScaleItem & { key: Filtro }> = [
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
      share: parte(resumen?.sugerenciaAlta ?? 0),
    },
    {
      key: "SUGERENCIA_MULTIPLE",
      label: "Varias opciones",
      value: resumen?.sugerenciaMultiple ?? 0,
      hint: "hay que elegir",
      tone: (resumen?.sugerenciaMultiple ?? 0) > 0 ? "warning" : "mute",
      share: parte(resumen?.sugerenciaMultiple ?? 0),
    },
    {
      key: "DISCREPANCIA",
      label: "Discrepancias",
      value: resumen?.discrepancias ?? 0,
      hint: "el monto no cuadra",
      tone: (resumen?.discrepancias ?? 0) > 0 ? "danger" : "mute",
      share: parte(resumen?.discrepancias ?? 0),
    },
    {
      key: "PENDIENTE",
      label: "Pendientes",
      value: resumen?.pendientes ?? 0,
      hint: "sin candidato",
      share: parte(resumen?.pendientes ?? 0),
    },
    {
      key: "CONCILIADO",
      label: "Conciliados",
      value: resumen?.conciliados ?? 0,
      hint: "ya aplicados",
      tone: (resumen?.conciliados ?? 0) > 0 ? "success" : "mute",
      share: parte(resumen?.conciliados ?? 0),
    },
  ];

  const sinCuentas = !loading && !error && (data?.cuentas.length ?? 0) === 0;
  const rango = data?.rango;
  const cuentaActiva = (data?.cuentas ?? []).find((c) => c.id === data?.cuenta?.id) ?? null;
  const parametros = data?.parametros;

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Conciliación bancaria"
        subtitle="El banco a la izquierda, lo que NEXARA cree que es a la derecha. Tú confirmas."
        density="ops"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              aria-label="Cuenta bancaria"
              value={accountId ?? ""}
              onChange={(e) => {
                setAccountId(Number(e.target.value) || null);
                setMovimientoId(null);
              }}
              disabled={(data?.cuentas.length ?? 0) === 0}
              style={selectStyle}
            >
              {(data?.cuentas ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {c.banco}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label="Desde"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              style={selectStyle}
            />
            <input
              type="date"
              aria-label="Hasta"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              style={selectStyle}
            />
            <Link href="/erp/banking" style={linkStyle}>
              Bancos
            </Link>
            <Button size="sm" variant="ghost" onClick={() => void cargar()} disabled={loading}>
              Actualizar
            </Button>
          </div>
        }
      />

      {error && <InlineAlert message={error} variant="danger" onDismiss={() => setError(null)} />}

      {sinCuentas ? (
        <Section dense>
          <EmptyState
            title="Todavía no hay cuentas bancarias"
            description="Para conciliar hace falta una cuenta con movimientos. Crea la cuenta en Bancos y sube el estado de cuenta (CSV); en cuanto haya movimientos, aquí aparecerán las sugerencias."
            action={
              <Link href="/erp/banking" style={{ textDecoration: "none" }}>
                <Button size="sm">Ir a Bancos</Button>
              </Link>
            }
          />
        </Section>
      ) : (
        <>
          <FilterScale
            ariaLabel="Filtrar por estado"
            items={contadores}
            active={filtro}
            onSelect={(clave) => {
              setFiltro((clave || "TODOS") as Filtro);
              setMovimientoId(null);
            }}
          />

          {/* Qué periodo se está mirando: el API resuelve el rango cuando las
              fechas van vacías, y hasta ahora no lo decía en ningún sitio. */}
          {(rango?.from || rango?.to) && (
            <p
              style={{
                margin: "-6px 0 12px",
                fontSize: 12,
                color: "var(--text-tertiary)",
              }}
            >
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
            </p>
          )}

          <div className={styles.split}>
            <Section
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
              dense
              flush
            >
              {loading ? (
                <p style={{ padding: 16, fontSize: 13, color: "var(--text-tertiary)" }}>
                  {token
                    ? "Cargando movimientos y buscando coincidencias…"
                    : "Esperando la sesión para pedir los movimientos…"}
                </p>
              ) : (
                <div ref={listaRef}>
                  <DataTable
                    columns={columnas}
                    rows={visibles}
                    rowKey={(r) => r.id}
                    density="compact"
                    onRowClick={(r) => setMovimientoId(r.id)}
                    emptyTitle={filtro === "TODOS" ? "Sin movimientos" : "Nada en este filtro"}
                    emptyDescription={
                      filtro === "TODOS"
                        ? "No hay movimientos en el rango elegido. Cambia las fechas o importa el estado de cuenta desde Bancos."
                        : "Ningún movimiento está en ese estado ahora mismo. Prueba con otro contador de arriba."
                    }
                  />
                </div>
              )}
            </Section>

            <div className={styles.match}>
              <Section title="Coincidencia en NEXARA" subtitle={<AyudaTeclado />} dense>
                {!seleccionado ? (
                  <EmptyState
                    variant="compact"
                    title="Elige un movimiento"
                    description="Selecciona un movimiento del banco para ver con qué factura o pago coincide."
                  />
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div
                      style={{
                        display: "grid",
                        gap: 3,
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "var(--surface-2)",
                        border: "1px solid var(--nx-panel-hairline, var(--border))",
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        Movimiento del banco · {seleccionado.esCargo ? "cargo" : "abono"}
                      </span>
                      <strong style={{ fontSize: 14, lineHeight: 1.3 }}>
                        {seleccionado.descripcion || "Sin descripción"}
                      </strong>
                      <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
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
                        <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
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
                      <InlineAlert
                        variant="danger"
                        style={{ marginBottom: 0 }}
                        message={errorAplicar}
                        onDismiss={() => setErrorAplicar(null)}
                        action={
                          <Button size="sm" variant="secondary" onClick={() => void cargar()}>
                            Recargar
                          </Button>
                        }
                      />
                    )}
                    {aviso && (
                      <InlineAlert
                        variant="info"
                        style={{ marginBottom: 0 }}
                        message={aviso}
                        onDismiss={() => setAviso(null)}
                      />
                    )}

                    {seleccionado.estado === "CONCILIADO" ? (
                      <InlineAlert
                        variant="success"
                        style={{ marginBottom: 0 }}
                        message={`Conciliado${
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
                      />
                    ) : candidatos.length === 0 ? (
                      <EmptyState
                        variant="compact"
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
                          <InlineAlert
                            variant="warning"
                            style={{ marginBottom: 0 }}
                            message={`Los montos no son idénticos: ${
                              Math.abs(Number(candidato.diferenciaMonto) || 0) < 0.005
                                ? "Coincide al centavo"
                                : `${formatPesos(Math.abs(Number(candidato.diferenciaMonto) || 0))} de diferencia`
                            } contra ${candidato.folio}. Revisa comisiones o retenciones antes de conciliar.`}
                          />
                        )}
                        {candidatos.length > 1 && (
                          <div style={{ display: "grid", gap: 5 }}>
                            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                              Candidato {Math.min(candidatoIdx, candidatos.length - 1) + 1} de{" "}
                              {candidatos.length} · ordenados por puntaje
                            </span>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {candidatos.map((c, i) => {
                                const activo = i === candidatoIdx;
                                return (
                                  <button
                                    key={`${c.tipo}-${c.id}`}
                                    type="button"
                                    onClick={() => setCandidatoIdx(i)}
                                    aria-pressed={activo}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "baseline",
                                      gap: 6,
                                      fontSize: 11.5,
                                      padding: "4px 9px",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      background: activo
                                        ? "color-mix(in srgb, var(--primary) 10%, var(--surface))"
                                        : "transparent",
                                      border: `1px solid ${
                                        activo
                                          ? "color-mix(in srgb, var(--primary) 40%, var(--border))"
                                          : "var(--border)"
                                      }`,
                                      color: "var(--text-primary)",
                                      fontWeight: activo ? 700 : 500,
                                    }}
                                  >
                                    {c.folio}
                                    <span
                                      style={{
                                        fontSize: 10.5,
                                        fontWeight: 600,
                                        fontVariantNumeric: "tabular-nums",
                                        color: scoreColor(c.score, scoreAlto),
                                      }}
                                    >
                                      {c.score}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {candidato && (
                          <div
                            style={{
                              border: "1px solid var(--border)",
                              borderRadius: 10,
                              padding: 12,
                              display: "grid",
                              gap: 10,
                              background: "var(--surface)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: 10,
                              }}
                            >
                              <div style={{ display: "grid", gap: 2 }}>
                                <strong style={{ fontSize: 14 }}>
                                  {candidato.tipo === "INVOICE" ? "Factura" : "Pago"} {candidato.folio}
                                </strong>
                                <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                                  {candidato.contraparte || "Sin contraparte"}
                                  {candidato.contraparteRfc ? ` · ${candidato.contraparteRfc}` : ""}
                                </span>
                                {candidato.proyecto && (
                                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                                    Proyecto: {candidato.proyecto}
                                  </span>
                                )}
                                {candidato.tipo === "PAYMENT" && candidato.factura && (
                                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                                    Aplica a la factura {candidato.factura}
                                  </span>
                                )}
                                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                                  {fechaCorta(candidato.fecha)}
                                  {candidato.vencimiento
                                    ? ` · vence ${fechaCorta(candidato.vencimiento)}`
                                    : ""}
                                </span>
                              </div>
                              <div style={{ textAlign: "right", display: "grid", gap: 4 }}>
                                <Money value={candidato.monto} />
                                <Puntaje score={candidato.score} alto={scoreAlto} />
                              </div>
                            </div>

                            {/* En qué se separan el movimiento y el candidato. El
                                API lo manda por candidato y no se pintaba: sin
                                esto, «no son idénticos» no dice por cuánto. */}
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "4px 12px",
                                fontSize: 12,
                                color:
                                  Math.abs(candidato.diferenciaMonto) >= 0.005
                                    ? "var(--state-warning-text, #b45309)"
                                    : "var(--text-secondary)",
                              }}
                            >
                              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                                {textoDiferenciaMonto(candidato.diferenciaMonto)}
                              </span>
                              <span
                                style={{
                                  fontVariantNumeric: "tabular-nums",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {textoDiferenciaDias(candidato.diferenciaDias)}
                              </span>
                              <span style={{ color: "var(--text-tertiary)" }}>
                                {candidato.sentido === "IN" ? "entra dinero" : "sale dinero"}
                              </span>
                            </div>

                            <div style={{ display: "grid", gap: 5 }}>
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "var(--text-tertiary)",
                                }}
                              >
                                Por qué coinciden
                              </span>
                              <ul
                                style={{
                                  margin: 0,
                                  padding: 0,
                                  listStyle: "none",
                                  display: "grid",
                                  gap: 4,
                                  fontSize: 12.5,
                                  lineHeight: 1.4,
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {candidato.razones.length === 0 ? (
                                  <li style={{ color: "var(--text-tertiary)" }}>
                                    El emparejador no devolvió motivos para esta coincidencia.
                                  </li>
                                ) : (
                                  candidato.razones.map((r) => (
                                    <li
                                      key={r}
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "10px minmax(0, 1fr)",
                                        gap: 8,
                                        alignItems: "baseline",
                                      }}
                                    >
                                      <span
                                        aria-hidden="true"
                                        style={{ color: "var(--text-tertiary)" }}
                                      >
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
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--text-tertiary)",
                                textAlign: "center",
                              }}
                            >
                              {aplicando ? "Aplicando el movimiento, no cierres la pantalla." : "o pulsa Enter"}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Section>
            </div>
          </div>

          {/* Al moverse con el teclado, la selección cambia en una tabla que
              no tiene foco: sin esto, un lector de pantalla no se entera. */}
          <p aria-live="polite" className={styles.srOnly}>
            {seleccionado
              ? `Movimiento seleccionado: ${seleccionado.descripcion || "sin descripción"}, ${
                  estadoTexto(seleccionado.estado)
                }, ${candidatos.length} candidato${candidatos.length === 1 ? "" : "s"}.`
              : "Ningún movimiento seleccionado."}
          </p>
        </>
      )}
    </>
  );
}

/**
 * El puntaje, con la barra debajo: el número dice cuánto confía el sistema y
 * la barra lo vuelve comparable entre candidatos sin leer dos cifras.
 */
function Puntaje({ score, alto }: { score: number; alto: number }) {
  const color = scoreColor(score, alto);
  const ancho = Math.max(0, Math.min(100, score));
  return (
    <span style={{ display: "grid", gap: 3, justifyItems: "end" }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color,
        }}
        title={score >= alto ? "Coincidencia fuerte" : "Revisa antes de conciliar"}
      >
        {score} / 100
      </span>
      <span
        aria-hidden="true"
        style={{
          width: 88,
          height: 3,
          borderRadius: 2,
          background: "var(--surface-2)",
          overflow: "hidden",
        }}
      >
        <span
          style={{ display: "block", width: `${ancho}%`, height: "100%", background: color }}
        />
      </span>
    </span>
  );
}

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: "inline-block",
        minWidth: 16,
        padding: "0 4px",
        borderRadius: 4,
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        fontSize: 10.5,
        fontFamily: "inherit",
        fontWeight: 600,
        lineHeight: "16px",
        textAlign: "center",
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </kbd>
  );
}

/** La navegación por teclado existe; aquí se ve, en una línea discreta. */
function AyudaTeclado() {
  return (
    <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <Tecla>↑</Tecla>
        <Tecla>↓</Tecla> movimiento
      </span>
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <Tecla>[</Tecla>
        <Tecla>]</Tecla> candidato
      </span>
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <Tecla>Enter</Tecla> concilia
      </span>
    </span>
  );
}

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-primary)",
};

const linkStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 8,
  textDecoration: "none",
  color: "var(--text-secondary)",
};
