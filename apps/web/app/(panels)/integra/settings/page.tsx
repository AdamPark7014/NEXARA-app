"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IgBadge,
  IgBtn,
  IgError,
  IgField,
  IgPage,
  IgPanel,
  IgSplit,
  IgTable,
  IgToolbar,
} from "../_Console";
import { getActiveCompanyId } from "@/lib/tenant";
import { inputStyle, integraApi, selectStyle } from "../_lib";

type Site = {
  id: number;
  name: string;
  label?: string | null;
  host: string;
  provider?: "ARTEMIS" | "HCT";
  isActive: boolean;
  isDefault: boolean;
  lastSyncAt?: string | null;
  modulesOverride?: Record<string, boolean> | null;
  _count?: { cameras: number; doors: number; people: number; vehicles: number };
};

const MODULE_KEYS = [
  "video",
  "access",
  "people",
  "events",
  "vehicles",
  "anpr",
  "visitors",
  "alarms",
] as const;

export default function IntegraSettingsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [provider, setProvider] = useState<"ARTEMIS" | "HCT">("ARTEMIS");
  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Site | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSites(await integraApi<Site[]>("integra/sites"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void load();
    const active = getActiveCompanyId();
    if (active) setTargetCompanyId(String(active));
  }, [load]);

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("es-MX", { hour12: false }) : "nunca";

  return (
    <IgPage>
      <IgToolbar
        title="Sitios"
        meta={`${sites.length} · Artemis/HCT`}
        actions={<IgBtn onClick={() => void load()}>Refresh</IgBtn>}
      />
      <IgError>{error}</IgError>
      <IgSplit
        leftWidth="58%"
        left={
          <IgPanel title="Registrados" count={sites.length} flush>
            <IgTable
              selectedKey={selected ? String(selected.id) : null}
              onRowClick={(key) => setSelected(sites.find((s) => String(s.id) === key) || null)}
              columns={[
                { key: "n", label: "Nombre" },
                { key: "p", label: "Prov" },
                { key: "h", label: "Host", mono: true },
                { key: "i", label: "Inv", mono: true },
                { key: "s", label: "Sync", mono: true },
                { key: "x", label: "", width: "110px" },
              ]}
              rows={sites.map((s) => ({
                key: String(s.id),
                cells: {
                  n: (
                    <>
                      {s.label || s.name}{" "}
                      {s.isDefault && <IgBadge tone="accent">def</IgBadge>}
                    </>
                  ),
                  p: (
                    <IgBadge tone={s.provider === "HCT" ? "warn" : "accent"}>
                      {s.provider || "ARTEMIS"}
                    </IgBadge>
                  ),
                  h: s.host,
                  i: `${s._count?.cameras ?? 0}c/${s._count?.doors ?? 0}p`,
                  s: fmt(s.lastSyncAt),
                  x: (
                    <div style={{ display: "flex", gap: 4 }}>
                      <IgBtn
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void (async () => {
                            setBusy(true);
                            try {
                              await integraApi(`integra/sync?siteId=${s.id}`, { method: "POST" });
                              await load();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Sync");
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        Sync
                      </IgBtn>
                      <IgBtn
                        onClick={(e) => {
                          e.stopPropagation();
                          void (async () => {
                            if (!confirm("¿Borrar sitio?")) return;
                            await integraApi(`integra/sites/${s.id}`, { method: "DELETE" });
                            setSelected(null);
                            await load();
                          })();
                        }}
                      >
                        Del
                      </IgBtn>
                    </div>
                  ),
                },
              }))}
              empty="Sin sitios — usa INTEGRA_HIK_* o crea uno"
            />
          </IgPanel>
        }
        right={
          <>
            <IgPanel title="Nuevo sitio">
              <div style={{ display: "grid", gap: 6 }}>
                <IgField label="CompanyId">
                  <input value={targetCompanyId} onChange={(e) => setTargetCompanyId(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                </IgField>
                <IgField label="Provider">
                  <select value={provider} onChange={(e) => setProvider(e.target.value as "ARTEMIS" | "HCT")} style={{ ...selectStyle, maxWidth: "100%" }}>
                    <option value="ARTEMIS">Artemis</option>
                    <option value="HCT">HCT</option>
                  </select>
                </IgField>
                <IgField label="Nombre">
                  <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                </IgField>
                <IgField label="Label">
                  <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                </IgField>
                <IgField label="Host">
                  <input value={host} onChange={(e) => setHost(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                </IgField>
                <IgField label="App Key">
                  <input value={appKey} onChange={(e) => setAppKey(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                </IgField>
                <IgField label="Secret">
                  <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                </IgField>
                <IgBtn
                  variant="primary"
                  disabled={busy || !name || !host || !appKey || !appSecret}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const body: Record<string, unknown> = {
                        name,
                        host,
                        appKey,
                        appSecret,
                        provider,
                        label: label || undefined,
                        isDefault: sites.length === 0,
                      };
                      if (targetCompanyId) body.companyId = Number(targetCompanyId);
                      await integraApi("integra/sites", {
                        method: "POST",
                        body: JSON.stringify(body),
                      });
                      setName("");
                      setLabel("");
                      setHost("");
                      setAppKey("");
                      setAppSecret("");
                      setProvider("ARTEMIS");
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Crear
                </IgBtn>
              </div>
            </IgPanel>
            {selected && (
              <IgPanel title="Override módulos" count={selected.label || selected.name}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {MODULE_KEYS.map((k) => {
                    const on = selected.modulesOverride?.[k] !== false;
                    return (
                      <IgBtn
                        key={k}
                        disabled={busy}
                        onClick={async () => {
                          const current = { ...(selected.modulesOverride || {}) };
                          current[k] = !(current[k] !== false);
                          setBusy(true);
                          try {
                            await integraApi(`integra/sites/${selected.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ modulesOverride: current }),
                            });
                            await load();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Error");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <span style={{ opacity: on ? 1 : 0.4, textDecoration: on ? "none" : "line-through" }}>
                          {k}
                        </span>
                      </IgBtn>
                    );
                  })}
                </div>
              </IgPanel>
            )}
          </>
        }
      />
    </IgPage>
  );
}
