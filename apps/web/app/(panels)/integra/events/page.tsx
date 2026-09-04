"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IgBadge,
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgNotice,
  IgPage,
  IgPanel,
  IgToolbar,
} from "../_Console";
import { subscribePushEvents, type PushEvent } from "../_DetectionOverlay";
import { PersonFaceThumb, prefetchPersonFace } from "../_PersonFace";
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

type LiveHit = {
  id: number;
  at: number;
  personName: string;
  personId: string | null;
  door: string;
  photoPath: string | null;
  verifyMode: string | null;
  label: string | null;
};

const LIVE_TTL_MS = 90_000;

function fmt(iso?: string) {
  return iso ? new Date(iso).toLocaleString("es-MX", { hour12: false }) : "—";
}

function relAge(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 1) return "ahora";
  if (s < 60) return `hace ${s}s`;
  return `hace ${Math.floor(s / 60)}m`;
}

export default function IntegraEventsPage() {
  const router = useRouter();
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
  const [picByUri, setPicByUri] = useState<Record<string, string>>({});
  const [liveHits, setLiveHits] = useState<LiveHit[]>([]);
  const [auto, setAuto] = useState(true);
  const [faceOnly, setFaceOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

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
      for (const e of data.items) {
        if (e.personId) prefetchPersonFace(e.personId);
      }
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

  // Flash ACS en vivo (<1 s vía SSE) encima del historial Artemis/ISAPI.
  useEffect(() => {
    return subscribePushEvents((events: PushEvent[]) => {
      const fresh: LiveHit[] = [];
      for (const ev of events) {
        const name = ev.personName?.trim();
        if (!name) continue;
        const at = Date.parse(ev.occurredAt);
        if (!Number.isFinite(at) || Date.now() - at > LIVE_TTL_MS) continue;
        if (ev.personId) prefetchPersonFace(ev.personId);
        fresh.push({
          id: ev.id,
          at,
          personName: name,
          personId: ev.personId ?? null,
          door: ev.deviceName || ev.deviceIp || "Acceso",
          photoPath: ev.photoPath ?? null,
          verifyMode: ev.verifyMode ?? null,
          label: ev.label ?? null,
        });
      }
      if (!fresh.length) return;
      setLiveHits((prev) => {
        const map = new Map(prev.map((h) => [h.id, h]));
        for (const h of fresh) {
          const old = map.get(h.id);
          map.set(h.id, old ? { ...h, photoPath: h.photoPath || old.photoPath } : h);
        }
        return [...map.values()].sort((a, b) => b.at - a.at).slice(0, 24);
      });
    });
  }, []);

  useEffect(() => {
    if (liveHits.length === 0) return;
    const id = window.setInterval(() => {
      const cut = Date.now() - LIVE_TTL_MS;
      setLiveHits((prev) => prev.filter((h) => h.at > cut));
      setTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [liveHits.length]);

  const loadPic = useCallback(async (picUri: string) => {
    if (!picUri || picByUri[picUri]) return;
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
      if (src) setPicByUri((prev) => ({ ...prev, [picUri]: src }));
    } catch {
      /* la tarjeta sigue con foto enrolada */
    }
  }, [picByUri]);

  // Prefetch fotos de evento (pocas en paralelo) para la rejilla.
  useEffect(() => {
    const need = items.filter((e) => e.picUri && !picByUri[e.picUri!]).slice(0, 12);
    for (const e of need) void loadPic(e.picUri!);
  }, [items, picByUri, loadPic]);

  const preset = (hours: number) => {
    const r = defaultRangeHours(hours);
    setStart(r.start);
    setEnd(r.end);
    setPageNo(1);
  };

  return (
    <IgPage>
      <IgToolbar
        title="Eventos ACS"
        meta={
          busy
            ? "Cargando…"
            : `pág ${pageNo} · ${items.length}/${total} · vivo ${liveHits.length} · auto ${auto ? "20s" : "off"}`
        }
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
      <p className={styles.attNote}>
        Identidad solo desde terminales ACS (nombre + foto). Las cajas ópticas de
        oficina dicen «Humano · sin ID» — no es Face ID sobre AcuSense.
      </p>

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

      {liveHits.length > 0 && (
        <IgPanel title="En vivo · ACS" count={liveHits.length}>
          <div className={styles.evGrid}>
            {liveHits.map((h) => (
              <article
                key={h.id}
                className={styles.evCard}
                data-live="1"
                data-fresh={Date.now() - h.at < 4000 ? "1" : undefined}
              >
                <PersonFaceThumb
                  className={styles.evPhoto}
                  size="xl"
                  personId={h.personId}
                  personName={h.personName}
                  photoPath={h.photoPath}
                />
                <div className={styles.evBody}>
                  <strong className={styles.evName}>{h.personName}</strong>
                  <span className={styles.evMeta}>{h.door}</span>
                  <span className={styles.evTime}>{relAge(h.at)}</span>
                  <div className={styles.evChips}>
                    <IgBadge tone="ok">{h.label || "Acceso"}</IgBadge>
                    {h.verifyMode && <IgBadge tone="accent">{h.verifyMode}</IgBadge>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </IgPanel>
      )}

      <IgPanel title="Timeline" count={`${items.length}`}>
        {items.length === 0 && !busy ? (
          <div className={styles.igEmpty}>
            <strong className={styles.igEmptyTitle}>Sin eventos en el rango</strong>
            <span className={styles.igEmptyHint}>Prueba 24h o quita filtros de puerta/persona.</span>
          </div>
        ) : (
          <div className={styles.evGrid}>
            {items.map((e) => {
              const key = e.id || `${e.timestamp}-${e.doorId}-${e.personId}`;
              const pic = e.picUri ? picByUri[e.picUri] : null;
              const sel = selected?.id === e.id;
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.evCard}
                  data-selected={sel ? "1" : undefined}
                  onClick={() => {
                    setSelected(e);
                    if (e.picUri) void loadPic(e.picUri);
                  }}
                >
                  <PersonFaceThumb
                    className={styles.evPhoto}
                    size="xl"
                    personId={e.personId}
                    personName={e.personName || null}
                    photoPath={pic}
                  />
                  <div className={styles.evBody}>
                    <strong className={styles.evName}>
                      {e.personName || e.personId || "Sin identidad ACS"}
                    </strong>
                    <span className={styles.evMeta}>
                      {e.doorName || e.doorId || "Puerta"}
                      {e.readerName ? ` · ${e.readerName}` : ""}
                    </span>
                    <span className={styles.evTime}>{fmt(e.timestamp)}</span>
                    <div className={styles.evChips}>
                      <IgBadge tone="neutral">{e.eventType || "evento"}</IgBadge>
                      {e.eventTypeCode != null && (
                        <IgBadge tone="neutral">#{e.eventTypeCode}</IgBadge>
                      )}
                      {e.cardNo && <IgBadge tone="accent">{e.cardNo}</IgBadge>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className={styles.evPager}>
          <IgBtn disabled={pageNo <= 1} onClick={() => setPageNo((p) => Math.max(1, p - 1))}>
            ← Anterior
          </IgBtn>
          <span className={styles.evPagerMeta}>Página {pageNo}</span>
          <IgBtn onClick={() => setPageNo((p) => p + 1)}>Siguiente →</IgBtn>
        </div>
      </IgPanel>

      {selected && (
        <IgPanel title="Detalle" count={selected.id.slice(0, 16)}>
          <div className={styles.evDetail}>
            <PersonFaceThumb
              className={styles.evDetailPhoto}
              size="xl"
              personId={selected.personId}
              personName={selected.personName || null}
              photoPath={selected.picUri ? picByUri[selected.picUri] : null}
            />
            <div className={styles.evDetailBody}>
              <strong>{selected.personName || "Sin persona ACS"}</strong>
              <span>{fmt(selected.timestamp)}</span>
              <span>Puerta: {selected.doorName || selected.doorId || "—"}</span>
              <span>
                Tipo: {selected.eventType || "—"}
                {selected.eventTypeCode != null ? ` (${selected.eventTypeCode})` : ""}
              </span>
              <span>Tarjeta: {selected.cardNo || "—"}</span>
              <span>Lector: {selected.readerName || "—"}</span>
              <span className={styles.doorCellMeta}>ID {selected.personId || "—"}</span>
              {selected.picUri && !picByUri[selected.picUri] && (
                <IgBtn variant="primary" onClick={() => void loadPic(selected.picUri!)}>
                  Cargar foto del evento
                </IgBtn>
              )}
            </div>
          </div>
        </IgPanel>
      )}
    </IgPage>
  );
}
