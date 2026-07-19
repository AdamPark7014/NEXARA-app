"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
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
  CRM: "CRM",
  MAINTENANCE: "Mantenimiento",
  ACTIVITY: "OPS · Actividad",
  TENDER: "Licitación",
  PROJECT: "Proyecto",
};

const SOURCE_VARIANT: Record<string, "accent" | "warning" | "positive" | "neutral" | "default"> = {
  CRM: "accent",
  MAINTENANCE: "warning",
  ACTIVITY: "default",
  TENDER: "neutral",
  PROJECT: "positive",
};

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function isTomorrow(iso: string) {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return new Date(iso).toDateString() === t.toDateString();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default function CalendarPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [searchQ, setSearchQ] = useState("");
  const [filterSource, setFilterSource] = useState("");

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

  const visibleEvents = useMemo(() => {
    let rows = events;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((ev) =>
        ev.title.toLowerCase().includes(q) ||
        (ev.ownerName ?? "").toLowerCase().includes(q) ||
        (ev.description ?? "").toLowerCase().includes(q)
      );
    }
    if (filterSource) rows = rows.filter((ev) => ev.source === filterSource);
    return rows;
  }, [events, searchQ, filterSource]);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of visibleEvents) {
      const day = new Date(ev.start).toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "short" });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    return Array.from(map.entries()).sort((a, b) => new Date(a[1][0].start).getTime() - new Date(b[1][0].start).getTime());
  }, [visibleEvents]);

  const todayCount = events.filter((ev) => isToday(ev.start)).length;
  const tomorrowCount = events.filter((ev) => isTomorrow(ev.start)).length;
  const bySource = useMemo(() => {
    const m: Record<string, number> = {};
    for (const ev of events) m[ev.source] = (m[ev.source] ?? 0) + 1;
    return m;
  }, [events]);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Mi cuenta"
        title="Mi calendario"
        subtitle="Eventos agregados de OT (OPS), citas comerciales (CRM), visitas de mantenimiento y deadlines de licitación."
        actions={
          <>
            <select
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value))}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
            >
              <option value={7}>Próximos 7 días</option>
              <option value={30}>Próximos 30 días</option>
              <option value={90}>Próximos 90 días</option>
            </select>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
          </>
        }
      />

      {!loading && !error && events.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Hoy" value={todayCount} icon="📅" variant={todayCount > 0 ? "accent" : "default"} hint="Eventos de hoy" />
          <KpiCard label="Mañana" value={tomorrowCount} icon="🗓️" hint="Eventos de mañana" />
          <KpiCard label="Total período" value={events.length} icon="📋" hint={`Próximos ${rangeDays} días`} />
          {bySource.CRM != null && <KpiCard label="CRM" value={bySource.CRM} icon="🤝" variant="accent" hint="Citas y seguimientos" />}
          {bySource.ACTIVITY != null && <KpiCard label="OPS" value={bySource.ACTIVITY} icon="🔧" hint="Órdenes de trabajo" />}
          {bySource.MAINTENANCE != null && <KpiCard label="Mantenimiento" value={bySource.MAINTENANCE} icon="⚙️" variant="warning" hint="Visitas programadas" />}
        </div>
      )}

      {!loading && !error && events.length > 0 && Object.keys(bySource).length > 1 && (() => {
        const total = events.length;
        const sourceColors: Record<string, string> = { CRM: "var(--success)", ACTIVITY: "var(--primary)", MAINTENANCE: "var(--warning)", TENDER: "#a855f7", PROJECT: "var(--danger)" };
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Eventos por módulo</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
                <div key={s} style={{ display: "grid", gridTemplateColumns: "130px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{SOURCE_LABEL[s] ?? s}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: sourceColors[s] ?? "var(--primary)", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por título, responsable o descripción…" }}
        selects={[
          {
            label: "Origen",
            value: filterSource,
            onChange: setFilterSource,
            options: Object.keys(SOURCE_LABEL).map((k) => ({ value: k, label: SOURCE_LABEL[k] })),
            allowAll: true,
          },
        ]}
        onClear={() => { setSearchQ(""); setFilterSource(""); }}
        resultCount={loading ? null : visibleEvents.length}
        rightActions={events.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleEvents, [
            { key: "id", label: "ID" },
            { key: "source", label: "Origen" },
            { key: "type", label: "Tipo" },
            { key: "title", label: "Título" },
            { key: "ownerName", label: "Responsable" },
            { key: "start", label: "Inicio", format: (v) => v ? String(v).slice(0, 16).replace("T", " ") : "" },
            { key: "end", label: "Fin", format: (v) => v ? String(v).slice(0, 16).replace("T", " ") : "" },
          ], "calendario")}>Excel</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${visibleEvents.length} eventos`}>
        {loading && <EmptyState icon="⏳" title="Cargando agenda…" description="Consultando eventos de todos los módulos." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && grouped.length === 0 && <EmptyState icon="📅" title="Sin eventos" description="No hay citas, OT ni vencimientos en este rango o filtro." />}
        {!loading && !error && grouped.map(([day, evs]) => (
          <div key={day} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>{day}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {evs.map((ev) => {
                const inner = (
                  <div style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto",
                    alignItems: "center", gap: 12, padding: "10px 14px",
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 10, borderLeftWidth: 4, borderLeftColor: ev.color || "var(--primary)",
                    cursor: ev.url ? "pointer" : "default",
                  }}>
                    <Tag variant={SOURCE_VARIANT[ev.source] ?? "default"}>{SOURCE_LABEL[ev.source] ?? ev.source}</Tag>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{ev.title}</div>
                      {(ev.ownerName || ev.description) && (
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                          {ev.ownerName ? `${ev.ownerName}${ev.description ? " · " : ""}` : ""}
                          {ev.description?.slice(0, 80)}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                      {fmtTime(ev.start)}{ev.end ? ` – ${fmtTime(ev.end)}` : ""}
                    </span>
                  </div>
                );
                return ev.url ? (
                  <Link key={ev.id} href={ev.url} style={{ textDecoration: "none" }}>{inner}</Link>
                ) : (
                  <div key={ev.id}>{inner}</div>
                );
              })}
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}
