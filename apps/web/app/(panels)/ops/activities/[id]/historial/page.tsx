"use client";

import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";

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

const EVENT_ICON: Record<string, string> = {
  "Actividad asignada": "📋",
  "Inicio en campo": "🚀",
  "Entrega esperada": "📅",
  "Finalizada": "✅",
};

export default function ActivityHistoryPage() {
  const { activity, error, reload } = useActivityDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const events: Array<{ at: string; label: string; isPast: boolean }> = [];
  const now = new Date();

  if (activity.fechaAsignacion) {
    events.push({ at: activity.fechaAsignacion, label: "Actividad asignada", isPast: new Date(activity.fechaAsignacion) < now });
  }
  if (activity.fechaInicio) {
    events.push({ at: activity.fechaInicio, label: "Inicio en campo", isPast: new Date(activity.fechaInicio) < now });
  }
  if (activity.fechaEntregaEsperada) {
    const d = new Date(activity.fechaEntregaEsperada);
    const overdue = d < now && activity.estatus !== "COMPLETADA" && activity.estatus !== "CANCELADA";
    events.push({ at: activity.fechaEntregaEsperada, label: overdue ? "⚠️ Entrega esperada (vencida)" : "Entrega esperada", isPast: d < now });
  }
  if (activity.fechaFinalizacion) {
    events.push({ at: activity.fechaFinalizacion, label: "Finalizada", isPast: new Date(activity.fechaFinalizacion) < now });
  }
  if (activity.activityEvidence?.reviewedAt) {
    events.push({
      at: activity.activityEvidence.reviewedAt,
      label: `Evidencia ${(activity.activityEvidence.status ?? "revisada").toLowerCase()}`,
      isPast: true,
    });
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <DetailSection title="Línea de tiempo">
      {events.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Sin eventos registrados aún.</p>
      ) : (
        <div style={{ position: "relative", paddingLeft: 28 }}>
          {/* Vertical line */}
          <div style={{ position: "absolute", left: 9, top: 10, bottom: 10, width: 2, background: "var(--border)" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {events.map((ev, idx) => {
              const icon = Object.keys(EVENT_ICON).find((k) => ev.label.includes(k.replace("⚠️ ", "")));
              const emoji = icon ? EVENT_ICON[icon] : "🔵";
              const isFirst = idx === 0;
              return (
                <div key={`${ev.at}-${idx}`} style={{ position: "relative", paddingBottom: idx < events.length - 1 ? 20 : 0 }}>
                  {/* Dot on timeline */}
                  <div style={{
                    position: "absolute",
                    left: -28,
                    top: 12,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: ev.label.includes("vencida") ? "var(--danger)" : ev.isPast ? "var(--success)" : "var(--primary)",
                    border: "2px solid var(--surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    zIndex: 1,
                  }} />
                  <div style={{
                    padding: "12px 14px",
                    background: isFirst ? "color-mix(in srgb, var(--primary) 5%, var(--surface))" : "var(--surface)",
                    border: `1px solid ${isFirst ? "color-mix(in srgb, var(--primary) 20%, var(--border))" : "var(--border)"}`,
                    borderRadius: 10,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{emoji} {ev.label}</div>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }}>{relativeTime(ev.at)}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>{formatDateTime(ev.at)}</div>
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
