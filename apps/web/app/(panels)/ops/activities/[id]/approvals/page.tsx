"use client";

import { useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import ActivityEvidenceReviewPanel from "@/components/ops/ActivityEvidenceReviewPanel";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { countEvidenceFiles } from "@/lib/evidence-display";
import { EVIDENCE_STEP_ORDER, evidenceStepLabel } from "@/lib/evidence-lock";
import { getActivitiesSectionConfig } from "@/lib/section-views";
import KpiCard from "@/components/ui/KpiCard";

export default function ActivityApprovalsPage() {
  const { activity, error, reload, id } = useActivityDetail();
  const { user } = useUser();
  const cfg = getActivitiesSectionConfig(user);
  const token = user?.token ?? "";
  const [notes, setNotes] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectedSteps, setRejectedSteps] = useState<string[]>([]);
  const [resetFullFlow, setResetFullFlow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rejectErr, setRejectErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const review = activity.activityEvidence;
  const reviewState = review?.reviewStatus ?? "";
  const isPending =
    review &&
    review.status === "COMPLETED" &&
    !["APROBADA", "APPROVED", "RECHAZADA", "REJECTED"].includes(reviewState);

  const toggleStep = (step: string) => {
    setResetFullFlow(false);
    setRejectedSteps((prev) =>
      prev.includes(step) ? prev.filter((s) => s !== step) : [...prev, step],
    );
  };

  const approve = async () => {
    if (!token || !user?.id) return;
    setSaving(true);
    setActionErr(null);
    try {
      const res = await fetch(buildApiUrl(`activity-evidence/${id}/approve`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerId: user.id, notes: notes.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      setRejectMode(false);
      reload();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "No se pudo aprobar");
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    if (!token || !user?.id) return;
    const reason = notes.trim();
    if (!reason) {
      setRejectErr("Escribe un motivo de rechazo antes de continuar.");
      return;
    }
    if (!resetFullFlow && rejectedSteps.length === 0) {
      setRejectErr("Selecciona al menos un paso a corregir o marca rehacer todo.");
      return;
    }
    setRejectErr(null);
    setSaving(true);
    setActionErr(null);
    try {
      const res = await fetch(buildApiUrl(`activity-evidence/${id}/reject`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: user.id,
          notes: reason,
          ...(resetFullFlow ? { resetFullFlow: true } : { rejectedSteps }),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setRejectMode(false);
      reload();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "No se pudo rechazar");
    } finally {
      setSaving(false);
    }
  };

  if (!review) {
    return (
      <EmptyState
        icon="✅"
        title="Sin paquete en revisión"
        description="El ingeniero debe completar el flujo de evidencias (entrada, fotos, hoja de servicio, salida) antes de que puedas aprobar."
      />
    );
  }

  const fileCount = countEvidenceFiles(review);

  const reviewVariant =
    reviewState === "APROBADA" || reviewState === "APPROVED"
      ? "positive"
      : reviewState === "RECHAZADA" || reviewState === "REJECTED"
        ? "danger"
        : isPending
          ? "warning"
          : "default";

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Estado revisión" value={(reviewState || "PENDIENTE").replace(/_/g, " ")} variant={reviewVariant} icon="🔍" />
        <KpiCard label="Archivos" value={fileCount} icon="📎" variant={fileCount > 0 ? "accent" : "default"} />
        <KpiCard label="Pasos del flujo" value={EVIDENCE_STEP_ORDER.length} icon="📋" />
        <KpiCard label="Requiere acción" value={isPending && cfg.canApprove ? "Sí" : "No"} variant={isPending && cfg.canApprove ? "warning" : "positive"} icon="⚡" />
      </div>
      <ActivityEvidenceReviewPanel activity={activity} />

      <DetailSection title="Decisión de revisión">
        <div style={{ marginBottom: 12 }}>
          <Tag
            variant={
              reviewState === "APROBADA" || reviewState === "APPROVED"
                ? "positive"
                : reviewState === "RECHAZADA" || reviewState === "REJECTED"
                  ? "danger"
                  : "warning"
            }
          >
            {(reviewState || "PENDIENTE").replace(/_/g, " ")}
          </Tag>
        </div>
        <DetailFieldGrid>
          <DetailField label="Revisor" value={review.reviewedBy?.nombre} />
          <DetailField label="Fecha de revisión" value={formatDateTime(review.reviewedAt)} />
          <DetailField label="Paquete" value={review.status?.replace(/_/g, " ")} />
          <DetailField label="Archivos en paquete" value={`${fileCount} archivo(s)`} />
        </DetailFieldGrid>

        {review.reviewNotes && (
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--text-secondary)" }}>
            Notas previas: {review.reviewNotes}
          </p>
        )}

        {cfg.canApprove && isPending && (
          <div style={{ marginTop: 20, padding: 16, border: "1px solid var(--border)", borderRadius: 10 }}>
            {!rejectMode ? (
              <>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Revisa el contenido de arriba (fotos, PDF, plantilla y GPS) antes de aprobar o rechazar el paquete de{" "}
                  <strong>{activity.anNumber}</strong> asignado a <strong>{activity.responsable?.nombre ?? "—"}</strong>.
                </p>
                <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Notas de revisión</span>
                  <textarea
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      if (e.target.value.trim()) setRejectErr(null);
                    }}
                    rows={3}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: `1px solid ${rejectErr ? "var(--danger)" : "var(--border)"}`,
                      background: "var(--surface)",
                      color: "var(--foreground)",
                      fontSize: 13,
                      resize: "vertical",
                    }}
                    placeholder="Observaciones para el ingeniero (opcional al aprobar, requerido al rechazar)…"
                  />
                </label>
                {actionErr && (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "var(--state-danger-bg,#fef2f2)",
                      border: "1px solid var(--danger)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--danger)",
                      marginBottom: 8,
                    }}
                  >
                    {actionErr}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="primary" onClick={() => void approve()} disabled={saving}>
                    Aprobar paquete
                  </Button>
                  <Button variant="danger" onClick={() => setRejectMode(true)} disabled={saving}>
                    Rechazar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)" }}>
                  Indica qué debe corregir <strong>{activity.responsable?.nombre ?? "el técnico"}</strong> en{" "}
                  <strong>{activity.anNumber}</strong>.
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={resetFullFlow}
                    onChange={(e) => {
                      setResetFullFlow(e.target.checked);
                      if (e.target.checked) setRejectedSteps([]);
                    }}
                  />
                  Rehacer todo desde cero (volver al paso 1)
                </label>
                {!resetFullFlow && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                      Pasos a corregir *
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {EVIDENCE_STEP_ORDER.map((step) => (
                        <label key={step} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={rejectedSteps.includes(step)}
                            onChange={() => toggleStep(step)}
                          />
                          {evidenceStepLabel(step)}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <label style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                    Motivo del rechazo *
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      if (e.target.value.trim()) setRejectErr(null);
                    }}
                    rows={4}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: `1px solid ${rejectErr ? "var(--danger)" : "var(--border)"}`,
                      background: "var(--surface)",
                      color: "var(--foreground)",
                      fontSize: 13,
                      resize: "vertical",
                    }}
                    placeholder="Explica qué debe corregir el técnico…"
                  />
                </label>
                {rejectErr && (
                  <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>⚠ {rejectErr}</div>
                )}
                {actionErr && (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "var(--state-danger-bg,#fef2f2)",
                      border: "1px solid var(--danger)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--danger)",
                      marginBottom: 8,
                    }}
                  >
                    {actionErr}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="danger" onClick={() => void reject()} disabled={saving}>
                    Confirmar rechazo
                  </Button>
                  <Button variant="ghost" onClick={() => setRejectMode(false)} disabled={saving}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Flujo diario: ingeniería documenta en sitio → operaciones revisa evidencias → arquitectura valida el cierre. Los
          viáticos se aprueban en el módulo Viáticos.
        </p>
      </DetailSection>
    </>
  );
}
