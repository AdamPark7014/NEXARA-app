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
import { getCachedProvider, subscribeProvider } from "../_caps";
import { inputStyle, integraApi, selectStyle } from "../_lib";

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
  const [syncing, setSyncing] = useState(false);
  const [provider, setProvider] = useState<string | null>(() => getCachedProvider());
  const isArtemis = !provider || provider === "ARTEMIS";

  useEffect(() => subscribeProvider(setProvider), []);

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
    if (!isArtemis) {
      setDetail({
        source: provider || "ISAPI",
        note: "Alta/edición en el terminal. Aquí se muestra el espejo interno.",
        person: p,
      });
      return;
    }
    setBusy(true);
    try {
      setDetail(await integraApi(`integra/people/${encodeURIComponent(p.id)}`));
    } catch (e) {
      setDetail({ error: e instanceof Error ? e.message : "Sin detalle" });
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      await integraApi("integra/sync", { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error sync");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <IgPage>
      <IgToolbar
        title="Personas"
        meta={`${filtered.length}/${people.length}${orgs.length ? ` · ${orgs.length} orgs` : ""} · ${live ? "live" : "espejo"}`}
        actions={
          <>
            <IgBtn onClick={() => setLive((v) => !v)}>{live ? "Live" : "Espejo"}</IgBtn>
            {!isArtemis && (
              <IgBtn variant="primary" disabled={syncing} onClick={() => void syncNow()}>
                {syncing ? "Sincronizando…" : "Sincronizar terminales"}
              </IgBtn>
            )}
            <IgBtn onClick={() => void load()}>Actualizar</IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>

      <IgFilters>
        {isArtemis && (
          <IgField label="Org">
            <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} style={selectStyle}>
              <option value="">Todas</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </IgField>
        )}
        <IgField label="Buscar">
          <input value={q} onChange={(e) => setQ(e.target.value)} style={inputStyle} placeholder="nombre / código / id" />
        </IgField>
      </IgFilters>

      <IgSplit
        leftWidth="58%"
        left={
          <IgPanel title="Directorio" count={filtered.length} flush>
            <IgTable
              selectedKey={selected?.id}
              onRowClick={(key) => {
                const p = people.find((x) => x.id === key);
                if (p) void openDetail(p);
              }}
              columns={[
                { key: "n", label: "Nombre" },
                { key: "c", label: "Código", mono: true },
                { key: "o", label: isArtemis ? "Org" : "Tipo" },
                { key: "id", label: "ID", mono: true },
              ]}
              rows={filtered.map((p) => ({
                key: p.id,
                cells: {
                  n: p.name,
                  c: p.code || "—",
                  o: p.orgName || p.orgId || "—",
                  id: p.id,
                },
              }))}
              empty={
                isArtemis
                  ? "Sin personas"
                  : "Sin personas en espejo — pulsa «Sincronizar terminales»"
              }
            />
          </IgPanel>
        }
        right={
          <IgPanel title={isArtemis ? "Detalle / alta" : "Detalle"} count={selected?.name || "—"}>
            {selected ? (
              <div style={{ display: "grid", gap: 6, fontSize: 12, marginBottom: 12 }}>
                <strong>{selected.name}</strong>
                <span>{selected.code || "sin código"}</span>
                <span>{selected.orgName || selected.orgId || "—"}</span>
                {busy && <IgBadge>personInfo…</IgBadge>}
                {detail != null && (
                  <pre style={{ fontSize: 10, maxHeight: 200, overflow: "auto", margin: 0 }}>
                    {JSON.stringify(detail, null, 2)}
                  </pre>
                )}
                {isArtemis && (
                  <IgBtn
                    onClick={async () => {
                      if (!confirm("¿Eliminar esta persona del directorio?")) return;
                      await integraApi(`integra/people/${encodeURIComponent(selected.id)}`, {
                        method: "DELETE",
                      });
                      setSelected(null);
                      setDetail(null);
                      await load();
                    }}
                  >
                    Eliminar
                  </IgBtn>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--ig-muted)" }}>
                {isArtemis
                  ? "Click en una fila"
                  : "Personas leídas de los terminales ACS. El alta facial/tarjeta se hace en el equipo; aquí se consulta el directorio interno."}
              </p>
            )}
            {isArtemis && (
              <>
                <hr style={{ borderColor: "var(--ig-line)", margin: "10px 0" }} />
                <div style={{ display: "grid", gap: 8 }}>
                  <IgField label="Nombre">
                    <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                  </IgField>
                  <IgField label="Código">
                    <input value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                  </IgField>
                  <IgField label="Org">
                    <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ ...selectStyle, maxWidth: "100%" }}>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </IgField>
                  <IgBtn
                    variant="primary"
                    disabled={!name || !orgId}
                    onClick={async () => {
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
                    }}
                  >
                    Alta persona
                  </IgBtn>
                </div>
              </>
            )}
          </IgPanel>
        }
      />
    </IgPage>
  );
}
