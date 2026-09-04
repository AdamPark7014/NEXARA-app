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
  const [doors, setDoors] = useState<Door[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
    try {
      await integraApi(`integra/doors/${encodeURIComponent(id)}/control`, {
        method: "POST",
        body: JSON.stringify({ controlType, reason }),
      });
      setConfirmDoor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
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
        title="Control de acceso"
        meta={`${onlineN}/${doors.length} puertas online · ${devices.length} equipos · ${groups.length} grupos`}
        actions={
          <>
            <IgBtn onClick={() => setLiveDoors((v) => !v)}>{liveDoors ? "Live ON" : "Espejo"}</IgBtn>
            <IgBtn onClick={() => void load()}>Actualizar</IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>
      {!canControl && (
        <IgNotice tone="warn">
          Modo consulta: no puedes abrir ni cerrar puertas con esta cuenta.
        </IgNotice>
      )}

      <IgFilters>
        {canControl && (
          <IgField label="Acción">
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
            data-selected={selectedDoor?.id === d.id ? "1" : undefined}
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
              ? "Sincroniza el sitio para cargar el inventario ACS."
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
                <IntegraLivePlayer
                  src={doorFeed?.id === doorCam.id ? doorFeed.hls : null}
                  mode="mse"
                  audio={Boolean(doorFeed?.audio)}
                />
              ) : (
                <div className={styles.doorConsoleNoCam}>
                  <strong>Esta puerta no tiene cámara</strong>
                  <span>
                    Las terminales con cámara aparecen aquí en vivo tras sincronizar el sitio.
                  </span>
                </div>
              )}
            </div>
            <div className={styles.doorConsoleSide}>
              <p className={styles.doorConsoleHint}>
                {canControl
                  ? "Cada acción pide un motivo y queda en auditoría."
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
                    {o.label}
                  </IgBtn>
                ))}
              </div>
              <dl className={styles.doorConsoleFacts}>
                <div>
                  <dt>Terminal</dt>
                  <dd>{selectedDoor.location || selectedDoor.id}</dd>
                </div>
                <div>
                  <dt>Con acceso</dt>
                  <dd>{people.length} personas dadas de alta en el sitio</dd>
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
              empty="Sin equipos"
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
                  <option value="">—</option>
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
                  <span className={styles.igEmptyHint}>Ajusta el filtro o sincroniza el sitio.</span>
                </div>
              )}
            </div>
            <IgBtn
              variant="primary"
              disabled={!selectedGroup || selectedPeople.length === 0}
              onClick={async () => {
                try {
                  await integraApi(
                    `integra/privilege-groups/${encodeURIComponent(selectedGroup)}/persons`,
                    {
                      method: "POST",
                      body: JSON.stringify({ personIds: selectedPeople }),
                    },
                  );
                  setSelectedPeople([]);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Error");
                }
              }}
            >
              Asignar al grupo
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
