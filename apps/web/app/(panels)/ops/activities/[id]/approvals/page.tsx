"use client";

import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";

export default function ActivityApprovalsPage() {
  const { activity, error, reload } = useActivityDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const review = activity.activityEvidence;

  if (!review) {
    return (
      <EmptyState
        icon="✅"
        title="Sin flujo de aprobación"
        description="Esta actividad aún no tiene un paquete de evidencia enviado a revisión."
      />
    );
  }

  return (
    <DetailSection title="Aprobación de evidencias">
      <div style={{ marginBottom: 12 }}>
        <Tag variant={review.status === "APROBADA" ? "positive" : review.status === "RECHAZADA" ? "danger" : "warning"}>
          {(review.status ?? "PENDIENTE_REVISION").replace(/_/g, " ")}
        </Tag>
      </div>
      <DetailFieldGrid>
        <DetailField label="Revisor" value={review.reviewedBy?.nombre} />
        <DetailField label="Fecha de revisión" value={formatDateTime(review.reviewedAt)} />
        <DetailField label="Archivos adjuntos" value={`${activity.evidencias?.length ?? 0} evidencia(s)`} />
      </DetailFieldGrid>
      <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        Las aprobaciones de viáticos se gestionan en el módulo de viáticos. Las evidencias de campo se revisan desde la pestaña Evidencias.
      </p>
    </DetailSection>
  );
}
