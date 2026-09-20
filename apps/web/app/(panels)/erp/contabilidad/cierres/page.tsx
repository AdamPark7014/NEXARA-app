"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { useUser } from "@/components/UserContext";
import { erpFetch, erpInputStyle, formatApiError } from "@/lib/erp-api";
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

const MARCA: Record<EstadoItem, { icono: string; color: string; fondo: string; texto: string }> = {
  ok: {
    icono: "✓",
    color: "var(--success, #15803d)",
    fondo: "color-mix(in srgb, var(--success, #22c55e) 10%, transparent)",
    texto: "Listo",
  },
  advertencia: {
    icono: "!",
    color: "var(--warning, #b45309)",
    fondo: "color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent)",
    texto: "Revisar",
  },
  bloqueante: {
    icono: "×",
    color: "var(--danger)",
    fondo: "color-mix(in srgb, var(--danger) 10%, transparent)",
    texto: "Bloquea el cierre",
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
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: r.isClosed ? "var(--text-tertiary)" : "var(--success, #15803d)",
          }}
        >
          {r.isClosed ? `Cerrado ${fecha(r.closedAt)}` : "Abierto"}
        </span>
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
                    variant="danger"
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

              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {checklist.items.map((i) => {
                  const marca = MARCA[i.estado];
                  return (
                    <li
                      key={i.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1px solid ${
                          i.estado === "ok" ? "var(--border)" : `color-mix(in srgb, ${marca.color} 40%, var(--border))`
                        }`,
                        background: i.estado === "ok" ? "transparent" : marca.fondo,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 22,
                          height: 22,
                          flexShrink: 0,
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 13,
                          fontWeight: 800,
                          color: "#fff",
                          background: marca.color,
                        }}
                      >
                        {marca.icono}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "baseline",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{i.etiqueta}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: marca.color }}>
                            {marca.texto}
                          </span>
                          {i.conteo > 0 && (
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                              {i.conteo} pendiente{i.conteo === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: 12.5,
                            color: "var(--text-secondary)",
                            lineHeight: 1.45,
                          }}
                        >
                          {i.descripcion}
                        </p>
                        {i.conteo > 0 && i.href && (
                          <a
                            href={i.href}
                            style={{ fontSize: 12.5, color: "var(--primary)", fontWeight: 600 }}
                          >
                            Ir a resolverlo →
                          </a>
                        )}
                      </div>
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
        <label
          htmlFor="justificacion-cierre"
          style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}
        >
          Justificación
        </label>
        <textarea
          id="justificacion-cierre"
          value={justificacion}
          onChange={(e) => setJustificacion(e.target.value)}
          rows={4}
          placeholder="Ej. Cierre autorizado por dirección: las pólizas pendientes se reponen en el siguiente periodo."
          style={{ ...erpInputStyle, minHeight: 90, resize: "vertical" }}
        />
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--text-tertiary)" }}>
          Mínimo {MIN_JUSTIFICACION} caracteres ({justificacion.trim().length}).
        </p>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} danger={false} />
    </>
  );
}
