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

export default function IntegraAnprPage() {
  const range0 = useMemo(() => defaultRangeHours(24), []);
  const [items, setItems] = useState<any[]>([]);
  const [start, setStart] = useState(range0.start);
  const [end, setEnd] = useState(range0.end);
  const [pageSize, setPageSize] = useState(50);
  const [pageNo, setPageNo] = useState(1);
  const [plateQ, setPlateQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await integraApi<any>("integra/anpr/cross-records", {
        method: "POST",
        body: JSON.stringify({
          pageNo,
          pageSize,
          startTime: fromDatetimeLocalValue(start),
          endTime: fromDatetimeLocalValue(end),
        }),
      });
      let list: any[] = data?.list || data?.data?.list || [];
      if (plateQ.trim()) {
        const q = plateQ.trim().toLowerCase();
        list = list.filter((r) => String(r.plateNo || "").toLowerCase().includes(q));
      }
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error — requiere licencia PMS");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="ANPR / PMS"
        title="Cruces de placa"
        subtitle="crossRecords/page · rango + paginación · filtro placa local sobre resultados."
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
            {[25, 50, 100].map((n) => (
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
          <span className={styles.filterLabel}>Placa (filtro UI)</span>
          <input
            placeholder="ABC123"
            value={plateQ}
            onChange={(e) => setPlateQ(e.target.value.toUpperCase())}
            style={inputStyle}
          />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Presets</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={btnGhost} onClick={() => { const r = defaultRangeHours(24); setStart(r.start); setEnd(r.end); }}>24h</button>
            <button type="button" style={btnGhost} onClick={() => { const r = defaultRangeHours(168); setStart(r.start); setEnd(r.end); }}>7d</button>
          </div>
        </div>
      </div>

      <DashPanel title="Cruces" subtitle={`${items.length}`}>
        <div className={styles.tableScroll}>
          {items.map((r, i) => (
            <ListRow
              key={r.crossRecordSyscode || `${r.plateNo}-${r.crossTime}-${i}`}
              title={r.plateNo || "—"}
              sub={[r.crossTime, r.entranceName, r.vehicleType, r.vehicleOut].filter(Boolean).join(" · ")}
            />
          ))}
          {items.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              Sin cruces o PMS no licenciado en el sitio.
            </p>
          )}
        </div>
      </DashPanel>
    </DashPage>
  );
}
