"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  DashPanel,
  ListRow,
  DashPill,
} from "@/components/dashboard/DashKit";
import styles from "../integra.module.css";
import {
  btnGhost,
  btnPrimary,
  DOOR_CONTROL_OPTIONS,
  DoorControlType,
  inputStyle,
  integraApi,
  selectStyle,
} from "../_lib";

type Door = {
  id: string;
  name: string;
  location?: string;
  online?: boolean;
  status?: string;
  doorState?: string | number | null;
};
type Group = { id: string; name: string; description?: string };
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

  const togglePerson = (id: string) => {
    setSelectedPeople((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const assign = async () => {
    if (!selectedGroup || selectedPeople.length === 0) return;
    setBusy("assign");
    try {
      await integraApi(`integra/privilege-groups/${encodeURIComponent(selectedGroup)}/persons`, {
        method: "POST",
        body: JSON.stringify({ personIds: selectedPeople }),
      });
      setSelectedPeople([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  const applyAuth = async () => {
    setBusy("apply");
    try {
      await integraApi("integra/privilege/apply", { method: "POST" });
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

  return (
    <DashPage>
      <DashHero
        eyebrow="Accesos"
        title="Control de puertas"
        subtitle="doControl Artemis (abrir/cerrar/remain) · devices · privilegios con picker."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={btnGhost} onClick={() => setLiveDoors((v) => !v)}>
              {liveDoors ? "Live ON" : "Espejo"}
            </button>
            <button type="button" style={btnGhost} onClick={() => void load()}>
              Actualizar
            </button>
          </div>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className={styles.filterBar}>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Acción doControl</span>
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
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Filtrar puertas</span>
          <input
            placeholder="Nombre / región / id…"
            value={doorQ}
            onChange={(e) => setDoorQ(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Devices</span>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
            style={selectStyle}
          >
            <option value="ALL">ACS + Encode</option>
            <option value="ACS">Solo ACS</option>
            <option value="ENCODE">Solo Encode</option>
          </select>
        </div>
      </div>

      <DashGrid>
        <DashCol span={6}>
          <DashPanel title="Puertas" subtitle={`${filteredDoors.length} / ${doors.length}`}>
            <div className={styles.tableScroll}>
              {filteredDoors.map((d) => (
                <ListRow
                  key={d.id}
                  title={d.name}
                  sub={[d.location, d.status, d.doorState != null ? `state ${d.doorState}` : null, d.id]
                    .filter(Boolean)
                    .join(" · ")}
                  trail={
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <DashPill tone={d.online ? "positive" : "warning"}>
                        {d.online ? "online" : "off"}
                      </DashPill>
                      <button
                        type="button"
                        style={btnPrimary}
                        disabled={busy === d.id}
                        onClick={() => void control(d.id)}
                      >
                        {busy === d.id ? "…" : "Ejecutar"}
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          </DashPanel>
          <DashPanel title="Devices" subtitle={`${filteredDevices.length}`}>
            <div className={styles.tableScroll}>
              {filteredDevices.map((d) => (
                <ListRow
                  key={`${d.kind}-${d.id}`}
                  title={d.name}
                  sub={[d.kind, d.ip, d.id].filter(Boolean).join(" · ")}
                  trail={
                    <DashPill tone={d.online ? "positive" : "warning"}>
                      {d.online ? "online" : "off"}
                    </DashPill>
                  }
                />
              ))}
            </div>
          </DashPanel>
        </DashCol>
        <DashCol span={6}>
          <DashPanel title="Privilegios" subtitle="Asignar personas a grupo + reaplicar auth">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              style={{ ...selectStyle, marginBottom: 8, maxWidth: "100%" }}
            >
              <option value="">Grupo…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Filtrar personas…"
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8, maxWidth: "100%" }}
            />
            <div style={{ maxHeight: 280, overflow: "auto", marginBottom: 8 }}>
              {filteredPeople.map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: 13,
                    padding: "4px 0",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedPeople.includes(p.id)}
                    onChange={() => togglePerson(p.id)}
                  />
                  {p.name}
                  {p.code ? ` (${p.code})` : ""}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={busy === "assign"}
                onClick={() => void assign()}
              >
                Asignar ({selectedPeople.length})
              </button>
              <button
                type="button"
                style={btnGhost}
                disabled={busy === "apply"}
                onClick={() => void applyAuth()}
              >
                Reaplicar auth
              </button>
            </div>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
