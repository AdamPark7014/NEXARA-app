"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { buildApiUrl } from "@/lib/api-base";
import EmptyState from "@/components/ui/EmptyState";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import EquipoEvidencias from "@/components/ops/EquipoEvidencias";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";
import { isCeoEmail } from "@/lib/activity-kinds";
import KpiCard from "@/components/ui/KpiCard";

const ActivityEvidenceFlow = dynamic(() => import("@/components/ActivityEvidenceFlow"), { ssr: false });

export default function ActivityEvidencesPage() {
  const { activity, error, reload, core } = useActivityDetail();
  const { user } = useUser();
  const v2 = resolveV2RoleKey(user);
  // En despacho, el LEAD solo reparte: no sube evidencias.
  const myRow = activity?.assignees?.find((m) => m.user?.id === user?.id && !m.retiradoAt);
  const despacho = activity?.assignmentCharge === "despacho";
  const soyResponsable = Boolean(user?.id && activity?.responsable?.id === user.id);
  const reparte = despacho && (myRow?.rol === "LEAD" || (soyResponsable && !myRow));
  // Core: solo quien la ejecuta captura (equipo o responsable). Christian y los superiores revisan abajo.
  const canUpload = core
    ? !isCeoEmail(user?.email) && !reparte && (Boolean(myRow) || soyResponsable)
    : v2 === ROLES.ING_CAMPO || v2 === ROLES.ING_SOPORTE || user?.isSuperAdmin;

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

  return (
    <>
      {!core && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
          <KpiCard label="Archivos" value={files.length} icon="📎" variant={files.length > 0 ? "accent" : "default"} />
          <KpiCard label="Puede cargar" value={canUpload ? "Sí" : "No"} icon="⬆️" variant={canUpload ? "positive" : "default"} />
        </div>
      )}
      {reparte && (
        <DetailSection title="Tú repartes esta actividad">
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            En despacho tu parte es pasarla a quien la ejecuta; no subes evidencias. El registro de a quién se la
            pasaste está en la pestaña Historial.
          </p>
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

      <div style={{ marginBottom: 16 }}>
        <EquipoEvidencias activityId={activity.id} />
      </div>

      {(files.length > 0 || !core) && (
      <DetailSection title={`Otros archivos (${files.length})`}>
        {files.length === 0 ? (
          <EmptyState icon="📎" title="Sin otros archivos" description="Aquí aparecen archivos sueltos adjuntos a la actividad." />
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
      )}
    </>
  );
}
