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
import { IntegraHlsPlayer } from "./_HlsPlayer";
import {
  DOOR_CONTROL_OPTIONS,
  DoorControlType,
  getActiveIntegraSiteId,
  integraApi,
} from "./_lib";
import styles from "./integra.module.css";

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
  const [preview, setPreview] = useState<{ id: string; name: string; hls: string | null; note?: string | null } | null>(null);
  const [busyCam, setBusyCam] = useState(false);

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
    const e = setInterval(() => void refreshEvents(), 8000);
    return () => {
      clearInterval(t);
      clearInterval(e);
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

  const controlDoor = async (id: string) => {
    setBusyDoor(id);
    setError(null);
    try {
      await integraApi(`integra/doors/${encodeURIComponent(id)}/control`, {
        method: "POST",
        body: JSON.stringify({ controlType }),
      });
      await refreshTree();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error puerta");
    } finally {
      setBusyDoor(null);
    }
  };

  const playCam = async (id: string) => {
    const cam = tree?.cameras.find((c) => c.id === id);
    setBusyCam(true);
    setError(null);
    try {
      const data = await integraApi<{ hls: string | null; note?: string }>(
        `integra/cameras/${encodeURIComponent(id)}/stream`,
        { method: "POST" },
      );
      setPreview({ id, name: cam?.name || id, hls: data.hls, note: data.note });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stream");
      setPreview(null);
    } finally {
      setBusyCam(false);
    }
  };

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
      <div className={styles.igOnboard}>
        <div className={styles.igOnboardCard}>
          <EmptyState
            title="Sin sitio activo"
            description="Conecta un HikCentral o Hik-Connect para operar video, puertas y eventos en esta consola."
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
    );
  }

  const focusDoor = sel?.kind === "door" ? tree?.doors.find((d) => d.id === sel.id) : null;
  const focusCam = sel?.kind === "camera" ? tree?.cameras.find((c) => c.id === sel.id) : null;

  const wallCams = (tree?.cameras || []).slice(0, 9);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%" }}>
      <IgError>{error}</IgError>
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
              tab === "doors" ? (
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
                    onClick={() => void controlDoor(d.id)}
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
                {wallCams.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.doorCell}
                    onClick={() => {
                      setSel({ kind: "camera", id: c.id });
                      setTab("focus");
                      void playCam(c.id);
                    }}
                  >
                    <span className={styles.doorCellName}>{c.name}</span>
                    <span className={styles.doorCellMeta}>{c.region || c.id}</span>
                    <IgBadge tone="accent">Live</IgBadge>
                  </button>
                ))}
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
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <IgBtn
                        variant="primary"
                        disabled={busyDoor === focusDoor.id}
                        onClick={() => void controlDoor(focusDoor.id)}
                      >
                        {busyDoor === focusDoor.id ? "…" : DOOR_CONTROL_OPTIONS.find((o) => o.value === controlType)?.label || "Abrir"}
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
                  </div>
                )}
                {(focusCam || preview) && (
                  <div className={styles.camTile} style={{ maxWidth: 640 }}>
                    <div className={styles.camTileHead}>
                      <span>{preview?.name || focusCam?.name}</span>
                      {busyCam && <span>…</span>}
                    </div>
                    <div className={styles.camTileBody}>
                      {preview?.hls ? (
                        <IntegraHlsPlayer src={preview.hls} />
                      ) : (
                        <p className={styles.igEmpty}>
                          {preview?.note || "Sin HLS — revisa go2rtc o token HCT"}
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
            title="Eventos en vivo"
            actions={<IgBtn onClick={() => void refreshEvents()}>↻</IgBtn>}
            items={events.map((e) => ({
              id: e.id || `${e.timestamp}-${e.doorName}-${e.personName}`,
              time: fmtTime(e.timestamp),
              title: e.personName || e.eventType || "Evento",
              meta: [e.doorName, e.eventType].filter(Boolean).join(" · "),
            }))}
            empty="Sin eventos recientes"
            onItemClick={(id) => {
              const ev = events.find((e) => (e.id || `${e.timestamp}-${e.doorName}-${e.personName}`) === id);
              if (ev?.doorId) {
                setSel({ kind: "door", id: ev.doorId });
                setTab("focus");
              }
            }}
          />
        }
      />
    </div>
  );
}
