"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
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
import { IntegraDetectionOverlay, LIVE_DET_BADGE_MS, subscribePushEvents } from "../_DetectionOverlay";
import {
  IntegraLivePlayer,
  preloadGo2rtcPlayer,
  type HdOffer,
  type PlayerState,
} from "../_LivePlayer";
import {
  elegirObjetivoHd,
  evaluarRespuestaHd,
  textoSinHd,
  type MotivoSinHd,
  type StreamQuality,
} from "../_quality";
import { WALL_CONNECT_CONCURRENCY, admitirMosaicos } from "../_wallAdmission";
import { useElementWidth } from "../_useElementWidth";
import { IntegraLiveAccessBanner } from "../_LiveAccessBanner";
import { IntegraAcsIdentityStrip } from "../_AcsIdentityStrip";
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
import {
  WALL_DND_MIME,
  WallCell,
  WallEmptyCell,
  encodeWallDrag,
  type WallDragPayload,
} from "../_WallCell";
import { PlaybackTimeline } from "../_PlaybackTimeline";
import { WallShortcutsHelp } from "../_ShortcutsHelp";
import { WallViewsBar } from "../_WallViewsBar";
import { useFullscreen } from "../_useFullscreen";
import {
  newViewId,
  readDefaultViewId,
  readWallViews,
  sameLayoutAsView,
  writeDefaultViewId,
  writeWallViews,
  type WallView,
} from "../_wallViews";
import styles from "../integra.module.css";
import wall from "../_wall.module.css";

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
  /**
   * Nombre del stream dentro de go2rtc. Es lo que permite comprobar que una
   * petición de alta calidad devolvió de verdad un canal distinto (`cam_X_hd`)
   * y no el mismo del muro con otra etiqueta.
   */
  streamName?: string | null;
};

type ViewMode = "wall" | "focus";
type LayoutN = 1 | 4 | 9 | 16;

const LAYOUT_KEY = "nexara_integra_video_layout";
const MODE_KEY = "nexara_integra_video_mode";
const AUTOOPEN_KEY = "nexara_integra_video_autoopen";
/**
 * Turno entre arranques dentro de una misma tanda. Ya no carga con todo el peso
 * — de eso se encarga el control de admisión de abajo — así que basta con
 * separar los handshakes unos cientos de ms.
 */
const STAGGER_MS = 250;

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
  /** Estado que reporta cada mosaico; alimenta el control de admisión. */
  const [tileState, setTileState] = useState<Record<string, PlayerState>>({});
  /**
   * Cámaras que el muro intentó abrir y no pudo, con el motivo. Antes se
   * descartaban en silencio y el hueco quedaba idéntico a un slot vacío: de ahí
   * la sensación de «no se ven todas» sin ningún mensaje que lo explicara.
   */
  const [wallIssues, setWallIssues] = useState<Array<{ name: string; reason: string }>>([]);
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
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { begin: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) };
  }, []);
  const [begin, setBegin] = useState(pb0.begin);
  const [end, setEnd] = useState(pb0.end);
  type PbSegment = { startTime?: string | null; endTime?: string | null; name?: string | null };
  type PlaybackState = {
    cameraId: string;
    hls: string;
    note?: string | null;
    segments: PbSegment[];
    segmentIndex: number;
  };
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [provider, setProvider] = useState<string | null>(() => getCachedProvider());
  const autoOpened = useRef(false);
  const isHct = provider === "HCT" || slots.some((s) => s.provider === "HCT");

  /* ── Vistas guardadas, atajos, pantalla completa ───────────────── */
  const [views, setViews] = useState<WallView[]>([]);
  const [currentViewId, setCurrentViewId] = useState<string | null>(null);
  const [defaultViewId, setDefaultViewId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  /** Celda «recogida» con `M`: alternativa por teclado al arrastre. */
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  /** La imagen visible está pausada a mano (Espacio). */
  const [frozen, setFrozen] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const focusStageRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  /** Nodo DOM de cada celda, por índice: pantalla completa y foco de teclado. */
  const cellEls = useRef(new Map<number, HTMLDivElement>());
  /**
   * Espejo de `slots` para los callbacks que se pasan a las celdas: si
   * dependieran del array, cada cambio de muro rompería el `memo` de los
   * dieciséis mosaicos.
   */
  const slotsRef = useRef<StreamSlot[]>(slots);
  slotsRef.current = slots;

  const { element: fsElement, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen();
  const gridFullscreen = fsElement != null && fsElement === stageRef.current;

  const [caps, setCaps] = useState(() => getCachedCapabilities());
  /** Última detección / acceso por IP de equipo (rail + contador toolbar). */
  const [detByIp, setDetByIp] = useState<Record<string, number>>({});
  const [namedDetCount, setNamedDetCount] = useState(0);
  const [opticalDetCount, setOpticalDetCount] = useState(0);

  useEffect(() => subscribeProvider(setProvider), []);
  useEffect(() => subscribeCapabilities(setCaps), []);
  useEffect(() => {
    preloadGo2rtcPlayer();
  }, []);

  // Vistas guardadas: se leen tras montar (en SSR no hay `localStorage`).
  useEffect(() => {
    setViews(readWallViews());
    setDefaultViewId(readDefaultViewId());
  }, []);

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
          if (!Number.isFinite(age) || age > LIVE_DET_BADGE_MS) continue;
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
      `integra/push/events?sinceMs=${LIVE_DET_BADGE_MS}&limit=60&live=1`,
    )
      .then((d) => {
        if (stop) return;
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const ev of d.items || []) {
          if (!ev.deviceIp) continue;
          const age = now - Date.parse(ev.occurredAt);
          if (!Number.isFinite(age) || age > LIVE_DET_BADGE_MS) continue;
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
      const cut = Date.now() - LIVE_DET_BADGE_MS;
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

  /**
   * `quality` solo se manda cuando se pide `main`: así el muro sigue haciendo
   * exactamente la misma petición de siempre, sin un parámetro nuevo que
   * invalide cachés o cambie el camino en el servidor.
   */
  const fetchStream = useCallback(
    async (cam: Cam, withAudio = false, quality: StreamQuality = "sub"): Promise<StreamSlot> => {
      const params = [withAudio ? "audio=1" : "", quality === "main" ? "quality=main" : ""].filter(
        Boolean,
      );
      const qs = params.length ? `?${params.join("&")}` : "";
      const data = await integraApi<{
        hls: string | null;
        rtsp: string | null;
        note?: string;
        provider?: string;
        stream?: Record<string, unknown>;
        hasAudio?: boolean;
        audio?: boolean;
        streamName?: string;
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
        streamName: data.streamName ?? null,
      };
    },
    [],
  );

  const playLive = useCallback(
    async (cam: Cam, multi = false) => {
      setBusy(cam.id);
      setError(null);
      setSelected(cam.id);
      setPlayback(null);
      try {
        // Si el espejo ya marca micrófono, abrir con audio (antes había que
        // pulsar «Escuchar» y parecía que no había canal). En el muro no: el
        // stream con audio es `ffmpeg:…#audio=aac`, o sea un proceso ffmpeg y
        // una SEGUNDA sesión RTSP contra la misma cámara — y el mosaico lo
        // pinta mudo de todas formas. Ese gasto solo se justifica en Foco.
        const slot = await fetchStream(cam, !multi && cam.hasAudio === true);
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

  /**
   * Llena el muro hasta `layout`. Dos diferencias con la versión anterior:
   * si una cámara falla se tira de la siguiente candidata en vez de dejar el
   * hueco, y las que fallan se anotan con su motivo en vez de desaparecer.
   * `keep` permite crecer de 2×2 a 3×3 sin cortar lo que ya se estaba viendo.
   */
  const fillWall = useCallback(
    async (cams: Cam[], keep: StreamSlot[] = []) => {
      if (keep.length >= layout) return;
      const taken = new Set(keep.map((s) => s.id));
      const free = cams.filter((c) => !taken.has(c.id));
      // Las que el espejo da por caídas van al final, no se descartan: mejor un
      // cuadro que dice «Sin video» que un hueco que no dice nada.
      const queue = [
        ...free.filter((c) => onlineish(c.status)),
        ...free.filter((c) => !onlineish(c.status)),
      ];
      if (queue.length === 0) return;

      setFilling(true);
      setError(null);
      setPlayback(null);
      const got: StreamSlot[] = [...keep];
      const issues: Array<{ name: string; reason: string }> = [];
      try {
        let i = 0;
        while (got.length < layout && i < queue.length) {
          const batch = queue.slice(i, i + (layout - got.length));
          i += batch.length;
          const results = await Promise.allSettled(batch.map((c) => fetchStream(c)));
          results.forEach((r, k) => {
            if (r.status === "fulfilled") got.push(r.value);
            else {
              issues.push({
                name: batch[k].name || batch[k].id,
                reason: r.reason instanceof Error ? r.reason.message : "no respondió",
              });
            }
          });
        }
        setWallIssues(issues);
        if (got.length === 0) throw new Error("No se pudo abrir ninguna cámara");
        setSlots(got);
        setSelected((prev) => prev ?? got[0].id);
        setNote(got[0].note || null);
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

  const setViewMode = useCallback((m: ViewMode) => {
    setMode(m);
    window.localStorage.setItem(MODE_KEY, m);
  }, []);

  const setLayoutN = useCallback((n: LayoutN) => {
    setLayout(n);
    window.localStorage.setItem(LAYOUT_KEY, String(n));
  }, []);

  /**
   * Carga una vista guardada: rejilla + qué cámara va en cada celda, en orden.
   *
   * Ojo con el auto-rellenado: si la vista tiene menos cámaras que celdas, el
   * efecto de `layout` volvería a llenar los huecos y desharía la vista. Por
   * eso se marca `lastFillKey` como ya atendido — la celda vacía de una vista
   * guardada es una decisión del operador, no un hueco que arreglar.
   */
  const applyView = useCallback(
    async (view: WallView) => {
      autoOpened.current = true;
      setLayoutN(view.layout);
      setCurrentViewId(view.id);
      setPickedIndex(null);
      setPlayback(null);
      setError(null);
      setFilling(true);
      try {
        const wanted = view.cells.filter((c): c is string => Boolean(c));
        const cams = wanted
          .map((id) => items.find((c) => c.id === id))
          .filter((c): c is Cam => Boolean(c));
        const gone = wanted.length - cams.length;
        const results = await Promise.allSettled(cams.map((c) => fetchStream(c)));
        const got: StreamSlot[] = [];
        const issues: Array<{ name: string; reason: string }> = [];
        results.forEach((r, i) => {
          if (r.status === "fulfilled") got.push(r.value);
          else {
            issues.push({
              name: cams[i].name || cams[i].id,
              reason: r.reason instanceof Error ? r.reason.message : "no respondió",
            });
          }
        });
        if (gone > 0) {
          issues.push({
            name: `${gone} cámara(s) de la vista`,
            reason: "ya no están en el inventario del sitio",
          });
        }
        setWallIssues(issues);
        setSlots(got);
        setSelected(got[0]?.id ?? null);
        setNote(got[0]?.note || null);
        lastFillKey.current = `${view.layout}:${filtered.length}`;
        setViewMode("wall");
        window.sessionStorage.setItem(AUTOOPEN_KEY, "0");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar la vista");
      } finally {
        setFilling(false);
      }
    },
    [items, fetchStream, filtered.length, setLayoutN, setViewMode],
  );

  // Primera visita: la vista predeterminada si la hay; si no, muro lleno.
  useEffect(() => {
    if (autoOpened.current || items.length === 0 || slots.length > 0) return;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(AUTOOPEN_KEY) === "0") {
      return;
    }
    const preferred = defaultViewId ? views.find((v) => v.id === defaultViewId) : undefined;
    if (preferred) {
      void applyView(preferred);
      return;
    }
    autoOpened.current = true;
    if (mode === "wall") {
      void fillWall(filtered);
    } else {
      const first = filtered.find((c) => onlineish(c.status)) || filtered[0];
      if (first) void playLive(first, false);
    }
  }, [items, filtered, slots.length, mode, fillWall, playLive, views, defaultViewId, applyView]);

  /**
   * Cambiar de rejilla: al encoger se recorta, al crecer se RELLENA. Antes solo
   * recortaba (`prev.slice(0, layout)`), así que pasar de 2×2 a 3×3 dejaba cinco
   * huecos fijos hasta que alguien pulsara «Llenar muro». Esa era la causa
   * directa de «no se ven todas».
   *
   * El ref evita el bucle cuando hay menos cámaras que celdas: se intenta una
   * vez por combinación de rejilla e inventario, y ya.
   */
  const lastFillKey = useRef("");
  useEffect(() => {
    if (mode !== "wall") return;
    if (slots.length > layout) {
      setSlots((prev) => prev.slice(0, layout));
      return;
    }
    if (!autoOpened.current || filling || slots.length >= layout) return;
    if (items.length === 0 || filtered.length === 0) return;
    const key = `${layout}:${filtered.length}`;
    if (lastFillKey.current === key) return;
    lastFillKey.current = key;
    void fillWall(filtered, slots);
  }, [layout, mode, slots, items.length, filtered, filling, fillWall]);

  const focus = useMemo(
    () => slots.find((s) => s.id === selected) || slots[0] || null,
    [slots, selected],
  );
  const playbackActive =
    Boolean(playback && focus && playback.cameraId === focus.id && playback.hls);
  const focusSrc = playbackActive && playback ? playback.hls : focus?.hls ?? null;

  /* ── Mejora progresiva de calidad ─────────────────────────────────
   *
   * Abrir Foco ya no cierra el stream del muro para abrir otro. Se sigue
   * pintando el secundario —que está caliente en go2rtc, primer fotograma
   * inmediato— y en paralelo se negocia el canal principal; el reproductor
   * cambia de uno a otro sin corte cuando el principal da imagen. Si no la da,
   * se queda el secundario: nunca peor que antes.
   *
   * La página decide y negocia; el corte limpio lo hace `_LivePlayer`.
   */
  const focusStageWidth = useElementWidth(
    focusStageRef,
    mode === "focus" && Boolean(focus),
    focus?.id ?? null,
  );

  const hdObjetivo = useMemo(
    () =>
      elegirObjetivoHd({
        mode,
        focusId: focus?.id ?? null,
        focusProvider: focus?.provider ?? null,
        playbackActive,
        stageWidthPx: focusStageWidth,
      }),
    [mode, focus?.id, focus?.provider, playbackActive, focusStageWidth],
  );
  const hdCamId = hdObjetivo.objetivo?.cameraId ?? null;
  const hdSubSrc = focus?.hls ?? null;
  const hdSubStreamName = focus?.streamName ?? null;
  const hdConAudio = Boolean(focus?.audio);

  /**
   * Resultado de la negociación, atado a la cámara para la que se pidió: si el
   * operador cambia de cámara mientras el principal viaja, la respuesta vieja
   * no puede aplicarse a la nueva.
   */
  const [hdNegociado, setHdNegociado] = useState<{
    cameraId: string;
    src: string | null;
    motivo: MotivoSinHd | null;
    detalle: string | null;
  } | null>(null);

  /**
   * Cámaras que ya dijeron que no. Las 13 de vigilancia van en H.265 y la
   * respuesta no va a cambiar mientras dure la sesión, así que no se les vuelve
   * a preguntar cada vez que el operador entra y sale de Foco: cada pregunta es
   * un POST que además re-registra en go2rtc el stream que el muro está usando.
   */
  const hdSinCanal = useRef(new Map<string, { motivo: MotivoSinHd; detalle: string | null }>());

  useEffect(() => {
    if (!hdCamId || !hdSubSrc) {
      setHdNegociado(null);
      return;
    }
    const cam = items.find((c) => c.id === hdCamId);
    if (!cam) {
      setHdNegociado(null);
      return;
    }
    const yaSabido = hdSinCanal.current.get(hdCamId);
    if (yaSabido) {
      setHdNegociado({ cameraId: hdCamId, src: null, ...yaSabido });
      return;
    }
    let cancelado = false;
    void fetchStream(cam, hdConAudio, "main")
      .then((slot) => {
        if (cancelado) return;
        const veredicto = evaluarRespuestaHd(
          { hls: slot.hls, note: slot.note, streamName: slot.streamName },
          { hls: hdSubSrc, streamName: hdSubStreamName },
        );
        if (veredicto.usable) {
          setHdNegociado({ cameraId: hdCamId, src: veredicto.src, motivo: null, detalle: null });
          return;
        }
        // Un «no» por códec o por no haber canal es estable: se recuerda. Un
        // fallo de red no, que eso sí puede arreglarse solo al siguiente intento.
        if (veredicto.motivo === "codec" || veredicto.motivo === "sin-canal") {
          hdSinCanal.current.set(hdCamId, {
            motivo: veredicto.motivo,
            detalle: veredicto.detalle,
          });
        }
        setHdNegociado({
          cameraId: hdCamId,
          src: null,
          motivo: veredicto.motivo,
          detalle: veredicto.detalle,
        });
      })
      .catch(() => {
        if (cancelado) return;
        // Que falle la alta calidad no es un error de pantalla: el secundario
        // sigue puesto. Se anota el motivo y ya está.
        setHdNegociado({
          cameraId: hdCamId,
          src: null,
          motivo: "sin-respuesta",
          detalle: null,
        });
      });
    return () => {
      cancelado = true;
    };
  }, [hdCamId, hdSubSrc, hdSubStreamName, hdConAudio, items, fetchStream]);

  /**
   * La oferta que ve el reproductor de Foco. **Nunca es `null`**: si lo fuera,
   * React cambiaría el tipo de componente al aparecer la alta calidad y
   * remontaría el `<video-stream>` del secundario — o sea, pagaría justo el
   * handshake que todo esto existe para evitar. Sin alta calidad la oferta va
   * vacía y con el motivo, que además es lo que se le enseña al operador.
   */
  const hdOferta: HdOffer = useMemo(() => {
    if (!hdCamId) {
      return { src: null, pidiendo: false, motivo: hdObjetivo.motivo, detalle: null };
    }
    if (!hdNegociado || hdNegociado.cameraId !== hdCamId) {
      return { src: null, pidiendo: true, motivo: null, detalle: null };
    }
    return {
      src: hdNegociado.src,
      pidiendo: false,
      motivo: hdNegociado.motivo,
      detalle: hdNegociado.detalle,
    };
  }, [hdCamId, hdObjetivo.motivo, hdNegociado]);

  /** Explicación larga para la nota técnica, cuando no hay alta calidad. */
  const hdNota = useMemo(
    () => (hdOferta.src ? null : textoSinHd(hdOferta.motivo, hdOferta.detalle)),
    [hdOferta],
  );

  const clearAll = () => {
    setSlots([]);
    setSelected(null);
    setNote(null);
    setPlayback(null);
    autoOpened.current = true;
    window.sessionStorage.setItem(AUTOOPEN_KEY, "0");
  };

  const formatSegRange = (start?: string | null, end?: string | null) => {
    const fmt = (iso?: string | null) => {
      if (!iso) return "—";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString("es-MX", { hour12: false });
    };
    return `${fmt(start)} → ${fmt(end)}`;
  };

  const requestPlayback = useCallback(
    async (segmentIndex = 0, rangeOverride?: { start: string; end: string }) => {
      if (!selected) {
        setError("Elige una cámara en el inventario o el muro antes de pedir grabación.");
        return;
      }
      const beginLocal = rangeOverride?.start ?? begin;
      const endLocal = rangeOverride?.end ?? end;
      const beginTime = fromDatetimeLocalValue(beginLocal);
      const endTime = fromDatetimeLocalValue(endLocal);
      if (!beginTime || !endTime) {
        setError("Rango de fechas inválido");
        return;
      }
      if (new Date(beginTime).getTime() >= new Date(endTime).getTime()) {
        setError("El inicio debe ser anterior al fin");
        return;
      }
      setBusy("pb");
      setError(null);
      try {
        const data = await integraApi<{
          url: string | null;
          hls?: string | null;
          note?: string;
          segmentIndex?: number;
          segments?: PbSegment[];
        }>(`integra/cameras/${encodeURIComponent(selected)}/playback`, {
          method: "POST",
          body: JSON.stringify({ beginTime, endTime, segmentIndex }),
        });
        const play = data.hls || data.url;
        const segs = Array.isArray(data.segments) ? data.segments : [];
        if (!play) {
          setPlayback(null);
          setError(
            data.note ||
              "Sin grabaciones en ese rango. El NVR solo guarda lo que cabe en disco; prueba otra cámara o un rango más corto.",
          );
          setNote(data.note || null);
          setShowTech(true);
          return;
        }
        // Solo el foco: el muro conserva el vivo en `slots`.
        setPlayback({
          cameraId: selected,
          hls: play,
          note: data.note || null,
          segments: segs,
          segmentIndex: data.segmentIndex ?? segmentIndex,
        });
        setViewMode("focus");
        setNote(
          data.note ||
            `Playback listo · ${segs.length || 1} segmento(s)`,
        );
        setShowTech(true);
      } catch (e) {
        setPlayback(null);
        setError(e instanceof Error ? e.message : "Error al pedir playback");
      } finally {
        setBusy(null);
      }
    },
    [selected, begin, end],
  );

  /** Un clic: fija rango y reproduce (evita el callejón «solo cambió fechas»). */
  const playLastHours = useCallback(
    async (hours: number) => {
      const r = defaultRangeHours(hours);
      setBegin(r.start);
      setEnd(r.end);
      let camId = selected;
      if (!camId) {
        const first = filtered.find((c) => onlineish(c.status)) || filtered[0];
        if (!first) {
          setError("No hay cámaras en el inventario para reproducir.");
          return;
        }
        camId = first.id;
        setSelected(camId);
        try {
          await playLive(first, false);
        } catch {
          /* requestPlayback igual intentará con el id */
        }
      }
      setViewMode("focus");
      // requestPlayback lee `selected` del closure — forzar con override tras setState
      // reutilizando la misma API inline si selected aún no actualizó.
      const beginTime = fromDatetimeLocalValue(r.start);
      const endTime = fromDatetimeLocalValue(r.end);
      if (!beginTime || !endTime || !camId) return;
      setBusy("pb");
      setError(null);
      try {
        const data = await integraApi<{
          url: string | null;
          hls?: string | null;
          note?: string;
          segmentIndex?: number;
          segments?: PbSegment[];
        }>(`integra/cameras/${encodeURIComponent(camId)}/playback`, {
          method: "POST",
          body: JSON.stringify({ beginTime, endTime, segmentIndex: 0 }),
        });
        const play = data.hls || data.url;
        const segs = Array.isArray(data.segments) ? data.segments : [];
        if (!play) {
          setPlayback(null);
          setError(
            data.note ||
              "Sin grabaciones en las últimas horas. Retención según disco del NVR.",
          );
          setNote(data.note || null);
          setShowTech(true);
          return;
        }
        setPlayback({
          cameraId: camId,
          hls: play,
          note: data.note || null,
          segments: segs,
          segmentIndex: data.segmentIndex ?? 0,
        });
        setNote(data.note || `Últimas ${hours}h · ${segs.length || 1} segmento(s)`);
        setShowTech(true);
      } catch (e) {
        setPlayback(null);
        setError(e instanceof Error ? e.message : "Error al pedir playback");
      } finally {
        setBusy(null);
      }
    },
    [selected, filtered, playLive],
  );

  const openFocus = (camId: string) => {
    setSelected(camId);
    setViewMode("focus");
  };

  const wallCells = useMemo(() => {
    const cells: Array<StreamSlot | null> = [...slots];
    while (cells.length < layout) cells.push(null);
    return cells.slice(0, layout);
  }, [slots, layout]);

  const handleTileState = useCallback((id: string, st: PlayerState) => {
    setTileState((prev) => (prev[id] === st ? prev : { ...prev, [id]: st }));
  }, []);

  /* ── Celdas: selección, arrastre, teclado, pantalla completa ───── */

  const selectedIndex = useMemo(
    () => wallCells.findIndex((s) => s != null && s.id === selected),
    [wallCells, selected],
  );

  const registerCellEl = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) cellEls.current.set(index, el);
    else cellEls.current.delete(index);
  }, []);

  const handleSelectCell = useCallback((index: number) => {
    const s = slotsRef.current[index];
    if (s) setSelected(s.id);
  }, []);

  const handleRemoveCam = useCallback((camId: string) => {
    setSlots((prev) => {
      const next = prev.filter((x) => x.id !== camId);
      setSelected((sel) => (sel === camId ? next[0]?.id ?? null : sel));
      return next;
    });
    setPickedIndex(null);
  }, []);

  const handleCellFullscreen = useCallback(
    (index: number, el: HTMLElement | null) => {
      toggleFullscreen(el ?? cellEls.current.get(index) ?? null);
    },
    [toggleFullscreen],
  );

  /** Intercambia dos celdas. Es lo que espera un operador de VMS al reordenar. */
  const swapCells = useCallback((a: number, b: number) => {
    setSlots((prev) => {
      if (a === b || a < 0 || b < 0 || a >= prev.length || b >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[a];
      next[a] = next[b];
      next[b] = tmp;
      return next;
    });
  }, []);

  /**
   * Soltar sobre una celda. Del rail sobre una celda ocupada = sustituir; sobre
   * un hueco = añadir al final (el muro se llena desde el principio, invariante
   * que dejó `8bf4451` y que no conviene romper). Entre celdas = intercambiar.
   */
  const handleDropOnCell = useCallback(
    (targetIndex: number, payload: WallDragPayload) => {
      setPickedIndex(null);
      if (payload.fromIndex != null) {
        swapCells(payload.fromIndex, Math.min(targetIndex, slotsRef.current.length - 1));
        return;
      }
      const already = slotsRef.current.findIndex((s) => s.id === payload.cameraId);
      if (already >= 0) {
        swapCells(already, Math.min(targetIndex, slotsRef.current.length - 1));
        return;
      }
      const cam = items.find((c) => c.id === payload.cameraId);
      if (!cam) return;
      setBusy(cam.id);
      setError(null);
      void fetchStream(cam)
        .then((slot) => {
          setSlots((prev) => {
            const next = [...prev];
            if (targetIndex < next.length) next[targetIndex] = slot;
            else next.push(slot);
            return next.slice(0, layout);
          });
          setSelected(cam.id);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "No se pudo abrir esa cámara");
        })
        .finally(() => setBusy(null));
    },
    [items, fetchStream, layout, swapCells],
  );

  /** Colocar por teclado: `M` recoge, `M` sobre otra celda intercambia. */
  const handleCellKeyCommand = useCallback(
    (index: number, key: string, el: HTMLElement | null) => {
      if (key === "Delete") {
        const s = slotsRef.current[index];
        if (s) handleRemoveCam(s.id);
        return;
      }
      if (key !== "m") return;
      setPickedIndex((prev) => {
        if (prev == null) return index;
        if (prev !== index) swapCells(prev, index);
        return null;
      });
      el?.focus();
    },
    [handleRemoveCam, swapCells],
  );

  const handleAddAt = useCallback(
    (index: number) => {
      const taken = new Set(slotsRef.current.map((s) => s.id));
      const nextCam =
        filtered.find((c) => !taken.has(c.id) && onlineish(c.status)) ||
        filtered.find((c) => !taken.has(c.id));
      if (!nextCam) return;
      handleDropOnCell(index, { cameraId: nextCam.id, fromIndex: null });
    },
    [filtered, handleDropOnCell],
  );

  const openFocusCb = useCallback(
    (camId: string) => {
      setSelected(camId);
      setViewMode("focus");
    },
    [setViewMode],
  );

  /* ── Vistas guardadas: guardar, borrar, predeterminada ─────────── */

  const currentCellIds = useMemo(() => wallCells.map((s) => s?.id ?? null), [wallCells]);

  const currentView = useMemo(
    () => views.find((v) => v.id === currentViewId) ?? null,
    [views, currentViewId],
  );

  const viewDirty = useMemo(
    () => (currentView ? !sameLayoutAsView(currentView, layout, currentCellIds) : false),
    [currentView, layout, currentCellIds],
  );

  const persistViews = useCallback((next: WallView[]) => {
    setViews(next);
    writeWallViews(next);
  }, []);

  const handleLoadView = useCallback(
    (id: string) => {
      const v = views.find((x) => x.id === id);
      if (v) void applyView(v);
    },
    [views, applyView],
  );

  const handleSaveAsView = useCallback(
    (name: string) => {
      const view: WallView = {
        id: newViewId(),
        name,
        layout,
        cells: currentCellIds,
        savedAt: new Date().toISOString(),
      };
      persistViews([view, ...views.filter((v) => v.name !== name)]);
      setCurrentViewId(view.id);
    },
    [layout, currentCellIds, persistViews, views],
  );

  const handleSaveOverView = useCallback(() => {
    if (!currentViewId) return;
    persistViews(
      views.map((v) =>
        v.id === currentViewId
          ? { ...v, layout, cells: currentCellIds, savedAt: new Date().toISOString() }
          : v,
      ),
    );
  }, [currentViewId, layout, currentCellIds, persistViews, views]);

  const handleDeleteView = useCallback(
    (id: string) => {
      persistViews(views.filter((v) => v.id !== id));
      if (currentViewId === id) setCurrentViewId(null);
      if (defaultViewId === id) {
        setDefaultViewId(null);
        writeDefaultViewId(null);
      }
    },
    [views, persistViews, currentViewId, defaultViewId],
  );

  const handleToggleDefaultView = useCallback(
    (id: string) => {
      const next = defaultViewId === id ? null : id;
      setDefaultViewId(next);
      writeDefaultViewId(next);
    },
    [defaultViewId],
  );

  /* ── Pantalla completa y congelado ─────────────────────────────── */

  const toggleGridFullscreen = useCallback(() => {
    toggleFullscreen(stageRef.current);
  }, [toggleFullscreen]);

  /**
   * Congelar / reanudar la imagen visible. Se actúa sobre el `<video>` que ya
   * está en el DOM; el reproductor no expone controles y no es de este panel.
   */
  const togglePlayPause = useCallback(() => {
    const root =
      mode === "focus" ? focusStageRef.current : cellEls.current.get(selectedIndex) ?? null;
    const v = root?.querySelector("video");
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => undefined);
      setFrozen(false);
    } else {
      v.pause();
      setFrozen(true);
    }
  }, [mode, selectedIndex]);

  /* ── Atajos de teclado ─────────────────────────────────────────── */

  /**
   * Un único listener en `window`. Los componentes que necesitan las teclas
   * para sí —el mando PTZ, la línea de tiempo, los campos de texto— cortan la
   * propagación, así que aquí no hace falta un mapa de excepciones.
   *
   * Cambia el listener en cada render, no el muro: colgar y descolgar un
   * `keydown` no repinta nada.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (
          tag === "INPUT" ||
          tag === "SELECT" ||
          tag === "TEXTAREA" ||
          t.isContentEditable
        ) {
          return;
        }
      }

      if (e.key === "Escape") {
        if (helpOpen) {
          e.preventDefault();
          setHelpOpen(false);
          return;
        }
        if (fsElement) {
          e.preventDefault();
          exitFullscreen();
          return;
        }
        if (pickedIndex != null) {
          e.preventDefault();
          setPickedIndex(null);
          return;
        }
        if (mode === "focus") {
          e.preventDefault();
          setViewMode("wall");
        }
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (helpOpen) return;

      if (e.key === "/") {
        e.preventDefault();
        setRailOpen(true);
        // El input aún puede estar por montar si el rail estaba plegado.
        window.setTimeout(() => searchRef.current?.focus(), 0);
        return;
      }

      if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
        e.preventDefault();
        const map: Record<string, LayoutN> = { "1": 1, "2": 4, "3": 9, "4": 16 };
        setLayoutN(map[e.key]);
        setViewMode("wall");
        return;
      }

      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setViewMode("wall");
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setViewMode("focus");
        return;
      }

      if (e.key === "F") {
        e.preventDefault();
        toggleFullscreen(stageRef.current);
        return;
      }
      if (e.key === "f") {
        e.preventDefault();
        if (mode === "focus") toggleFullscreen(focusStageRef.current);
        else if (selectedIndex >= 0) toggleFullscreen(cellEls.current.get(selectedIndex) ?? null);
        return;
      }

      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        togglePlayPause();
        return;
      }

      if (mode !== "wall") return;

      if (e.key === "Delete" && selectedIndex >= 0) {
        e.preventDefault();
        const s = slotsRef.current[selectedIndex];
        if (s) handleRemoveCam(s.id);
        return;
      }

      if ((e.key === "m" || e.key === "M") && selectedIndex >= 0) {
        e.preventDefault();
        handleCellKeyCommand(selectedIndex, "m", cellEls.current.get(selectedIndex) ?? null);
        return;
      }

      const cols = colsFor(layout);
      const delta =
        e.key === "ArrowRight" ? 1
          : e.key === "ArrowLeft" ? -1
            : e.key === "ArrowDown" ? cols
              : e.key === "ArrowUp" ? -cols
                : 0;
      if (delta === 0) return;
      e.preventDefault();
      const total = slotsRef.current.length;
      if (total === 0) return;
      const from = selectedIndex >= 0 ? selectedIndex : 0;
      const to = from + delta;
      if (to < 0 || to >= total) return;
      const target = slotsRef.current[to];
      if (!target) return;
      setSelected(target.id);
      cellEls.current.get(to)?.focus();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    helpOpen,
    mode,
    layout,
    selectedIndex,
    pickedIndex,
    fsElement,
    exitFullscreen,
    toggleFullscreen,
    togglePlayPause,
    handleRemoveCam,
    handleCellKeyCommand,
    setLayoutN,
    setViewMode,
  ]);

  /**
   * Control de admisión: la regla vive en `_wallAdmission.ts`, con pruebas.
   * Recorre las celdas en orden y deja arrancar solo a
   * `WALL_CONNECT_CONCURRENCY` a la vez; el resto espera «En cola». Cuando una
   * se asienta —imagen, respaldo o error— libera su turno y entra la siguiente.
   *
   * Lo único que cambió: un mosaico fuera de pantalla ya no ocupa turno. Antes
   * se quedaba en «en cola» por su `IntersectionObserver` y el bucle lo contaba
   * como conectando, así que en un 4×4 en portátil las filas visibles esperaban
   * detrás de filas que nadie estaba viendo.
   */
  const liveWallIds = useMemo(() => {
    if (mode !== "wall") return new Set<string>();
    return admitirMosaicos(wallCells, tileState, WALL_CONNECT_CONCURRENCY);
  }, [wallCells, mode, tileState]);

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
  /**
   * Cuentas honestas del muro. `liveWallIds` ya no significa «vivas» sino
   * «admitidas a conectar», así que lo vivo se cuenta por lo que reporta cada
   * mosaico. Y se separa el respaldo por imágenes de lo que sí es video: eran
   * indistinguibles en pantalla, con el mismo badge LIVE sobre 0,9 fps.
   */
  const wallStats = useMemo(() => {
    let live = 0;
    let snapshot = 0;
    let failed = 0;
    for (const s of wallCells) {
      if (!s) continue;
      const st = tileState[s.id];
      if (st === "live") live += 1;
      else if (st === "snapshot") snapshot += 1;
      else if (st === "error") failed += 1;
    }
    const queued = Math.max(0, slots.length - liveWallIds.size);
    return { live, snapshot, failed, queued };
  }, [wallCells, tileState, slots.length, liveWallIds.size]);
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
        title="Video · vivo y 24h"
        meta={
          filling
            ? "Abriendo cámaras…"
            : mode === "wall"
              ? [
                  `${filtered.length} cámaras`,
                  `${slots.length}/${layout} en muro`,
                  `${wallStats.live} en vivo`,
                  wallStats.snapshot ? `${wallStats.snapshot} en respaldo` : "",
                  wallStats.queued ? `${wallStats.queued} en cola` : "",
                  wallStats.failed ? `${wallStats.failed} sin video` : "",
                  wallIssues.length ? `${wallIssues.length} no abrieron` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") + detMeta
              : `${filtered.length} cámaras · foco${playbackActive ? " · playback" : ""}${detMeta}`
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
            {!isHct && (
              <IgBtn
                variant="primary"
                disabled={filling || filtered.length === 0 || busy === "pb"}
                title="Abre el foco y reproduce las últimas 24 h del NVR"
                onClick={() => void playLastHours(24)}
              >
                {busy === "pb" ? "Buscando…" : "Playback 24h"}
              </IgBtn>
            )}
            <IgBtn
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
      {!isHct && (
        <p className={styles.attNote}>
          El vivo sale por sub-stream H.264. El playback 24h lee el NVR (canal principal);
          si no hay disco o retención, verás el aviso — no es un fallo de la consola.
        </p>
      )}

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
                        ? Date.now() - detByIp[c.sourceIp] < LIVE_DET_BADGE_MS
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
                    <div className={styles.igEmpty}>
                      <strong className={styles.igEmptyTitle}>Sin cámaras</strong>
                      <span className={styles.igEmptyHint}>
                        Sincroniza el sitio o revisa el filtro de región/búsqueda.
                      </span>
                    </div>
                  )}
                </div>
                <p className={styles.wallHint}>
                  Clic = al muro · Doble clic = foco · Toolbar «Playback 24h» = grabación NVR
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
                          onStateChange={(st) => handleTileState(s.id, st)}
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
              <IgPanel
                title={focus ? focus.name : "Vista principal"}
                count={focus ? (playbackActive ? "PLAYBACK" : "EN VIVO") : "—"}
              >
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
                    {showPtz && (
                      <div className={styles.ptzChrome}>
                        <IntegraPtzPad
                          cameraId={focus.id}
                          canControl={Boolean(caps?.canControlDoors)}
                        />
                        <div className={styles.ptzChromeMeta}>
                          <div className={styles.ptzCapChips} aria-label="Capacidades PTZ">
                            <span data-on="1">Video</span>
                            <span data-on="1">PTZ</span>
                            <span data-on="1">Motion</span>
                            <span data-on="0">Vehicle</span>
                            <span data-on="0">Placas</span>
                          </div>
                          {focusCam?.anprCapable !== true && (
                            <p className={styles.ptzCapBanner} data-tone="limit">
                              Esta domo no clasifica vehículos ni lee placas —
                              video + PTZ only. Necesitas cámara ITC/ANPR o
                              AcuSense/NVR con vehicle (Office Entrance, Azotea,
                              Escalera).
                            </p>
                          )}
                          {!focus.hls && (
                            <p className={styles.ptzHint}>
                              El mando funciona aunque el video diga «Conectando…»
                              (MSE/go2rtc). Reintenta Actualizar si el cuadro
                              no abre.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {focus.provider === "HCT" ? (
                      <IntegraEzuiKitPlayer stream={focus.stream} cameraId={focus.id} height={420} />
                    ) : (
                      // El ref estaba declarado pero no colgaba de ningún nodo:
                      // `F` en Foco llamaba a pantalla completa con `null` y no
                      // hacía nada. Ahora además es lo que se mide para decidir
                      // la calidad, así que sin esto no se pediría HD jamás.
                      <div className={styles.focusStage} ref={focusStageRef}>
                        <IntegraDetectionOverlay
                          deviceIp={focusCam?.sourceIp ?? null}
                          showEmpty
                        />
                        <IntegraLivePlayer
                          src={focusSrc}
                          enabled={mode === "focus"}
                          mode="mse"
                          audio={Boolean(focus.audio) && !playbackActive}
                          hd={hdOferta}
                        />
                      </div>
                    )}
                    <div className={styles.focusSide}>
                      {!focusCam?.isDoorCamera && (
                        <IntegraAcsIdentityStrip enabled={mode === "focus"} />
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
                          anprCapable={focusCam?.anprCapable}
                          isPtz={Boolean(showPtz || focusCam?.isPtz)}
                        />
                      )}
                    </div>
                    {(note || hdNota) && (
                      <p className={styles.videoNote}>
                        <button
                          type="button"
                          onClick={() => setShowTech((v) => !v)}
                          className={styles.techToggle}
                        >
                          {showTech ? "Ocultar detalle técnico ▾" : "Detalle técnico ▸"}
                        </button>
                        {showTech && (
                          <span className={styles.techDetail}>
                            {[note, hdNota].filter(Boolean).join(" · ")}
                          </span>
                        )}
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
                      <strong className={styles.focusPlaybackLabel}>Playback histórico (NVR)</strong>
                      <p className={styles.doorCellMeta} style={{ margin: 0 }}>
                        Solo en el foco (el muro sigue en vivo). Retención según disco del
                        grabador — si no hay segmentos, el equipo no grabó ese tramo.
                      </p>
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
                          disabled={!selected || busy === "pb"}
                          onClick={() => void playLastHours(1)}
                        >
                          Última 1h
                        </IgBtn>
                        <IgBtn
                          variant="primary"
                          disabled={!selected || busy === "pb"}
                          onClick={() => void playLastHours(24)}
                        >
                          {busy === "pb" ? "Buscando…" : "Últimas 24h"}
                        </IgBtn>
                        <IgBtn
                          disabled={!selected || busy === "pb"}
                          onClick={() => void requestPlayback(0)}
                        >
                          Reproducir rango
                        </IgBtn>
                        {playbackActive && (
                          <IgBtn
                            onClick={() => {
                              setPlayback(null);
                              setNote(null);
                              setError(null);
                            }}
                          >
                            Volver a vivo
                          </IgBtn>
                        )}
                      </div>
                      {playback && playback.cameraId === selected && playback.segments.length > 0 && (
                        <ul className={styles.playbackSegments}>
                          {playback.segments.map((seg, i) => {
                            const label = formatSegRange(seg.startTime, seg.endTime);
                            const active = i === playback.segmentIndex;
                            return (
                              <li key={`${seg.startTime || i}-${seg.endTime || i}`}>
                                <button
                                  type="button"
                                  className={styles.playbackSegBtn}
                                  data-active={active ? "1" : "0"}
                                  disabled={busy === "pb"}
                                  onClick={() => void requestPlayback(i)}
                                >
                                  {active ? "▶ " : ""}
                                  {label}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className={styles.doorCellMeta}>
                      Este proveedor (Hik-Connect) solo ofrece video en vivo aquí. El
                      playback histórico no está disponible en esta consola.
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
