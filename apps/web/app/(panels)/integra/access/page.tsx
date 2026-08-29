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
import { buildApiUrl } from "@/lib/api-base";

type Door = { id: string; name: string; location?: string; online?: boolean; status?: string };
type Group = { id: string; name: string; description?: string };

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.message === "string" ? body.message : `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}

export default function IntegraAccessPage() {
  const [doors, setDoors] = useState<Door[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [personIds, setPersonIds] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, g] = await Promise.all([
        apiJson<{ items: Door[] }>("integra/doors"),
        apiJson<{ items: Group[] }>("integra/privilege-groups").catch(() => ({ items: [] })),
      ]);
      setDoors(d.items);
      setGroups(g.items);
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
      await apiJson(`integra/doors/${encodeURIComponent(id)}/open`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  const assign = async () => {
    if (!selectedGroup || !personIds.trim()) return;
    setBusy("assign");
    try {
      const ids = personIds.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
      await apiJson(`integra/privilege-groups/${encodeURIComponent(selectedGroup)}/persons`, {
        method: "POST",
        body: JSON.stringify({ personIds: ids }),
      });
      setPersonIds("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    setBusy("apply");
    try {
      await apiJson("integra/privilege/apply", { method: "POST" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Accesos"
        title="Control de acceso · sitio"
        subtitle="Puertas y privilege groups Artemis (no oficinas NEXARA)."
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashGrid>
        <DashCol span={7}>
          <DashPanel title="Puertas" subtitle={`${doors.length} puertas`}>
            {doors.map((d) => (
              <ListRow
                key={d.id}
                title={d.name}
                sub={[d.location, d.id].filter(Boolean).join(" · ")}
                trail={
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <DashPill tone={d.online ? "positive" : "neutral"}>
                      {d.online ? "online" : "offline"}
                    </DashPill>
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => void open(d.id)}
                      style={btn}
                    >
                      {busy === d.id ? "…" : "Abrir"}
                    </button>
                  </div>
                }
              />
            ))}
          </DashPanel>
        </DashCol>
        <DashCol span={5}>
          <DashPanel
            title="Privilegios"
            subtitle="Grupos Artemis"
            headExtra={
              <button type="button" style={btnGhost} disabled={busy === "apply"} onClick={() => void apply()}>
                Reaplicar
              </button>
            }
          >
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              style={inp}
            >
              <option value="">Elegir grupo…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.id}
                </option>
              ))}
            </select>
            <input
              style={{ ...inp, marginTop: 8 }}
              placeholder="personIds separados por coma"
              value={personIds}
              onChange={(e) => setPersonIds(e.target.value)}
            />
            <button
              type="button"
              style={{ ...btn, marginTop: 8, width: "100%" }}
              disabled={!selectedGroup || busy === "assign"}
              onClick={() => void assign()}
            >
              Asignar personas
            </button>
            {groups.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
                Sin grupos o endpoint no disponible en esta instancia.
              </p>
            )}
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}

const btn: React.CSSProperties = {
  border: "none",
  background: "var(--accent, #1d4ed8)",
  color: "#fff",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "transparent",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};
const inp: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border, #e2e8f0)",
  fontSize: 13,
};
