"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac/roles";
import {
  IgBadge,
  IgBtn,
  IgCanvas,
  IgError,
  IgFeed,
  IgTree,
  IgWorkbench,
  type IgTreeNode,
} from "./_Console";
import { DoorConfirmModal } from "./_DoorConfirmModal";
import { IntegraEzuiKitPlayer } from "./_EzuiKitPlayer";
import { IntegraLivePlayer } from "./_LivePlayer";
import { getCachedCapabilities, subscribeCapabilities } from "./_caps";
import {
  DOOR_CONTROL_OPTIONS,
  DoorControlType,
  getActiveIntegraSiteId,
  integraApi,
  withSiteQuery,
  type IntegraCapabilities,
} from "./_lib";
import { buildApiUrl } from "@/lib/api-base";
import styles from "./integra.module.css";
import { getTicketsUrl } from "@/lib/panel-urls";
import Link from "next/link";

type Region = { id: string; name: string; parentId?: string | null };
type Door = {
  id: string;
  name: string;
  location?: string;
  regionId?: string | null;
  online?: boolean;
  status?: string;
};
type Cam = {
  id: string;
  name: string;
  region?: string;
  regionId?: string | null;
  status?: string | number;
};
type TreePayload = {
  regions: Region[];
  doors: Door[];
  cameras: Cam[];
};
type Ev = {
  id: string;
  doorId?: string;
  doorName?: string;
  personName?: string;
  eventType?: string;
  timestamp?: string;
};
type Dash = {
  connected: boolean;
  configured: boolean;
  host?: string | null;
  provider?: string;
  doors?: number;
  cameras?: number;
  doorsOnline?: number;
  people?: number;
};

type Sel =
  | { kind: "door"; id: string }
  | { kind: "camera"; id: string }
  | { kind: "region"; id: string }
  | null;

function buildTree(regions: Region[], doors: Door[], cameras: Cam[]): IgTreeNode[] {
  const byParent = new Map<string | null, Region[]>();
  for (const r of regions) {
    const p = r.parentId || null;
    const list = byParent.get(p) || [];
    list.push(r);
    byParent.set(p, list);
  }

  const doorsByRegion = new Map<string, Door[]>();
  const doorsOrphan: Door[] = [];
  for (const d of doors) {
    const rid = d.regionId || null;
    if (rid) {
      const list = doorsByRegion.get(rid) || [];
      list.push(d);
      doorsByRegion.set(rid, list);
    } else {
      doorsOrphan.push(d);
    }
  }

  const camsByRegion = new Map<string, Cam[]>();
  const camsOrphan: Cam[] = [];
  for (const c of cameras) {
    const rid = c.regionId || null;
    if (rid) {
      const list = camsByRegion.get(rid) || [];
      list.push(c);
      camsByRegion.set(rid, list);
    } else {
      camsOrphan.push(c);
    }
  }

  const walk = (r: Region): IgTreeNode => {
    const kids: IgTreeNode[] = [];
    for (const child of byParent.get(r.id) || []) kids.push(walk(child));
    for (const d of doorsByRegion.get(r.id) || []) {
      kids.push({
        id: `door:${d.id}`,
        label: d.name,
        kind: "door",
        online: d.online,
      });
    }
    for (const c of camsByRegion.get(r.id) || []) {
      kids.push({
        id: `cam:${c.id}`,
        label: c.name,
        kind: "camera",
        online: c.status === 1 || c.status === "1" || String(c.status).toLowerCase() === "online",
      });
    }
    return { id: `region:${r.id}`, label: r.name, kind: "region", children: kids };
  };

  const roots = (byParent.get(null) || []).map(walk);
  // Regions whose parent is missing from set → treat as roots
  const known = new Set(regions.map((r) => r.id));
  for (const r of regions) {
    if (r.parentId && !known.has(r.parentId) && !roots.some((n) => n.id === `region:${r.id}`)) {
      roots.push(walk(r));
    }
  }

  if (!roots.length && (doors.length || cameras.length)) {
    const flat: IgTreeNode[] = [];
    if (doors.length) {
      flat.push({
        id: "group:doors",
        label: "Puertas",
        kind: "group",
        children: doors.map((d) => ({
          id: `door:${d.id}`,
          label: d.name,
          kind: "door" as const,
          online: d.online,
        })),
      });
    }
    if (cameras.length) {
      flat.push({
        id: "group:cams",
        label: "Cámaras",
        kind: "group",
        children: cameras.map((c) => ({
          id: `cam:${c.id}`,
          label: c.name,
          kind: "camera" as const,
        })),
      });
    }
    return flat;
  }

  if (doorsOrphan.length || camsOrphan.length) {
    const orphans: IgTreeNode[] = [];
    for (const d of doorsOrphan) {
      orphans.push({ id: `door:${d.id}`, label: d.name, kind: "door", online: d.online });
    }
    for (const c of camsOrphan) {
      orphans.push({ id: `cam:${c.id}`, label: c.name, kind: "camera" });
    }
    if (orphans.length) {
      roots.push({ id: "group:other", label: "Sin área", kind: "group", children: orphans });
    }
  }

  return roots;
}

export default function IntegraHome() {
  const router = useRouter();
  const { user } = useUser();
  const isClient = resolveV2RoleKey(user) === ROLES.CLIENTE;
  const [tree, setTree] = useState<TreePayload | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [tab, setTab] = useState("doors");
  const [controlType, setControlType] = useState<DoorControlType>("2");
  const [busyDoor, setBusyDoor] = useState<string | null>(null);
  const [confirmDoor, setConfirmDoor] = useState<Door | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    name: string;
    hls: string | null;
    note?: string | null;
    stream?: Record<string, unknown> | null;
    provider?: string | null;
  } | null>(null);
  const [busyCam, setBusyCam] = useState(false);
  const [liveSlots, setLiveSlots] = useState<
    Array<{ id: string; name: string; hls: string | null; stream?: Record<string, unknown> | null; provider?: string }>
  >([]);
  const [openAlarms, setOpenAlarms] = useState(0);
  const [caps, setCaps] = useState<IntegraCapabilities | null>(null);

  useEffect(() => {
    setCaps(getCachedCapabilities());
    return subscribeCapabilities(setCaps);
  }, []);

  const canControl = caps == null ? !isClient : Boolean(caps.canControlDoors);

  const refreshTree = useCallback(async () => {
    try {
      const [t, d] = await Promise.all([
        integraApi<TreePayload>("integra/tree"),
        integraApi<Dash>("integra/dashboard").catch(() => null),
      ]);
      setTree(t);
      if (d) setDash(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      const ev = await integraApi<{ items: Ev[] }>("integra/events?limit=40");
      setEvents(ev.items);
    } catch {
      /* feed silencioso */
    }
  }, []);

  useEffect(() => {
    void refreshTree();
    void refreshEvents();
    const t = setInterval(() => void refreshTree(), 60000);

    // SSE con reconnect exponencial (tope 60s); poll solo mientras SSE esté caído
    let es: EventSource | null = null;
    let poll: number | null = null;
    let retryTimer: number | null = null;
    let backoffMs = 1000;
    let stopped = false;

    const stopPoll = () => {
      if (poll != null) {
        window.clearInterval(poll);
        poll = null;
      }
    };
    const startPoll = () => {
      if (poll != null || stopped) return;
      poll = window.setInterval(() => void refreshEvents(), 8000);
    };
    const openSse = () => {
      if (stopped) return;
      try {
        es?.close();
        const url = buildApiUrl(withSiteQuery("integra/events/stream"));
        es = new EventSource(url, { withCredentials: true });
        es.onopen = () => {
          backoffMs = 1000;
          stopPoll();
        };
        es.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (Array.isArray(data?.items)) setEvents(data.items);
          } catch {
            /* ignore */
          }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          startPoll();
          if (stopped) return;
          if (retryTimer != null) window.clearTimeout(retryTimer);
          const wait = backoffMs;
          backoffMs = Math.min(backoffMs * 2, 60_000);
          retryTimer = window.setTimeout(() => openSse(), wait);
        };
      } catch {
        startPoll();
        if (!stopped) {
          if (retryTimer != null) window.clearTimeout(retryTimer);
          const wait = backoffMs;
          backoffMs = Math.min(backoffMs * 2, 60_000);
          retryTimer = window.setTimeout(() => openSse(), wait);
        }
      }
    };
    openSse();

    const alarmIv = window.setInterval(async () => {
      try {
        const q = await integraApi<{ openCount: number }>("integra/alarms/queue?hours=24");
        setOpenAlarms(q.openCount ?? 0);
      } catch {
        /* ignore */
      }
    }, 10000);
    void integraApi<{ openCount: number }>("integra/alarms/queue?hours=24")
      .then((q) => setOpenAlarms(q.openCount ?? 0))
      .catch(() => undefined);

    return () => {
      stopped = true;
      clearInterval(t);
      stopPoll();
      if (retryTimer != null) window.clearTimeout(retryTimer);
      clearInterval(alarmIv);
      es?.close();
    };
  }, [refreshTree, refreshEvents]);

  const nodes = useMemo(
    () => buildTree(tree?.regions || [], tree?.doors || [], tree?.cameras || []),
    [tree],
  );

  const selectedId =
    sel?.kind === "door"
      ? `door:${sel.id}`
      : sel?.kind === "camera"
        ? `cam:${sel.id}`
        : sel?.kind === "region"
          ? `region:${sel.id}`
          : null;

  const onSelect = (id: string, kind: IgTreeNode["kind"]) => {
    if (kind === "door" && id.startsWith("door:")) {
      setSel({ kind: "door", id: id.slice(5) });
      setTab("focus");
    } else if (kind === "camera" && id.startsWith("cam:")) {
      setSel({ kind: "camera", id: id.slice(4) });
      setTab("focus");
      void playCam(id.slice(4));
    } else if (kind === "region" && id.startsWith("region:")) {
      setSel({ kind: "region", id: id.slice(7) });
      setTab("doors");
    }
  };

  const controlDoor = async (id: string, reason: string) => {
    setBusyDoor(id);
    setError(null);
    try {
      await integraApi(`integra/doors/${encodeURIComponent(id)}/control`, {
        method: "POST",
        body: JSON.stringify({ controlType, reason }),
      });
      setConfirmDoor(null);
      await refreshTree();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error puerta");
    } finally {
      setBusyDoor(null);
    }
  };

  const requestDoorControl = (d: Door) => {
    if (!canControl) {
      setError("Sin permiso para controlar puertas");
      return;
    }
    setConfirmDoor(d);
  };

  const playCam = async (id: string) => {
    const cam = tree?.cameras.find((c) => c.id === id);
    setBusyCam(true);
    setError(null);
    try {
      const data = await integraApi<{
        hls: string | null;
        note?: string;
        stream?: Record<string, unknown>;
        provider?: string;
      }>(`integra/cameras/${encodeURIComponent(id)}/stream`, { method: "POST" });
      setPreview({
        id,
        name: cam?.name || id,
        hls: data.hls,
        note: data.note,
        stream: data.stream,
        provider: data.provider,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stream");
      setPreview(null);
    } finally {
      setBusyCam(false);
    }
  };

  const loadLiveWall = useCallback(async () => {
    const cams = (tree?.cameras || []).slice(0, 4);
    if (!cams.length) {
      setLiveSlots([]);
      return;
    }
    const slots = await Promise.all(
      cams.map(async (c) => {
        try {
          const data = await integraApi<{
            hls: string | null;
            stream?: Record<string, unknown>;
            provider?: string;
          }>(`integra/cameras/${encodeURIComponent(c.id)}/stream`, { method: "POST" });
          return {
            id: c.id,
            name: c.name,
            hls: data.hls,
            stream: data.stream,
            provider: data.provider,
          };
        } catch {
          return { id: c.id, name: c.name, hls: null };
        }
      }),
    );
    setLiveSlots(slots);
  }, [tree?.cameras]);

  useEffect(() => {
    if (tab === "video") void loadLiveWall();
  }, [tab, loadLiveWall]);

  const fmtTime = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleTimeString("es-MX", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const noSite = !getActiveIntegraSiteId() && dash && !dash.configured;
  const emptyInventory =
    tree && tree.doors.length === 0 && tree.cameras.length === 0 && tree.regions.length === 0;

  if (noSite || (emptyInventory && dash && !dash.configured)) {
    if (isClient) {
      return (
        <div className={styles.igOnboard}>
          <div className={styles.igOnboardCard}>
            <EmptyState
              title="Tu sitio aún no está activo"
              description="NEXARA está configurando cámaras y accesos de tu sede. Cuando el enlace esté listo, aquí verás el monitoreo en vivo, eventos y el estado de tus puertas."
              icon={
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 3 4 9v11h5v-6h6v6h5V9l-8-6Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />
            <ol className={styles.igOnboardSteps}>
              <li>
                <span className={styles.igOnboardStepNum}>1</span>
                <span>Tu equipo NEXARA registra el sitio</span>
              </li>
              <li>
                <span className={styles.igOnboardStepNum}>2</span>
                <span>Se sincronizan cámaras, puertas y personas</span>
              </li>
              <li>
                <span className={styles.igOnboardStepNum}>3</span>
                <span>Ops queda listo para consultar y operar</span>
              </li>
            </ol>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.pageStack}>
        <header className={styles.pageHero}>
          <div className={styles.pageHeroCopy}>
            <span className={styles.pageEyebrow}>Integra · alta</span>
            <h1 className={styles.pageTitle}>Conecta tu primer sitio</h1>
            <p className={styles.pageSub}>
              Misma experiencia de shell que CRM y ERP: primero conecta tu plataforma de seguridad.
            </p>
          </div>
        </header>
      <div className={styles.igOnboard}>
        <div className={styles.igOnboardCard}>
          <EmptyState
            title="Sin sitio activo"
            description="Conecta un sitio de seguridad para operar video, puertas y eventos en esta consola."
            action={
              <Button variant="primary" size="md" onClick={() => router.push("/integra/settings")}>
                Ir a Sitios
              </Button>
            }
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <ol className={styles.igOnboardSteps}>
            <li>
              <span className={styles.igOnboardStepNum}>1</span>
              <span>Abre Sitios y crea una conexión al servidor</span>
            </li>
            <li>
              <span className={styles.igOnboardStepNum}>2</span>
              <span>Sincroniza el inventario (cámaras, puertas, personas)</span>
            </li>
            <li>
              <span className={styles.igOnboardStepNum}>3</span>
              <span>Vuelve a Ops para monitorear y controlar</span>
            </li>
          </ol>
        </div>
      </div>
      </div>
    );
  }

  const focusDoor = sel?.kind === "door" ? tree?.doors.find((d) => d.id === sel.id) : null;
  const focusCam = sel?.kind === "camera" ? tree?.cameras.find((c) => c.id === sel.id) : null;

  const wallCams = (tree?.cameras || []).slice(0, 9);

  return (
    <div className={styles.pageStack}>
      <header className={styles.pageHero}>
        <div className={styles.pageHeroCopy}>
          <span className={styles.pageEyebrow}>
            {isClient ? "Mi seguridad" : "Integra · consola"}
          </span>
          <h1 className={styles.pageTitle}>
            {isClient ? "Estado del sitio" : "Ops en vivo"}
          </h1>
          <p className={styles.pageSub}>
            {dash?.connected
              ? `Sitio conectado · ${dash.host || "activo"}`
              : "Árbol de áreas, control de puertas, video y eventos"}
          </p>
        </div>
        <div className={styles.pageHeroActions}>
          <Button variant="secondary" size="sm" onClick={() => void refreshTree()}>
            Actualizar
          </Button>
          {!isClient && (
            <Button variant="primary" size="sm" onClick={() => router.push("/integra/video")}>
              Ir a video →
            </Button>
          )}
        </div>
      </header>

      {isClient && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <a
            href={getTicketsUrl("/")}
            style={{
              textDecoration: "none",
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "inherit",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Mis tickets</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
              Solicitudes y seguimiento de servicio
            </div>
          </a>
          <Link
            href="/integra/video"
            style={{
              textDecoration: "none",
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "inherit",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Video</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
              Cámaras y muro en vivo
            </div>
          </Link>
          <Link
            href="/integra/access"
            style={{
              textDecoration: "none",
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "inherit",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Accesos</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
              Puertas y control de acceso
            </div>
          </Link>
        </div>
      )}

      <IgError>{error}</IgError>

      <div className={styles.workbenchWrap}>
      <IgWorkbench
        tree={
          <>
            <div className={styles.igFeedHead}>
              <h2 className={styles.igFeedTitle}>Sitio</h2>
              <IgBtn onClick={() => void refreshTree()}>↻</IgBtn>
            </div>
            <IgTree
              nodes={nodes}
              selectedId={selectedId}
              onSelect={onSelect}
              empty="Sin áreas — sincroniza el sitio"
            />
          </>
        }
        canvas={
          <IgCanvas
            tabs={[
              { id: "doors", label: "Puertas" },
              { id: "video", label: "Video" },
              { id: "focus", label: "Foco" },
            ]}
            active={tab}
            onTab={setTab}
            actions={
              tab === "doors" && canControl ? (
                <select
                  value={controlType}
                  onChange={(e) => setControlType(e.target.value as DoorControlType)}
                  style={{ fontSize: 11, padding: "2px 6px" }}
                  aria-label="Acción de puerta"
                >
                  {DOOR_CONTROL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : tab === "video" ? (
                <IgBtn onClick={() => router.push("/integra/video")}>Abrir muro</IgBtn>
              ) : undefined
            }
          >
            {tab === "doors" && (
              <div className={styles.doorMatrix}>
                {(tree?.doors || []).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={styles.doorCell}
                    data-online={d.online === false ? "0" : "1"}
                    disabled={busyDoor === d.id}
                    onClick={() => {
                      if (canControl) requestDoorControl(d);
                      else {
                        setSel({ kind: "door", id: d.id });
                        setTab("focus");
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSel({ kind: "door", id: d.id });
                      setTab("focus");
                    }}
                    title={`${d.name} · clic = controlar · clic der. = foco`}
                  >
                    <span className={styles.doorCellName}>{d.name}</span>
                    <span className={styles.doorCellMeta}>{d.location || d.id}</span>
                    <IgBadge tone={d.online === false ? "warn" : "ok"}>
                      {busyDoor === d.id ? "…" : d.status || (d.online === false ? "off" : "online")}
                    </IgBadge>
                  </button>
                ))}
                {(tree?.doors || []).length === 0 && (
                  <p className={styles.igEmpty}>Sin puertas — sincroniza o revisa Accesos</p>
                )}
              </div>
            )}

            {tab === "video" && (
              <div className={styles.camGridDense}>
                {(liveSlots.length ? liveSlots : wallCams.slice(0, 4).map((c) => ({ id: c.id, name: c.name, hls: null }))).map(
                  (c) => (
                    <div key={c.id} className={styles.camTile} style={{ minHeight: 120 }}>
                      <div className={styles.camTileHead}>
                        <button
                          type="button"
                          style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 0 }}
                          onClick={() => {
                            setSel({ kind: "camera", id: c.id });
                            setTab("focus");
                            void playCam(c.id);
                          }}
                        >
                          {c.name}
                        </button>
                      </div>
                      <div className={styles.camTileBody}>
                        {"provider" in c && c.provider === "HCT" && "stream" in c && c.stream ? (
                          <IntegraEzuiKitPlayer stream={c.stream as any} cameraId={c.id} height={140} />
                        ) : c.hls ? (
                          <IntegraLivePlayer src={c.hls} compact showLiveBadge mode="mjpeg" startDelayMs={0} />
                        ) : (
                          <p className={styles.igEmpty} style={{ fontSize: 11 }}>
                            Cargando…
                          </p>
                        )}
                      </div>
                    </div>
                  ),
                )}
                {wallCams.length === 0 && (
                  <p className={styles.igEmpty}>Sin cámaras en el espejo</p>
                )}
              </div>
            )}

            {tab === "focus" && (
              <div style={{ display: "grid", gap: 10 }}>
                {focusDoor && (
                  <div className={styles.doorCell} style={{ maxWidth: 360 }}>
                    <span className={styles.doorCellName}>{focusDoor.name}</span>
                    <span className={styles.doorCellMeta}>{focusDoor.location || focusDoor.id}</span>
                    {canControl && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <IgBtn
                          variant="primary"
                          disabled={busyDoor === focusDoor.id}
                          onClick={() => requestDoorControl(focusDoor)}
                        >
                          {busyDoor === focusDoor.id
                            ? "…"
                            : DOOR_CONTROL_OPTIONS.find((o) => o.value === controlType)?.label || "Abrir"}
                        </IgBtn>
                        <select
                          value={controlType}
                          onChange={(e) => setControlType(e.target.value as DoorControlType)}
                          style={{ fontSize: 11 }}
                        >
                          {DOOR_CONTROL_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
                {(focusCam || preview) && (
                  <div className={styles.camTile} style={{ maxWidth: 640 }}>
                    <div className={styles.camTileHead}>
                      <span>{preview?.name || focusCam?.name}</span>
                      {busyCam && <span>…</span>}
                    </div>
                    <div className={styles.camTileBody}>
                      {preview?.provider === "HCT" && preview.stream ? (
                        <IntegraEzuiKitPlayer stream={preview.stream} cameraId={preview.id} />
                      ) : preview?.hls ? (
                        <IntegraLivePlayer src={preview.hls} mode="mse" />
                      ) : (
                        <p className={styles.igEmpty}>
                          {preview?.note || "Sin señal de video — revisa el sitio o el stream"}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {!focusDoor && !focusCam && !preview && (
                  <p className={styles.igEmpty}>Selecciona una puerta o cámara en el árbol</p>
                )}
              </div>
            )}
          </IgCanvas>
        }
        feed={
          <IgFeed
            title={openAlarms > 0 ? `Eventos · ${openAlarms} alarmas` : "Eventos en vivo"}
            actions={
              <>
                {openAlarms > 0 && (
                  <IgBtn onClick={() => router.push("/integra/alarms")}>Alarmas</IgBtn>
                )}
                <IgBtn onClick={() => void refreshEvents()}>↻</IgBtn>
              </>
            }
            items={events.map((e) => ({
              id: e.id || `${e.timestamp}-${e.doorName}-${e.personName}`,
              time: fmtTime(e.timestamp),
              title: e.personName || e.eventType || "Evento",
              meta: [e.doorName, e.eventType].filter(Boolean).join(" · "),
            }))}
            empty="Sin eventos recientes"
            onItemClick={(id) => {
              const ev = events.find(
                (e) => (e.id || `${e.timestamp}-${e.doorName}-${e.personName}`) === id,
              );
              if (ev?.doorId) {
                setSel({ kind: "door", id: ev.doorId });
                setTab("focus");
              }
            }}
          />
        }
      />
      </div>

      <DoorConfirmModal
        open={Boolean(confirmDoor)}
        doorName={confirmDoor?.name || ""}
        doorId={confirmDoor?.id || ""}
        controlType={controlType}
        busy={busyDoor === confirmDoor?.id}
        allowTypeSelect
        onControlTypeChange={setControlType}
        onCancel={() => setConfirmDoor(null)}
        onConfirm={(reason) => {
          if (confirmDoor) void controlDoor(confirmDoor.id, reason);
        }}
      />
    </div>
  );
}
