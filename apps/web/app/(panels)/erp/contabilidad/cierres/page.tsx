"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import MetricStrip from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import { FinanceField, financeInputStyle } from "@/components/finance/FinanceModuleShell";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { useUser } from "@/components/UserContext";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";

type Period = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt?: string | null;
};

type EstadoItem = "ok" | "advertencia" | "bloqueante";

type ItemVerificacion = {
  id: string;
  etiqueta: string;
  descripcion: string;
  estado: EstadoItem;
  conteo: number;
  href: string | null;
};

type Checklist = {
  periodo: {
    id: number;
    nombre: string;
    inicio: string;
    fin: string;
    cerrado: boolean;
    cerradoEl: string | null;
  };
  items: ItemVerificacion[];
  bloqueantes: number;
  advertencias: number;
  puedeCerrar: boolean;
  requiereJustificacion: boolean;
  proteccion: { bloqueado: string[]; noBloqueado: string[] };
};

const MIN_JUSTIFICACION = 20;

/**
 * Lo que decide si el periodo puede cerrarse.
 *
 * Antes los tres estados llevaban un disco de color con un símbolo en blanco y
 * el renglón entero teñido: con diez puntos, la lista era un semáforo y el
 * bloqueante no se distinguía del aviso. Ahora lo resuelto se queda plano y
 * gris, y solo lo que impide cerrar lleva una regla roja al margen.
 */
const MARCA: Record<
  EstadoItem,
  { tono: StatusTone; color: string | null; texto: string; peso: number }
> = {
  ok: { tono: "neutral", color: null, texto: "Listo", peso: 2 },
  advertencia: {
    tono: "warning",
    color: "var(--state-warning-text, #b45309)",
    texto: "Revisar",
    peso: 1,
  },
  bloqueante: {
    tono: "danger",
    color: "var(--state-danger-text, #b91c1c)",
    texto: "Bloquea el cierre",
    peso: 0,
  },
};

const fecha = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function CierresPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [rows, setRows] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Period | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [closing, setClosing] = useState(false);
  /**
   * Lo que falló al cerrar. Antes solo salía en un toast: con el modal de
   * justificación abierto encima, el aviso pasaba por detrás y el periodo
   * parecía cerrado sin estarlo.
   */
  const [errorCierre, setErrorCierre] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [justificacion, setJustificacion] = useState("");
  const [intentado, setIntentado] = useState(false);
  /** Cerrojo síncrono: cerrar dos veces el mismo periodo no es inocuo. */
  const cierreEnVueloRef = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await erpFetch<Period[] | { items?: Period[] }>(
        "accounting/accounts/fiscal-periods",
        token,
      );
      setRows(Array.isArray(data) ? data : (data?.items ?? []));
    } catch (e) {
      setError(formatApiError(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const revisar = useCallback(
    async (period: Period) => {
      setSelected(period);
      setChecklist(null);
      setCheckError(null);
      setChecking(true);
      try {
        const data = await erpFetch<Checklist>(
          `accounting/workspace/cierres/${period.id}/checklist`,
          token,
        );
        setChecklist(data);
      } catch (e) {
        setCheckError(formatApiError(e));
      } finally {
        setChecking(false);
      }
    },
    [token],
  );

  async function cerrar(periodId: number, texto?: string) {
    if (cierreEnVueloRef.current) return;
    if (!selected) {
      setErrorCierre("No hay un periodo seleccionado. Vuelve a elegirlo en la lista.");
      return;
    }
    cierreEnVueloRef.current = true;
    setClosing(true);
    setErrorCierre(null);
    try {
      await erpFetch(`accounting/workspace/cierres/${periodId}/cerrar`, token, {
        method: "POST",
        body: JSON.stringify(texto ? { justificacion: texto } : {}),
      });
      toast.success(texto ? "Periodo cerrado con justificación" : "Periodo cerrado");
      setForceOpen(false);
      setJustificacion("");
      setIntentado(false);
      await load();
      const actualizado = { ...selected, isClosed: true };
      setSelected(actualizado);
      await revisar(actualizado);
    } catch (e) {
      // El modal de justificación se queda abierto con el motivo dentro: si se
      // cerrara, nadie sabría si el periodo quedó cerrado o no.
      setErrorCierre(`No se pudo cerrar el periodo. ${formatApiError(e)}`);
    } finally {
      cierreEnVueloRef.current = false;
      setClosing(false);
    }
  }

  /**
   * El diálogo de confirmación pinta el mensaje en un solo párrafo: los saltos
   * de línea y las viñetas que llevaba se veían como una frase corrida. El
   * detalle de qué se bloquea ya está en la pantalla, completo y en lista;
   * aquí va solo lo que hay que confirmar.
   */
  function pedirConfirmacion(lista: Checklist) {
    const cuantos = lista.proteccion.bloqueado.length;
    setConfirmState({
      title: `Cerrar ${lista.periodo.nombre}`,
      message:
        `Del ${fecha(lista.periodo.inicio)} al ${fecha(lista.periodo.fin)}. ` +
        `Al cerrar, el sistema impedirá ${cuantos} ${cuantos === 1 ? "operación" : "operaciones"} sobre el periodo ` +
        `—las tienes listadas en la pantalla— y solo dirección podrá reabrirlo.`,
      confirmLabel: "Cerrar periodo",
      danger: false,
      fn: () => cerrar(lista.periodo.id),
    });
  }

  const columns: Column<Period>[] = [
    { key: "name", label: "Periodo" },
    {
      key: "range",
      label: "Rango",
      render: (r) => `${fecha(r.startDate)} → ${fecha(r.endDate)}`,
    },
    {
      key: "status",
      label: "Estado",
      render: (r) => (
        <StatusDot
          label={r.isClosed ? `Cerrado ${fecha(r.closedAt)}` : "Abierto"}
          tone={r.isClosed ? "success" : "neutral"}
          title={r.isClosed ? "Solo dirección puede reabrirlo" : "Admite pólizas"}
        />
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          variant={selected?.id === r.id ? "secondary" : "ghost"}
          onClick={() => void revisar(r)}
          loading={checking && selected?.id === r.id}
        >
          {r.isClosed ? "Ver verificación" : "Revisar cierre"}
        </Button>
      ),
    },
  ];

  const bloqueado = (checklist?.bloqueantes ?? 0) > 0;
  const yaCerrado = checklist?.periodo.cerrado ?? false;
  /**
   * El API dice si este periodo exige justificación por escrito
   * (`requiereJustificacion`) y la pantalla lo ignoraba: decía «puedes cerrar»
   * y el servidor lo rechazaba sin que nadie supiera por qué.
   */
  const pideJustificacion = checklist?.requiereJustificacion ?? false;
  const conJustificacion = bloqueado || pideJustificacion;

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Cierres"
        subtitle="Revisa la lista de verificación antes de cerrar. Al cerrar se bloquean las pólizas del periodo."
        density="ops"
        actions={
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            Actualizar
          </Button>
        }
      />

      {error && (
        <InlineAlert
          message={`No se pudieron cargar los periodos. ${error}`}
          variant="danger"
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      )}

      <Section
        title="Periodos fiscales"
        subtitle="Elige el periodo que quieres cerrar para ver qué falta."
        flush
      >
        {loading ? (
          <p
            style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "16px 18px" }}
            aria-busy="true"
          >
            {token ? "Cargando periodos…" : "Esperando la sesión para pedir los periodos…"}
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Sin periodos"
            description="Crea un periodo fiscal desde Contabilidad general."
          />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} density="compact" />
        )}
      </Section>

      {selected && (
        <Section
          eyebrow="Lista de verificación"
          title={selected.name}
          subtitle={`${fecha(selected.startDate)} → ${fecha(selected.endDate)}`}
          actions={
            checklist && !yaCerrado ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={conJustificacion || closing}
                  loading={closing && !forceOpen}
                  onClick={() => pedirConfirmacion(checklist)}
                  title={
                    bloqueado
                      ? "Resuelve los puntos que bloquean el cierre o ciérralo con justificación"
                      : pideJustificacion
                        ? "Este periodo exige justificación por escrito"
                        : undefined
                  }
                >
                  Cerrar periodo
                </Button>
                {conJustificacion && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={closing}
                    onClick={() => {
                      setErrorCierre(null);
                      setIntentado(false);
                      setForceOpen(true);
                    }}
                  >
                    Cerrar con justificación
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          {checking && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }} aria-busy="true">
              Calculando pendientes…
            </p>
          )}
          {checkError && (
            <InlineAlert
              message={`No se pudo calcular la verificación. ${checkError}`}
              variant="danger"
              action={
                selected ? (
                  <Button size="sm" variant="secondary" onClick={() => void revisar(selected)}>
                    Reintentar
                  </Button>
                ) : undefined
              }
            />
          )}

          {/* El resultado del último intento de cierre, en la pantalla donde se
              pulsó y no en un toast que se va. */}
          {errorCierre && (
            <InlineAlert
              message={errorCierre}
              variant="danger"
              onDismiss={() => setErrorCierre(null)}
            />
          )}

          {checklist && (
            <>
              {yaCerrado ? (
                <InlineAlert
                  message={`Este periodo ya está cerrado${
                    checklist.periodo.cerradoEl ? ` desde el ${fecha(checklist.periodo.cerradoEl)}` : ""
                  }. Solo dirección puede reabrirlo.`}
                  variant="info"
                />
              ) : bloqueado ? (
                <InlineAlert
                  message={`Faltan ${checklist.bloqueantes} punto(s) que bloquean el cierre. Resuélvelos o cierra con una justificación por escrito.`}
                  variant="danger"
                />
              ) : pideJustificacion ? (
                <InlineAlert
                  message="Nada bloquea el cierre, pero este periodo exige una justificación por escrito para cerrarse."
                  variant="warning"
                />
              ) : (
                <InlineAlert
                  message="Todo lo que bloquea el cierre está resuelto. Puedes cerrar el periodo."
                  variant="success"
                />
              )}

              <div style={{ margin: "0 0 12px" }}>
                <MetricStrip
                  ariaLabel="Estado de la verificación"
                  metrics={[
                    {
                      label: "Bloquean el cierre",
                      value: String(checklist.bloqueantes),
                      tone: checklist.bloqueantes > 0 ? "danger" : "default",
                      hint:
                        checklist.bloqueantes > 0
                          ? "hay que resolverlos o justificar"
                          : "nada lo impide",
                    },
                    {
                      label: "Para revisar",
                      value: String(checklist.advertencias),
                      tone: checklist.advertencias > 0 ? "warning" : "default",
                      hint: "no impiden cerrar",
                    },
                    {
                      label: "Resueltos",
                      value: String(checklist.items.filter((i) => i.estado === "ok").length),
                      hint: `de ${checklist.items.length} puntos`,
                    },
                  ]}
                />
              </div>

              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
                {[...checklist.items]
                  .sort((a, b) => MARCA[a.estado].peso - MARCA[b.estado].peso)
                  .map((i) => {
                    const marca = MARCA[i.estado];
                    const pide = i.estado !== "ok";
                    return (
                      <li
                        key={i.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) auto",
                          gap: 12,
                          alignItems: "baseline",
                          padding: "10px 12px 10px 14px",
                          borderLeft: `2px solid ${marca.color ?? "transparent"}`,
                          borderBottom: "1px solid var(--nx-panel-hairline, var(--border))",
                          background: "transparent",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "baseline",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13.5,
                                fontWeight: pide ? 600 : 500,
                                color: pide ? "var(--text-primary)" : "var(--text-secondary)",
                              }}
                            >
                              {i.etiqueta}
                            </span>
                            {i.conteo > 0 && (
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  fontVariantNumeric: "tabular-nums",
                                  color: marca.color ?? "var(--text-secondary)",
                                }}
                              >
                                {i.conteo} pendiente{i.conteo === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                          <p
                            style={{
                              margin: "3px 0 0",
                              fontSize: 12,
                              color: "var(--text-tertiary)",
                              lineHeight: 1.45,
                            }}
                          >
                            {i.descripcion}
                          </p>
                          {i.conteo > 0 && i.href && (
                            <Link
                              href={i.href}
                              style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}
                            >
                              Ir a resolverlo →
                            </Link>
                          )}
                        </div>
                        {/* La palabra dice el estado, no el color: con la regla
                            roja invisible, «Bloquea el cierre» sigue leyéndose. */}
                        <StatusDot label={marca.texto} tone={marca.tono} wrap />
                      </li>
                    );
                  })}
              </ul>

              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border)",
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>Al cerrar se bloquea:</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {checklist.proteccion.bloqueado.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong style={{ color: "var(--warning, #b45309)" }}>
                    Hoy el cierre todavía NO bloquea:
                  </strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {checklist.proteccion.noBloqueado.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </Section>
      )}

      <Modal
        open={forceOpen}
        onClose={() => {
          setForceOpen(false);
          setErrorCierre(null);
          setIntentado(false);
        }}
        title={bloqueado ? "Cerrar con puntos pendientes" : "Cerrar con justificación"}
        dirty={justificacion.trim().length > 0}
        maxWidth={560}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button
              variant="ghost"
              onClick={() => {
                setForceOpen(false);
                setErrorCierre(null);
                setIntentado(false);
              }}
              disabled={closing}
            >
              Cancelar
            </Button>
            {/* Habilitado siempre: si se deshabilitara por falta de texto, el
                botón no reaccionaría y tampoco diría qué falta. Al pulsarlo,
                el campo lo explica debajo. */}
            <Button
              variant="danger"
              loading={closing}
              onClick={() => {
                setIntentado(true);
                if (!checklist) {
                  setErrorCierre("La verificación ya no está cargada. Vuelve a revisar el periodo.");
                  return;
                }
                if (justificacion.trim().length < MIN_JUSTIFICACION) return;
                void cerrar(checklist.periodo.id, justificacion.trim());
              }}
            >
              {closing ? "Cerrando…" : "Cerrar de todos modos"}
            </Button>
          </div>
        }
      >
        {errorCierre && (
          <InlineAlert
            variant="danger"
            message={errorCierre}
            onDismiss={() => setErrorCierre(null)}
          />
        )}
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Vas a cerrar <strong>{checklist?.periodo.nombre}</strong>
          {bloqueado
            ? ` con ${checklist?.bloqueantes ?? 0} punto(s) sin resolver`
            : ", que exige justificación por escrito"}
          . Escribe por qué; queda en la bitácora de auditoría con tu nombre, la fecha y el estado
          anterior del periodo.
        </p>
        {checklist && bloqueado && (
          <ul
            style={{
              margin: "0 0 12px",
              paddingLeft: 18,
              fontSize: 12.5,
              color: "var(--danger)",
            }}
          >
            {checklist.items
              .filter((i) => i.estado === "bloqueante")
              .map((i) => (
                <li key={i.id}>
                  {i.etiqueta}: {i.conteo}
                </li>
              ))}
          </ul>
        )}
        <FinanceField
          label="Justificación"
          hint={`Mínimo ${MIN_JUSTIFICACION} caracteres · llevas ${justificacion.trim().length}.`}
          error={
            justificacion.trim().length < MIN_JUSTIFICACION &&
            (intentado || justificacion.trim().length > 0)
              ? justificacion.trim().length === 0
                ? "Escribe por qué se cierra así; sin esto no se puede cerrar."
                : `Faltan ${MIN_JUSTIFICACION - justificacion.trim().length} caracteres para poder cerrar.`
              : null
          }
        >
          <textarea
            id="justificacion-cierre"
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            rows={4}
            aria-invalid={
              intentado && justificacion.trim().length < MIN_JUSTIFICACION ? true : undefined
            }
            placeholder="Ej. Cierre autorizado por dirección: las pólizas pendientes se reponen en el siguiente periodo."
            style={{ ...financeInputStyle, minHeight: 90, resize: "vertical" }}
          />
        </FinanceField>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} danger={false} />
    </>
  );
}
