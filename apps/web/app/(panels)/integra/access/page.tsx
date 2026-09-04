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
  IgSplit,
  IgTable,
  IgToolbar,
} from "../_Console";
import { DoorConfirmModal } from "../_DoorConfirmModal";
import { IntegraLivePlayer } from "../_LivePlayer";
import { getCachedCapabilities, subscribeCapabilities } from "../_caps";
import {
  DOOR_CONTROL_OPTIONS,
  DoorControlType,
  inputStyle,
  integraApi,
  selectStyle,
  type IntegraCapabilities,
} from "../_lib";
import { toast } from "@/components/Toast";
import styles from "../integra.module.css";

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

export default function IntegraAccessPage() {
  const router = useRouter();
  const [doors, setDoors] = useState<Door[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [doorQ, setDoorQ] = useState("");
  const [controlType, setControlType] = useState<DoorControlType>("2");
  const [kindFilter, setKindFilter] = useState<"ALL" | "ACS" | "ENCODE">("ALL");
  const [liveDoors, setLiveDoors] = useState(false);
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

  const load = useCallback(async () => {
    setError(null);
    try {
      const doorPath = liveDoors ? "integra/doors?live=1" : "integra/doors";
      const [d, g, p, dev, c] = await Promise.all([
        integraApi<{ items: Door[] }>(doorPath),
        integraApi<{ items: Group[] }>("integra/privilege-groups").catch(() => ({ items: [] })),
        integraApi<{ items: Person[] }>("integra/people").catch(() => ({ items: [] })),
        integraApi<{ items: Device[] }>("integra/devices").catch(() => ({ items: [] })),
        integraApi<{ items: Cam[] }>("integra/cameras").catch(() => ({ items: [] })),
      ]);
      setDoors(d.items);
      setGroups(g.items);
      setPeople(p.items);
      setDevices(dev.items);
      setCams(c.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [liveDoors]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestControl = (d: Door) => {
    if (!canControl) {
      setError("Sin permiso para controlar puertas");
      return;
    }
    setSelectedDoor(d);
    setConfirmDoor(d);
  };

  const control = async (id: string, reason: string) => {
    setBusy(id);
    setError(null);
    try {
      await integraApi(`integra/doors/${encodeURIComponent(id)}/control`, {
        method: "POST",
        body: JSON.stringify({ controlType, reason }),
      });
      const label =
        DOOR_CONTROL_OPTIONS.find((o) => o.value === controlType)?.label || "Acción";
      toast.success(`${label} enviada · ${confirmDoor?.name || id}`);
      setConfirmDoor(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al controlar la puerta";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const filteredDoors = useMemo(
    () =>
      doors.filter(
        (d) =>
          !doorQ ||
          d.name.toLowerCase().includes(doorQ.toLowerCase()) ||
          d.id.toLowerCase().includes(doorQ.toLowerCase()) ||
          (d.location || "").toLowerCase().includes(doorQ.toLowerCase()),
      ),
    [doors, doorQ],
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
    void integraApi<{ hls: string | null; audio?: boolean }>(
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
      setError("Sin permiso para controlar puertas");
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
        meta={`${onlineN}/${doors.length} puertas online · ${devices.length} equipos · ${groups.length} grupos`}
        actions={
          <>
            <IgBtn onClick={() => router.push("/integra/people")}>Alta persona</IgBtn>
            <IgBtn onClick={() => router.push("/integra/schedules")}>Horarios</IgBtn>
            <IgBtn onClick={() => router.push("/integra/events")}>Eventos Face</IgBtn>
            <IgBtn
              onClick={() => setLiveDoors((v) => !v)}
              title={
                liveDoors
                  ? "Consultando estado en vivo al ACS"
                  : "Usando el espejo sincronizado (más rápido)"
              }
            >
              {liveDoors ? "Estado live ON" : "Espejo sync"}
            </IgBtn>
            <IgBtn onClick={() => void load()}>Actualizar</IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>
      {!canControl && (
        <IgNotice tone="warn">
          Modo consulta: esta cuenta no puede abrir ni cerrar puertas.
        </IgNotice>
      )}
      {canControl && (
        <IgNotice>
          Clic en una puerta = seleccionar · Doble clic = abrir (momentáneo) con
          confirmación. Toda acción pide motivo y queda en auditoría.
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
            onChange={(e) => setDoorQ(e.target.value)}
            style={inputStyle}
            placeholder="nombre / región / id"
          />
        </IgField>
        <IgField label="Equipos">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
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
              onClick={() => setConfirmDoor(selectedDoor)}
            >
              Ejecutar → {selectedDoor.name}
            </IgBtn>
          </IgField>
        )}
      </IgFilters>

      <div className={styles.doorMatrix}>
        {filteredDoors.slice(0, 24).map((d) => (
          <button
            key={d.id}
            type="button"
            className={styles.doorCell}
            data-online={d.online === false ? "0" : "1"}
            onClick={() => setSelectedDoor(d)}
            onDoubleClick={() => {
              if (!canControl) {
                setError("Sin permiso para controlar puertas");
                return;
              }
              setSelectedDoor(d);
              setControlType("2");
              setConfirmDoor(d);
            }}
            data-selected={selectedDoor?.id === d.id ? "1" : undefined}
            title={
              canControl
                ? `${d.name} · clic = detalle · doble clic = abrir`
                : `${d.name} · solo consulta`
            }
          >
            <span className={styles.doorCellName}>{d.name}</span>
            <span className={styles.doorCellMeta}>{d.location || d.id}</span>
            <IgBadge tone={d.online === false ? "warn" : "ok"}>
              {d.status || (d.online === false ? "off" : "online")}
            </IgBadge>
          </button>
        ))}
      </div>
      {filteredDoors.length === 0 && (
        <div className={styles.igEmpty}>
          <strong className={styles.igEmptyTitle}>Sin puertas</strong>
          <span className={styles.igEmptyHint}>
            {doors.length === 0
              ? "Sincroniza el sitio (barra superior) para cargar el inventario ACS."
              : "Ninguna puerta coincide con el filtro."}
          </span>
        </div>
      )}

      {selectedDoor && (
        <IgPanel
          title={`Puerta · ${selectedDoor.name}`}
          count={selectedDoor.online === false ? "OFFLINE" : "ONLINE"}
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
                      onClick={() => router.push("/integra/people")}
                    >
                      gestionar →
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
          <IgPanel title="Equipos">
            <IgTable
              columns={[
                { key: "name", label: "Nombre" },
                { key: "kind", label: "Tipo", width: "80px" },
                { key: "ip", label: "IP", width: "110px", mono: true },
                { key: "on", label: "Estado", width: "70px" },
              ]}
              rows={filteredDevices.slice(0, 40).map((d) => ({
                key: d.id,
                cells: {
                  name: d.name,
                  kind: d.kind,
                  ip: d.ip || "—",
                  on: d.online === false ? "off" : "online",
                },
                tone: d.online === false ? "warn" : "ok",
              }))}
              empty="Sin equipos — sincroniza el sitio"
            />
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
                  onChange={(e) => setPersonFilter(e.target.value)}
                  style={inputStyle}
                  placeholder="filtrar…"
                />
              </IgField>
            </IgFilters>
            <div className={styles.igCheckList}>
              {filteredPeople.slice(0, 80).map((p) => (
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
              {filteredPeople.length === 0 && (
                <div className={styles.igEmpty}>
                  <strong className={styles.igEmptyTitle}>Sin personas</strong>
                  <span className={styles.igEmptyHint}>
                    Da de alta en Personas o sincroniza el directorio ACS.
                  </span>
                  <IgBtn variant="primary" onClick={() => router.push("/integra/people")}>
                    Ir a Personas
                  </IgBtn>
                </div>
              )}
            </div>
            <IgBtn
              variant="primary"
              disabled={!selectedGroup || selectedPeople.length === 0 || assignBusy}
              onClick={async () => {
                setAssignBusy(true);
                setError(null);
                try {
                  await integraApi(
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
                  const msg = e instanceof Error ? e.message : "No se pudo asignar al grupo";
                  setError(msg);
                  toast.error(msg);
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
