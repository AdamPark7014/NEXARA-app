"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type CalEvent = {
  id: string;
  source: "CRM" | "MAINTENANCE" | "ACTIVITY" | "TENDER" | "PROJECT";
  type: string;
  title: string;
  description?: string;
  start: string;
  end?: string;
  ownerId?: number | null;
  ownerName?: string | null;
  color: string;
  url?: string;
  metadata?: Record<string, any>;
};

const SOURCE_ICONS: Record<string, string> = {
  CRM: "💼",
  MAINTENANCE: "🔧",
  ACTIVITY: "🛠️",
  TENDER: "📋",
  PROJECT: "🏗️",
};

const SOURCE_LABELS: Record<string, string> = {
  CRM: "CRM",
  MAINTENANCE: "Mantenimiento",
  ACTIVITY: "OT",
  TENDER: "Licitación",
  PROJECT: "Proyecto",
};

export default function CalendarPage() {
  const { user } = useUser();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Set<string>>(new Set(["CRM", "MAINTENANCE", "ACTIVITY", "TENDER", "PROJECT"]));
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const first = new Date(viewMonth.year, viewMonth.month, 1);
      const last = new Date(viewMonth.year, viewMonth.month + 1, 0, 23, 59, 59);
      const url = `calendar/events?from=${first.toISOString()}&to=${last.toISOString()}`;
      const res = await fetch(buildApiUrl(url), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setEvents(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token, viewMonth]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => events.filter((e) => filters.has(e.source)), [events, filters]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    filtered.forEach((e) => {
      const d = new Date(e.start).toISOString().slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    });
    return map;
  }, [filtered]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const first = new Date(viewMonth.year, viewMonth.month, 1);
    const last = new Date(viewMonth.year, viewMonth.month + 1, 0);
    const startWeekday = first.getDay(); // 0 = Sun
    const daysInMonth = last.getDate();
    const days: Array<{ date: Date; inMonth: boolean }> = [];
    // Pad before
    for (let i = startWeekday; i > 0; i--) {
      const d = new Date(first);
      d.setDate(first.getDate() - i);
      days.push({ date: d, inMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(viewMonth.year, viewMonth.month, i), inMonth: true });
    }
    // Pad after to fill 6 weeks = 42 cells
    while (days.length < 42) {
      const lastDay = days[days.length - 1].date;
      const d = new Date(lastDay);
      d.setDate(d.getDate() + 1);
      days.push({ date: d, inMonth: d.getMonth() === viewMonth.month });
    }
    return days;
  }, [viewMonth]);

  const toggleFilter = (src: string) => {
    const next = new Set(filters);
    if (next.has(src)) next.delete(src);
    else next.add(src);
    setFilters(next);
  };

  const navigate = (delta: number) => {
    const d = new Date(viewMonth.year, viewMonth.month + delta, 1);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>📅 Calendario unificado</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Vista consolidada de actividades CRM, visitas de mantenimiento, OT, licitaciones y proyectos.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={() => navigate(-1)} style={navBtnStyle}>◀</button>
          <strong style={{ fontSize: 16, minWidth: 180, textAlign: "center" }}>
            {new Date(viewMonth.year, viewMonth.month, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
          </strong>
          <button type="button" onClick={() => navigate(1)} style={navBtnStyle}>▶</button>
          <button type="button" onClick={() => { const d = new Date(); setViewMonth({ year: d.getFullYear(), month: d.getMonth() }); }} style={{ ...navBtnStyle, fontSize: 12 }}>Hoy</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {Object.entries(SOURCE_LABELS).map(([src, label]) => (
          <button
            key={src}
            type="button"
            onClick={() => toggleFilter(src)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: filters.has(src) ? "var(--primary)" : "var(--bg-secondary)",
              color: filters.has(src) ? "#fff" : "var(--text-primary)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {SOURCE_ICONS[src]} {label}
          </button>
        ))}
      </div>

      {loading ? <p>Cargando…</p> : (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--border)" }}>
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
              <div key={d} style={{ padding: 8, background: "var(--bg-secondary)", textAlign: "center", fontSize: 12, fontWeight: 700 }}>{d}</div>
            ))}
            {calendarDays.map((cell, i) => {
              const iso = cell.date.toISOString().slice(0, 10);
              const dayEvents = eventsByDay.get(iso) || [];
              const isToday = iso === today;
              return (
                <div
                  key={i}
                  style={{
                    minHeight: 110,
                    padding: 6,
                    background: "var(--bg-primary)",
                    opacity: cell.inMonth ? 1 : 0.4,
                    borderTop: isToday ? "3px solid var(--primary)" : "3px solid transparent",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? "var(--primary)" : "var(--text-secondary)" }}>
                    {cell.date.getDate()}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                    {dayEvents.slice(0, 4).map((e) => (
                      <EventChip key={e.id} event={e} />
                    ))}
                    {dayEvents.length > 4 && (
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center" }}>+ {dayEvents.length - 4} más</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, padding: 12, background: "var(--bg-secondary)", borderRadius: 8 }}>
            <strong style={{ fontSize: 12 }}>Total eventos visibles: {filtered.length}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function EventChip({ event }: { event: CalEvent }) {
  const inner = (
    <div
      style={{
        padding: "2px 6px",
        background: `${event.color}22`,
        borderLeft: `3px solid ${event.color}`,
        borderRadius: 4,
        fontSize: 10,
        cursor: event.url ? "pointer" : "default",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={`${event.title}${event.description ? ` — ${event.description}` : ""}`}
    >
      <strong>{SOURCE_ICONS[event.source]}</strong> {event.title}
    </div>
  );
  return event.url ? (
    <Link href={event.url} style={{ textDecoration: "none", color: "inherit" }}>{inner}</Link>
  ) : inner;
}

const navBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  cursor: "pointer",
  borderRadius: 6,
  fontWeight: 600,
};
