"use client";

import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useOpportunityDetail } from "@/components/crm/OpportunityDetailShell";
import { formatOpportunityStage } from "@/lib/sales-api";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 2) return "Justo ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `Hace ${days} día${days !== 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OpportunityHistoryPage() {
  const { opportunity, error, reload } = useOpportunityDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!opportunity) return null;

  const notes = [...(opportunity.notes ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  type EventItem = { at: string; label: string; type: "created" | "updated" | "note" };
  const events: EventItem[] = [];
  if (opportunity.createdAt) events.push({ at: opportunity.createdAt, label: "Oportunidad creada", type: "created" });
  if (opportunity.updatedAt && opportunity.updatedAt !== opportunity.createdAt) {
    events.push({ at: opportunity.updatedAt, label: "Última actualización", type: "updated" });
  }
  for (const n of notes) {
    events.push({ at: n.createdAt, label: `Nota: ${n.message.slice(0, 100)}${n.message.length > 100 ? "…" : ""}`, type: "note" });
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const typeConfig = {
    created: { emoji: "🎯", color: "var(--success)" },
    updated: { emoji: "✏️", color: "var(--primary)" },
    note: { emoji: "💬", color: "var(--warning)" },
  };

  return (
    <DetailSection title="Línea de tiempo">
      <div style={{ marginBottom: 16 }}>
      <DetailFieldGrid>
        <DetailField label="Etapa actual" value={formatOpportunityStage(opportunity.stage)} />
        <DetailField label="Probabilidad" value={`${opportunity.probability}%`} />
      </DetailFieldGrid>
      </div>

      {events.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Sin eventos registrados aún.</p>
      ) : (
        <div style={{ position: "relative", paddingLeft: 28 }}>
          <div style={{ position: "absolute", left: 9, top: 10, bottom: 10, width: 2, background: "var(--border)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {events.map((ev, idx) => {
              const cfg = typeConfig[ev.type];
              return (
                <div key={`${ev.at}-${idx}`} style={{ position: "relative", paddingBottom: idx < events.length - 1 ? 16 : 0 }}>
                  <div style={{
                    position: "absolute", left: -28, top: 12,
                    width: 18, height: 18, borderRadius: "50%",
                    background: cfg.color, border: "2px solid var(--surface)", zIndex: 1,
                  }} />
                  <div style={{
                    padding: "11px 14px",
                    background: idx === 0 ? "color-mix(in srgb, var(--primary) 5%, var(--surface))" : "var(--surface)",
                    border: `1px solid ${idx === 0 ? "color-mix(in srgb, var(--primary) 20%, var(--border))" : "var(--border)"}`,
                    borderRadius: 10,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: ev.type === "note" ? 400 : 600, fontSize: 13, lineHeight: 1.45 }}>
                        {cfg.emoji} {ev.label}
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0, paddingTop: 1 }}>{relativeTime(ev.at)}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 3 }}>{formatDateTime(ev.at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DetailSection>
  );
}
