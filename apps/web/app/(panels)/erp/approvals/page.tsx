"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import {
  listMyPendingApprovals,
  decideApproval,
  buildApprovalChain,
  labelForEntityType,
  formatRequestedAt,
  type PendingApproval,
  type ApprovalChainStep,
} from "@/lib/workflow-api";

/**
 * Aprobaciones jerárquicas: el flujo va de OPERATIVE → SPECIALIST → MANAGER →
 * DIRECTOR → EXECUTIVE según monto y tipo. Esta página muestra la bandeja
 * con todo lo que requiere tu intervención según tu nivel.
 *
 * Conectada a `GET /api/workflow/my-pending` y `POST /api/workflow/approvals/:id/decide`.
 * Si la API falla o no hay sesión, muestra dataset demo para preview.
 */

type DemoApproval = {
  id: string;
  approvalId: null;
  type: string;
  titulo: string;
  detalle: string;
  monto?: string;
  solicita: string;
  solicitaRol: string;
  pasos: ApprovalChainStep[];
  prioridad: "Alta" | "Media" | "Baja";
  fechaSolicitud: string;
};

type RealApproval = {
  id: string;
  approvalId: number;
  instanceId: number;
  type: string;
  titulo: string;
  detalle: string;
  monto?: string;
  solicita: string;
  solicitaRol: string;
  pasos: ApprovalChainStep[];
  prioridad: "Alta" | "Media" | "Baja";
  fechaSolicitud: string;
};

type ApprovalRow = DemoApproval | RealApproval;

const DEMO_APPROVALS: DemoApproval[] = [
  {
    id: "AP-1042",
    approvalId: null,
    type: "Compra",
    titulo: "OC #4892 · 24 cámaras Hikvision DS-2CD2143G2-I + bracket",
    detalle: "Proyecto Polos del Bienestar · Polo 4 (Iztacalco). Stock comprometido contra OT-3423.",
    monto: "$ 84,200 MXN",
    solicita: "Israel Ramos",
    solicitaRol: "Ingeniero de Campo",
    pasos: [
      { rol: "Jefe de Almacén", estado: "Aprobado", quien: "Carolina J.", fecha: "Ayer 16:20", isCurrent: false },
      { rol: "Coordinador de Compras", estado: "Aprobado", quien: "Karen E. (Director Admin)", fecha: "Hoy 09:14", isCurrent: false },
      { rol: "Director Administrativo", estado: "Pendiente", isCurrent: true },
      { rol: "CEO (si > $250k)", estado: "En espera", isCurrent: false },
    ],
    prioridad: "Alta",
    fechaSolicitud: "Ayer 14:32",
  },
  {
    id: "AP-1043",
    approvalId: null,
    type: "Viáticos",
    titulo: "Visita Soriana Querétaro · 4 ingenieros, 3 días",
    detalle: "Mantenimiento mensual POS + auditoría cámaras. 1,200 km redondos.",
    monto: "$ 18,400 MXN",
    solicita: "Alejandro Gonzales",
    solicitaRol: "Jefe de Proyectos",
    pasos: [
      { rol: "Director Operativo", estado: "Aprobado", quien: "Luis A.", fecha: "Hoy 08:45", isCurrent: false },
      { rol: "Director Administrativo", estado: "Pendiente", isCurrent: true },
    ],
    prioridad: "Media",
    fechaSolicitud: "Hoy 07:20",
  },
  {
    id: "AP-1044",
    approvalId: null,
    type: "Descuento",
    titulo: "Descuento 22% · Cotización Universidad UDLA Cholula",
    detalle: "120 laptops Lenovo ThinkPad + 40 monitores 27\". Pago contra entrega.",
    monto: "$ 412,000 MXN",
    solicita: "Karina Martínez",
    solicitaRol: "Ejecutivo de Ventas",
    pasos: [
      { rol: "Gerente de Ventas", estado: "Aprobado", quien: "(autoaprobado por nivel)", fecha: "Hoy 10:02", isCurrent: false },
      { rol: "Director Comercial / Admin", estado: "Aprobado", quien: "Karen E.", fecha: "Hoy 10:48", isCurrent: false },
      { rol: "CEO (descuento > 20%)", estado: "Pendiente", isCurrent: true },
    ],
    prioridad: "Alta",
    fechaSolicitud: "Hoy 09:55",
  },
  {
    id: "AP-1045",
    approvalId: null,
    type: "Contratación",
    titulo: "Vacante · Ingeniero CCTV junior · Puebla",
    detalle: "Refuerzo para contratos de mantenimiento. Inicio sugerido: lunes próximo.",
    solicita: "Carolina Juárez",
    solicitaRol: "Ingeniero Senior",
    pasos: [
      { rol: "Especialista RRHH", estado: "Aprobado", quien: "Karen E. (interim)", fecha: "Ayer 18:10", isCurrent: false },
      { rol: "Director Operativo", estado: "Pendiente", isCurrent: true },
    ],
    prioridad: "Baja",
    fechaSolicitud: "Ayer 17:30",
  },
];

/**
 * Convierte un PendingApproval del backend a la estructura de tarjeta de UI.
 * El "monto" y "detalle" no viven en WorkflowApproval — habría que enriquecer
 * al servicio para incluir snapshots de la entidad. Por ahora se rellena
 * con el entityType + entityId.
 */
const toApprovalRow = (approval: PendingApproval): RealApproval => {
  const inst = approval.instance;
  const decidedCount = (inst.approvals || []).filter((a) => a.status !== "PENDING").length;
  const totalSteps = inst.workflow?.steps?.length ?? (inst.approvals?.length || 1);
  const ratio = totalSteps > 0 ? decidedCount / totalSteps : 0;
  const prioridad: RealApproval["prioridad"] = ratio >= 0.66 ? "Alta" : ratio >= 0.33 ? "Media" : "Baja";

  return {
    id: `AP-${approval.id}`,
    approvalId: approval.id,
    instanceId: inst.id,
    type: labelForEntityType(inst.entityType),
    titulo: `${inst.workflow?.name ?? labelForEntityType(inst.entityType)} · #${inst.entityId}`,
    detalle: `Solicitud iniciada para ${labelForEntityType(inst.entityType)} #${inst.entityId}.`,
    solicita: inst.startedBy?.nombre ?? "—",
    solicitaRol: inst.startedBy?.role?.nombre ?? "Equipo NEXARA",
    pasos: buildApprovalChain(inst, approval.id),
    prioridad,
    fechaSolicitud: formatRequestedAt(approval.createdAt),
  };
};

export default function ApprovalsPage() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<"all" | "Alta" | "Media" | "Baja">("all");
  const [data, setData] = useState<ApprovalRow[]>(DEMO_APPROVALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(true);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const fetchPending = async () => {
    if (!user?.token) {
      setData(DEMO_APPROVALS);
      setUsingDemo(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listMyPendingApprovals(user.token);
      if (list.length === 0) {
        setData([]);
        setUsingDemo(false);
      } else {
        setData(list.map(toApprovalRow));
        setUsingDemo(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo conectar a workflow";
      setError(msg);
      setData(DEMO_APPROVALS);
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token]);

  const list = useMemo(() => {
    let rows = filter === "all" ? data : data.filter((a) => a.prioridad === filter);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) {
        rows = [...rows].sort((a, b) => {
          const aHit = "instanceId" in a && a.instanceId === id;
          const bHit = "instanceId" in b && b.instanceId === id;
          if (aHit && !bHit) return -1;
          if (!aHit && bHit) return 1;
          return 0;
        });
      }
    }
    return rows;
  }, [data, filter, highlightId]);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, list, loading]);

  const handleDecide = async (row: ApprovalRow, decision: "APPROVED" | "REJECTED") => {
    if (row.approvalId == null) {
      window.alert("Esta es una solicitud demo. Conéctate con tu cuenta para aprobar de verdad.");
      return;
    }
    if (!user?.token) {
      window.alert("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }
    let comments: string | undefined;
    if (decision === "REJECTED") {
      const reason = window.prompt("Motivo del rechazo (visible al solicitante):", "");
      if (reason == null) return; // canceló
      comments = reason.trim() || undefined;
    }
    setDecidingId(row.approvalId);
    try {
      await decideApproval(user.token, row.approvalId, decision, comments);
      await fetchPending();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo registrar la decisión";
      window.alert(`Error: ${msg}`);
    } finally {
      setDecidingId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { all: data.length, Alta: 0, Media: 0, Baja: 0 };
    for (const a of data) c[a.prioridad]++;
    return c;
  }, [data]);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Gobierno corporativo"
        title="Aprobaciones jerárquicas"
        subtitle="Flujo automático por nivel: cada solicitud pasa por su cadena de aprobadores. Tú ves solo lo que requiere tu firma."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void fetchPending()} disabled={loading}>
              Actualizar
            </Button>
            <Button variant="secondary" iconLeft="🛠️">
              Definir flujos
            </Button>
          </>
        }
      />

      {(usingDemo || error) && (
        <div
          role="status"
          style={{
            padding: "10px 14px",
            background: error ? "var(--state-warning-bg)" : "color-mix(in srgb, var(--accent) 8%, transparent)",
            border: `1px solid ${error ? "var(--state-warning-border)" : "color-mix(in srgb, var(--accent) 25%, var(--border))"}`,
            color: error ? "var(--state-warning-text)" : "var(--text-secondary)",
            borderRadius: 12,
            fontSize: 12.5,
            marginBottom: 14,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span aria-hidden="true">{error ? "⚠️" : "ℹ️"}</span>
          <span>
            {error
              ? `Mostrando datos demo (no se pudo cargar workflow: ${error})`
              : "Vista previa con datos demo. Inicia sesión para ver tus aprobaciones reales."}
          </span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {(["all", "Alta", "Media", "Baja"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilter(p)}
            style={{
              padding: "7px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 999,
              border: filter === p ? "1px solid var(--primary)" : "1px solid var(--border)",
              background: filter === p ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)",
              color: filter === p ? "var(--primary)" : "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{p === "all" ? "Todas" : p}</span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                background: filter === p ? "var(--primary)" : "var(--surface-2)",
                color: filter === p ? "#fff" : "var(--text-secondary)",
                padding: "1px 6px",
                borderRadius: 6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {counts[p]}
            </span>
          </button>
        ))}
      </div>

      {loading && data.length === 0 ? (
        <EmptyState icon="⏳" title="Cargando aprobaciones…" description="Estamos consultando tu bandeja." />
      ) : list.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Bandeja limpia"
          description="No hay aprobaciones pendientes que requieran tu atención. Buen trabajo."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {highlightId && (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
              Solicitud de workflow <strong>#{highlightId}</strong> desde enlace directo.
            </p>
          )}
          {list.map((a) => {
            const isHighlighted = Boolean(
              highlightId && "instanceId" in a && a.instanceId === Number(highlightId),
            );
            return (
            <article
              key={a.id}
              ref={isHighlighted ? highlightRef : undefined}
              style={{
                background: isHighlighted ? "color-mix(in srgb, var(--primary) 6%, var(--surface))" : "var(--surface)",
                border: isHighlighted ? "2px solid var(--primary)" : "1px solid var(--border)",
                borderRadius: 16,
                padding: 18,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
                gap: 20,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "var(--primary)",
                      color: "#fff",
                      fontFamily: "var(--nx-font-display)",
                    }}
                  >
                    {a.id}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "var(--surface-2)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {a.type}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background:
                        a.prioridad === "Alta"
                          ? "var(--state-danger-bg)"
                          : a.prioridad === "Media"
                            ? "var(--state-warning-bg)"
                            : "var(--surface-2)",
                      color:
                        a.prioridad === "Alta"
                          ? "var(--state-danger-text)"
                          : a.prioridad === "Media"
                            ? "var(--state-warning-text)"
                            : "var(--text-secondary)",
                    }}
                  >
                    {a.prioridad}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {a.fechaSolicitud}
                  </span>
                </div>

                <h3
                  style={{
                    margin: 0,
                    fontSize: 15.5,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    fontFamily: "var(--nx-font-display)",
                    lineHeight: 1.3,
                  }}
                >
                  {a.titulo}
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    margin: "6px 0 12px",
                    lineHeight: 1.5,
                  }}
                >
                  {a.detalle}
                </p>

                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  {a.monto && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
                        Monto
                      </div>
                      <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 18 }}>
                        {a.monto}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
                      Solicita
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {a.solicita}{" "}
                      <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
                        · {a.solicitaRol}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  <Button
                    variant="primary"
                    iconLeft="✓"
                    onClick={() => void handleDecide(a, "APPROVED")}
                    disabled={decidingId === a.approvalId}
                  >
                    {decidingId === a.approvalId ? "Aprobando…" : "Aprobar"}
                  </Button>
                  <Button variant="secondary" iconLeft="💬">
                    Pedir más info
                  </Button>
                  <Button
                    variant="ghost"
                    iconLeft="✕"
                    onClick={() => void handleDecide(a, "REJECTED")}
                    disabled={decidingId === a.approvalId}
                    style={{ color: "var(--danger)" }}
                  >
                    Rechazar
                  </Button>
                </div>
              </div>

              <div
                style={{
                  background: "color-mix(in srgb, var(--surface-2) 50%, transparent)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-tertiary)",
                    marginBottom: 12,
                  }}
                >
                  Cadena de aprobación
                </div>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0 }}>
                  {a.pasos.map((paso, idx) => {
                    const color =
                      paso.estado === "Aprobado"
                        ? "var(--success)"
                        : paso.estado === "Rechazado"
                          ? "var(--danger)"
                          : paso.estado === "Pendiente"
                            ? "var(--warning)"
                            : "var(--text-tertiary)";
                    return (
                      <li
                        key={idx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "20px 1fr",
                          gap: 12,
                          padding: "8px 0",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            display: "flex",
                            justifyContent: "center",
                          }}
                        >
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 999,
                              background:
                                paso.estado === "Aprobado" || paso.estado === "Rechazado"
                                  ? color
                                  : "transparent",
                              border: `2px solid ${color}`,
                              zIndex: 2,
                              marginTop: 4,
                              boxShadow: paso.isCurrent
                                ? `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)`
                                : "none",
                            }}
                          />
                          {idx < a.pasos.length - 1 && (
                            <span
                              style={{
                                position: "absolute",
                                top: 16,
                                bottom: -4,
                                width: 2,
                                background:
                                  paso.estado === "Aprobado"
                                    ? "var(--success)"
                                    : "var(--border)",
                              }}
                            />
                          )}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 700,
                              color: "var(--text-primary)",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {paso.rol}
                            {paso.isCurrent && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 800,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  background: "color-mix(in srgb, var(--warning) 18%, transparent)",
                                  color: "var(--warning)",
                                }}
                              >
                                Tu firma
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color }}>
                            {paso.estado}
                            {paso.quien && ` · ${paso.quien}`}
                            {paso.fecha && ` · ${paso.fecha}`}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </>
  );
}
