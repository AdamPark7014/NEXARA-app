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
import { IntegraHlsPlayer } from "../_HlsPlayer";
import {
  defaultRangeHours,
  fromDatetimeLocalValue,
  inputStyle,
  integraApi,
  selectStyle,
  toDatetimeLocalValue,
} from "../_lib";
import styles from "../integra.module.css";

type Cam = {
  id: string;
  name: string;
  region?: string;
  status?: string | number;
  encodeDevIndexCode?: string | null;
};

type StreamSlot = {
  id: string;
  name: string;
  hls: string | null;
  rtsp: string | null;
  note?: string | null;
  provider?: string | null;
};

export default function IntegraVideoPage() {
  const [items, setItems] = useState<Cam[]>([]);
  const [region, setRegion] = useState("");
  const [q, setQ] = useState("");
  const [slots, setSlots] = useState<StreamSlot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pb0 = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    return { begin: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) };
  }, []);
  const [begin, setBegin] = useState(pb0.begin);
  const [end, setEnd] = useState(pb0.end);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await integraApi<{ items: Cam[] }>("integra/cameras");
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const regions = useMemo(() => {
    const s = new Set<string>();
    for (const c of items) if (c.region) s.add(c.region);
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((c) => {
        if (region && c.region !== region) return false;
        if (!q) return true;
        const qq = q.toLowerCase();
        return (
          c.name.toLowerCase().includes(qq) ||
          c.id.toLowerCase().includes(qq) ||
          (c.encodeDevIndexCode || "").toLowerCase().includes(qq)
        );
      }),
    [items, region, q],
  );

  const playLive = async (cam: Cam, multi = false) => {
    setBusy(cam.id);
    setError(null);
    setSelected(cam.id);
    setPlaybackUrl(null);
    try {
      const data = await integraApi<{
        hls: string | null;
        rtsp: string | null;
        note?: string;
        provider?: string;
      }>(`integra/cameras/${encodeURIComponent(cam.id)}/stream`, { method: "POST" });
      setNote(data.note || null);
      const slot: StreamSlot = {
        id: cam.id,
        name: cam.name,
        hls: data.hls,
        rtsp: data.rtsp,
        note: data.note,
        provider: data.provider,
      };
      setSlots((prev) => {
        if (!multi) return [slot];
        const without = prev.filter((s) => s.id !== cam.id);
        return [...without, slot].slice(-4);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error stream");
    } finally {
      setBusy(null);
    }
  };

  const onlineish = (status?: string | number) => {
    const s = String(status ?? "");
    return s === "1" || s === "online" || s === "";
  };

  return (
    <IgPage>
      <IgToolbar
        title="Video wall"
        meta={`${filtered.length}/${items.length} cams · wall ${slots.length}/4`}
        actions={
          <>
            <IgBtn onClick={() => setSlots([])}>Limpiar wall</IgBtn>
            <IgBtn onClick={() => void load()}>Refresh</IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>

      <IgFilters>
        <IgField label="Región">
          <select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle}>
            <option value="">Todas</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </IgField>
        <IgField label="Buscar">
          <input value={q} onChange={(e) => setQ(e.target.value)} style={inputStyle} placeholder="nombre / id / encode" />
        </IgField>
      </IgFilters>

      {slots.length > 0 && (
        <div className={styles.camGrid}>
          {slots.map((s) => (
            <div key={s.id} className={styles.camTile}>
              <div className={styles.camTileHead}>
                <span>{s.name}</span>
                <IgBtn onClick={() => setSlots((p) => p.filter((x) => x.id !== s.id))}>✕</IgBtn>
              </div>
              <div className={styles.camTileBody}>
                {s.provider === "HCT" ? (
                  <div style={{ color: "#94a3b8", fontSize: 12, padding: 12 }}>{s.note || "HCT"}</div>
                ) : (
                  <IntegraHlsPlayer src={s.hls} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <IgSplit
        leftWidth="48%"
        left={
          <IgPanel title="Inventario" count={filtered.length} flush>
            <IgTable
              selectedKey={selected}
              onRowClick={(key) => {
                const cam = items.find((c) => c.id === key);
                if (cam) void playLive(cam, true);
              }}
              columns={[
                { key: "n", label: "Cámara" },
                { key: "r", label: "Región" },
                { key: "e", label: "Encoder", mono: true },
                { key: "s", label: "Estado" },
                { key: "x", label: "", width: "120px" },
              ]}
              rows={filtered.map((c) => ({
                key: c.id,
                tone: onlineish(c.status) ? "ok" : "warn",
                cells: {
                  n: c.name,
                  r: c.region || "—",
                  e: c.encodeDevIndexCode || "—",
                  s: (
                    <IgBadge tone={onlineish(c.status) ? "ok" : "warn"}>
                      {String(c.status ?? "—")}
                    </IgBadge>
                  ),
                  x: (
                    <div style={{ display: "flex", gap: 4 }}>
                      <IgBtn
                        disabled={busy === c.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void playLive(c, true);
                        }}
                      >
                        +
                      </IgBtn>
                      <IgBtn
                        variant="primary"
                        disabled={busy === c.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void playLive(c, false);
                        }}
                      >
                        Live
                      </IgBtn>
                    </div>
                  ),
                },
              }))}
              empty="Sin cámaras"
            />
          </IgPanel>
        }
        right={
          <IgPanel title="Foco / playback" count={selected || "—"}>
            {note && <p className={styles.doorCellMeta}>{note}</p>}
            {slots.length === 1 && slots[0].provider !== "HCT" && <IntegraHlsPlayer src={slots[0].hls} />}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <IgBtn
                disabled={!selected}
                onClick={async () => {
                  if (!selected) return;
                  setBusy("cap");
                  try {
                    await integraApi(`integra/cameras/${encodeURIComponent(selected)}/capture`, {
                      method: "POST",
                    });
                    setNote("Snapshot OK");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error capture");
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Snapshot
              </IgBtn>
              {slots[0]?.rtsp && (
                <IgBtn onClick={() => void navigator.clipboard.writeText(slots[0].rtsp!)}>
                  Copiar RTSP
                </IgBtn>
              )}
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ig-muted)" }}>
                Playback
              </strong>
              <IgField label="Inicio">
                <input type="datetime-local" value={begin} onChange={(e) => setBegin(e.target.value)} style={inputStyle} />
              </IgField>
              <IgField label="Fin">
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
              </IgField>
              <div style={{ display: "flex", gap: 6 }}>
                <IgBtn
                  onClick={() => {
                    const r = defaultRangeHours(1);
                    setBegin(r.start);
                    setEnd(r.end);
                  }}
                >
                  1h
                </IgBtn>
                <IgBtn
                  variant="primary"
                  disabled={!selected || busy === "pb"}
                  onClick={async () => {
                    if (!selected) return;
                    const beginTime = fromDatetimeLocalValue(begin);
                    const endTime = fromDatetimeLocalValue(end);
                    if (!beginTime || !endTime) return;
                    setBusy("pb");
                    try {
                      const data = await integraApi<{ url: string | null }>(
                        `integra/cameras/${encodeURIComponent(selected)}/playback`,
                        { method: "POST", body: JSON.stringify({ beginTime, endTime }) },
                      );
                      setPlaybackUrl(data.url);
                      setNote(data.url ? "Playback listo" : "Sin URL");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error playback");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Obtener
                </IgBtn>
              </div>
              {playbackUrl && (
                <code style={{ fontSize: 10, wordBreak: "break-all" }}>{playbackUrl}</code>
              )}
            </div>
          </IgPanel>
        }
      />
    </IgPage>
  );
}
