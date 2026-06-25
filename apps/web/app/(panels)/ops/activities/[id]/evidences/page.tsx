"use client";

import { buildApiUrl } from "@/lib/api-base";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";

export default function ActivityEvidencesPage() {
  const { activity, error, reload } = useActivityDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const files = activity.evidencias ?? [];
  const review = activity.activityEvidence;

  return (
    <DetailSection title="Evidencias de campo">
      {review && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            border: "1px solid var(--border)",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Paquete de evidencia</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Revisado por {review.reviewedBy?.nombre ?? "—"}
            </div>
          </div>
          <Tag variant={review.status === "APROBADA" ? "positive" : review.status === "RECHAZADA" ? "danger" : "warning"}>
            {(review.status ?? "PENDIENTE").replace(/_/g, " ")}
          </Tag>
        </div>
      )}
      {files.length === 0 ? (
        <EmptyState icon="📷" title="Sin evidencias" description="El técnico aún no ha cargado fotos o documentos para esta actividad." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {files.map((ev) => (
            <li
              key={ev.id}
              style={{
                padding: 14,
                borderRadius: 10,
                border: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{ev.tipo ?? `Evidencia #${ev.id}`}</div>
                {ev.descripcion && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{ev.descripcion}</div>
                )}
              </div>
              {ev.url && (
                <a
                  href={buildApiUrl(ev.url.replace(/^\//, ""))}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}
                >
                  Ver
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
