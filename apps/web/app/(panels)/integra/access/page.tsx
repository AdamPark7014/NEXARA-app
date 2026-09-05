"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import TuneIcon from "@mui/icons-material/Tune";
import {
  IgBtn,
  IgField,
  IgFilters,
  IgNotice,
  IgPage,
  IgPanel,
  IgSplit,
  IgTable,
  IgToolbar,
} from "../_Console";
import {
  DOOR_STATE_FILTERS,
  DoorGridSkeleton,
  DoorStateBadge,
  RetryNotice,
  RowsSkeleton,
  ShowingCount,
  diagLocal,
  doorState,
  doorStateLabel,
  type DoorStateKey,
} from "../_AccessUi";
import { DoorConfirmModal } from "../_DoorConfirmModal";
import { IntegraLivePlayer } from "../_LivePlayer";
import { getCachedCapabilities, subscribeCapabilities } from "../_caps";
import { diagnosticar, pedirIntegra, type Diagnostico } from "../_fallosApi";
import {
  DOOR_CONTROL_OPTIONS,
  DoorControlType,
  getActiveIntegraSiteId,
  inputStyle,
  selectStyle,
  type IntegraCapabilities,
} from "../_lib";
import { toast } from "@/components/Toast";
import styles from "../integra.module.css";
import a from "../_access.module.css";

type Door = {
  id: string;
  name: string;
  location?: string;
  online?: boolean;
  status?: string;
  doorState?: string | number | null;
};
type Group = { id: string; name: string };
type Person = { id: string; name: string; code?: string };
type Device = { id: string; name: string; kind: string; ip?: string; online?: boolean };
type Cam = {
  id: string;
  name: string;
  hasAudio?: boolean;
  doorIndexCode?: string | null;
  isDoorCamera?: boolean;
};
type Site = { id: number; name: string; label?: string | null; isDefault?: boolean };

/** `GET integra/doors` — `source` distingue el espejo de la consulta al ACS. */
type DoorList = { items: Door[]; total?: number; source?: string };

type KindFilter = "ALL" | "ACS" | "ENCODE";

/** Cuántos elementos se pintan de primeras en cada lista. */
const DOOR_PAGE = 24;
const DEVICE_PAGE = 40;
const PERSON_PAGE = 80;

/**
 * El permiso lo comprobó la propia pantalla con las capacidades ya cargadas:
 * no hubo petición, así que no hay `status` que diagnosticar ni nada que
 * reintentar.
 */
const SIN_PERMISO_PUERTAS = diagLocal(
  "No tienes permiso para accionar puertas",
  "Tu rol puede consultar el estado, pero no abrir ni cerrar. Pídele el permiso a un administrador del sitio.",
);

/**
 * `useSearchParams` obliga a una frontera de Suspense en el App Router.
 * La consola vive dentro para que los filtros puedan viajar en la URL.
 */
export default function IntegraAccessPage() {
  return (
    <Suspense
      fallback={
        <IgPage>
          <DoorGridSkeleton />
        </IgPage>
      }
    >
      <IntegraAccessConsole />
    </Suspense>
  );
}

function IntegraAccessConsole() {
  const router = useRouter();
  const sp = useSearchParams();
  const [doors, setDoors] = useState<Door[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  /**
   * Un solo canal de error para la pantalla. Guarda el diagnóstico, no la
   * cadena: quien lo pinta necesita saber si el servidor está caído (rojo, con
   * reintento) o si es un permiso (ámbar, sin reintento).
   */
  const [fallo, setFallo] = useState<Diagnostico | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [controlType, setControlType] = useState<DoorControlType>("2");
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);

  /*
   * Filtros compartibles. Arrancan de la URL y vuelven a ella (con retardo,
   * para que teclear no dispare una navegación por letra): así un operador
   * puede pegar en el chat de turno el enlace exacto de «puertas mantenidas
   * abiertas en Planta Norte» y el siguiente ve lo mismo.
   */
  const [personFilter, setPersonFilter] = useState(() => sp.get("persona") ?? "");
  const [doorQ, setDoorQ] = useState(() => sp.get("q") ?? "");
  const [stateFilter, setStateFilter] = useState<DoorStateKey | "ALL">(() => {
    const v = sp.get("estado");
    return v && DOOR_STATE_FILTERS.some((o) => o.value === v) ? (v as DoorStateKey) : "ALL";
  });
  const [regionFilter, setRegionFilter] = useState(() => sp.get("region") ?? "ALL");
  const [kindFilter, setKindFilter] = useState<KindFilter>(() => {
    const v = sp.get("equipos");
    return v === "ACS" || v === "ENCODE" ? v : "ALL";
  });
  const [liveDoors, setLiveDoors] = useState(() => sp.get("live") === "1");
  /** De dónde vino la última lista de puertas, según el propio backend. */
  const [doorSource, setDoorSource] = useState<"mirror" | "live" | null>(null);

  /* Cuánto se pinta de cada lista. Nunca se corta en silencio. */
  const [doorLimit, setDoorLimit] = useState(DOOR_PAGE);
  const [deviceLimit, setDeviceLimit] = useState(DEVICE_PAGE);
  const [personLimit, setPersonLimit] = useState(PERSON_PAGE);

  const [selectedDoor, setSelectedDoor] = useState<Door | null>(null);
  const [confirmDoor, setConfirmDoor] = useState<Door | null>(null);
  const [caps, setCaps] = useState<IntegraCapabilities | null>(null);
  const [cams, setCams] = useState<Cam[]>([]);
  const [doorFeed, setDoorFeed] = useState<{ id: string; hls: string | null; audio: boolean } | null>(
    null,
  );

  useEffect(() => {
    setCaps(getCachedCapabilities());
    return subscribeCapabilities(setCaps);
  }, []);

  const canControl = caps == null ? true : Boolean(caps.canControlDoors);

  // Filtros → URL. Se compara antes de navegar para no meter entradas
  // redundantes en el historial mientras el operador teclea.
  useEffect(() => {
    const next = new URLSearchParams();
    if (doorQ) next.set("q", doorQ);
    if (stateFilter !== "ALL") next.set("estado", stateFilter);
    if (regionFilter !== "ALL") next.set("region", regionFilter);
    if (kindFilter !== "ALL") next.set("equipos", kindFilter);
    if (personFilter) next.set("persona", personFilter);
    if (liveDoors) next.set("live", "1");
    const qs = next.toString();
    const path = window.location.pathname;
    const url = qs ? `${path}?${qs}` : path;
    if (url === path + window.location.search) return;
    const t = window.setTimeout(() => router.replace(url, { scroll: false }), 300);
    return () => window.clearTimeout(t);
  }, [doorQ, stateFilter, regionFilter, kindFilter, personFilter, liveDoors, router]);

  const load = useCallback(async () => {
    setFallo(null);
    setLoading(true);
    try {
      const doorPath = liveDoors ? "integra/doors?live=1" : "integra/doors";
      const [d, g, p, dev, c, s] = await Promise.all([
        pedirIntegra<DoorList>(doorPath),
        pedirIntegra<{ items: Group[] }>("integra/privilege-groups").catch(() => ({ items: [] })),
        pedirIntegra<{ items: Person[] }>("integra/people").catch(() => ({ items: [] })),
        pedirIntegra<{ items: Device[] }>("integra/devices").catch(() => ({ items: [] })),
        pedirIntegra<{ items: Cam[] }>("integra/cameras").catch(() => ({ items: [] })),
        // Solo para poder decir en el modal EN QUÉ SITIO está la puerta.
        pedirIntegra<Site[]>("integra/sites").catch(() => [] as Site[]),
      ]);
      setDoors(d.items);
      // El backend dice de dónde salió la lista ('mirror' | 'live'). Se guarda
      // para poder confesarlo en la barra: pedir estado en vivo y recibir el
      // espejo sin avisar es exactamente la clase de mentira que hace que un
      // operador confíe en el estado de una cerradura que nadie ha consultado.
      setDoorSource(d.source === "live" || d.source === "mirror" ? d.source : null);
      setGroups(g.items);
      setPeople(p.items);
      setDevices(dev.items);
      setCams(c.items);
      setSites(Array.isArray(s) ? s : []);
    } catch (e) {
      setFallo(diagnosticar(e, "cargar el inventario de accesos"));
    } finally {
      setLoading(false);
    }
  }, [liveDoors]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Nombre del sitio activo — el mismo que elige la barra superior. */
  const activeSiteName = useMemo(() => {
    if (sites.length === 0) return null;
    const id = getActiveIntegraSiteId();
    const site =
      (id != null ? sites.find((s) => s.id === id) : null) ||
      sites.find((s) => s.isDefault) ||
      (sites.length === 1 ? sites[0] : null);
    return site ? site.label || site.name : null;
  }, [sites]);

  const requestControl = (d: Door) => {
    if (!canControl) {
      setFallo(SIN_PERMISO_PUERTAS);
      return;
    }
    setSelectedDoor(d);
    setConfirmDoor(d);
  };

  const control = async (id: string, reason: string) => {
    setBusy(id);
    setFallo(null);
    try {
      await pedirIntegra(`integra/doors/${encodeURIComponent(id)}/control`, {
        method: "POST",
        body: JSON.stringify({ controlType, reason }),
      });
      const label =
        DOOR_CONTROL_OPTIONS.find((o) => o.value === controlType)?.label || "Acción";
      toast.success(`${label} enviada · ${confirmDoor?.name || id}`);
      setConfirmDoor(null);
      await load();
    } catch (e) {
      // Un solo aviso: el error vive en el panel de reintento de la página.
      // Antes salía además un toast con el mismo texto y el operador veía
      // dos alertas por el mismo fallo.
      setFallo(diagnosticar(e, `enviar la orden a «${confirmDoor?.name || id}»`));
    } finally {
      setBusy(null);
    }
  };

  /** Regiones presentes en el inventario — no se inventa ninguna. */
  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const d of doors) if (d.location) set.add(d.location);
    return Array.from(set).sort((x, y) => x.localeCompare(y, "es"));
  }, [doors]);

  const filteredDoors = useMemo(() => {
    const q = doorQ.trim().toLowerCase();
    return doors.filter((d) => {
      if (
        q &&
        !d.name.toLowerCase().includes(q) &&
        !d.id.toLowerCase().includes(q) &&
        !(d.location || "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (regionFilter !== "ALL" && (d.location || "") !== regionFilter) return false;
      if (stateFilter !== "ALL" && doorState(d) !== stateFilter) return false;
      return true;
    });
  }, [doors, doorQ, regionFilter, stateFilter]);

  const visibleDoors = useMemo(
    () => filteredDoors.slice(0, doorLimit),
    [filteredDoors, doorLimit],
  );

  const filteredPeople = people.filter(
    (p) =>
      !personFilter ||
      p.name.toLowerCase().includes(personFilter.toLowerCase()) ||
      (p.code || "").toLowerCase().includes(personFilter.toLowerCase()),
  );

  const filteredDevices = devices.filter(
    (d) => kindFilter === "ALL" || d.kind === kindFilter,
  );

  const onlineN = doors.filter((d) => d.online !== false).length;

  /**
   * De dónde salió el estado que se está leyendo, dicho por el backend y no
   * deducido del botón. Son las dos únicas fuentes que `listDoors` declara.
   */
  const sourceLabel =
    doorSource === "live"
      ? "estado consultado al ACS"
      : doorSource === "mirror"
        ? "espejo sincronizado"
        : null;

  /** La cámara de la terminal que gobierna esa puerta, si la tiene. */
  const doorCam = useMemo(
    () => (selectedDoor ? cams.find((c) => c.doorIndexCode === selectedDoor.id) || null : null),
    [cams, selectedDoor],
  );

  // Abrir el video de la puerta seleccionada. Se pide con audio: las terminales
  // llevan micrófono y por ahí se oye a quien está llamando.
  useEffect(() => {
    if (!doorCam) {
      setDoorFeed(null);
      return;
    }
    let cancelled = false;
    setDoorFeed(null);
    void pedirIntegra<{ hls: string | null; audio?: boolean }>(
      `integra/cameras/${encodeURIComponent(doorCam.id)}/stream${doorCam.hasAudio ? "?audio=1" : ""}`,
      { method: "POST" },
    )
      .then((r) => {
        if (!cancelled) setDoorFeed({ id: doorCam.id, hls: r.hls, audio: Boolean(r.audio) });
      })
      .catch(() => {
        if (!cancelled) setDoorFeed({ id: doorCam.id, hls: null, audio: false });
      });
    return () => {
      cancelled = true;
    };
  }, [doorCam]);

  const runAction = (d: Door, type: DoorControlType) => {
    if (!canControl) {
      setFallo(SIN_PERMISO_PUERTAS);
      return;
    }
    setSelectedDoor(d);
    setControlType(type);
    setConfirmDoor(d);
  };

  return (
    <IgPage>
      <IgToolbar
        title="Accesos"
        meta={`${activeSiteName ? `${activeSiteName} · ` : ""}${onlineN}/${doors.length} puertas online · ${devices.length} equipos · ${groups.length} grupos${sourceLabel ? ` · ${sourceLabel}` : ""}`}
        actions={
          <>
            <IgBtn onClick={() => router.push("/integra/espacios")}>Espacios</IgBtn>
            <IgBtn onClick={() => router.push("/integra/people")}>Alta persona</IgBtn>
            <IgBtn onClick={() => router.push("/integra/schedules")}>Horarios</IgBtn>
            <IgBtn onClick={() => router.push("/integra/events")}>Eventos Face</IgBtn>
            <IgBtn
              aria-pressed={liveDoors}
              onClick={() => setLiveDoors((v) => !v)}
              title={
                liveDoors
                  ? "Consultando estado en vivo al ACS"
                  : "Usando el espejo sincronizado (más rápido)"
              }
            >
              {liveDoors ? "Estado live ON" : "Espejo sync"}
            </IgBtn>
            <IgBtn
              onClick={() => void load()}
              disabled={loading}
              aria-label="Actualizar el inventario de accesos"
            >
              {loading ? "Actualizando…" : "Actualizar"}
              <RefreshIcon className={a.btnIcon} aria-hidden />
            </IgBtn>
          </>
        }
      />
      {fallo && <RetryNotice diag={fallo} onRetry={() => void load()} busy={loading} />}
      {!canControl && (
        <IgNotice tone="warn">
          Modo consulta: esta cuenta no puede abrir ni cerrar puertas.
        </IgNotice>
      )}
      {canControl && (
        <IgNotice>
          Clic en una puerta = seleccionar · los botones de cada tarjeta la abren
          o la cierran. Toda acción pide confirmación con motivo y queda en
          auditoría.
        </IgNotice>
      )}

      <IgFilters>
        {canControl && (
          <IgField label="Acción por defecto">
            <select
              value={controlType}
              onChange={(e) => setControlType(e.target.value as DoorControlType)}
              style={selectStyle}
            >
              {DOOR_CONTROL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </IgField>
        )}
        <IgField label="Filtrar puertas">
          <input
            value={doorQ}
            onChange={(e) => {
              setDoorQ(e.target.value);
              setDoorLimit(DOOR_PAGE);
            }}
            style={inputStyle}
            placeholder="nombre / región / id"
          />
        </IgField>
        <IgField label="Estado">
          <select
            value={stateFilter}
            onChange={(e) => {
              const v = e.target.value;
              setStateFilter(
                DOOR_STATE_FILTERS.some((o) => o.value === v) ? (v as DoorStateKey) : "ALL",
              );
              setDoorLimit(DOOR_PAGE);
            }}
            style={selectStyle}
          >
            <option value="ALL">Todos los estados</option>
            {DOOR_STATE_FILTERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </IgField>
        {/* El sitio lo elige la barra superior; dentro del sitio, lo que separa
            unas puertas de otras es la región que reporta el ACS. */}
        <IgField label="Región del sitio">
          <select
            value={regionFilter}
            onChange={(e) => {
              setRegionFilter(e.target.value);
              setDoorLimit(DOOR_PAGE);
            }}
            style={selectStyle}
            disabled={regions.length === 0}
          >
            <option value="ALL">Todo el sitio</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </IgField>
        <IgField label="Equipos">
          <select
            value={kindFilter}
            onChange={(e) => {
              setKindFilter(e.target.value as KindFilter);
              setDeviceLimit(DEVICE_PAGE);
            }}
            style={selectStyle}
          >
            <option value="ALL">ACS + Encode</option>
            <option value="ACS">ACS</option>
            <option value="ENCODE">Encode</option>
          </select>
        </IgField>
        {selectedDoor && canControl && (
          <IgField label="Seleccionada">
            <IgBtn
              variant="primary"
              disabled={busy === selectedDoor.id}
              onClick={() => requestControl(selectedDoor)}
              aria-label={`Ejecutar la acción por defecto en ${selectedDoor.name}`}
            >
              Ejecutar · {selectedDoor.name}
              <ArrowForwardIcon className={a.btnIcon} aria-hidden />
            </IgBtn>
          </IgField>
        )}
      </IgFilters>

      {loading && doors.length === 0 ? (
        <DoorGridSkeleton />
      ) : (
        <>
          <ShowingCount
            shown={visibleDoors.length}
            matching={filteredDoors.length}
            total={doors.length}
            noun="puertas"
            onMore={() => setDoorLimit((n) => n + DOOR_PAGE)}
            onAll={() => setDoorLimit(filteredDoors.length)}
          />
          <div className={a.doorGrid}>
            {visibleDoors.map((d) => {
              const st = doorState(d);
              const selected = selectedDoor?.id === d.id;
              return (
                <div
                  key={d.id}
                  className={a.doorCard}
                  data-selected={selected ? "1" : undefined}
                  data-offline={st === "offline" ? "1" : undefined}
                >
                  <button
                    type="button"
                    className={a.doorPick}
                    aria-pressed={selected}
                    aria-label={`${d.name} · ${doorStateLabel(st)}${
                      d.location ? ` · ${d.location}` : ""
                    } · ver detalle`}
                    title={`${d.name} · ${doorStateLabel(st)}`}
                    onClick={() => setSelectedDoor(d)}
                  >
                    <span className={a.doorName}>{d.name}</span>
                    <span className={a.doorMeta}>{d.location || d.id}</span>
                    <DoorStateBadge state={st} />
                  </button>
                  {canControl && (
                    <div className={a.doorActions}>
                      <button
                        type="button"
                        className={a.iconBtn}
                        disabled={busy === d.id}
                        aria-label={`Abrir ${d.name} (momentáneo)`}
                        title={`Abrir (momentáneo) · ${d.name}`}
                        onClick={() => runAction(d, "2")}
                      >
                        <LockOpenOutlinedIcon className={a.icon} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={a.iconBtn}
                        disabled={busy === d.id}
                        aria-label={`Cerrar ${d.name}`}
                        title={`Cerrar · ${d.name}`}
                        onClick={() => runAction(d, "1")}
                      >
                        <LockOutlinedIcon className={a.icon} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={a.iconBtn}
                        disabled={busy === d.id}
                        aria-label={`Más acciones para ${d.name}`}
                        title={`Todas las acciones · ${d.name}`}
                        onClick={() => requestControl(d)}
                      >
                        <TuneIcon className={a.icon} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {!loading && filteredDoors.length === 0 && (
        <div className={styles.igEmpty}>
          <strong className={styles.igEmptyTitle}>Sin puertas</strong>
          <span className={styles.igEmptyHint}>
            {doors.length === 0
              ? "Sincroniza el sitio (barra superior) para cargar el inventario ACS."
              : `Ninguna de las ${doors.length} puertas cargadas coincide con el filtro.`}
          </span>
          {doors.length > 0 && (
            <IgBtn
              onClick={() => {
                setDoorQ("");
                setStateFilter("ALL");
                setRegionFilter("ALL");
                setDoorLimit(DOOR_PAGE);
              }}
            >
              Quitar filtros
            </IgBtn>
          )}
        </div>
      )}

      {selectedDoor && (
        <IgPanel
          title={`Puerta · ${selectedDoor.name}`}
          count={<DoorStateBadge state={doorState(selectedDoor)} />}
        >
          <div className={styles.doorConsole}>
            <div className={styles.doorConsoleVideo}>
              {doorCam ? (
                doorFeed?.id === doorCam.id && doorFeed.hls === null ? (
                  <div className={styles.doorConsoleNoCam}>
                    <strong>No hay señal de video</strong>
                    <span>
                      La terminal tiene cámara en el espejo, pero el stream no abrió.
                      Revisa go2rtc o pulsa Actualizar.
                    </span>
                  </div>
                ) : (
                  <IntegraLivePlayer
                    src={doorFeed?.id === doorCam.id ? doorFeed.hls : null}
                    mode="mse"
                    audio={Boolean(doorFeed?.audio)}
                  />
                )
              ) : (
                <div className={styles.doorConsoleNoCam}>
                  <strong>Esta puerta no tiene cámara</strong>
                  <span>
                    Solo terminales con lente (p. ej. DS-K1T) muestran vivo aquí tras
                    sincronizar.
                  </span>
                </div>
              )}
            </div>
            <div className={styles.doorConsoleSide}>
              <p className={styles.doorConsoleHint}>
                {canControl
                  ? "Elige una acción. Se pedirá un motivo antes de enviarla al ACS."
                  : "Modo consulta: esta cuenta no puede accionar la puerta."}
              </p>
              <div className={styles.doorConsoleActions}>
                {DOOR_CONTROL_OPTIONS.map((o) => (
                  <IgBtn
                    key={o.value}
                    variant={o.value === "2" ? "primary" : undefined}
                    disabled={!canControl || busy === selectedDoor.id}
                    aria-label={`${o.label} · ${selectedDoor.name}`}
                    onClick={() => runAction(selectedDoor, o.value)}
                  >
                    {busy === selectedDoor.id && controlType === o.value
                      ? "Enviando…"
                      : o.label}
                  </IgBtn>
                ))}
              </div>
              <dl className={styles.doorConsoleFacts}>
                <div>
                  <dt>Estado</dt>
                  <dd>{doorStateLabel(doorState(selectedDoor))}</dd>
                </div>
                <div>
                  <dt>Terminal</dt>
                  <dd>{selectedDoor.location || selectedDoor.id}</dd>
                </div>
                <div>
                  <dt>Personas en sitio</dt>
                  <dd>
                    {people.length}{" "}
                    <button
                      type="button"
                      className={styles.techToggle}
                      aria-label="Ir a la pantalla de Personas"
                      onClick={() => router.push("/integra/people")}
                    >
                      gestionar
                      <ArrowForwardIcon className={a.btnIcon} aria-hidden />
                    </button>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </IgPanel>
      )}

      <IgSplit
        left={
          <IgPanel title="Equipos" count={devices.length}>
            {loading && devices.length === 0 ? (
              <RowsSkeleton rows={6} />
            ) : (
              <>
                <IgTable
                  columns={[
                    { key: "name", label: "Nombre" },
                    { key: "kind", label: "Tipo", width: "80px" },
                    { key: "ip", label: "IP", width: "110px", mono: true },
                    { key: "on", label: "Estado", width: "70px" },
                  ]}
                  rows={filteredDevices.slice(0, deviceLimit).map((d) => ({
                    key: d.id,
                    cells: {
                      name: d.name,
                      kind: d.kind,
                      ip: d.ip || "—",
                      on: d.online === false ? "caído" : "en línea",
                    },
                    tone: d.online === false ? "warn" : "ok",
                  }))}
                  empty="Sin equipos — sincroniza el sitio"
                />
                <ShowingCount
                  shown={Math.min(deviceLimit, filteredDevices.length)}
                  matching={filteredDevices.length}
                  total={devices.length}
                  noun="equipos"
                  onMore={() => setDeviceLimit((n) => n + DEVICE_PAGE)}
                  onAll={() => setDeviceLimit(filteredDevices.length)}
                />
              </>
            )}
          </IgPanel>
        }
        right={
          <IgPanel title="Privilegios">
            <IgFilters>
              <IgField label="Grupo">
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">— elige un grupo —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </IgField>
              <IgField label="Personas">
                <input
                  value={personFilter}
                  onChange={(e) => {
                    setPersonFilter(e.target.value);
                    setPersonLimit(PERSON_PAGE);
                  }}
                  style={inputStyle}
                  placeholder="filtrar…"
                />
              </IgField>
            </IgFilters>
            {loading && people.length === 0 && <RowsSkeleton rows={8} />}
            <ShowingCount
              shown={Math.min(personLimit, filteredPeople.length)}
              matching={filteredPeople.length}
              total={people.length}
              noun="personas"
              onMore={() => setPersonLimit((n) => n + PERSON_PAGE)}
              onAll={() => setPersonLimit(filteredPeople.length)}
            />
            <div className={styles.igCheckList}>
              {filteredPeople.slice(0, personLimit).map((p) => (
                <label key={p.id} className={styles.igCheckRow}>
                  <input
                    type="checkbox"
                    checked={selectedPeople.includes(p.id)}
                    onChange={(e) =>
                      setSelectedPeople((prev) =>
                        e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                      )
                    }
                  />
                  <span>
                    {p.name} {p.code ? `(${p.code})` : ""}
                  </span>
                </label>
              ))}
              {!loading && filteredPeople.length === 0 && (
                <div className={styles.igEmpty}>
                  <strong className={styles.igEmptyTitle}>Sin personas</strong>
                  <span className={styles.igEmptyHint}>
                    {people.length === 0
                      ? "Da de alta en Personas o sincroniza el directorio ACS."
                      : `Ninguna de las ${people.length} personas cargadas coincide con el filtro.`}
                  </span>
                  {people.length === 0 ? (
                    <IgBtn variant="primary" onClick={() => router.push("/integra/people")}>
                      Ir a Personas
                    </IgBtn>
                  ) : (
                    <IgBtn onClick={() => setPersonFilter("")}>Quitar filtro</IgBtn>
                  )}
                </div>
              )}
            </div>
            <IgBtn
              variant="primary"
              disabled={!selectedGroup || selectedPeople.length === 0 || assignBusy}
              onClick={async () => {
                setAssignBusy(true);
                setFallo(null);
                try {
                  await pedirIntegra(
                    `integra/privilege-groups/${encodeURIComponent(selectedGroup)}/persons`,
                    {
                      method: "POST",
                      body: JSON.stringify({ personIds: selectedPeople }),
                    },
                  );
                  toast.success(
                    `${selectedPeople.length} persona(s) asignada(s) al grupo`,
                  );
                  setSelectedPeople([]);
                } catch (e) {
                  // Igual que en el control de puerta: un solo aviso. El texto
                  // vive arriba, en el panel de error con reintento.
                  setFallo(diagnosticar(e, "asignar las personas al grupo"));
                } finally {
                  setAssignBusy(false);
                }
              }}
            >
              {assignBusy ? "Asignando…" : "Asignar al grupo"}
            </IgBtn>
          </IgPanel>
        }
      />

      <DoorConfirmModal
        open={Boolean(confirmDoor)}
        doorName={confirmDoor?.name || ""}
        doorId={confirmDoor?.id || ""}
        doorLocation={confirmDoor?.location || null}
        doorStateLabel={confirmDoor ? doorStateLabel(doorState(confirmDoor)) : null}
        siteName={activeSiteName}
        controlType={controlType}
        busy={busy === confirmDoor?.id}
        allowTypeSelect
        onControlTypeChange={setControlType}
        onCancel={() => setConfirmDoor(null)}
        onConfirm={(reason) => {
          if (confirmDoor) void control(confirmDoor.id, reason);
        }}
      />
    </IgPage>
  );
}
