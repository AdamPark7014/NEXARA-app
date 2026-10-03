"use client";

// Evidencias de la actividad. Vivía en /ops/activities/[id]/evidences y Core la
// reexportaba; ahora vive aquí, que es la única superficie alcanzable.

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { buildApiUrl } from "@/lib/api-base";
import EquipoEvidencias from "@/components/ops/EquipoEvidencias";
import EvidenciaPorCampos from "@/components/ops/EvidenciaPorCampos";
import { puedeSubirFotoDePunto } from "@/lib/evidencia-campos";
import { esActividadComercial } from "@/lib/evidence-flow-helpers";
import { quienMira, useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { Alert, Button, EmptyState, RecordSection, SkeletonRows, Stat, StatRow, buttonClass } from "@/components/base";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import UploadOutlinedIcon from "@mui/icons-material/UploadOutlined";
import s from "./evidencias.module.css";

const ActivityEvidenceFlow = dynamic(() => import("@/components/ActivityEvidenceFlow"), {
  ssr: false,
  loading: () => <SkeletonRows rows={4} label="Cargando captura de evidencias" />,
});

export default function ActivityEvidencesPage() {
  const { activity, core, error, reload } = useActivityDetail();
  const { user } = useUser();
  // En despacho, el LEAD solo reparte: no sube evidencias.
  // Core: solo quien la ejecuta captura (equipo o responsable). Christian y los superiores revisan abajo.
  const { reparte, puedeCapturar: canUpload } = activity
    ? quienMira(activity, user, core)
    : { reparte: false, puedeCapturar: false };
  const puedeSubirPuntos = puedeSubirFotoDePunto({
    userId: user?.id,
    responsableId: activity?.responsable?.id,
    assignmentCharge: activity?.assignmentCharge,
    asignados: (activity?.assignees ?? []).map((m) => ({
      userId: m.userId ?? m.user?.id,
      rol: m.rol,
      retirado: Boolean(m.retiradoAt),
    })),
  });

  useEffect(() => {
    if (typeof window === "undefined" || !activity?.id) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("activityId") !== String(activity.id)) {
      url.searchParams.set("activityId", String(activity.id));
      window.history.replaceState({}, "", url.toString());
    }
  }, [activity?.id]);

  // La ficha (shell) ya pinta la carga y el error cuando la actividad no llegó.
  if (!activity) return null;

  const files = activity.evidencias ?? [];

  return (
    <>
      {error ? (
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" variant="tertiary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          No se pudo actualizar: {error}
        </Alert>
      ) : null}
      {!core && (
        <StatRow cols={2} ariaLabel="Resumen de evidencias">
          <Stat label="Archivos" value={files.length} icon={<AttachFileOutlinedIcon fontSize="inherit" />} />
          <Stat
            label="Puede cargar"
            value={canUpload ? "Sí" : "No"}
            tone={canUpload ? "success" : "default"}
            icon={<UploadOutlinedIcon fontSize="inherit" />}
          />
        </StatRow>
      )}
      {reparte && (
        <Alert tone="info" title="Tú repartes esta actividad">
          En despacho tu parte es pasarla a quien la ejecuta; no subes evidencias. El registro de a quién se la
          pasaste está en la pestaña Historial.
        </Alert>
      )}
      {canUpload && (
        <div id="captura" className={s.ancla}>
          <RecordSection
            title="Captura de evidencias"
            subtitle={
              esActividadComercial(activity.coreKind)
                ? "Inicio de actividad, evidencias, cotización y conclusión de actividad."
                : "Foto de entrada, evidencias en sitio, hoja de servicio y foto de salida."
            }
          >
            <ActivityEvidenceFlow />
          </RecordSection>
        </div>
      )}

      <EvidenciaPorCampos
        activityId={activity.id}
        anNumber={activity.anNumber}
        titulo={activity.titulo}
        puedeSubir={puedeSubirPuntos}
      />

      <div id="revision" className={s.ancla}>
        <EquipoEvidencias activityId={activity.id} />
      </div>

      {(files.length > 0 || !core) && (
        <RecordSection title="Otros archivos" subtitle={`${files.length} archivo${files.length === 1 ? "" : "s"} suelto${files.length === 1 ? "" : "s"}`}>
          {files.length === 0 ? (
            <EmptyState
              tone="neutral"
              size="compact"
              icon={<AttachFileOutlinedIcon fontSize="inherit" />}
              title="Sin otros archivos"
              description="Aquí aparecen archivos sueltos adjuntos a la actividad."
            />
          ) : (
            <ul className={s.archivos}>
              {files.map((ev) => (
                <li key={ev.id} className={s.archivo}>
                  <div className={s.archivoTexto}>
                    <span className={s.archivoT}>{ev.tipo ?? `Evidencia #${ev.id}`}</span>
                    {ev.descripcion ? <span className={s.archivoM}>{ev.descripcion}</span> : null}
                  </div>
                  {ev.url ? (
                    <a
                      href={buildApiUrl(ev.url.replace(/^\//, ""))}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass("secondary", { size: "sm" })}
                    >
                      Ver
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </RecordSection>
      )}
    </>
  );
}
