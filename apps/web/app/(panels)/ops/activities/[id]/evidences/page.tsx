"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { buildApiUrl } from "@/lib/api-base";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import ActivityEvidenceReviewPanel from "@/components/ops/ActivityEvidenceReviewPanel";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";
import KpiCard from "@/components/ui/KpiCard";

const ActivityEvidenceFlow = dynamic(() => import("@/components/ActivityEvidenceFlow"), { ssr: false });

export default function ActivityEvidencesPage() {
  const { activity, error, reload } = useActivityDetail();
  const { user } = useUser();
  const v2 = resolveV2RoleKey(user);
  const canUpload = v2 === ROLES.ING_CAMPO || v2 === ROLES.ING_SOPORTE || user?.isSuperAdmin;

  useEffect(() => {
    if (typeof window === "undefined" || !activity?.id) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("activityId") !== String(activity.id)) {
      url.searchParams.set("activityId", String(activity.id));
      window.history.replaceState({}, "", url.toString());
    }
  }, [activity?.id]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const files = activity.evidencias ?? [];
  const review = activity.activityEvidence;

  const reviewStatus = review?.reviewStatus ?? null;
  const reviewVariant = reviewStatus === "APROBADA" || reviewStatus === "APPROVED" ? "positive" : reviewStatus === "RECHAZADA" || reviewStatus === "REJECTED" ? "danger" : review ? "warning" : "default";

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Archivos" value={files.length} icon="📎" variant={files.length > 0 ? "accent" : "default"} />
        <KpiCard label="Paquete" value={review ? "Enviado" : "Sin enviar"} icon={review ? "📦" : "⏳"} variant={review ? "accent" : "default"} />
        <KpiCard label="Revisión" value={(reviewStatus ?? "Pendiente").replace(/_/g, " ")} icon="🔍" variant={reviewVariant} />
        <KpiCard label="Puede cargar" value={canUpload ? "Sí" : "No"} icon="⬆️" variant={canUpload ? "positive" : "default"} />
      </div>
      {review && (
        <ActivityEvidenceReviewPanel activity={activity} showHeader={false} />
      )}

      {review && (
        <DetailSection title="Estado del paquete">
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
              <div style={{ fontSize: 13, fontWeight: 600 }}>Revisión de evidencias</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                {review.reviewedBy?.nombre ? `Revisado por ${review.reviewedBy.nombre}` : "Pendiente de revisión"}
              </div>
            </div>
            <Tag variant={review.reviewStatus === "APROBADA" || review.reviewStatus === "APPROVED" ? "positive" : review.reviewStatus === "RECHAZADA" || review.reviewStatus === "REJECTED" ? "danger" : "warning"}>
              {(review.reviewStatus ?? "PENDIENTE").replace(/_/g, " ")}
            </Tag>
          </div>
        </DetailSection>
      )}

      {canUpload && (
        <DetailSection title="Captura de evidencias">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
            Foto de entrada, evidencias en sitio, hoja de servicio y foto de salida.
          </p>
          <ActivityEvidenceFlow />
        </DetailSection>
      )}

      <DetailSection title={`Archivos (${files.length})`}>
        {files.length === 0 ? (
          <EmptyState icon="📷" title="Sin archivos adjuntos" description={canUpload ? "Usa el flujo de arriba para documentar la visita." : "El técnico aún no ha cargado evidencias."} />
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
    </>
  );
}
