"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IgBadge,
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgPage,
  IgPanel,
  IgSplit,
  IgTable,
  IgToolbar,
} from "../_Console";
import {
  defaultRangeHours,
  fromDatetimeLocalValue,
  inputStyle,
  integraApi,
  selectStyle,
} from "../_lib";
import styles from "../integra.module.css";

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
  const [limit, setLimit] = useState(100);
  const [pageNo, setPageNo] = useState(1);
  const [selected, setSelected] = useState<Ev | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
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
    const t = setInterval(() => void load(), 20000);
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

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("es-MX", { hour12: false }) : "—";

  return (
    <IgPage>
      <IgToolbar
        title="Eventos ACS"
        meta={`pág ${pageNo} · ${items.length}/${total} · auto ${auto ? "20s" : "off"}`}
        actions={
          <>
            <IgBtn onClick={() => setAuto((v) => !v)}>Auto {auto ? "ON" : "OFF"}</IgBtn>
            <IgBtn variant="primary" disabled={busy} onClick={() => void load()}>
              {busy ? "…" : "Buscar"}
            </IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>

      <IgFilters>
        <IgField label="Desde">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
        </IgField>
        <IgField label="Hasta">
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
        </IgField>
        <IgField label="Puerta">
          <select value={doorId} onChange={(e) => { setDoorId(e.target.value); setPageNo(1); }} style={selectStyle}>
            <option value="">Todas</option>
            {doors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </IgField>
        <IgField label="Persona">
          <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="contiene…" style={inputStyle} />
        </IgField>
        <IgField label="ID persona">
          <input value={personId} onChange={(e) => setPersonId(e.target.value)} placeholder="opcional" style={inputStyle} title="ID de persona" />
        </IgField>
        <IgField label="Tipo evento">
          <input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="código" style={{ ...inputStyle, maxWidth: 110 }} title="Tipo de evento" />
        </IgField>
        <IgField label="Por página">
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ ...inputStyle, maxWidth: 80 }}>
            {[50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </IgField>
        <IgField label="Rango">
          <div style={{ display: "flex", gap: 4 }}>
            <IgBtn onClick={() => preset(1)}>1h</IgBtn>
            <IgBtn onClick={() => preset(24)}>24h</IgBtn>
            <IgBtn onClick={() => preset(168)}>7d</IgBtn>
          </div>
        </IgField>
      </IgFilters>

      <IgSplit
        leftWidth="68%"
        left={
          <IgPanel title="Timeline" count={`${items.length}`} flush>
            <IgTable
              selectedKey={selected?.id}
              onRowClick={(key) => {
                const row = items.find((e) => (e.id || `${e.timestamp}`) === key) || null;
                setSelected(row);
                setThumb(null);
              }}
              columns={[
                { key: "t", label: "Hora", width: "18%", mono: true },
                { key: "p", label: "Persona" },
                { key: "d", label: "Puerta" },
                { key: "ty", label: "Tipo" },
                { key: "c", label: "Card", mono: true },
                { key: "r", label: "Reader" },
                { key: "f", label: "Foto", width: "70px" },
              ]}
              rows={items.map((e) => ({
                key: e.id || `${e.timestamp}-${e.doorId}-${e.personId}`,
                cells: {
                  t: fmt(e.timestamp),
                  p: e.personName || e.personId || "—",
                  d: e.doorName || e.doorId || "—",
                  ty: (
                    <>
                      {e.eventType || "—"}{" "}
                      {e.eventTypeCode != null && (
                        <IgBadge tone="neutral">#{e.eventTypeCode}</IgBadge>
                      )}
                    </>
                  ),
                  c: e.cardNo || "—",
                  r: e.readerName || "—",
                  f: e.picUri ? (
                    <IgBtn
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void loadPic(e.picUri!);
                        setSelected(e);
                      }}
                    >
                      Ver
                    </IgBtn>
                  ) : (
                    "—"
                  ),
                },
              }))}
              empty="Sin eventos en el rango"
            />
            <div style={{ display: "flex", gap: 6, padding: 8 }}>
              <IgBtn disabled={pageNo <= 1} onClick={() => setPageNo((p) => Math.max(1, p - 1))}>
                ←
              </IgBtn>
              <IgBtn onClick={() => setPageNo((p) => p + 1)}>→</IgBtn>
            </div>
          </IgPanel>
        }
        right={
          <IgPanel title="Detalle" count={selected ? selected.id.slice(0, 12) : "—"}>
            {!selected ? (
              <p className={styles.igEmpty}>Selecciona una fila</p>
            ) : (
              <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                <div><strong>{selected.personName || "Sin persona"}</strong></div>
                <div className={styles.doorCellMeta}>{fmt(selected.timestamp)}</div>
                <div>Puerta: {selected.doorName || selected.doorId}</div>
                <div>Tipo: {selected.eventType} {selected.eventTypeCode != null ? `(${selected.eventTypeCode})` : ""}</div>
                <div>Card: {selected.cardNo || "—"}</div>
                <div>Reader: {selected.readerName || "—"}</div>
                <div className={styles.doorCellMeta}>ID persona {selected.personId || "—"}</div>
                {selected.picUri && (
                  <IgBtn variant="primary" onClick={() => void loadPic(selected.picUri!)}>
                    Cargar foto
                  </IgBtn>
                )}
                {thumb && (
                  thumb.startsWith("http") || thumb.startsWith("data:") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="evento" style={{ maxWidth: "100%", border: "1px solid var(--ig-line)" }} />
                  ) : (
                    <code style={{ fontSize: 10, wordBreak: "break-all" }}>{thumb}</code>
                  )
                )}
              </div>
            )}
          </IgPanel>
        }
      />
    </IgPage>
  );
}
