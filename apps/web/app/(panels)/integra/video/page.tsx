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
import { IntegraHlsPlayer } from "../_HlsPlayer";
import styles from "../integra.module.css";
import {
  btnGhost,
  btnPrimary,
  defaultRangeHours,
  fromDatetimeLocalValue,
  inputStyle,
  integraApi,
  selectStyle,
  toDatetimeLocalValue,
} from "../_lib";

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
        const next = [...without, slot];
        return next.slice(-4);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error stream");
    } finally {
      setBusy(null);
    }
  };

  const capture = async () => {
    if (!selected) return;
    setBusy("cap");
    try {
      await integraApi(`integra/cameras/${encodeURIComponent(selected)}/capture`, {
        method: "POST",
      });
      setNote("Snapshot solicitado a Artemis");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error capture");
    } finally {
      setBusy(null);
    }
  };

  const loadPlayback = async () => {
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
      setNote(data.url ? "Playback RTSP listo" : "Sin URL playback");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error playback");
    } finally {
      setBusy(null);
    }
  };

  const statusTone = (status?: string | number) => {
    const s = String(status ?? "");
    if (s === "1" || s === "online") return "positive" as const;
    if (!s) return "neutral" as const;
    return "warning" as const;
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Video"
        title="Wall de cámaras"
        subtitle="Hasta 4 lives HLS · filtro región/encode · snapshot · playback con rango real."
        actions={
          <button type="button" style={btnGhost} onClick={() => void load()}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className={styles.filterBar}>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Región</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle}>
            <option value="">Todas</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Buscar</span>
          <input
            placeholder="Nombre / id / encode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Wall</span>
          <button type="button" style={btnGhost} onClick={() => setSlots([])}>
            Limpiar wall ({slots.length}/4)
          </button>
        </div>
      </div>

      {slots.length > 0 && (
        <div className={styles.camGrid}>
          {slots.map((s) => (
            <div key={s.id} className={styles.camTile}>
              <div className={styles.camTileHead}>
                <span>{s.name}</span>
                <button type="button" style={btnGhost} onClick={() => setSlots((p) => p.filter((x) => x.id !== s.id))}>
                  ✕
                </button>
              </div>
              <div className={styles.camTileBody}>
                {s.provider === "HCT" ? (
                  <div style={{ color: "#94a3b8", fontSize: 12, padding: 12 }}>{s.note || "HCT token"}</div>
                ) : (
                  <IntegraHlsPlayer src={s.hls} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <DashGrid>
        <DashCol span={5}>
          <DashPanel title="Inventario" subtitle={`${filtered.length} / ${items.length}`}>
            <div className={styles.tableScroll}>
              {filtered.map((c) => (
                <ListRow
                  key={c.id}
                  title={c.name}
                  sub={[c.region, c.encodeDevIndexCode ? `enc ${c.encodeDevIndexCode}` : null, c.id]
                    .filter(Boolean)
                    .join(" · ")}
                  trail={
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <DashPill tone={statusTone(c.status)}>{String(c.status ?? "—")}</DashPill>
                      <button
                        type="button"
                        style={btnGhost}
                        disabled={busy === c.id}
                        onClick={() => void playLive(c, true)}
                      >
                        +Wall
                      </button>
                      <button
                        type="button"
                        style={btnPrimary}
                        disabled={busy === c.id}
                        onClick={() => void playLive(c, false)}
                      >
                        {busy === c.id ? "…" : "Live"}
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          </DashPanel>
        </DashCol>
        <DashCol span={7}>
          <DashPanel title={selected ? `Foco · ${selected}` : "Foco / playback"} subtitle={note || "—"}>
            {slots.length === 1 && slots[0].provider !== "HCT" && (
              <IntegraHlsPlayer src={slots[0].hls} />
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button type="button" style={btnGhost} disabled={!selected} onClick={() => void capture()}>
                Snapshot
              </button>
              {slots[0]?.rtsp && (
                <button
                  type="button"
                  style={btnGhost}
                  onClick={() => void navigator.clipboard.writeText(slots[0].rtsp!)}
                >
                  Copiar RTSP
                </button>
              )}
            </div>
            <div style={{ marginTop: 16, display: "grid", gap: 8, maxWidth: 360 }}>
              <strong style={{ fontSize: 13 }}>Playback</strong>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>Inicio</span>
                <input type="datetime-local" value={begin} onChange={(e) => setBegin(e.target.value)} style={inputStyle} />
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>Fin</span>
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  style={btnGhost}
                  onClick={() => {
                    const r = defaultRangeHours(1);
                    setBegin(r.start);
                    setEnd(r.end);
                  }}
                >
                  Última 1h
                </button>
                <button type="button" style={btnPrimary} disabled={!selected} onClick={() => void loadPlayback()}>
                  {busy === "pb" ? "…" : "Obtener playback"}
                </button>
              </div>
              {playbackUrl && (
                <code style={{ fontSize: 11, wordBreak: "break-all" }}>{playbackUrl}</code>
              )}
            </div>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
