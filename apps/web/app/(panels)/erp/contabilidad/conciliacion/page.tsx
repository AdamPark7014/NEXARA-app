"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import { useUser } from "@/components/UserContext";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";

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

function fechaCorta(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" });
}

type Tono = "warning" | "danger";

const TONO_CONTADOR: Record<Tono, string> = {
  warning: "var(--state-warning-text, #b45309)",
  danger: "var(--state-danger-text, #b91c1c)",
};

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
  const cargaRef = useRef(0);

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
  }, [seleccionado?.id]);

  const candidatos = seleccionado?.candidatos ?? [];
  const candidato = candidatos[Math.min(candidatoIdx, Math.max(candidatos.length - 1, 0))] ?? null;

  const seleccionar = useCallback(
    (delta: number) => {
      if (visibles.length === 0) return;
      const actual = visibles.findIndex((m) => m.id === (seleccionado?.id ?? -1));
      const next = Math.min(Math.max((actual < 0 ? 0 : actual) + delta, 0), visibles.length - 1);
      setMovimientoId(visibles[next].id);
    },
    [visibles, seleccionado],
  );

  const conciliar = useCallback(
    async (mov: Movimiento, cand: Candidato) => {
      if (!token || aplicando) return;
      setAplicando(true);
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
        toast.error(formatApiError(e));
      } finally {
        setAplicando(false);
      }
    },
    [token, aplicando, cargar],
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
        if (seleccionado && candidato && seleccionado.estado !== "CONCILIADO") {
          e.preventDefault();
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
          label={ESTADO_LABEL[r.estado]}
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

  const contadores: Array<{ key: Filtro; label: string; valor: number; tono?: Tono }> = [
    { key: "TODOS", label: "Todos", valor: resumen?.total ?? 0 },
    { key: "SUGERENCIA_ALTA", label: "Sugerencia alta", valor: resumen?.sugerenciaAlta ?? 0 },
    {
      key: "SUGERENCIA_MULTIPLE",
      label: "Varias opciones",
      valor: resumen?.sugerenciaMultiple ?? 0,
      tono: "warning",
    },
    {
      key: "DISCREPANCIA",
      label: "Discrepancias",
      valor: resumen?.discrepancias ?? 0,
      tono: "danger",
    },
    { key: "PENDIENTE", label: "Pendientes", valor: resumen?.pendientes ?? 0 },
    { key: "CONCILIADO", label: "Conciliados", valor: resumen?.conciliados ?? 0 },
  ];

  const sinCuentas = !loading && !error && (data?.cuentas.length ?? 0) === 0;

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
          <div
            role="group"
            aria-label="Filtrar por estado"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))",
              border: "1px solid var(--nx-panel-hairline, var(--border))",
              borderRadius: 10,
              overflow: "hidden",
              background: "var(--surface)",
              marginBottom: 14,
            }}
          >
            {contadores.map((c, i) => {
              const activo = filtro === c.key;
              const color =
                c.valor > 0 && c.tono ? TONO_CONTADOR[c.tono] : "var(--text-primary)";
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setFiltro(c.key);
                    setMovimientoId(null);
                  }}
                  aria-pressed={activo}
                  style={{
                    display: "grid",
                    gap: 2,
                    padding: "10px 14px",
                    cursor: "pointer",
                    textAlign: "left",
                    font: "inherit",
                    border: "none",
                    borderRight:
                      i < contadores.length - 1
                        ? "1px solid var(--nx-panel-hairline, var(--border))"
                        : undefined,
                    boxShadow: activo ? "inset 0 -2px 0 var(--primary)" : undefined,
                    background: activo
                      ? "color-mix(in srgb, var(--primary) 7%, var(--surface))"
                      : "transparent",
                    color: "var(--text-primary)",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{c.label}</span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 20,
                      lineHeight: 1.15,
                      fontVariantNumeric: "tabular-nums",
                      color,
                    }}
                  >
                    {c.valor}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
              gap: 14,
              alignItems: "start",
            }}
          >
            <Section
              title="Movimientos del banco"
              subtitle={
                data?.cuenta
                  ? `${data.cuenta.nombre} · ${data.cuenta.banco} · ${data.cuenta.moneda}`
                  : undefined
              }
              dense
              flush
            >
              {loading ? (
                <p style={{ padding: 16, fontSize: 13, color: "var(--text-tertiary)" }}>
                  Cargando movimientos y buscando coincidencias…
                </p>
              ) : (
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
              )}
            </Section>

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
                      Movimiento del banco
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
                  </div>

                  {seleccionado.estado === "CONCILIADO" ? (
                    <InlineAlert
                      variant="success"
                      style={{ marginBottom: 0 }}
                      message={`Conciliado${
                        seleccionado.conciliacion?.conciliadoPor
                          ? ` por ${seleccionado.conciliacion.conciliadoPor.nombre}`
                          : ""
                      }${
                        seleccionado.conciliacion?.conciliadoEn
                          ? ` el ${fechaCorta(seleccionado.conciliacion.conciliadoEn)}`
                          : ""
                      }${seleccionado.conciliacion?.notas ? ` · ${seleccionado.conciliacion.notas}` : ""}`}
                    />
                  ) : candidatos.length === 0 ? (
                    <EmptyState
                      variant="compact"
                      title="Sin coincidencias"
                      description={`No hay factura ni pago con un monto parecido (±$${
                        data?.parametros.toleranciaMonto ?? 0
                      }) dentro de ${data?.parametros.ventanaDias ?? 0} días. Revisa si falta capturar el documento en NEXARA.`}
                    />
                  ) : (
                    <>
                      {seleccionado.estado === "DISCREPANCIA" && (
                        <InlineAlert
                          variant="warning"
                          style={{ marginBottom: 0 }}
                          message="Los montos no son idénticos. Revisa comisiones o retenciones antes de conciliar."
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
                              </span>
                              {candidato.proyecto && (
                                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                                  Proyecto: {candidato.proyecto}
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
                              {candidato.razones.map((r) => (
                                <li
                                  key={r}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "10px minmax(0, 1fr)",
                                    gap: 8,
                                    alignItems: "baseline",
                                  }}
                                >
                                  <span aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>
                                    ·
                                  </span>
                                  <span>{r}</span>
                                </li>
                              ))}
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
                            Conciliar con {candidato.folio}
                          </Button>
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-tertiary)",
                              textAlign: "center",
                            }}
                          >
                            o pulsa Enter
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </Section>
          </div>
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
