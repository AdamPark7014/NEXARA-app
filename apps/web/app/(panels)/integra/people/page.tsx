"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  DashPanel,
  ListRow,
} from "@/components/dashboard/DashKit";
import { btnGhost, btnPrimary, inputStyle, integraApi } from "../_lib";

type Person = { id: string; name: string; code?: string; orgId?: string; orgName?: string };
type Org = { id: string; name: string; parentId?: string };

export default function IntegraPeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, o] = await Promise.all([
        integraApi<{ items: Person[] }>("integra/people"),
        integraApi<{ items: Org[] }>("integra/orgs").catch(() => ({ items: [] })),
      ]);
      setPeople(p.items);
      setOrgs(o.items);
      setOrgId((prev) => prev || o.items[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      people.filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          (p.code || "").toLowerCase().includes(q.toLowerCase()),
      ),
    [people, q],
  );

  const add = async () => {
    if (!name || !orgId) return;
    try {
      await integraApi("integra/people", {
        method: "POST",
        body: JSON.stringify({ personName: name, personCode: code || undefined, orgIndexCode: orgId }),
      });
      setName("");
      setCode("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar persona en Artemis?")) return;
    await integraApi(`integra/people/${encodeURIComponent(id)}`, { method: "DELETE" });
    setSelected(null);
    await load();
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Personas"
        title="Directorio"
        subtitle="Espejo Prisma + alta/baja Artemis · árbol de orgs."
        actions={
          <button type="button" style={btnGhost} onClick={() => void load()}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashGrid>
        <DashCol span={4}>
          <DashPanel title="Organizaciones" subtitle={`${orgs.length}`}>
            {orgs.map((o) => (
              <ListRow
                key={o.id}
                title={o.name}
                sub={o.parentId ? `parent ${o.parentId}` : "root"}
                trail={
                  <button type="button" style={btnGhost} onClick={() => setOrgId(o.id)}>
                    Usar
                  </button>
                }
              />
            ))}
          </DashPanel>
        </DashCol>
        <DashCol span={5}>
          <DashPanel title="Personas" subtitle={`${filtered.length}`}>
            <input
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            {filtered.map((p) => (
              <ListRow
                key={p.id}
                title={p.name}
                sub={[p.code, p.orgName, p.id].filter(Boolean).join(" · ")}
                trail={
                  <button type="button" style={btnGhost} onClick={() => setSelected(p)}>
                    Ver
                  </button>
                }
              />
            ))}
          </DashPanel>
        </DashCol>
        <DashCol span={3}>
          <DashPanel title="Detalle / alta">
            {selected ? (
              <div style={{ fontSize: 13, display: "grid", gap: 6 }}>
                <strong>{selected.name}</strong>
                <span>{selected.code || "—"}</span>
                <span>{selected.orgName || selected.orgId}</span>
                <code style={{ fontSize: 11 }}>{selected.id}</code>
                <button type="button" style={btnGhost} onClick={() => void remove(selected.id)}>
                  Eliminar
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Selecciona una persona</p>
            )}
            <hr style={{ margin: "12px 0", borderColor: "var(--border)" }} />
            <div style={{ display: "grid", gap: 8 }}>
              <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              <input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} />
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={inputStyle}>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button type="button" style={btnPrimary} onClick={() => void add()}>
                Alta
              </button>
            </div>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
