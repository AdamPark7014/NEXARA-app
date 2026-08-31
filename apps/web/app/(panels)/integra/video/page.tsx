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
import { IntegraEzuiKitPlayer } from "../_EzuiKitPlayer";
import { IntegraHlsPlayer } from "../_HlsPlayer";
import {
  defaultRangeHours,
  fromDatetimeLocalValue,
  inputStyle,
  integraApi,
  selectStyle,
  toDatetimeLocalValue,
} from "../_lib";
import { getCachedProvider, subscribeProvider } from "../_caps";
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
  stream?: Record<string, unknown> | null;
};

const LAYOUT_KEY = "nexara_integra_video_layout";

export default function IntegraVideoPage() {
  const [items, setItems] = useState<Cam[]>([]);
  const [region, setRegion] = useState("");
  const [q, setQ] = useState("");
  const [slots, setSlots] = useState<StreamSlot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [layout, setLayout] = useState<1 | 4 | 9>(() => {
    if (typeof window === "undefined") return 4;
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    const n = Number(raw);
    return n === 1 || n === 9 ? n : 4;
  });
  const pb0 = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    return { begin: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) };
  }, []);
  const [begin, setBegin] = useState(pb0.begin);
  const [end, setEnd] = useState(pb0.end);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(() => getCachedProvider());
  const isHct = provider === "HCT" || slots.some((s) => s.provider === "HCT");

  useEffect(() => subscribeProvider(setProvider), []);

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
        stream?: Record<string, unknown>;
      }>(`integra/cameras/${encodeURIComponent(cam.id)}/stream`, { method: "POST" });
      setNote(data.note || null);
      const slot: StreamSlot = {
        id: cam.id,
        name: cam.name,
        hls: data.hls,
        rtsp: data.rtsp,
        note: data.note,
        provider: data.provider,
        stream: data.stream,
      };
      setSlots((prev) => {
        if (!multi) return [slot];
        const without = prev.filter((s) => s.id !== cam.id);
        return [...without, slot].slice(-layout);
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
        meta={`${filtered.length}/${items.length} cams · wall ${slots.length}/${layout}`}
        actions={
          <>
            <select
              value={layout}
              onChange={(e) => {
                const n = Number(e.target.value) as 1 | 4 | 9;
                setLayout(n);
                window.localStorage.setItem(LAYOUT_KEY, String(n));
                setSlots((prev) => prev.slice(0, n));
              }}
              style={{ fontSize: 12, padding: "4px 8px" }}
              aria-label="Layout"
            >
              <option value={1}>1</option>
              <option value={4}>2×2</option>
              <option value={9}>3×3</option>
            </select>
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
        <div
          className={styles.camGrid}
          style={{
            gridTemplateColumns:
              layout === 1 ? "1fr" : layout === 4 ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
          }}
        >
          {slots.map((s) => (
            <div key={s.id} className={styles.camTile}>
              <div className={styles.camTileHead}>
                <span>{s.name}</span>
                <IgBtn onClick={() => setSlots((p) => p.filter((x) => x.id !== s.id))}>✕</IgBtn>
              </div>
              <div className={styles.camTileBody}>
                {s.provider === "HCT" ? (
                  <IntegraEzuiKitPlayer stream={s.stream} cameraId={s.id} height={layout === 1 ? 420 : 200} />
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
              {!isHct ? (
                <>
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
                </>
              ) : (
                <p className={styles.doorCellMeta}>
                  Playback histórico no aplica en este proveedor. Usa video en vivo.
                </p>
              )}
            </div>
          </IgPanel>
        }
      />
    </IgPage>
  );
}
