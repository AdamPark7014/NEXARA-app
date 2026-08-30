"use client";

import { useMemo, useState } from "react";
import { DashPage, DashHero, DashPanel, ListRow } from "@/components/dashboard/DashKit";
import styles from "../integra.module.css";
import {
  btnGhost,
  btnPrimary,
  defaultRangeHours,
  fromDatetimeLocalValue,
  inputStyle,
  integraApi,
} from "../_lib";

export default function IntegraAlarmsPage() {
  const range0 = useMemo(() => defaultRangeHours(24), []);
  const [items, setItems] = useState<any[]>([]);
  const [start, setStart] = useState(range0.start);
  const [end, setEnd] = useState(range0.end);
  const [pageSize, setPageSize] = useState(50);
  const [pageNo, setPageNo] = useState(1);
  const [eventTypes, setEventTypes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        pageNo,
        pageSize,
        startTime: fromDatetimeLocalValue(start),
        endTime: fromDatetimeLocalValue(end),
      };
      const types = eventTypes
        .split(/[,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n));
      if (types.length === 1) body.eventType = types[0];
      else if (types.length > 1) body.eventTypes = types;

      const data = await integraApi<any>("integra/alarms/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const list = data?.list || data?.data?.list || (Array.isArray(data) ? data : []);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Alarmas"
        title="eventService"
        subtitle="eventRecords/page con rango, pageNo/pageSize y eventType(s) documentados."
        actions={
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => void search()}>
            {busy ? "…" : "Buscar"}
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className={styles.filterBar}>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Desde</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Hasta</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>pageSize</span>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ ...inputStyle, maxWidth: 90 }}>
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>pageNo</span>
          <input
            type="number"
            min={1}
            value={pageNo}
            onChange={(e) => setPageNo(Math.max(1, Number(e.target.value) || 1))}
            style={{ ...inputStyle, maxWidth: 80 }}
          />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>eventType(s)</span>
          <input
            placeholder="opcional, ej. 131329 o 1,2"
            value={eventTypes}
            onChange={(e) => setEventTypes(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Presets</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={btnGhost} onClick={() => { const r = defaultRangeHours(1); setStart(r.start); setEnd(r.end); }}>1h</button>
            <button type="button" style={btnGhost} onClick={() => { const r = defaultRangeHours(24); setStart(r.start); setEnd(r.end); }}>24h</button>
          </div>
        </div>
      </div>

      <DashPanel title="Registros" subtitle={`${items.length}`}>
        <div className={styles.tableScroll}>
          {items.map((a, i) => (
            <ListRow
              key={a.eventId || a.id || i}
              title={a.eventTypeName || a.eventType || a.title || "Alarma"}
              sub={[a.srcName, a.happenTime || a.eventTime, a.eventId].filter(Boolean).join(" · ")}
            />
          ))}
          {items.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              Sin resultados o licencia eventService no disponible.
            </p>
          )}
        </div>
      </DashPanel>
    </DashPage>
  );
}
