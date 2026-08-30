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
import {
  DOOR_CONTROL_OPTIONS,
  DoorControlType,
  inputStyle,
  integraApi,
  selectStyle,
} from "../_lib";
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

  const load = useCallback(async () => {
    setError(null);
    try {
      const doorPath = liveDoors ? "integra/doors?live=1" : "integra/doors";
      const [d, g, p, dev] = await Promise.all([
        integraApi<{ items: Door[] }>(doorPath),
        integraApi<{ items: Group[] }>("integra/privilege-groups").catch(() => ({ items: [] })),
        integraApi<{ items: Person[] }>("integra/people").catch(() => ({ items: [] })),
        integraApi<{ items: Device[] }>("integra/devices").catch(() => ({ items: [] })),
      ]);
      setDoors(d.items);
      setGroups(g.items);
      setPeople(p.items);
      setDevices(dev.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [liveDoors]);

  useEffect(() => {
    void load();
  }, [load]);

  const control = async (id: string) => {
    setBusy(id);
    try {
      await integraApi(`integra/doors/${encodeURIComponent(id)}/control`, {
        method: "POST",
        body: JSON.stringify({ controlType }),
      });
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

  return (
    <IgPage>
      <IgToolbar
        title="Control de acceso"
        meta={`${onlineN}/${doors.length} puertas online · ${devices.length} devices · ${groups.length} grupos`}
        actions={
          <>
            <IgBtn onClick={() => setLiveDoors((v) => !v)}>{liveDoors ? "Live ON" : "Espejo"}</IgBtn>
            <IgBtn onClick={() => void load()}>Refresh</IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>

      <IgFilters>
        <IgField label="Acción">
          <select
            value={controlType}
            onChange={(e) => setControlType(e.target.value as DoorControlType)}
            style={selectStyle}
          >
            {DOOR_CONTROL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </IgField>
        <IgField label="Filtrar puertas">
          <input value={doorQ} onChange={(e) => setDoorQ(e.target.value)} style={inputStyle} placeholder="nombre / región / id" />
        </IgField>
        <IgField label="Devices">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)} style={selectStyle}>
            <option value="ALL">ACS + Encode</option>
            <option value="ACS">ACS</option>
            <option value="ENCODE">Encode</option>
          </select>
        </IgField>
        {selectedDoor && (
          <IgField label="Seleccionada">
            <IgBtn variant="primary" disabled={busy === selectedDoor.id} onClick={() => void control(selectedDoor.id)}>
              {busy === selectedDoor.id ? "…" : `Ejecutar → ${selectedDoor.name}`}
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
            onClick={() => {
              setSelectedDoor(d);
              void control(d.id);
            }}
          >
            <span className={styles.doorCellName}>{d.name}</span>
            <span className={styles.doorCellMeta}>{d.location || d.id}</span>
            <IgBadge tone={d.online === false ? "warn" : "ok"}>
              {d.status || (d.online === false ? "off" : "online")}
            </IgBadge>
          </button>
        ))}
      </div>

      <IgSplit
        leftWidth="55%"
        left={
          <IgPanel title="Puertas" count={`${filteredDoors.length}/${doors.length}`} flush>
            <IgTable
              selectedKey={selectedDoor?.id}
              onRowClick={(key) => setSelectedDoor(doors.find((d) => d.id === key) || null)}
              columns={[
                { key: "n", label: "Nombre" },
                { key: "l", label: "Región" },
                { key: "s", label: "Estado" },
                { key: "o", label: "Link" },
                { key: "id", label: "IndexCode", mono: true },
                { key: "x", label: "", width: "88px" },
              ]}
              rows={filteredDoors.map((d) => ({
                key: d.id,
                tone: d.online === false ? "warn" : "ok",
                cells: {
                  n: d.name,
                  l: d.location || "—",
                  s: d.status || String(d.doorState ?? "—"),
                  o: (
                    <IgBadge tone={d.online === false ? "warn" : "ok"}>
                      {d.online === false ? "off" : "online"}
                    </IgBadge>
                  ),
                  id: d.id,
                  x: (
                    <IgBtn
                      variant="primary"
                      disabled={busy === d.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void control(d.id);
                      }}
                    >
                      {busy === d.id ? "…" : "Go"}
                    </IgBtn>
                  ),
                },
              }))}
              empty="Sin puertas"
            />
          </IgPanel>
        }
        right={
          <>
            <IgPanel title="Privilegios" count={`${selectedPeople.length} sel`}>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                style={{ ...selectStyle, maxWidth: "100%", marginBottom: 8 }}
              >
                <option value="">Grupo…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <input
                placeholder="Filtrar personas…"
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                style={{ ...inputStyle, maxWidth: "100%", marginBottom: 8 }}
              />
              <div style={{ maxHeight: 200, overflow: "auto", marginBottom: 8 }}>
                {filteredPeople.map((p) => (
                  <label key={p.id} style={{ display: "flex", gap: 6, fontSize: 12, padding: "3px 0", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={selectedPeople.includes(p.id)}
                      onChange={() =>
                        setSelectedPeople((prev) =>
                          prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                        )
                      }
                    />
                    {p.name}{p.code ? ` (${p.code})` : ""}
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <IgBtn
                  variant="primary"
                  disabled={busy === "assign" || !selectedGroup || selectedPeople.length === 0}
                  onClick={async () => {
                    setBusy("assign");
                    try {
                      await integraApi(
                        `integra/privilege-groups/${encodeURIComponent(selectedGroup)}/persons`,
                        { method: "POST", body: JSON.stringify({ personIds: selectedPeople }) },
                      );
                      setSelectedPeople([]);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Asignar
                </IgBtn>
                <IgBtn
                  disabled={busy === "apply"}
                  onClick={async () => {
                    setBusy("apply");
                    try {
                      await integraApi("integra/privilege/apply", { method: "POST" });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Reaplicar
                </IgBtn>
              </div>
            </IgPanel>
            <IgPanel title="Devices" count={filteredDevices.length} flush>
              <IgTable
                columns={[
                  { key: "n", label: "Nombre" },
                  { key: "k", label: "Kind" },
                  { key: "ip", label: "IP", mono: true },
                  { key: "o", label: "Link" },
                ]}
                rows={filteredDevices.map((d) => ({
                  key: `${d.kind}-${d.id}`,
                  tone: d.online === false ? "warn" : "ok",
                  cells: {
                    n: d.name,
                    k: d.kind,
                    ip: d.ip || "—",
                    o: <IgBadge tone={d.online === false ? "warn" : "ok"}>{d.online === false ? "off" : "on"}</IgBadge>,
                  },
                }))}
                empty="Sin devices en espejo"
              />
            </IgPanel>
          </>
        }
      />
    </IgPage>
  );
}
