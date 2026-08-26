"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { listActivityTimeline, type ActivityTimelineEvent } from "@/lib/ops-activities-api";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 2) return "Justo ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.round(hrs / 24)}d`;
}

export default function ActivityHistoryPage() {
  const { activity, error, reload } = useActivityDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const [events, setEvents] = useState<ActivityTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const loadTimeline = useCallback(async () => {
    if (!token || !activity?.id) return;
    setLoading(true);
    setTimelineError(null);
    try {
      const data = await listActivityTimeline(token, activity.id);
      setEvents(data.events ?? []);
    } catch (e) {
      setTimelineError(e instanceof Error ? e.message : "No se pudo cargar el historial");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [token, activity?.id]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const isCompleted = !!activity.fechaFinalizacion;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Eventos" value={events.length} icon="📅" />
        <KpiCard label="Estado" value={isCompleted ? "Finalizada" : activity.estatus} icon="⚙️" variant={isCompleted ? "positive" : "accent"} />
      </div>

      <DetailSection title="Línea de tiempo unificada">
        {loading && <EmptyState icon="⏳" title="Cargando historial…" description="" />}
        {timelineError && (
          <EmptyState
            icon="⚠️"
            title="Historial limitado"
            description={timelineError}
            action={<Button size="sm" variant="secondary" onClick={() => void loadTimeline()}>Reintentar</Button>}
          />
        )}

        {!loading && !timelineError && events.length === 0 && (
          <EmptyState icon="🕐" title="Sin eventos" description="Aún no hay movimientos registrados en esta actividad." />
        )}

        {!loading && events.length > 0 && (
          <div style={{ position: "relative", paddingLeft: 28 }}>
            <div style={{ position: "absolute", left: 9, top: 10, bottom: 10, width: 2, background: "var(--border)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {events.map((ev, idx) => (
                <div key={ev.id} style={{ position: "relative", paddingBottom: idx < events.length - 1 ? 16 : 0 }}>
                  <div
                    style={{
                      position: "absolute",
                      left: -28,
                      top: 12,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "var(--primary)",
                      border: "2px solid var(--surface)",
                      zIndex: 1,
                    }}
                  />
                  <div
                    style={{
                      padding: "12px 14px",
                      background: idx === 0 ? "color-mix(in srgb, var(--primary) 5%, var(--surface))" : "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {ev.icon} {ev.title}
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{relativeTime(ev.at)}</span>
                    </div>
                    <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                      <Tag variant="neutral">{ev.kind}</Tag>
                      {ev.subtitle && <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{ev.subtitle}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>{formatDateTime(ev.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DetailSection>
    </>
  );
}
