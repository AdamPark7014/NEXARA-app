"use client";

import Link from "next/link";
import Section from "@/components/ui/Section";
import EmptyState from "@/components/ui/EmptyState";
import { DetailError } from "@/components/detail/DetailFrame";
import { useOpsProjectDetail } from "@/components/ops/OpsProjectDetailShell";

export default function OpsProjectActivitiesPage() {
  const { project, error, reload } = useOpsProjectDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!project) return null;

  const activities = project.activities ?? [];

  return (
    <Section title={`${activities.length} actividades vinculadas`}>
      {activities.length === 0 ? (
        <EmptyState icon="🧰" title="Sin actividades" description="Este proyecto operativo aún no tiene OTs asignadas." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {activities.map((a) => (
            <li
              key={a.id}
              style={{
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Link href={`/ops/activities/${a.id}`} style={{ color: "var(--primary)", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                  {a.anNumber} · {a.titulo}
                </Link>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>{a.estatus}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
