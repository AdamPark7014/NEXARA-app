"use client";

import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";

export default function ActivityHistoryPage() {
  const { activity, error, reload } = useActivityDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const events: Array<{ at: string; label: string }> = [];
  if (activity.fechaAsignacion) events.push({ at: activity.fechaAsignacion, label: "Actividad asignada" });
  if (activity.fechaInicio) events.push({ at: activity.fechaInicio, label: "Inicio en campo" });
  if (activity.fechaEntregaEsperada) events.push({ at: activity.fechaEntregaEsperada, label: "Entrega esperada" });
  if (activity.fechaFinalizacion) events.push({ at: activity.fechaFinalizacion, label: "Finalizada" });
  if (activity.activityEvidence?.reviewedAt) {
    events.push({
      at: activity.activityEvidence.reviewedAt,
      label: `Evidencia ${(activity.activityEvidence.status ?? "revisada").toLowerCase()}`,
    });
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <DetailSection title="Historial">
      {events.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Sin eventos registrados aún.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {events.map((ev, idx) => (
            <li
              key={`${ev.at}-${idx}`}
              style={{
                padding: "12px 14px",
                borderLeft: "3px solid var(--primary)",
                background: "var(--surface)",
                borderRadius: "0 8px 8px 0",
              }}
            >
              <div style={{ fontSize: 14 }}>{ev.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>{formatDateTime(ev.at)}</div>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
