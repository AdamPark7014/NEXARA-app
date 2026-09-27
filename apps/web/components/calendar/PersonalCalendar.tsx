"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CrossPanelLink from "@/components/CrossPanelLink";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip from "@/components/ui/MetricStrip";
import InlineAlert from "@/components/ui/InlineAlert";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { formatApiError } from "@/lib/erp-api";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import styles from "./PersonalCalendar.module.css";

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
  CRM: "Cita comercial",
  MAINTENANCE: "Mantenimiento",
  ACTIVITY: "Actividad de campo",
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

const RANGES = [7, 30, 90] as const;
const DAY_MS = 86_400_000;

const dayKey = (d: Date) => d.toLocaleDateString("sv-SE");
const timeFmt = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
const exportFmt = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" });

function fmtTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : timeFmt.format(d);
}

function dayLabel(key: string, todayKey: string, tomorrowKey: string, sample: Date) {
  if (key === todayKey) return "Hoy";
  if (key === tomorrowKey) return "Mañana";
  return dayFmt.format(sample);
}

/** Agenda personal: eventos de todos los módulos en los próximos días. */
export default function PersonalCalendar({ embedded = false }: { embedded?: boolean }) {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [searchQ, setSearchQ] = useState("");
  const [filterSource, setFilterSource] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + rangeDays * DAY_MS).toISOString();
      const data = await apiFetch(`calendar/events?from=${from}&to=${to}`, token);
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(formatApiError(e, "No pudimos cargar tu agenda."));
    } finally {
      setLoading(false);
    }
  }, [token, rangeDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => events ?? [], [events]);

  const visibleEvents = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return all.filter(
      (ev) =>
        (!filterSource || ev.source === filterSource) &&
        (!q ||
          ev.title.toLowerCase().includes(q) ||
          (ev.ownerName ?? "").toLowerCase().includes(q) ||
          (ev.description ?? "").toLowerCase().includes(q)),
    );
  }, [all, searchQ, filterSource]);

  const { todayKey, tomorrowKey } = useMemo(() => {
    const now = new Date();
    return { todayKey: dayKey(now), tomorrowKey: dayKey(new Date(now.getTime() + DAY_MS)) };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { sample: Date; items: CalendarEvent[] }>();
    for (const ev of visibleEvents) {
      const d = new Date(ev.start);
      if (Number.isNaN(d.getTime())) continue;
      const key = dayKey(d);
      const bucket = map.get(key);
      if (bucket) bucket.items.push(ev);
      else map.set(key, { sample: d, items: [ev] });
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { sample, items }]) => ({
        key,
        label: dayLabel(key, todayKey, tomorrowKey, sample),
        items: items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
      }));
  }, [visibleEvents, todayKey, tomorrowKey]);

  const counts = useMemo(() => {
    let today = 0;
    let tomorrow = 0;
    for (const ev of all) {
      const k = dayKey(new Date(ev.start));
      if (k === todayKey) today++;
      else if (k === tomorrowKey) tomorrow++;
    }
    return { today, tomorrow };
  }, [all, todayKey, tomorrowKey]);

  const controls = (
    <div className={styles.toolbar}>
      <select aria-label="Periodo" className={styles.select} value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
        {RANGES.map((d) => (
          <option key={d} value={d}>Próximos {d} días</option>
        ))}
      </select>
      <Button variant="ghost" iconLeft="↻" onClick={() => void load()} loading={loading && events !== null} disabled={loading}>
        Actualizar
      </Button>
    </div>
  );

  const subtitle = "Actividades de campo, citas comerciales, visitas de mantenimiento y fechas límite de licitaciones.";

  return (
    <>
      {embedded ? null : <PageHeader eyebrow="Mi cuenta" title="Mi agenda" subtitle={subtitle} actions={controls} />}

      {error && (
        <InlineAlert
          variant={events ? "warning" : "danger"}
          message={events ? `No pudimos actualizar tu agenda; mostramos la última versión. ${error}` : error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
        />
      )}

      {events !== null && all.length > 0 && (
        <div className={styles.metrics}>
          <MetricStrip
            ariaLabel="Resumen de tu agenda"
            metrics={[
              { label: "hoy", value: counts.today, tone: counts.today > 0 ? "warning" : "default" },
              { label: "mañana", value: counts.tomorrow },
              { label: `próximos ${rangeDays} días`, value: all.length },
            ]}
          />
        </div>
      )}

      <Section
        title={embedded ? "Mi agenda" : events === null ? "Eventos" : `${visibleEvents.length.toLocaleString("es-MX")} ${visibleEvents.length === 1 ? "evento" : "eventos"}`}
        subtitle={embedded ? subtitle : undefined}
        actions={embedded ? controls : undefined}
      >
        <FilterToolbar
          search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por título, responsable o descripción…" }}
          selects={[
            {
              label: "Tipo de evento",
              value: filterSource,
              onChange: setFilterSource,
              options: Object.keys(SOURCE_LABEL).map((k) => ({ value: k, label: SOURCE_LABEL[k] })),
              allowAll: true,
              allLabel: "Todos los tipos",
            },
          ]}
          onClear={() => {
            setSearchQ("");
            setFilterSource("");
          }}
          resultCount={events === null ? null : visibleEvents.length}
          rightActions={all.length > 0 ? (
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleEvents, [
              { key: "source", label: "Tipo", format: (v) => SOURCE_LABEL[String(v)] ?? String(v ?? "") },
              { key: "title", label: "Título" },
              { key: "ownerName", label: "Responsable" },
              { key: "start", label: "Inicio", format: (v) => (v ? exportFmt.format(new Date(String(v))) : "") },
              { key: "end", label: "Fin", format: (v) => (v ? exportFmt.format(new Date(String(v))) : "") },
            ], "agenda")}>Excel</Button>
          ) : undefined}
        />

        {events === null && loading ? (
          <div className={styles.events} aria-busy="true" aria-label="Cargando agenda">
            {[0, 1, 2, 3].map((i) => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : events === null ? null : grouped.length === 0 ? (
          <EmptyState
            icon="📅"
            title={all.length > 0 ? "Sin coincidencias" : "Agenda libre"}
            description={
              all.length > 0
                ? "Ningún evento coincide con la búsqueda o el tipo elegido."
                : `No tienes citas, actividades ni fechas límite en los próximos ${rangeDays} días.`
            }
          />
        ) : (
          grouped.map((day) => (
            <section key={day.key} className={styles.day} aria-labelledby={`dia-${day.key}`}>
              <h3 id={`dia-${day.key}`} className={`${styles.dayTitle} ${day.key === todayKey ? styles.dayToday : ""}`}>
                {day.label}
              </h3>
              <ul className={styles.events}>
                {day.items.map((ev) => {
                  const sub = [ev.ownerName, ev.description?.slice(0, 90)].filter(Boolean).join(" · ");
                  const inner = (
                    <>
                      <Tag variant={SOURCE_VARIANT[ev.source] ?? "default"}>{SOURCE_LABEL[ev.source] ?? "Evento"}</Tag>
                      <div style={{ minWidth: 0 }}>
                        <div className={styles.eventTitle}>{ev.title}</div>
                        {sub && <div className={styles.eventSub}>{sub}</div>}
                      </div>
                      <time className={styles.time} dateTime={ev.start}>
                        {fmtTime(ev.start)}
                        {ev.end ? ` – ${fmtTime(ev.end)}` : ""}
                      </time>
                    </>
                  );
                  const accent = { boxShadow: `inset 4px 0 0 ${ev.color || "var(--primary)"}` };
                  return (
                    <li key={ev.id}>
                      {ev.url ? (
                        <CrossPanelLink href={ev.url} className={styles.event} style={accent}>
                          {inner}
                        </CrossPanelLink>
                      ) : (
                        <div className={styles.event} style={accent}>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </Section>
    </>
  );
}
