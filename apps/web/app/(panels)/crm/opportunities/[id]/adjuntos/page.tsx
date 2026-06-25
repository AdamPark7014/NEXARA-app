"use client";

import EmptyState from "@/components/ui/EmptyState";
import { buildApiUrl } from "@/lib/api-base";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import { useOpportunityDetail } from "@/components/crm/OpportunityDetailShell";

function assetUrl(path: string) {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return buildApiUrl(clean);
}

export default function OpportunityAttachmentsPage() {
  const { opportunity, error, reload } = useOpportunityDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!opportunity) return null;

  const files = opportunity.evidences ?? [];

  return (
    <DetailSection title="Adjuntos y evidencias">
      {files.length === 0 ? (
        <EmptyState icon="📎" title="Sin archivos" description="Sube PDFs o imágenes desde el módulo comercial o la app móvil." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {files.map((f) => (
            <li
              key={f.id}
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
                <div style={{ fontWeight: 600, fontSize: 14 }}>{f.fileName || `Archivo #${f.id}`}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{f.kind || "documento"}</div>
              </div>
              <a href={assetUrl(f.fileUrl)} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
                Abrir
              </a>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
