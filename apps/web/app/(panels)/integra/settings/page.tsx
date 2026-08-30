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
import styles from "../integra.module.css";

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

const MODULE_LABELS: Record<string, string> = {
  video: "Video",
  access: "Accesos",
  people: "Personas",
  events: "Eventos",
  vehicles: "Vehículos",
  anpr: "ANPR",
  visitors: "Visitas",
  alarms: "Alarmas",
};

const MODULE_KEYS = Object.keys(MODULE_LABELS);

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
    iso ? new Date(iso).toLocaleString("es-MX", { hour12: false }) : "Nunca";

  const createSite = async () => {
    setBusy(true);
    setError(null);
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
  };

  return (
    <IgPage>
      <IgToolbar
        title="Sitios"
        meta={sites.length ? `${sites.length} conectados` : "Administración"}
        actions={<IgBtn onClick={() => void load()}>Actualizar</IgBtn>}
      />
      <IgError>{error}</IgError>

      {sites.length === 0 ? (
        <div className={styles.igEmptyCta}>
          <h2>Agrega tu primer sitio</h2>
          <p>Un sitio es la conexión a HikCentral (en sitio) o Hik-Connect (nube).</p>
          <ol className={styles.igEmptySteps}>
            <li>1. Elige el tipo de conexión</li>
            <li>2. Pega la dirección del servidor y las claves</li>
            <li>3. Guarda y sincroniza el inventario</li>
          </ol>
        </div>
      ) : null}

      <IgSplit
        leftWidth="55%"
        left={
          <IgPanel title="Tus sitios" count={sites.length} flush>
            <IgTable
              selectedKey={selected ? String(selected.id) : null}
              onRowClick={(key) => setSelected(sites.find((s) => String(s.id) === key) || null)}
              columns={[
                { key: "n", label: "Nombre" },
                { key: "p", label: "Tipo" },
                { key: "h", label: "Servidor" },
                { key: "i", label: "Inventario", mono: true },
                { key: "s", label: "Última sync" },
                { key: "x", label: "", width: "140px" },
              ]}
              rows={sites.map((s) => ({
                key: String(s.id),
                cells: {
                  n: (
                    <>
                      {s.label || s.name}{" "}
                      {s.isDefault && <IgBadge tone="accent">principal</IgBadge>}
                    </>
                  ),
                  p: (
                    <IgBadge tone={s.provider === "HCT" ? "warn" : "accent"}>
                      {s.provider === "HCT" ? "Hik-Connect" : "HikCentral"}
                    </IgBadge>
                  ),
                  h: s.host,
                  i: `${s._count?.cameras ?? 0} cam · ${s._count?.doors ?? 0} pta`,
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
                        variant="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          void (async () => {
                            if (!confirm("¿Eliminar este sitio?")) return;
                            await integraApi(`integra/sites/${s.id}`, { method: "DELETE" });
                            setSelected(null);
                            await load();
                          })();
                        }}
                      >
                        Eliminar
                      </IgBtn>
                    </div>
                  ),
                },
              }))}
              empty="Aún no hay sitios. Usa el formulario a la derecha."
            />
          </IgPanel>
        }
        right={
          <>
            <IgPanel title="Nuevo sitio">
              <div style={{ display: "grid", gap: 8 }}>
                <IgField label="Tipo de conexión">
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as "ARTEMIS" | "HCT")}
                    style={{ ...selectStyle, maxWidth: "100%" }}
                  >
                    <option value="ARTEMIS">HikCentral (Artemis)</option>
                    <option value="HCT">Hik-Connect (nube)</option>
                  </select>
                </IgField>
                <IgField label="Nombre">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Planta norte"
                    style={{ ...inputStyle, maxWidth: "100%" }}
                  />
                </IgField>
                <IgField label="Etiqueta visible (opcional)">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Cómo lo verá el operador"
                    style={{ ...inputStyle, maxWidth: "100%" }}
                  />
                </IgField>
                <IgField label="Dirección del servidor">
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder={
                      provider === "HCT"
                        ? "https://…areaDomain…"
                        : "https://hikcentral.ejemplo.com"
                    }
                    style={{ ...inputStyle, maxWidth: "100%" }}
                  />
                </IgField>
                <IgField label="Clave de acceso">
                  <input
                    value={appKey}
                    onChange={(e) => setAppKey(e.target.value)}
                    style={{ ...inputStyle, maxWidth: "100%" }}
                  />
                </IgField>
                <IgField label="Secreto">
                  <input
                    type="password"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    style={{ ...inputStyle, maxWidth: "100%" }}
                  />
                </IgField>

                <details className={styles.igAdvanced}>
                  <summary>Avanzado</summary>
                  <div className={styles.igAdvancedBody}>
                    <IgField label="Empresa (ID interno)">
                      <input
                        value={targetCompanyId}
                        onChange={(e) => setTargetCompanyId(e.target.value)}
                        style={{ ...inputStyle, maxWidth: "100%" }}
                      />
                    </IgField>
                    <p className={styles.empty} style={{ padding: "4px 0", textAlign: "left" }}>
                      Solo super-admin: asigna el sitio a otra empresa del portfolio.
                    </p>
                  </div>
                </details>

                <IgBtn
                  variant="primary"
                  disabled={busy || !name || !host || !appKey || !appSecret}
                  onClick={() => void createSite()}
                >
                  {busy ? "Guardando…" : "Crear sitio"}
                </IgBtn>
              </div>
            </IgPanel>

            {selected && (
              <IgPanel title="Módulos del sitio" count={selected.label || selected.name}>
                <p className={styles.empty} style={{ padding: "8px 10px", textAlign: "left" }}>
                  Activa o desactiva lo que verá el operador en este sitio.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 10px 10px" }}>
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
                            const updated = await integraApi<Site>(`integra/sites/${selected.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ modulesOverride: current }),
                            });
                            setSelected(updated);
                            await load();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Error");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <span style={{ opacity: on ? 1 : 0.45, textDecoration: on ? "none" : "line-through" }}>
                          {MODULE_LABELS[k] || k}
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
