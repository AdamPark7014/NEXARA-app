"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

interface CalendarEvent {
  id: string;
  source: "CRM" | "MAINTENANCE" | "ACTIVITY" | "TENDER" | "PROJECT" | string;
  type: string;
  title: string;
  description?: string;
  start: string;
  end?: string;
  ownerName?: string | null;
  color: string;
  url?: string;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

const SOURCE_LABEL: Record<string, string> = {
  CRM: "CRM", MAINTENANCE: "Mantenimiento", ACTIVITY: "Actividad OPS", TENDER: "Licitación", PROJECT: "Proyecto",
};

export default function CalendarPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(30);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + rangeDays * 86400000).toISOString();
      const data = await apiFetch(`calendar/events?from=${from}&to=${to}`, token);
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el calendario");
    } finally { setLoading(false); }
  }, [token, rangeDays]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const day = new Date(ev.start).toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "short" });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    return Array.from(map.entries()).sort((a, b) => new Date(a[1][0].start).getTime() - new Date(b[1][0].start).getTime());
  }, [events]);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Mi cuenta"
        title="Mi calendario"
        subtitle="Eventos agregados de OT (OPS), citas comerciales (CRM), visitas de mantenimiento y deadlines de licitación."
        actions={
          <>
            <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}>
              <option value={7}>Próximos 7 días</option>
              <option value={30}>Próximos 30 días</option>
              <option value={90}>Próximos 90 días</option>
            </select>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
          </>
        }
      />

      <Section title={loading ? "Cargando…" : `${events.length} eventos`}>
        {loading && <EmptyState icon="⏳" title="Cargando agenda…" description="Consultando eventos de todos los módulos." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && grouped.length === 0 && <EmptyState icon="📅" title="Sin eventos próximos" description="No hay citas, OT ni vencimientos en este rango." />}
        {!loading && !error && grouped.map(([day, evs]) => (
          <div key={day} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>{day}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {evs.map((ev) => (
                <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, borderLeftWidth: 4, borderLeftColor: ev.color || "var(--primary)" }}>
                  <Tag variant="default">{SOURCE_LABEL[ev.source] ?? ev.source}</Tag>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{ev.title}</div>
                    {ev.ownerName && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{ev.ownerName}</div>}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                    {new Date(ev.start).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}
