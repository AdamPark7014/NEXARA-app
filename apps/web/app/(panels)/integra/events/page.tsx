"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DashPage,
  DashHero,
  DashPanel,
  ListRow,
  DashPill,
  DashGrid,
  DashCol,
} from "@/components/dashboard/DashKit";
import styles from "../integra.module.css";
import {
  btnGhost,
  btnPrimary,
  defaultRangeHours,
  fromDatetimeLocalValue,
  inputStyle,
  integraApi,
  selectStyle,
} from "../_lib";

type Ev = {
  id: string;
  doorId?: string;
  doorName?: string;
  personId?: string;
  personName?: string;
  cardNo?: string;
  eventType?: string;
  eventTypeCode?: number;
  timestamp?: string;
  picUri?: string;
  readerName?: string;
};

type Door = { id: string; name: string };

export default function IntegraEventsPage() {
  const range0 = useMemo(() => defaultRangeHours(24), []);
  const [items, setItems] = useState<Ev[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [total, setTotal] = useState(0);
  const [doorId, setDoorId] = useState("");
  const [personName, setPersonName] = useState("");
  const [personId, setPersonId] = useState("");
  const [eventType, setEventType] = useState("");
  const [start, setStart] = useState(range0.start);
  const [end, setEnd] = useState(range0.end);
  const [limit, setLimit] = useState(80);
  const [pageNo, setPageNo] = useState(1);
  const [thumb, setThumb] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void integraApi<{ items: Door[] }>("integra/doors")
      .then((d) => setDoors(d.items))
      .catch(() => setDoors([]));
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      q.set("limit", String(limit));
      q.set("pageNo", String(pageNo));
      if (doorId) q.set("doorId", doorId);
      if (personName.trim()) q.set("personName", personName.trim());
      if (personId.trim()) q.set("personId", personId.trim());
      if (eventType.trim()) q.set("eventType", eventType.trim());
      const st = fromDatetimeLocalValue(start);
      const et = fromDatetimeLocalValue(end);
      if (st) q.set("startTime", st);
      if (et) q.set("endTime", et);
      const data = await integraApi<{ items: Ev[]; total?: number }>(`integra/events?${q}`);
      setItems(data.items);
      setTotal(data.total ?? data.items.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, [doorId, personName, personId, eventType, start, end, limit, pageNo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [auto, load]);

  const loadPic = async (picUri: string) => {
    try {
      const data = await integraApi<Record<string, unknown>>("integra/events/picture", {
        method: "POST",
        body: JSON.stringify({ picUri }),
      });
      const src =
        (typeof data.picUrl === "string" && data.picUrl) ||
        (typeof data.url === "string" && data.url) ||
        (typeof data.picture === "string" && data.picture.startsWith("data:")
          ? data.picture
          : null);
      setThumb(src || JSON.stringify(data).slice(0, 240));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error foto");
    }
  };

  const preset = (hours: number) => {
    const r = defaultRangeHours(hours);
    setStart(r.start);
    setEnd(r.end);
    setPageNo(1);
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Eventos ACS"
        title="Timeline de accesos"
        subtitle="Filtros Artemis: rango, puerta (doorIndexCodes), eventType, persona · fotos vía proxy."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={btnGhost} onClick={() => setAuto((v) => !v)}>
              Auto {auto ? "ON" : "OFF"}
            </button>
            <button type="button" style={btnPrimary} disabled={busy} onClick={() => void load()}>
              {busy ? "…" : "Buscar"}
            </button>
          </div>
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
          <span className={styles.filterLabel}>Puerta</span>
          <select value={doorId} onChange={(e) => { setDoorId(e.target.value); setPageNo(1); }} style={selectStyle}>
            <option value="">Todas</option>
            {doors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Persona</span>
          <input placeholder="Nombre contiene…" value={personName} onChange={(e) => setPersonName(e.target.value)} style={inputStyle} />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>personId</span>
          <input placeholder="Opcional" value={personId} onChange={(e) => setPersonId(e.target.value)} style={inputStyle} />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>eventType</span>
          <input placeholder="ej. 196893" value={eventType} onChange={(e) => setEventType(e.target.value)} style={{ ...inputStyle, maxWidth: 120 }} />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>pageSize</span>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ ...inputStyle, maxWidth: 90 }}>
            {[40, 80, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Presets</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={btnGhost} onClick={() => preset(1)}>1h</button>
            <button type="button" style={btnGhost} onClick={() => preset(24)}>24h</button>
            <button type="button" style={btnGhost} onClick={() => preset(168)}>7d</button>
          </div>
        </div>
      </div>

      <DashGrid>
        <DashCol span={thumb ? 8 : 12}>
          <DashPanel title="Resultados" subtitle={`página ${pageNo} · ${items.length} / total Artemis ${total}`}>
            <div className={styles.tableScroll}>
              {items.map((e) => (
                <ListRow
                  key={e.id || `${e.timestamp}-${e.doorId}-${e.personId}`}
                  title={e.personName || e.eventType || "Evento"}
                  sub={[
                    e.doorName || e.doorId,
                    e.eventType,
                    e.eventTypeCode != null ? `#${e.eventTypeCode}` : null,
                    e.cardNo ? `card ${e.cardNo}` : null,
                    e.readerName,
                    e.timestamp,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  trail={
                    e.picUri ? (
                      <button type="button" style={btnGhost} onClick={() => void loadPic(e.picUri!)}>
                        Foto
                      </button>
                    ) : (
                      <DashPill tone="neutral">sin foto</DashPill>
                    )
                  }
                />
              ))}
              {items.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin eventos en el rango.</p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" style={btnGhost} disabled={pageNo <= 1} onClick={() => setPageNo((p) => Math.max(1, p - 1))}>
                ← Página
              </button>
              <button type="button" style={btnGhost} onClick={() => setPageNo((p) => p + 1)}>
                Página →
              </button>
            </div>
          </DashPanel>
        </DashCol>
        {thumb && (
          <DashCol span={4}>
            <DashPanel title="Foto evento" subtitle="proxy API">
              {thumb.startsWith("http") || thumb.startsWith("data:") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="evento" style={{ maxWidth: "100%" }} />
              ) : (
                <code style={{ fontSize: 11, wordBreak: "break-all" }}>{thumb}</code>
              )}
              <button type="button" style={{ ...btnGhost, marginTop: 8 }} onClick={() => setThumb(null)}>
                Cerrar
              </button>
            </DashPanel>
          </DashCol>
        )}
      </DashGrid>
    </DashPage>
  );
}
