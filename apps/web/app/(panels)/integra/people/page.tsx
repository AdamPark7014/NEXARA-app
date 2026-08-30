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
import { btnGhost, btnPrimary, inputStyle, integraApi, selectStyle } from "../_lib";

type Person = { id: string; name: string; code?: string; orgId?: string; orgName?: string };
type Org = { id: string; name: string; parentId?: string };

export default function IntegraPeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [detail, setDetail] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [orgId, setOrgId] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, o] = await Promise.all([
        integraApi<{ items: Person[] }>(live ? "integra/people?live=1" : "integra/people"),
        integraApi<{ items: Org[] }>("integra/orgs").catch(() => ({ items: [] })),
      ]);
      setPeople(p.items);
      setOrgs(o.items);
      setOrgId((prev) => prev || o.items[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [live]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      people.filter((p) => {
        if (orgFilter && p.orgId !== orgFilter) return false;
        if (!q) return true;
        const qq = q.toLowerCase();
        return (
          p.name.toLowerCase().includes(qq) ||
          (p.code || "").toLowerCase().includes(qq) ||
          p.id.toLowerCase().includes(qq)
        );
      }),
    [people, q, orgFilter],
  );

  const openDetail = async (p: Person) => {
    setSelected(p);
    setDetail(null);
    setBusy(true);
    try {
      const data = await integraApi(`integra/people/${encodeURIComponent(p.id)}`);
      setDetail(data);
    } catch (e) {
      setDetail({ error: e instanceof Error ? e.message : "Sin detalle live" });
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!name || !orgId) return;
    try {
      await integraApi("integra/people", {
        method: "POST",
        body: JSON.stringify({
          personName: name,
          personCode: code || undefined,
          orgIndexCode: orgId,
        }),
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
    setDetail(null);
    await load();
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Personas"
        title="Directorio"
        subtitle="Espejo / live · filtro org · detalle personInfo Artemis · alta con orgIndexCode."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={btnGhost} onClick={() => setLive((v) => !v)}>
              {live ? "Live Artemis" : "Espejo"}
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
          <span className={styles.filterLabel}>Org</span>
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} style={selectStyle}>
            <option value="">Todas</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Buscar</span>
          <input placeholder="Nombre / código / id" value={q} onChange={(e) => setQ(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <DashGrid>
        <DashCol span={3}>
          <DashPanel title="Organizaciones" subtitle={`${orgs.length}`}>
            <div className={styles.tableScroll}>
              {orgs.map((o) => (
                <ListRow
                  key={o.id}
                  title={o.name}
                  sub={o.parentId ? `parent ${o.parentId}` : "root"}
                  trail={
                    <button
                      type="button"
                      style={btnGhost}
                      onClick={() => {
                        setOrgId(o.id);
                        setOrgFilter(o.id);
                      }}
                    >
                      Filtrar
                    </button>
                  }
                />
              ))}
            </div>
          </DashPanel>
        </DashCol>
        <DashCol span={5}>
          <DashPanel title="Personas" subtitle={`${filtered.length} / ${people.length}`}>
            <div className={styles.tableScroll}>
              {filtered.map((p) => (
                <ListRow
                  key={p.id}
                  title={p.name}
                  sub={[p.code, p.orgName, p.id].filter(Boolean).join(" · ")}
                  trail={
                    <button type="button" style={btnGhost} onClick={() => void openDetail(p)}>
                      Ver
                    </button>
                  }
                />
              ))}
            </div>
          </DashPanel>
        </DashCol>
        <DashCol span={4}>
          <DashPanel title="Detalle / alta">
            {selected ? (
              <div style={{ fontSize: 13, display: "grid", gap: 6, marginBottom: 10 }}>
                <strong>{selected.name}</strong>
                <span>{selected.code || "—"}</span>
                <span>{selected.orgName || selected.orgId}</span>
                <code style={{ fontSize: 11 }}>{selected.id}</code>
                {busy && <DashPill tone="neutral">cargando personInfo…</DashPill>}
                {detail != null && (
                  <pre style={{ fontSize: 10, maxHeight: 180, overflow: "auto", margin: 0 }}>
                    {JSON.stringify(detail, null, 2)}
                  </pre>
                )}
                <button type="button" style={btnGhost} onClick={() => void remove(selected.id)}>
                  Eliminar
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Selecciona una persona</p>
            )}
            <hr style={{ margin: "12px 0", borderColor: "var(--border)" }} />
            <div style={{ display: "grid", gap: 8 }}>
              <input placeholder="Nombre *" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
              <input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ ...selectStyle, maxWidth: "100%" }}>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button type="button" style={btnPrimary} onClick={() => void add()}>
                Alta Artemis
              </button>
            </div>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
