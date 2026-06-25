"use client";

import Link from "next/link";
import Section from "@/components/ui/Section";
import { DetailError, DetailField, DetailFieldGrid, formatDate } from "@/components/detail/DetailFrame";
import { useOpsProjectDetail } from "@/components/ops/OpsProjectDetailShell";

export default function OpsProjectSummaryPage() {
  const { project, error, reload } = useOpsProjectDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!project) return null;

  return (
    <>
      <Section title="Datos generales">
        <DetailFieldGrid>
          <DetailField label="Cliente" value={project.client?.name} />
          <DetailField label="Responsable" value={project.vendor?.nombre} />
          <DetailField label="Inicio" value={formatDate(project.startDate)} />
          <DetailField label="Fin planeado" value={formatDate(project.endDate)} />
          <DetailField label="Tipo" value={project.projectType ?? "—"} />
          <DetailField label="Sitios" value={project.siteCount ?? "—"} />
          <DetailField label="Actividades" value={project.activities?.length ?? 0} />
        </DetailFieldGrid>
        {project.scopeSummary && (
          <div style={{ marginTop: 12 }}>
            <DetailField label="Alcance" value={project.scopeSummary} />
          </div>
        )}
      </Section>

      {project.salesProjectId && (
        <p style={{ marginTop: 16, fontSize: 13 }}>
          <Link href={`/crm/projects/${project.salesProjectId}`} style={{ color: "var(--primary)", fontWeight: 600 }}>
            Ver proyecto comercial →
          </Link>
        </p>
      )}
    </>
  );
}
