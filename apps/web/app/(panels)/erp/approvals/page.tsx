"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { getApprovalsSectionConfig } from "@/lib/section-views";
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
 * Conectada a GET /api/workflow/my-pending y POST /api/workflow/approvals/:id/decide.
 */

type ApprovalRow = {
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

const toApprovalRow = (approval: PendingApproval): ApprovalRow => {
  const inst = approval.instance;
  const decidedCount = (inst.approvals || []).filter((a) => a.status !== "PENDING").length;
  const totalSteps = inst.workflow?.steps?.length ?? (inst.approvals?.length || 1);
  const ratio = totalSteps > 0 ? decidedCount / totalSteps : 0;
  const prioridad: ApprovalRow["prioridad"] = ratio >= 0.66 ? "Alta" : ratio >= 0.33 ? "Media" : "Baja";

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
  const cfg = useMemo(() => getApprovalsSectionConfig(user), [user]);
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<"all" | "Alta" | "Media" | "Baja">("all");
  const [data, setData] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<ApprovalRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [infoModal, setInfoModal] = useState<ApprovalRow | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [decidingErr, setDecidingErr] = useState<string | null>(null);

  const fetchPending = async () => {
    if (!user?.token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listMyPendingApprovals(user.token);
      setData(list.map(toApprovalRow));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo conectar a workflow";
      setError(msg);
      setData([]);
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
          const aHit = a.instanceId === id;
          const bHit = b.instanceId === id;
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

  const handleRequestInfo = (row: ApprovalRow) => {
    setInfoModal(row);
    setInfoMessage("");
  };

  const handleDecide = async (row: ApprovalRow, decision: "APPROVED" | "REJECTED") => {
    if (!user?.token) return;
    if (decision === "REJECTED") {
      setRejectModal(row);
      setRejectReason("");
      setDecidingErr(null);
      return;
    }
    setDecidingId(row.approvalId);
    setDecidingErr(null);
    try {
      await decideApproval(user.token, row.approvalId, decision, undefined);
      await fetchPending();
    } catch (e: unknown) {
      setDecidingErr(e instanceof Error ? e.message : "No se pudo registrar la decisión");
    } finally {
      setDecidingId(null);
    }
  };

  const submitReject = async () => {
    if (!user?.token || !rejectModal) return;
    setDecidingId(rejectModal.approvalId);
    setDecidingErr(null);
    try {
      await decideApproval(user.token, rejectModal.approvalId, "REJECTED", rejectReason.trim() || undefined);
      setRejectModal(null);
      await fetchPending();
    } catch (e: unknown) {
      setDecidingErr(e instanceof Error ? e.message : "No se pudo registrar el rechazo");
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
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void fetchPending()} disabled={loading}>
              Actualizar
            </Button>
            <Button
              variant="secondary"
              iconLeft="🛠️"
              onClick={() => toast.info("La configuración visual de flujos de aprobación estará disponible próximamente. Los flujos actuales se definen por tipo de entidad y nivel jerárquico.")}
            >
              Definir flujos
            </Button>
          </>
        }
      />

      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            background: "var(--state-warning-bg)",
            border: "1px solid var(--state-warning-border)",
            color: "var(--state-warning-text)",
            borderRadius: 12,
            fontSize: 12.5,
            marginBottom: 14,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span aria-hidden="true">⚠️</span>
          <span>No se pudo cargar el flujo de aprobaciones: {error}</span>
          <Button size="sm" variant="ghost" onClick={() => void fetchPending()} style={{ marginLeft: "auto" }}>
            Reintentar
          </Button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
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

      {loading ? (
        <EmptyState icon="⏳" title="Cargando aprobaciones…" description="Consultando tu bandeja de workflow." />
      ) : !user?.token ? (
        <EmptyState icon="🔒" title="Sin sesión" description="Inicia sesión para ver tus aprobaciones pendientes." />
      ) : list.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Bandeja limpia"
          description={
            filter === "all"
              ? "No hay aprobaciones pendientes que requieran tu atención. Buen trabajo."
              : `No hay aprobaciones de prioridad ${filter}.`
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {highlightId && (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
              Solicitud de workflow <strong>#{highlightId}</strong> desde enlace directo.
            </p>
          )}
          {list.map((a) => {
            const isHighlighted = Boolean(highlightId && a.instanceId === Number(highlightId));
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
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "var(--primary)", color: "#fff", fontFamily: "var(--nx-font-display)" }}>
                      {a.id}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                      {a.type}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: a.prioridad === "Alta" ? "var(--state-danger-bg)" : a.prioridad === "Media" ? "var(--state-warning-bg)" : "var(--surface-2)",
                        color: a.prioridad === "Alta" ? "var(--state-danger-text)" : a.prioridad === "Media" ? "var(--state-warning-text)" : "var(--text-secondary)",
                      }}
                    >
                      {a.prioridad}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{a.fechaSolicitud}</span>
                  </div>

                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--nx-font-display)", lineHeight: 1.3 }}>
                    {a.titulo}
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 12px", lineHeight: 1.5 }}>
                    {a.detalle}
                  </p>

                  <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                    {a.monto && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>Monto</div>
                        <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 18 }}>{a.monto}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>Solicita</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {a.solicita}{" "}
                        <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {a.solicitaRol}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                    <Button variant="primary" iconLeft="✓" onClick={() => void handleDecide(a, "APPROVED")} disabled={decidingId === a.approvalId}>
                      {decidingId === a.approvalId ? "Aprobando…" : "Aprobar"}
                    </Button>
                    <Button variant="secondary" iconLeft="💬" onClick={() => handleRequestInfo(a)}>Pedir más info</Button>
                    <Button variant="ghost" iconLeft="✕" onClick={() => void handleDecide(a, "REJECTED")} disabled={decidingId === a.approvalId} style={{ color: "var(--danger)" }}>
                      Rechazar
                    </Button>
                  </div>
                </div>

                <div style={{ background: "color-mix(in srgb, var(--surface-2) 50%, transparent)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: 12 }}>
                    Cadena de aprobación
                  </div>
                  <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0 }}>
                    {a.pasos.map((paso, idx) => {
                      const color =
                        paso.estado === "Aprobado" ? "var(--success)" :
                        paso.estado === "Rechazado" ? "var(--danger)" :
                        paso.estado === "Pendiente" ? "var(--warning)" : "var(--text-tertiary)";
                      return (
                        <li key={idx} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 12, padding: "8px 0", position: "relative" }}>
                          <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                            <span style={{
                              width: 12, height: 12, borderRadius: 999,
                              background: paso.estado === "Aprobado" || paso.estado === "Rechazado" ? color : "transparent",
                              border: `2px solid ${color}`,
                              zIndex: 2, marginTop: 4,
                              boxShadow: paso.isCurrent ? `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)` : "none",
                            }} />
                            {idx < a.pasos.length - 1 && (
                              <span style={{ position: "absolute", top: 16, bottom: -4, width: 2, background: paso.estado === "Aprobado" ? "var(--success)" : "var(--border)" }} />
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {paso.rol}
                              {paso.isCurrent && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: "color-mix(in srgb, var(--warning) 18%, transparent)", color: "var(--warning)" }}>
                                  AQUÍ
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 11, color, fontWeight: 600 }}>{paso.estado}</span>
                              {paso.quien && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{paso.quien}</span>}
                              {paso.fecha && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{paso.fecha}</span>}
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

      {/* ── Rechazo modal ── */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setRejectModal(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Rechazar solicitud</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 18 }}>
              <strong>{rejectModal.titulo}</strong> · Solicitada por {rejectModal.solicita}
            </div>
            <label style={{ display: "grid", gap: 4, marginBottom: 16 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Motivo del rechazo (visible al solicitante)</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                placeholder="Explica la razón del rechazo para que el solicitante pueda tomar acción…"
                autoFocus
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }}
              />
            </label>
            {decidingErr && (
              <div style={{ padding: "8px 12px", background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)", marginBottom: 12 }}>
                {decidingErr}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setRejectModal(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => void submitReject()} disabled={decidingId === rejectModal.approvalId}>
                {decidingId === rejectModal.approvalId ? "Rechazando…" : "Confirmar rechazo"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Solicitar info modal ── */}
      {infoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setInfoModal(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Pedir más información</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 18 }}>
              A: <strong>{infoModal.solicita}</strong> ({infoModal.solicitaRol})
            </div>
            <label style={{ display: "grid", gap: 4, marginBottom: 16 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Pregunta o información requerida</span>
              <textarea
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                rows={4}
                placeholder={`¿Qué necesitas de ${infoModal.solicita}? Escribe tu pregunta aquí…`}
                autoFocus
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }}
              />
            </label>
            <div style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
              💡 La solicitud permanecerá en tu bandeja hasta que apruebes o rechaces. Contacta a {infoModal.solicita} por el canal habitual.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setInfoModal(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => { setInfoModal(null); }} disabled={!infoMessage.trim()}>
                Registrar pregunta
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
