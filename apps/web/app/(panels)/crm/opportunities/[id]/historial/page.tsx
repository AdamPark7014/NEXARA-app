"use client";

import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useOpportunityDetail } from "@/components/crm/OpportunityDetailShell";

export default function OpportunityHistoryPage() {
  const { opportunity, error, reload } = useOpportunityDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!opportunity) return null;

  const notes = [...(opportunity.notes ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const events: Array<{ at: string; label: string }> = [];
  if (opportunity.createdAt) events.push({ at: opportunity.createdAt, label: "Oportunidad creada" });
  if (opportunity.updatedAt) events.push({ at: opportunity.updatedAt, label: "Última actualización" });
  for (const n of notes) {
    events.push({ at: n.createdAt, label: `Nota: ${n.message.slice(0, 80)}${n.message.length > 80 ? "…" : ""}` });
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <DetailSection title="Historial">
      <DetailFieldGrid>
        <DetailField label="Etapa actual" value={opportunity.stage} />
        <DetailField label="Probabilidad" value={`${opportunity.probability}%`} />
      </DetailFieldGrid>
      <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gap: 10 }}>
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
    </DetailSection>
  );
}
