"use client";

/**
 * ApprovalHistory — timeline reutilizable que muestra TODAS las instancias de
 * workflow asociadas a una entidad (cotización, gasto, viático, OC, proyecto).
 *
 * Se monta como tab/sección lateral de cualquier formulario de entidad:
 *
 *   <ApprovalHistory entityType="COTIZACION" entityId={quote.id} />
 *
 * Comportamiento:
 *  - GET /workflow/entity/:entityType/:entityId
 *  - Cada instancia se renderiza como una tarjeta con su workflow, fecha de
 *    inicio, estado global (Pendiente / Aprobada / Rechazada) y el detalle
 *    paso a paso.
 *  - Cada paso muestra: número, nombre, descripción, estado, quién aprobó/
 *    rechazó, comentarios y fecha de decisión.
 *  - Botón "Refrescar" para forzar reload tras una acción del aprobador.
 *  - Si no hay instancias, muestra empty state con CTA a `RequestApproval`.
 *
 * No depende de un panel concreto: usa estilos inline y CSS variables.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type WorkflowStep = {
  id: number;
  stepNumber: number;
  name: string;
  description?: string | null;
};

type Approval = {
  id: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  comments?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  step: WorkflowStep;
  decidedBy?: { id: number; nombre: string } | null;
};

type WorkflowInstance = {
  id: number;
  workflowId: number;
  currentStep: number;
  isComplete: boolean;
  isCancelled: boolean;
  startedAt: string;
  completedAt?: string | null;
  workflow: {
    id: number;
    name: string;
    description?: string | null;
    entityType: string;
    steps: WorkflowStep[];
  };
  startedBy?: { id: number; nombre: string } | null;
  approvals: Approval[];
};

type Props = {
  entityType: string;
  entityId: number;
  /** Etiqueta de la tarjeta (default: "Historial de aprobaciones"). */
  title?: string;
  /** Si true, muestra padding compacto (para sidebars angostos). */
  compact?: boolean;
};

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  APPROVED: { label: "Aprobada", bg: "#dcfce7", color: "#166534" },
  REJECTED: { label: "Rechazada", bg: "#fee2e2", color: "#991b1b" },
  PENDING: { label: "Pendiente", bg: "#fef3c7", color: "#92400e" },
};

function instanceStatus(inst: WorkflowInstance): "PENDING" | "APPROVED" | "REJECTED" {
  if (inst.isCancelled) return "REJECTED";
  if (inst.isComplete) return "APPROVED";
  return "PENDING";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ApprovalHistory({ entityType, entityId, title, compact }: Props) {
  const { user } = useUser();
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token || !entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        buildApiUrl(`workflow/entity/${encodeURIComponent(entityType)}/${entityId}`),
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as WorkflowInstance[];
      setInstances(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message || "No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, user?.token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const padding = compact ? 12 : 18;

  const ordered = useMemo(() => {
    return [...instances].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [instances]);

  return (
    <section
      style={{
        background: "var(--bg-primary, #fff)",
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 10,
        padding,
        color: "var(--text-primary, #111)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
          🛡️ {title || "Historial de aprobaciones"}
        </h3>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            fontSize: 11,
            padding: "4px 10px",
            background: "transparent",
            color: "var(--text-secondary, #6b7280)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Actualizando…" : "↻ Refrescar"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 10, background: "#fee2e2", color: "#991b1b", borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {loading && instances.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-secondary, #6b7280)" }}>Cargando historial…</p>
      ) : ordered.length === 0 ? (
        <div
          style={{
            padding: compact ? 16 : 24,
            textAlign: "center",
            border: "1px dashed var(--border, #e5e7eb)",
            borderRadius: 8,
            color: "var(--text-secondary, #6b7280)",
          }}
        >
          <div style={{ fontSize: 26, marginBottom: 6 }}>🕊️</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Sin aprobaciones registradas</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            Esta {entityType.toLowerCase()} no ha pasado por un flujo todavía.
          </div>
        </div>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {ordered.map((inst) => {
            const status = instanceStatus(inst);
            const badge = STATUS_BADGE[status];
            const totalSteps = inst.workflow.steps.length || inst.approvals.length;
            return (
              <li
                key={inst.id}
                style={{
                  border: "1px solid var(--border, #e5e7eb)",
                  borderRadius: 8,
                  padding: compact ? 10 : 14,
                  background: "var(--bg-secondary, #f9fafb)",
                }}
              >
                <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{inst.workflow.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)" }}>
                      Iniciada {formatDate(inst.startedAt)}
                      {inst.startedBy?.nombre ? ` · por ${inst.startedBy.nombre}` : ""}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: badge.bg,
                      color: badge.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {badge.label}
                  </span>
                </header>

                <div style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)", marginBottom: 8 }}>
                  Paso {Math.min(inst.currentStep, totalSteps)} de {totalSteps}
                </div>

                <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {inst.workflow.steps.map((step) => {
                    const approval = inst.approvals.find((a) => a.step.id === step.id);
                    const stepStatus = approval?.status || (inst.currentStep === step.stepNumber ? "PENDING" : "PENDING");
                    const reached = approval !== undefined;
                    return (
                      <li
                        key={step.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          padding: 8,
                          borderRadius: 6,
                          background: reached ? "var(--bg-primary, #fff)" : "transparent",
                          opacity: reached ? 1 : 0.55,
                        }}
                      >
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background:
                              approval?.status === "APPROVED"
                                ? "#16a34a"
                                : approval?.status === "REJECTED"
                                ? "#dc2626"
                                : "var(--bg-secondary, #f3f4f6)",
                            color:
                              approval?.status === "APPROVED" || approval?.status === "REJECTED"
                                ? "#fff"
                                : "var(--text-secondary, #6b7280)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        >
                          {approval?.status === "APPROVED"
                            ? "✓"
                            : approval?.status === "REJECTED"
                            ? "✗"
                            : step.stepNumber}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{step.name}</div>
                          {step.description && (
                            <div style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)" }}>
                              {step.description}
                            </div>
                          )}
                          {approval?.decidedBy && (
                            <div style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)", marginTop: 2 }}>
                              {stepStatus === "APPROVED" ? "Aprobado" : stepStatus === "REJECTED" ? "Rechazado" : "Decidido"} por{" "}
                              <strong>{approval.decidedBy.nombre}</strong>
                              {approval.decidedAt ? ` · ${formatDate(approval.decidedAt)}` : ""}
                            </div>
                          )}
                          {approval?.comments && (
                            <div
                              style={{
                                fontSize: 11,
                                marginTop: 4,
                                padding: 6,
                                borderRadius: 4,
                                background: "var(--bg-secondary, #f3f4f6)",
                                color: "var(--text-primary, #111)",
                              }}
                            >
                              💬 {approval.comments}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
