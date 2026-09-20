"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [justificacion, setJustificacion] = useState("");

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
    setClosing(true);
    try {
      await erpFetch(`accounting/workspace/cierres/${periodId}/cerrar`, token, {
        method: "POST",
        body: JSON.stringify(texto ? { justificacion: texto } : {}),
      });
      toast.success(texto ? "Periodo cerrado con justificación" : "Periodo cerrado");
      setForceOpen(false);
      setJustificacion("");
      await load();
      const actualizado = { ...(selected as Period), isClosed: true };
      setSelected(actualizado);
      await revisar(actualizado);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setClosing(false);
    }
  }

  function pedirConfirmacion(lista: Checklist) {
    const protege = lista.proteccion.bloqueado.map((l) => `  · ${l}`).join("\n");
    const noProtege = lista.proteccion.noBloqueado.map((l) => `  · ${l}`).join("\n");
    setConfirmState({
      title: `Cerrar ${lista.periodo.nombre}`,
      message:
        `Del ${fecha(lista.periodo.inicio)} al ${fecha(lista.periodo.fin)}.\n\n` +
        `Al cerrar, el sistema impedirá:\n${protege}\n\n` +
        `Ojo: hoy el cierre NO impide todavía:\n${noProtege}\n\n` +
        `Solo dirección puede reabrir el periodo.`,
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
          disabled={checking && selected?.id === r.id}
        >
          {r.isClosed ? "Ver verificación" : "Revisar cierre"}
        </Button>
      ),
    },
  ];

  const bloqueado = (checklist?.bloqueantes ?? 0) > 0;
  const yaCerrado = checklist?.periodo.cerrado ?? false;

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

      {error && <InlineAlert message={error} variant="danger" onDismiss={() => setError(null)} />}

      <Section
        title="Periodos fiscales"
        subtitle="Elige el periodo que quieres cerrar para ver qué falta."
        flush
      >
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "16px 18px" }}>Cargando…</p>
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
                  disabled={bloqueado || closing}
                  onClick={() => pedirConfirmacion(checklist)}
                  title={
                    bloqueado
                      ? "Resuelve los puntos que bloquean el cierre o ciérralo con justificación"
                      : undefined
                  }
                >
                  Cerrar periodo
                </Button>
                {bloqueado && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={closing}
                    onClick={() => setForceOpen(true)}
                  >
                    Cerrar con justificación
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          {checking && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Calculando pendientes…</p>
          )}
          {checkError && <InlineAlert message={checkError} variant="danger" />}

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
                            <a
                              href={i.href}
                              style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}
                            >
                              Ir a resolverlo →
                            </a>
                          )}
                        </div>
                        <StatusDot label={marca.texto} tone={marca.tono} />
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
        onClose={() => setForceOpen(false)}
        title="Cerrar con puntos pendientes"
        dirty={justificacion.trim().length > 0}
        maxWidth={560}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setForceOpen(false)} disabled={closing}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={closing}
              disabled={closing || justificacion.trim().length < MIN_JUSTIFICACION || !checklist}
              onClick={() => {
                if (checklist) void cerrar(checklist.periodo.id, justificacion.trim());
              }}
            >
              Cerrar de todos modos
            </Button>
          </div>
        }
      >
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Vas a cerrar <strong>{checklist?.periodo.nombre}</strong> con{" "}
          {checklist?.bloqueantes ?? 0} punto(s) sin resolver. Escribe por qué; queda en la bitácora
          de auditoría con tu nombre, la fecha y el estado anterior del periodo.
        </p>
        {checklist && (
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
            justificacion.trim().length > 0 && justificacion.trim().length < MIN_JUSTIFICACION
              ? `Faltan ${MIN_JUSTIFICACION - justificacion.trim().length} caracteres para poder cerrar.`
              : null
          }
        >
          <textarea
            id="justificacion-cierre"
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            rows={4}
            placeholder="Ej. Cierre autorizado por dirección: las pólizas pendientes se reponen en el siguiente periodo."
            style={{ ...financeInputStyle, minHeight: 90, resize: "vertical" }}
          />
        </FinanceField>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} danger={false} />
    </>
  );
}
