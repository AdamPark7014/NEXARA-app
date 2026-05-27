"use client";

/**
 * RequestApproval — botón + modal reutilizable para disparar un workflow de
 * aprobación desde cualquier entidad (cotización, gasto, viático, OC, etc.).
 *
 * Uso típico (dentro de un form de cotización):
 *
 *   <RequestApproval
 *     entityType="COTIZACION"
 *     entityId={quote.id}
 *     workflowName="Aprobación de descuento en cotización"
 *     reasonHint="Descuento aplicado mayor a 15%."
 *   />
 *
 * Comportamiento:
 *  - Carga las definiciones activas vía GET /workflow/definitions, filtra por
 *    entityType y muestra una al usuario (o un selector si hay varias).
 *  - POST /workflow/request crea (o reutiliza) la instancia abierta y notifica
 *    al primer aprobador.
 *  - Muestra confirmación + lista de pasos para que el usuario sepa qué viene.
 *  - Si ya existe instancia abierta, el backend la devuelve y mostramos su
 *    estado actual (paso N de M).
 */

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type WorkflowStep = {
  id: number;
  stepNumber: number;
  name: string;
  description?: string | null;
  approverRoleId?: number | null;
  approverUserId?: number | null;
};

type WorkflowDefinition = {
  id: number;
  name: string;
  description?: string | null;
  entityType: string;
  status: string;
  steps: WorkflowStep[];
};

type Instance = {
  id: number;
  currentStep: number;
  isComplete: boolean;
  isCancelled: boolean;
  approvals?: Array<{ id: number; status: string }>;
};

type Props = {
  entityType: string;
  entityId: number;
  /** Nombre exacto del workflow a usar; si se omite usa el activo del entityType. */
  workflowName?: string;
  /** Texto explicativo opcional en el modal. */
  reasonHint?: string;
  /** Variante visual. */
  variant?: "primary" | "ghost" | "small";
  /** Override del label del botón. */
  label?: string;
};

export default function RequestApproval({
  entityType,
  entityId,
  workflowName,
  reasonHint,
  variant = "ghost",
  label,
}: Props) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [defs, setDefs] = useState<WorkflowDefinition[]>([]);
  const [loadingDefs, setLoadingDefs] = useState(false);
  const [selectedDefId, setSelectedDefId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [instance, setInstance] = useState<Instance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user?.token) return;
    let cancelled = false;
    setLoadingDefs(true);
    fetch(buildApiUrl("workflow/definitions"), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: WorkflowDefinition[]) => {
        if (cancelled) return;
        const matching = (data || []).filter(
          (d) => d.status === "ACTIVE" && d.entityType.toUpperCase() === entityType.toUpperCase(),
        );
        setDefs(matching);
        const preferred = workflowName
          ? matching.find((d) => d.name === workflowName)
          : matching[0];
        setSelectedDefId(preferred?.id ?? null);
      })
      .catch(() => setDefs([]))
      .finally(() => {
        if (!cancelled) setLoadingDefs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user?.token, entityType, workflowName]);

  const selectedDef = useMemo(
    () => defs.find((d) => d.id === selectedDefId) || null,
    [defs, selectedDefId],
  );

  const submit = async () => {
    if (!user?.token || !selectedDef) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("workflow/request"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entityType,
          entityId,
          workflowDefinitionId: selectedDef.id,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Instance;
      setInstance(data);
    } catch (e) {
      setError((e as Error).message || "Error al solicitar la aprobación");
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setOpen(false);
    setInstance(null);
    setError(null);
  };

  const buttonLabel = label || "🛡️ Solicitar aprobación";
  const buttonStyle: React.CSSProperties =
    variant === "primary"
      ? {
          padding: "10px 16px",
          background: "#f59e0b",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }
      : variant === "small"
      ? {
          padding: "4px 10px",
          background: "transparent",
          color: "#b45309",
          border: "1px solid #f59e0b",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }
      : {
          padding: "6px 12px",
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
          border: "1px solid #f59e0b",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={buttonStyle}>
        {buttonLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              borderRadius: 12,
              maxWidth: 520,
              width: "100%",
              padding: 22,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
              maxHeight: "85vh",
              overflow: "auto",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>🛡️ Solicitar aprobación</h2>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
              {reasonHint || `Iniciar el flujo de aprobación para ${entityType} #${entityId}.`}
            </p>

            {loadingDefs ? (
              <p style={{ marginTop: 16 }}>Cargando flujos disponibles…</p>
            ) : defs.length === 0 ? (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  background: "#fee2e2",
                  color: "#991b1b",
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                No hay un flujo de aprobación activo configurado para <strong>{entityType}</strong>.
                Pide al administrador que cree uno en <em>Console → Definir flujos de aprobación</em>.
              </div>
            ) : instance ? (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    padding: 14,
                    background: "#dcfce7",
                    color: "#166534",
                    borderRadius: 8,
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  ✅ Solicitud creada. Instancia #{instance.id} — paso actual: {instance.currentStep}.
                  El aprobador recibirá una notificación y aparecerá en su bandeja.
                </div>
                <button
                  type="button"
                  onClick={close}
                  style={{
                    padding: "8px 16px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                {defs.length > 1 && (
                  <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 600 }}>
                    Flujo a iniciar
                    <select
                      value={selectedDefId ?? ""}
                      onChange={(e) => setSelectedDefId(Number(e.target.value) || null)}
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: 4,
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {defs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {selectedDef && (
                  <div style={{ marginTop: 14 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    >
                      Pasos del flujo
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                      {selectedDef.steps.map((step) => (
                        <li key={step.id} style={{ marginBottom: 6 }}>
                          <strong>{step.name}</strong>
                          {step.description && (
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                              {step.description}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {error && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      background: "#fee2e2",
                      color: "#991b1b",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    {error}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={close}
                    disabled={submitting}
                    style={{
                      padding: "8px 16px",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "transparent",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!selectedDef || submitting}
                    style={{
                      padding: "8px 16px",
                      background: "#f59e0b",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      fontWeight: 700,
                      cursor: submitting ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    {submitting ? "Enviando…" : "Iniciar aprobación"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
