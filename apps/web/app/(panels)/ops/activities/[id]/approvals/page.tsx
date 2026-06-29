"use client";

import { useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getActivitiesSectionConfig } from "@/lib/section-views";

export default function ActivityApprovalsPage() {
  const { activity, error, reload, id } = useActivityDetail();
  const { user } = useUser();
  const cfg = getActivitiesSectionConfig(user);
  const token = user?.token ?? "";
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [rejectErr, setRejectErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const review = activity.activityEvidence;
  const reviewState = review?.reviewStatus ?? "";
  const isPending = review && !["APROBADA", "APPROVED", "RECHAZADA", "REJECTED"].includes(reviewState);

  const approve = async () => {
    if (!token || !user?.id) return;
    setSaving(true); setActionErr(null);
    try {
      const res = await fetch(buildApiUrl(`activity-evidence/${id}/approve`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerId: user.id, notes: notes.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
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
    if (!reason) { setRejectErr("Escribe un motivo de rechazo antes de continuar."); return; }
    setRejectErr(null); setSaving(true); setActionErr(null);
    try {
      const res = await fetch(buildApiUrl(`activity-evidence/${id}/reject`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerId: user.id, rejectedStep: review?.rejectedStep ?? review?.status ?? "EVIDENCE_PHOTOS", notes: reason }),
      });
      if (!res.ok) throw new Error(await res.text());
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

  return (
    <DetailSection title="Aprobación de evidencias">
      <div style={{ marginBottom: 12 }}>
        <Tag variant={reviewState === "APROBADA" || reviewState === "APPROVED" ? "positive" : reviewState === "RECHAZADA" || reviewState === "REJECTED" ? "danger" : "warning"}>
          {(reviewState || "PENDIENTE_REVISION").replace(/_/g, " ")}
        </Tag>
      </div>
      <DetailFieldGrid>
        <DetailField label="Revisor" value={review.reviewedBy?.nombre} />
        <DetailField label="Fecha de revisión" value={formatDateTime(review.reviewedAt)} />
        <DetailField label="Paso actual" value={review.status?.replace(/_/g, " ")} />
        <DetailField label="Archivos" value={`${activity.evidencias?.length ?? 0} evidencia(s)`} />
      </DetailFieldGrid>

      {review.reviewNotes && (
        <p style={{ marginTop: 12, fontSize: 13, color: "var(--text-secondary)" }}>
          Notas: {review.reviewNotes}
        </p>
      )}

      {cfg.canApprove && isPending && (
        <div style={{ marginTop: 20, padding: 16, border: "1px solid var(--border)", borderRadius: 10 }}>
          <label style={{ display: "grid", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Notas de revisión</span>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); if (e.target.value.trim()) setRejectErr(null); }}
              rows={3}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${rejectErr ? "var(--danger)" : "var(--border)"}`, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, resize: "vertical" }}
              placeholder="Observaciones para el ingeniero (opcional al aprobar, requerido al rechazar)…"
            />
          </label>
          {rejectErr && (
            <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>⚠ {rejectErr}</div>
          )}
          {actionErr && (
            <div style={{ padding: "8px 12px", background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>
              {actionErr}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button variant="primary" onClick={() => void approve()} disabled={saving}>Aprobar paquete</Button>
            <Button variant="danger" onClick={() => void reject()} disabled={saving}>Rechazar</Button>
          </div>
        </div>
      )}

      <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        Flujo diario: ingeniería documenta en sitio → operaciones revisa evidencias → arquitectura valida el cierre. Los viáticos se aprueban en el módulo Viáticos.
      </p>
    </DetailSection>
  );
}
