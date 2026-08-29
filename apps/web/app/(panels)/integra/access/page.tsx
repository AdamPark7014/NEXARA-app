"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  DashPanel,
  ListRow,
  DashPill,
} from "@/components/dashboard/DashKit";
import { btnGhost, btnPrimary, inputStyle, integraApi } from "../_lib";

type Door = { id: string; name: string; location?: string; online?: boolean; status?: string };
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

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, g, p, dev] = await Promise.all([
        integraApi<{ items: Door[] }>("integra/doors"),
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    setBusy(id);
    try {
      await integraApi(`integra/doors/${encodeURIComponent(id)}/open`, { method: "POST" });
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

  const filteredPeople = people.filter((p) =>
    !personFilter ||
    p.name.toLowerCase().includes(personFilter.toLowerCase()) ||
    (p.code || "").toLowerCase().includes(personFilter.toLowerCase()),
  );

  return (
    <DashPage>
      <DashHero
        eyebrow="Accesos"
        title="Control de acceso"
        subtitle="Puertas, devices ACS y privilegios con picker de personas."
        actions={
          <button type="button" style={btnGhost} onClick={() => void load()}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashGrid>
        <DashCol span={6}>
          <DashPanel title="Puertas" subtitle={`${doors.length}`}>
            {doors.map((d) => (
              <ListRow
                key={d.id}
                title={d.name}
                sub={[d.location, d.status, d.id].filter(Boolean).join(" · ")}
                trail={
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <DashPill tone={d.online ? "positive" : "warning"}>
                      {d.online ? "online" : "off"}
                    </DashPill>
                    <button
                      type="button"
                      style={btnPrimary}
                      disabled={busy === d.id}
                      onClick={() => void open(d.id)}
                    >
                      {busy === d.id ? "…" : "Abrir"}
                    </button>
                  </div>
                }
              />
            ))}
          </DashPanel>
          <DashPanel title="Devices ACS / Encode" subtitle={`${devices.length}`}>
            {devices.map((d) => (
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
          </DashPanel>
        </DashCol>
        <DashCol span={6}>
          <DashPanel title="Privilegios" subtitle="Asignar personas a grupo">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8 }}
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
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <div style={{ maxHeight: 220, overflow: "auto", marginBottom: 8 }}>
              {filteredPeople.map((p) => (
                <label
                  key={p.id}
                  style={{ display: "flex", gap: 8, fontSize: 13, padding: "4px 0", cursor: "pointer" }}
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
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={btnPrimary} disabled={busy === "assign"} onClick={() => void assign()}>
                Asignar ({selectedPeople.length})
              </button>
              <button type="button" style={btnGhost} disabled={busy === "apply"} onClick={() => void applyAuth()}>
                Reaplicar auth
              </button>
            </div>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
