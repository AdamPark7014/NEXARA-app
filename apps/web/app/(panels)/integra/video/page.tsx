"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { IntegraDetectionOverlay, subscribePushEvents } from "../_DetectionOverlay";
import { IntegraLivePlayer } from "../_LivePlayer";
import { IntegraLiveAccessBanner } from "../_LiveAccessBanner";
import { IntegraOccupancyPanel } from "../_OccupancyPanel";
import { IntegraPtzPad } from "../_PtzPad";
import { IntegraRecentAccess } from "../_RecentAccess";
import { IntegraVehicleStrip } from "../_VehicleStrip";
import {
  defaultRangeHours,
  fromDatetimeLocalValue,
  inputStyle,
  integraApi,
  selectStyle,
  toDatetimeLocalValue,
} from "../_lib";
import {
  getCachedCapabilities,
  getCachedProvider,
  subscribeCapabilities,
  subscribeProvider,
} from "../_caps";
import styles from "../integra.module.css";

type Cam = {
  id: string;
  name: string;
  region?: string;
  status?: string | number;
  encodeDevIndexCode?: string | null;
  /** IP del equipo que ve la escena: con ella se casan sus detecciones. */
  sourceIp?: string | null;
  model?: string | null;
  hasAudio?: boolean;
  isDoorCamera?: boolean;
  isPtz?: boolean;
  anprCapable?: boolean;
};

type StreamSlot = {
  id: string;
  name: string;
  hls: string | null;
  rtsp: string | null;
  note?: string | null;
  provider?: string | null;
  stream?: Record<string, unknown> | null;
  /** El equipo tiene pista de audio. Las cámaras del parque salen sin ella. */
  hasAudio?: boolean;
  /** Este stream concreto se pidió con audio. */
  audio?: boolean;
};

type ViewMode = "wall" | "focus";
type LayoutN = 1 | 4 | 9 | 16;

const LAYOUT_KEY = "nexara_integra_video_layout";
const MODE_KEY = "nexara_integra_video_mode";
const AUTOOPEN_KEY = "nexara_integra_video_autoopen";
/** Stagger suave al abrir muchos MJPEG a la vez (no decodifican H.264). */
const STAGGER_MS = 180;

function colsFor(layout: LayoutN): number {
  if (layout === 1) return 1;
  if (layout === 4) return 2;
  if (layout === 9) return 3;
  return 4;
}

function onlineish(status?: string | number) {
  const s = String(status ?? "").toLowerCase();
  return s === "1" || s === "online" || s === "";
}

export default function IntegraVideoPage() {
  const [items, setItems] = useState<Cam[]>([]);
  const [region, setRegion] = useState("");
  const [q, setQ] = useState("");
  const [slots, setSlots] = useState<StreamSlot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "wall";
    return window.localStorage.getItem(MODE_KEY) === "focus" ? "focus" : "wall";
  });
  const [layout, setLayout] = useState<LayoutN>(() => {
    if (typeof window === "undefined") return 4;
    const n = Number(window.localStorage.getItem(LAYOUT_KEY));
    return n === 1 || n === 9 || n === 16 ? n : 4;
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
  const [showTech, setShowTech] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [provider, setProvider] = useState<string | null>(() => getCachedProvider());
  const autoOpened = useRef(false);
  const isHct = provider === "HCT" || slots.some((s) => s.provider === "HCT");

  const [caps, setCaps] = useState(() => getCachedCapabilities());
  /** Última detección / acceso por IP de equipo (rail + contador toolbar). */
  const [detByIp, setDetByIp] = useState<Record<string, number>>({});
  const [namedDetCount, setNamedDetCount] = useState(0);
  const [opticalDetCount, setOpticalDetCount] = useState(0);

  useEffect(() => subscribeProvider(setProvider), []);
  useEffect(() => subscribeCapabilities(setCaps), []);

  useEffect(() => {
    return subscribePushEvents((events) => {
      const now = Date.now();
      let named = 0;
      let optical = 0;
      setDetByIp((prev) => {
        let next: Record<string, number> | null = null;
        for (const ev of events) {
          if (!ev.deviceIp) continue;
          if (!ev.targets?.length && !ev.personName) continue;
          const age = now - Date.parse(ev.occurredAt);
          if (!Number.isFinite(age) || age > 12_000) continue;
          if (!next) next = { ...prev };
          next[ev.deviceIp] = now;
          if (ev.personName) named += 1;
          else if (ev.targets?.length) optical += 1;
        }
        return next ?? prev;
      });
      if (named || optical) {
        setNamedDetCount((n) => n + named);
        setOpticalDetCount((n) => n + optical);
      }
    });
  }, []);

  // Semilla badges del rail: lo vivo de los últimos segundos.
  useEffect(() => {
    let stop = false;
    void integraApi<{ items: Array<{ id: number; deviceIp: string; personName?: string | null; targets?: unknown; occurredAt: string }> }>(
      "integra/push/events?sinceMs=12000&limit=60&live=1",
    )
      .then((d) => {
        if (stop) return;
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const ev of d.items || []) {
          if (!ev.deviceIp) continue;
          const age = now - Date.parse(ev.occurredAt);
          if (!Number.isFinite(age) || age > 12_000) continue;
          next[ev.deviceIp] = now - Math.max(0, age);
        }
        if (Object.keys(next).length) setDetByIp((prev) => ({ ...next, ...prev }));
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const cut = Date.now() - 10_000;
      setDetByIp((prev) => {
        const keys = Object.keys(prev);
        if (!keys.some((k) => prev[k] < cut)) return prev;
        const next: Record<string, number> = {};
        for (const k of keys) if (prev[k] >= cut) next[k] = prev[k];
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

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

  const fetchStream = useCallback(
    async (cam: Cam, withAudio = false): Promise<StreamSlot> => {
      const qs = withAudio ? "?audio=1" : "";
      const data = await integraApi<{
        hls: string | null;
        rtsp: string | null;
        note?: string;
        provider?: string;
        stream?: Record<string, unknown>;
        hasAudio?: boolean;
        audio?: boolean;
      }>(`integra/cameras/${encodeURIComponent(cam.id)}/stream${qs}`, { method: "POST" });
      return {
        id: cam.id,
        name: cam.name,
        hls: data.hls,
        rtsp: data.rtsp,
        note: data.note,
        provider: data.provider,
        stream: data.stream,
        hasAudio: data.hasAudio,
        audio: data.audio,
      };
    },
    [],
  );

  const playLive = useCallback(
    async (cam: Cam, multi = false) => {
      setBusy(cam.id);
      setError(null);
      setSelected(cam.id);
      setPlaybackUrl(null);
      try {
        const slot = await fetchStream(cam);
        setNote(slot.note || null);
        setSlots((prev) => {
          if (!multi) return [slot];
          if (prev.some((s) => s.id === cam.id)) {
            return prev.map((s) => (s.id === cam.id ? slot : s));
          }
          if (prev.length >= layout) {
            // Reemplaza el más antiguo
            return [...prev.slice(1), slot];
          }
          return [...prev, slot];
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error stream");
      } finally {
        setBusy(null);
      }
    },
    [fetchStream, layout],
  );

  const fillWall = useCallback(
    async (cams: Cam[]) => {
      const pick = cams.filter((c) => onlineish(c.status)).slice(0, layout);
      const fallback = pick.length > 0 ? pick : cams.slice(0, layout);
      if (fallback.length === 0) return;
      setFilling(true);
      setError(null);
      setPlaybackUrl(null);
      try {
        const results = await Promise.allSettled(fallback.map((c) => fetchStream(c)));
        const next: StreamSlot[] = [];
        for (const r of results) {
          if (r.status === "fulfilled") next.push(r.value);
        }
        if (next.length === 0) throw new Error("No se pudo abrir ninguna cámara");
        setSlots(next);
        setSelected(next[0].id);
        setNote(next[0].note || null);
        window.sessionStorage.removeItem(AUTOOPEN_KEY);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al llenar el muro");
      } finally {
        setFilling(false);
        setBusy(null);
      }
    },
    [fetchStream, layout],
  );

  // Primera visita: muro lleno (o una cámara en foco).
  useEffect(() => {
    if (autoOpened.current || items.length === 0 || slots.length > 0) return;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(AUTOOPEN_KEY) === "0") {
      return;
    }
    autoOpened.current = true;
    if (mode === "wall") {
      void fillWall(filtered);
    } else {
      const first = filtered.find((c) => onlineish(c.status)) || filtered[0];
      if (first) void playLive(first, false);
    }
  }, [items, filtered, slots.length, mode, fillWall, playLive]);

  useEffect(() => {
    setSlots((prev) => prev.slice(0, layout));
  }, [layout]);

  const focus = useMemo(
    () => slots.find((s) => s.id === selected) || slots[0] || null,
    [slots, selected],
  );

  const setViewMode = (m: ViewMode) => {
    setMode(m);
    window.localStorage.setItem(MODE_KEY, m);
  };

  const setLayoutN = (n: LayoutN) => {
    setLayout(n);
    window.localStorage.setItem(LAYOUT_KEY, String(n));
  };

  const clearAll = () => {
    setSlots([]);
    setSelected(null);
    setNote(null);
    setPlaybackUrl(null);
    autoOpened.current = true;
    window.sessionStorage.setItem(AUTOOPEN_KEY, "0");
  };

  const openFocus = (camId: string) => {
    setSelected(camId);
    setViewMode("focus");
  };

  const wallCells = useMemo(() => {
    const cells: Array<StreamSlot | null> = [...slots];
    while (cells.length < layout) cells.push(null);
    return cells.slice(0, layout);
  }, [slots, layout]);

  /** En muro MJPEG todos los slots con stream van vivos (sin cupo MSE). */
  const liveWallIds = useMemo(() => {
    if (mode !== "wall") return new Set<string>();
    return new Set(
      wallCells.filter((s): s is StreamSlot => Boolean(s)).map((s) => s.id),
    );
  }, [wallCells, mode]);

  const liveWallOrder = useMemo(() => {
    const order = new Map<string, number>();
    let i = 0;
    for (const s of wallCells) {
      if (!s) continue;
      order.set(s.id, i);
      i += 1;
    }
    return order;
  }, [wallCells]);

  const inWall = (id: string) => slots.some((s) => s.id === id);
  const liveCount = liveWallIds.size;
  const activeDetCount = Object.keys(detByIp).length;
  const focusCam = focus ? items.find((c) => c.id === focus.id) : undefined;
  const showPtz =
    Boolean(focusCam?.isPtz) || /ptz|df8|dome/i.test(`${focusCam?.name || focus?.name || ""}`);
  const detMeta =
    activeDetCount || namedDetCount || opticalDetCount
      ? ` · ${activeDetCount} det.${namedDetCount ? ` · ${namedDetCount} con nombre` : ""}${
          opticalDetCount ? ` · ${opticalDetCount} ópticas` : ""
        }`
      : "";

  return (
    <IgPage>
      <IntegraLiveAccessBanner enabled />
      <IgToolbar
        title="Video en vivo"
        meta={
          filling
            ? "Abriendo cámaras…"
            : mode === "wall"
              ? `${filtered.length} cámaras · ${slots.length}/${layout} en muro · ${liveCount} vivas${detMeta}`
              : `${filtered.length} cámaras · foco${detMeta}`
        }
        actions={
          <>
            <div className={styles.segGroup} role="group" aria-label="Vista">
              <button
                type="button"
                className={styles.segBtn}
                data-on={mode === "wall" ? "1" : undefined}
                onClick={() => setViewMode("wall")}
              >
                Muro
              </button>
              <button
                type="button"
                className={styles.segBtn}
                data-on={mode === "focus" ? "1" : undefined}
                onClick={() => setViewMode("focus")}
              >
                Foco
              </button>
            </div>
            <div className={styles.segGroup} role="group" aria-label="Cuadrícula">
              {([1, 4, 9, 16] as LayoutN[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={styles.segBtn}
                  data-on={layout === n ? "1" : undefined}
                  onClick={() => setLayoutN(n)}
                  title={n === 1 ? "1 cámara" : `${colsFor(n)}×${colsFor(n)}`}
                >
                  {n === 1 ? "1" : `${colsFor(n)}×${colsFor(n)}`}
                </button>
              ))}
            </div>
            <IgBtn
              variant="primary"
              disabled={filling || filtered.length === 0}
              onClick={() => void fillWall(filtered)}
            >
              {filling ? "Llenando…" : "Llenar muro"}
            </IgBtn>
            <IgBtn onClick={clearAll}>Limpiar</IgBtn>
            <IgBtn onClick={() => void load()}>Actualizar</IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>

      {/* Ambos montados: al ir a Foco el muro solo se oculta (cierra WS por IO),
          así volver no reconstruye toda la rejilla desde cero. */}
      <div className={styles.wallWorkbench} data-rail={railOpen ? "open" : "closed"} hidden={mode !== "wall"}>
          <aside className={styles.wallRail}>
            <div className={styles.wallRailHead}>
              <strong>Cámaras</strong>
              <IgBtn onClick={() => setRailOpen((v) => !v)} title={railOpen ? "Ocultar lista" : "Mostrar lista"}>
                {railOpen ? "«" : "»"}
              </IgBtn>
            </div>
            {railOpen && (
              <>
                <div className={styles.wallRailFilters}>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    style={selectStyle}
                    aria-label="Región"
                  >
                    <option value="">Todas las regiones</option>
                    {regions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    style={inputStyle}
                    placeholder="Buscar…"
                    aria-label="Buscar cámara"
                  />
                </div>
                <div className={styles.wallRailList}>
                  {filtered.map((c) => {
                    const active = inWall(c.id);
                    const sel = selected === c.id;
                    const det =
                      c.sourceIp && detByIp[c.sourceIp]
                        ? Date.now() - detByIp[c.sourceIp] < 10_000
                        : false;
                    const online = onlineish(c.status);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={styles.wallCamRow}
                        data-active={active ? "1" : undefined}
                        data-selected={sel ? "1" : undefined}
                        data-det={det ? "1" : undefined}
                        disabled={busy === c.id}
                        onClick={() => void playLive(c, true)}
                        onDoubleClick={() => {
                          void playLive(c, false).then(() => openFocus(c.id));
                        }}
                        title="Clic: al muro · Doble clic: foco"
                      >
                        <span
                          className={styles.wallCamDot}
                          data-ok={online ? "1" : undefined}
                          data-err={!online ? "1" : undefined}
                        />
                        <span className={styles.wallCamName}>{c.name}</span>
                        {active && <IgBadge tone="accent">vivo</IgBadge>}
                        {det && <IgBadge tone="warn">det</IgBadge>}
                        {!online && <IgBadge tone="warn">off</IgBadge>}
                        {busy === c.id && <span className={styles.wallCamBusy}>…</span>}
                      </button>
                    );
                  })}
                  {filtered.length === 0 && (
                    <p className={styles.igEmpty}>Sin cámaras</p>
                  )}
                </div>
                <p className={styles.wallHint}>
                  Muro = MSE con fallback snapshot · Doble clic → foco
                </p>
              </>
            )}
          </aside>

          <div
            className={styles.wallGrid}
            style={{ gridTemplateColumns: `repeat(${colsFor(layout)}, minmax(0, 1fr))` }}
          >
            {wallCells.map((s, i) =>
              s ? (
                <div
                  key={s.id}
                  className={styles.wallCell}
                  data-selected={selected === s.id ? "1" : undefined}
                  onClick={() => setSelected(s.id)}
                  onDoubleClick={() => openFocus(s.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openFocus(s.id);
                  }}
                >
                  <div className={styles.wallCellHead}>
                    <span>{s.name}</span>
                    <div className={styles.wallCellActions}>
                      <IgBtn
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openFocus(s.id);
                        }}
                        title="Abrir en foco"
                      >
                        ↗
                      </IgBtn>
                      <IgBtn
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSlots((p) => {
                            const next = p.filter((x) => x.id !== s.id);
                            if (selected === s.id) setSelected(next[0]?.id ?? null);
                            return next;
                          });
                        }}
                        title="Quitar del muro"
                      >
                        ✕
                      </IgBtn>
                    </div>
                  </div>
                  <div className={styles.wallCellBody}>
                    {s.provider === "HCT" ? (
                      <IntegraEzuiKitPlayer
                        stream={s.stream}
                        cameraId={s.id}
                        height={layout <= 4 ? 280 : 160}
                      />
                    ) : (
                      <>
                        <IntegraDetectionOverlay
                          deviceIp={items.find((c) => c.id === s.id)?.sourceIp ?? null}
                        />
                        <IntegraLivePlayer
                          src={s.hls}
                          compact
                          showLiveBadge
                            mode="auto"
                          enabled={liveWallIds.has(s.id)}
                          startDelayMs={(liveWallOrder.get(s.id) ?? i) * STAGGER_MS}
                        />
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  key={`empty-${i}`}
                  type="button"
                  className={styles.wallEmpty}
                  disabled={filling || filtered.length === 0}
                  onClick={() => {
                    const nextCam = filtered.find((c) => !inWall(c.id) && onlineish(c.status))
                      || filtered.find((c) => !inWall(c.id));
                    if (nextCam) void playLive(nextCam, true);
                  }}
                >
                  <span className={styles.wallEmptyPlus}>+</span>
                  <span>Añadir cámara</span>
                  <span className={styles.wallEmptyMeta}>Slot {i + 1}/{layout}</span>
                </button>
              ),
            )}
          </div>
      </div>

      <div hidden={mode !== "focus"}>
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
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={inputStyle}
                placeholder="nombre / id / encoder"
              />
            </IgField>
            <IgBtn variant="primary" onClick={() => setViewMode("wall")}>
              Ver muro
            </IgBtn>
          </IgFilters>

          <IgSplit
            leftWidth="40%"
            left={
              <IgPanel title="Inventario" count={filtered.length} flush>
                <IgTable
                  selectedKey={selected}
                  onRowClick={(key) => {
                    const cam = items.find((c) => c.id === key);
                    if (cam) void playLive(cam, false);
                  }}
                  columns={[
                    { key: "n", label: "Cámara" },
                    { key: "r", label: "Región" },
                    { key: "s", label: "Estado" },
                    { key: "x", label: "", width: "148px" },
                  ]}
                  rows={filtered.map((c) => ({
                    key: c.id,
                    tone: onlineish(c.status) ? "ok" : "warn",
                    cells: {
                      n: c.name,
                      r: c.region || "—",
                      s: (
                        <IgBadge tone={onlineish(c.status) ? "ok" : "warn"}>
                          {onlineish(c.status) ? "ONLINE" : String(c.status ?? "—")}
                        </IgBadge>
                      ),
                      x: (
                        <div style={{ display: "flex", gap: 4 }}>
                          <IgBtn
                            disabled={busy === c.id}
                            title="Añadir al muro y cambiar a vista muro"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void playLive(c, true).then(() => setViewMode("wall"));
                            }}
                          >
                            + Muro
                          </IgBtn>
                          <IgBtn
                            variant="primary"
                            disabled={busy === c.id}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void playLive(c, false);
                            }}
                          >
                            {busy === c.id ? "…" : "Ver"}
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
              <IgPanel title={focus ? focus.name : "Vista principal"} count={focus ? "EN VIVO" : "—"}>
                {busy && !focus && (
                  <div className={styles.videoFocusEmpty}>
                    <div className={styles.playerSpinner} />
                    <strong>Abriendo cámara…</strong>
                  </div>
                )}
                {!busy && !focus && (
                  <div className={styles.videoFocusEmpty}>
                    <strong>Elige una cámara</strong>
                    <span>O cambia a Muro y pulsa «Llenar muro» para ver varias a la vez.</span>
                  </div>
                )}
                {focus && mode === "focus" && (
                  <>
                    {focus.provider === "HCT" ? (
                      <IntegraEzuiKitPlayer stream={focus.stream} cameraId={focus.id} height={420} />
                    ) : (
                      <div className={styles.focusStage}>
                        <IntegraDetectionOverlay
                          deviceIp={focusCam?.sourceIp ?? null}
                        />
                        <IntegraLivePlayer
                          src={focus.hls}
                          enabled={mode === "focus"}
                          mode="mse"
                          audio={Boolean(focus.audio)}
                        />
                      </div>
                    )}
                    <div className={styles.focusSide}>
                      {!focusCam?.isDoorCamera && (
                        <IntegraOccupancyPanel enabled={mode === "focus"} />
                      )}
                      {focusCam?.isDoorCamera && (
                        <IntegraRecentAccess
                          deviceIp={focusCam.sourceIp ?? null}
                          enabled={mode === "focus"}
                        />
                      )}
                      {(showPtz || focusCam?.anprCapable === false) && (
                        <IntegraVehicleStrip
                          deviceIp={focusCam?.sourceIp ?? null}
                          enabled={mode === "focus"}
                        />
                      )}
                      {showPtz && (
                        <>
                          {focusCam?.anprCapable !== true && (
                            <p className={styles.ptzHint}>
                              Esta PTZ no tiene ANPR: se mueve y hace zoom, pero no lee
                              matrículas. Hace falta cámara serie ITC.
                            </p>
                          )}
                          <IntegraPtzPad
                            cameraId={focus.id}
                            canControl={Boolean(caps?.canControlDoors)}
                          />
                        </>
                      )}
                    </div>
                    {note && (
                      <p className={styles.videoNote}>
                        <button
                          type="button"
                          onClick={() => setShowTech((v) => !v)}
                          className={styles.techToggle}
                        >
                          {showTech ? "Ocultar detalle técnico ▾" : "Detalle técnico ▸"}
                        </button>
                        {showTech && <span className={styles.techDetail}>{note}</span>}
                      </p>
                    )}
                  </>
                )}
                <div className={styles.focusActions}>
                  {focus && !focus.hasAudio && caps?.canControlDoors && (
                    <IgBtn
                      disabled={busy === "mic"}
                      title="Enciende el micrófono de esta cámara en el propio equipo"
                      onClick={async () => {
                        const cam = items.find((c) => c.id === focus.id);
                        if (!cam) return;
                        setBusy("mic");
                        try {
                          const r = await integraApi<{ changed: boolean; note: string }>(
                            `integra/cameras/${encodeURIComponent(focus.id)}/audio`,
                            { method: "POST", body: JSON.stringify({ enabled: true }) },
                          );
                          setNote(r.note);
                          setShowTech(true);
                          if (r.changed) {
                            const slot = await fetchStream(cam, true);
                            setSlots((prev) => prev.map((x) => (x.id === slot.id ? slot : x)));
                          }
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Error micrófono");
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === "mic" ? "…" : "Activar micrófono"}
                    </IgBtn>
                  )}
                  {focus?.hasAudio && (
                    <IgBtn
                      variant={focus.audio ? "primary" : undefined}
                      disabled={busy === "aud"}
                      title={
                        focus.audio
                          ? "Volver al stream sin audio"
                          : "Reabrir el stream con la pista de audio del equipo"
                      }
                      onClick={async () => {
                        const cam = items.find((c) => c.id === focus.id);
                        if (!cam) return;
                        setBusy("aud");
                        try {
                          const slot = await fetchStream(cam, !focus.audio);
                          setSlots((prev) => prev.map((x) => (x.id === slot.id ? slot : x)));
                          setNote(slot.note || null);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Error audio");
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === "aud" ? "…" : focus.audio ? "Audio activo" : "Escuchar"}
                    </IgBtn>
                  )}
                  <IgBtn
                    disabled={!selected || busy === "cap"}
                    onClick={async () => {
                      if (!selected) return;
                      setBusy("cap");
                      try {
                        await integraApi(`integra/cameras/${encodeURIComponent(selected)}/capture`, {
                          method: "POST",
                        });
                        setNote("Snapshot guardado");
                        setShowTech(true);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Error capture");
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Snapshot
                  </IgBtn>
                  {focus?.rtsp && (
                    <IgBtn onClick={() => void navigator.clipboard.writeText(focus.rtsp!)}>
                      Copiar RTSP
                    </IgBtn>
                  )}
                  {focus && (
                    <IgBtn
                      onClick={() => {
                        if (!inWall(focus.id)) {
                          setSlots((prev) => [...prev.filter((s) => s.id !== focus.id), focus].slice(-layout));
                        }
                        setViewMode("wall");
                      }}
                    >
                      Al muro
                    </IgBtn>
                  )}
                </div>
                <div className={styles.focusPlayback}>
                  {!isHct ? (
                    <>
                      <strong className={styles.focusPlaybackLabel}>Playback histórico</strong>
                      <IgField label="Inicio">
                        <input
                          type="datetime-local"
                          value={begin}
                          onChange={(e) => setBegin(e.target.value)}
                          style={inputStyle}
                        />
                      </IgField>
                      <IgField label="Fin">
                        <input
                          type="datetime-local"
                          value={end}
                          onChange={(e) => setEnd(e.target.value)}
                          style={inputStyle}
                        />
                      </IgField>
                      <div className={styles.focusActions}>
                        <IgBtn
                          onClick={() => {
                            const r = defaultRangeHours(1);
                            setBegin(r.start);
                            setEnd(r.end);
                          }}
                        >
                          Última 1h
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
                              setNote(data.url ? "Playback listo" : "Sin URL de playback");
                              setShowTech(true);
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
                        <code className={styles.playbackUrl}>{playbackUrl}</code>
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
      </div>
    </IgPage>
  );
}
