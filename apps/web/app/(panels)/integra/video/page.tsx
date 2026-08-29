"use client";

import { useCallback, useEffect, useState } from "react";
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
import { btnGhost, btnPrimary, integraApi } from "../_lib";

type Cam = {
  id: string;
  name: string;
  region?: string;
  status?: string | number;
  encodeDevIndexCode?: string | null;
};

export default function IntegraVideoPage() {
  const [items, setItems] = useState<Cam[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hls, setHls] = useState<string | null>(null);
  const [rtsp, setRtsp] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [begin, setBegin] = useState("");
  const [end, setEnd] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

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

  const playLive = async (id: string) => {
    setBusy(id);
    setError(null);
    setSelected(id);
    setPlaybackUrl(null);
    try {
      const data = await integraApi<{ hls: string | null; rtsp: string | null; note?: string }>(
        `integra/cameras/${encodeURIComponent(id)}/stream`,
        { method: "POST" },
      );
      setHls(data.hls);
      setRtsp(data.rtsp);
      setNote(data.note || null);
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
    if (!selected || !begin || !end) return;
    setBusy("pb");
    try {
      const data = await integraApi<{ url: string | null }>(
        `integra/cameras/${encodeURIComponent(selected)}/playback`,
        { method: "POST", body: JSON.stringify({ beginTime: begin, endTime: end }) },
      );
      setPlaybackUrl(data.url);
      setNote(data.url ? "Playback RTSP listo (VLC / gateway)" : "Sin URL playback");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error playback");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Video"
        title="Cámaras"
        subtitle="Live HLS (go2rtc) · snapshot · playback por rango."
        actions={
          <button type="button" style={btnGhost} onClick={() => void load()}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashGrid>
        <DashCol span={5}>
          <DashPanel title="Inventario" subtitle={`${items.length} · espejo / live`}>
            {items.map((c) => (
              <ListRow
                key={c.id}
                title={c.name}
                sub={[c.region, c.encodeDevIndexCode, c.id].filter(Boolean).join(" · ")}
                trail={
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => void playLive(c.id)}
                    style={btnPrimary}
                  >
                    {busy === c.id ? "…" : selected === c.id ? "En vivo" : "Live"}
                  </button>
                }
              />
            ))}
            {items.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                Sin cámaras. Sincroniza un sitio o configura INTEGRA_HIK_*.
              </p>
            )}
          </DashPanel>
        </DashCol>
        <DashCol span={7}>
          <DashPanel
            title={selected ? `Live · ${selected}` : "Player"}
            subtitle={note || "Selecciona una cámara"}
          >
            <IntegraHlsPlayer src={hls} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button type="button" style={btnGhost} disabled={!selected} onClick={() => void capture()}>
                Snapshot
              </button>
              {rtsp && (
                <button
                  type="button"
                  style={btnGhost}
                  onClick={() => void navigator.clipboard.writeText(rtsp)}
                >
                  Copiar RTSP
                </button>
              )}
              {hls && <DashPill tone="positive">HLS</DashPill>}
              {!hls && rtsp && <DashPill tone="warning">solo RTSP</DashPill>}
            </div>
            <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Playback</strong>
              <input
                type="datetime-local"
                value={begin}
                onChange={(e) => setBegin(e.target.value)}
                style={{ maxWidth: 220 }}
              />
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                style={{ maxWidth: 220 }}
              />
              <button type="button" style={btnPrimary} disabled={!selected} onClick={() => void loadPlayback()}>
                {busy === "pb" ? "…" : "Obtener playback"}
              </button>
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
