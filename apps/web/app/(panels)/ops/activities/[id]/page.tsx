"use client";

import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatDate, formatDateTime } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";

const STATUS_VARIANT: Record<string, "accent" | "positive" | "warning" | "neutral" | "danger"> = {
  COMPLETADA: "positive",
  EN_CURSO: "accent",
  PROGRAMADA: "neutral",
  REPROGRAMAR: "warning",
  CANCELADA: "danger",
};

export default function ActivityDetailPage() {
  const { activity, error, reload } = useActivityDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const branch = [activity.branchName, activity.branchCity, activity.branchState].filter(Boolean).join(" · ");

  return (
    <DetailSection title="Información general">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Tag variant={STATUS_VARIANT[activity.estatus] ?? "neutral"}>{activity.estatus.replace(/_/g, " ")}</Tag>
        {activity.prioridad && <Tag variant="warning">{activity.prioridad}</Tag>}
        {activity.ticketType && <Tag variant="neutral">{activity.ticketType}</Tag>}
      </div>
      <DetailFieldGrid>
        <DetailField label="Cliente" value={activity.client?.name} />
        <DetailField label="Sucursal" value={branch || activity.branchAddress} />
        <DetailField label="Responsable" value={activity.responsable?.nombre} />
        <DetailField label="Creador" value={activity.creador?.nombre} />
        <DetailField label="Asignación" value={formatDateTime(activity.fechaAsignacion)} />
        <DetailField label="Inicio" value={formatDateTime(activity.fechaInicio)} />
        <DetailField label="Entrega esperada" value={formatDate(activity.fechaEntregaEsperada)} />
        <DetailField label="Finalización" value={formatDateTime(activity.fechaFinalizacion)} />
      </DetailFieldGrid>
      {activity.descripcion && (
        <div style={{ marginTop: 12 }}>
          <DetailField label="Descripción" value={activity.descripcion} />
        </div>
      )}
      {activity.indicaciones && (
        <div style={{ marginTop: 12 }}>
          <DetailField label="Indicaciones" value={activity.indicaciones} />
        </div>
      )}
    </DetailSection>
  );
}
