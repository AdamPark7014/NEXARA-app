"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  DashPanel,
  ListRow,
} from "@/components/dashboard/DashKit";
import { buildApiUrl } from "@/lib/api-base";

type Person = { id: string; name: string; code?: string; orgId?: string; orgName?: string };
type Org = { id: string; name: string };

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body?.message === "string" ? body.message : `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function IntegraPeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [orgId, setOrgId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, o] = await Promise.all([
        apiJson<{ items: Person[] }>("integra/people"),
        apiJson<{ items: Org[] }>("integra/orgs"),
      ]);
      setPeople(p.items);
      setOrgs(o.items);
      if (!orgId && o.items[0]) setOrgId(o.items[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [orgId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const create = async () => {
    if (!name.trim() || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson("integra/people", {
        method: "POST",
        body: JSON.stringify({
          personName: name.trim(),
          personCode: code.trim() || undefined,
          orgIndexCode: orgId,
        }),
      });
      setName("");
      setCode("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiJson(`integra/people/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Personas"
        title="Personas"
        subtitle="IDs Artemis únicamente — sin biometría en Postgres NEXARA."
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashGrid>
        <DashCol span={7}>
          <DashPanel title="Directorio" subtitle={`${people.length} personas`}>
            {people.map((p) => (
              <ListRow
                key={p.id}
                title={p.name || p.id}
                sub={[p.code, p.orgName, p.id].filter(Boolean).join(" · ")}
                trail={
                  <button type="button" style={btnDanger} disabled={busy} onClick={() => void remove(p.id)}>
                    Baja
                  </button>
                }
              />
            ))}
          </DashPanel>
        </DashCol>
        <DashCol span={5}>
          <DashPanel title="Alta" subtitle="person/single/add">
            <input style={inp} placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              style={{ ...inp, marginTop: 8 }}
              placeholder="Código (opcional)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <select style={{ ...inp, marginTop: 8 }} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">Organización…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name || o.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={{ ...btn, marginTop: 8, width: "100%" }}
              disabled={busy || !name.trim() || !orgId}
              onClick={() => void create()}
            >
              Crear en Artemis
            </button>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border, #e2e8f0)",
  fontSize: 13,
};
const btn: React.CSSProperties = {
  border: "none",
  background: "var(--accent, #1d4ed8)",
  color: "#fff",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  ...btn,
  background: "var(--danger, #b91c1c)",
};
