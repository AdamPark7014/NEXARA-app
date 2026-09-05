"use client";

import { useCallback, useEffect, useState } from "react";
import RefreshIcon from "@mui/icons-material/Refresh";
import SyncIcon from "@mui/icons-material/Sync";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import {
  IgBadge,
  IgBtn,
  IgField,
  IgPage,
  IgPanel,
  IgSplit,
  IgTable,
  IgToolbar,
} from "../_Console";
import { RetryNotice, RowsSkeleton } from "../_AccessUi";
import { ModuleSwitch } from "../_ModuleSwitch";
import { getActiveCompanyId } from "@/lib/tenant";
import { inputStyle, integraApi, selectStyle } from "../_lib";
import styles from "../integra.module.css";
import a from "../_access.module.css";

type Site = {
  id: number;
  name: string;
  label?: string | null;
  host: string;
  provider?: "ARTEMIS" | "HCT" | "ISAPI";
  isActive: boolean;
  isDefault: boolean;
  lastSyncAt?: string | null;
  modulesOverride?: Record<string, boolean> | null;
  serviceClientId?: number | null;
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

/** Overrides Artemis-only — no deben fingirse disponibles en HCT (ADR-0019). */
const HCT_ARTEMIS_ONLY = new Set(["people", "visitors", "vehicles", "anpr"]);

const MODULE_KEYS = Object.keys(MODULE_LABELS);

export default function IntegraSettingsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [lastSyncRun, setLastSyncRun] = useState<{
    status?: string;
    error?: string | null;
    finishedAt?: string | null;
    cameras?: number;
    doors?: number;
  } | null>(null);
  const [host, setHost] = useState("");
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [provider, setProvider] = useState<"ARTEMIS" | "HCT" | "ISAPI">("ARTEMIS");
  const [serviceClientId, setServiceClientId] = useState("");
  const [serviceClients, setServiceClients] = useState<Array<{ id: number; name: string }>>([]);
  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Site | null>(null);
  /** Diálogo del producto — sustituye al `window.confirm` del navegador. */
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setSites(await integraApi<Site[]>("integra/sites"));
      try {
        const raw = await integraApi<any>("service-clients?limit=200");
        const rows = Array.isArray(raw) ? raw : raw?.items || raw?.data || [];
        setServiceClients(
          rows
            .map((c: any) => ({ id: Number(c.id), name: String(c.name || c.nombre || `#${c.id}`) }))
            .filter((c: any) => Number.isFinite(c.id) && c.id > 0),
        );
      } catch {
        /* listado opcional */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const active = getActiveCompanyId();
    if (active) setTargetCompanyId(String(active));
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setLastSyncRun(null);
      return;
    }
    void integraApi<typeof lastSyncRun>(`integra/sync/last?siteId=${selected.id}`)
      .then((r) => setLastSyncRun(r))
      .catch(() => setLastSyncRun(null));
  }, [selected]);

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
        serviceClientId: serviceClientId ? Number(serviceClientId) : null,
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
      setServiceClientId("");
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
        actions={
          <IgBtn
            onClick={() => void load()}
            disabled={loading}
            aria-label="Actualizar la lista de sitios"
          >
            {loading ? "Actualizando…" : "Actualizar"}
            <RefreshIcon className={a.btnIcon} aria-hidden />
          </IgBtn>
        }
      />
      {error && <RetryNotice message={error} onRetry={() => void load()} busy={loading} />}

      {loading && sites.length === 0 ? (
        <RowsSkeleton rows={4} />
      ) : null}

      {!loading && sites.length === 0 ? (
        <div className={`${styles.igOnboard} ${a.onboard}`}>
          <div className={styles.igOnboardCard}>
            <EmptyState
              title="Agrega tu primer sitio"
              description="Un sitio es la conexión a HikCentral (en sitio) o Hik-Connect (nube). Después sincronizas el inventario y Ops cobra vida."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    document.getElementById("integra-new-site")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Completar formulario
                </Button>
              }
            />
            <ol className={styles.igOnboardSteps}>
              <li>
                <span className={styles.igOnboardStepNum}>1</span>
                <span>Elige el tipo de conexión</span>
              </li>
              <li>
                <span className={styles.igOnboardStepNum}>2</span>
                <span>Pega la dirección del servidor y las claves</span>
              </li>
              <li>
                <span className={styles.igOnboardStepNum}>3</span>
                <span>Guarda y sincroniza el inventario</span>
              </li>
            </ol>
          </div>
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
                              setSelected(s);
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
            {selected && lastSyncRun && (
              <p style={{ fontSize: 12, padding: "8px 12px", color: "var(--text-secondary)" }}>
                Último sync run: <strong>{lastSyncRun.status || "—"}</strong>
                {lastSyncRun.finishedAt ? ` · ${fmt(lastSyncRun.finishedAt)}` : ""}
                {` · ${lastSyncRun.cameras ?? 0} cam / ${lastSyncRun.doors ?? 0} pta`}
                {lastSyncRun.error ? (
                  <span style={{ color: "#b91c1c", display: "block" }}>{lastSyncRun.error}</span>
                ) : null}
              </p>
            )}
          </IgPanel>
        }
        right={
          <>
            <IgPanel title="Nuevo sitio">
              <div id="integra-new-site" style={{ display: "grid", gap: 8 }}>
                <IgField label="Tipo de conexión">
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as "ARTEMIS" | "HCT" | "ISAPI")}
                    style={{ ...selectStyle, maxWidth: "100%" }}
                  >
                    <option value="ARTEMIS">HikCentral (Artemis)</option>
                    <option value="HCT">Hik-Connect (nube)</option>
                    <option value="ISAPI">Equipos en red local (ISAPI)</option>
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
                <IgField
                  label={
                    provider === "ISAPI" ? "Dirección del grabador" : "Dirección del servidor"
                  }
                >
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder={
                      provider === "HCT"
                        ? "https://…areaDomain…"
                        : provider === "ISAPI"
                          ? "http://192.168.1.10"
                          : "https://hikcentral.ejemplo.com"
                    }
                    style={{ ...inputStyle, maxWidth: "100%" }}
                  />
                </IgField>
                {/* ISAPI no tiene appKey/appSecret: son las credenciales de la
                    consola web del equipo, guardadas en las mismas columnas. */}
                <IgField label={provider === "ISAPI" ? "Usuario del equipo" : "Clave de acceso"}>
                  <input
                    value={appKey}
                    onChange={(e) => setAppKey(e.target.value)}
                    placeholder={provider === "ISAPI" ? "admin" : undefined}
                    style={{ ...inputStyle, maxWidth: "100%" }}
                  />
                </IgField>
                <IgField label={provider === "ISAPI" ? "Contraseña del equipo" : "Secreto"}>
                  <input
                    type="password"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    style={{ ...inputStyle, maxWidth: "100%" }}
                  />
                </IgField>
                {provider === "ISAPI" && (
                  <p style={{ fontSize: 12, opacity: 0.75, margin: 0 }}>
                    El grabador es el equipo cabecera: sus canales son el inventario de
                    cámaras, incluidas las que cuelgan de su PoE interno. Las terminales
                    de control de acceso se dan de alta aparte.
                  </p>
                )}

                
                <IgField label="Cliente operativo (ERP)">
                  <select
                    id="integra-client-link"
                    value={serviceClientId}
                    onChange={(e) => setServiceClientId(e.target.value)}
                    style={{ ...inputStyle, maxWidth: "100%" }}
                  >
                    <option value="">— Sin vincular —</option>
                    {serviceClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
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
                {!selected.serviceClientId && (
                  <p style={{ fontSize: 12, padding: "8px 12px", margin: 0, color: "#b45309", background: "color-mix(in srgb, var(--warning) 12%, transparent)", borderBottom: "1px solid var(--border)" }}>
                    Sin cliente operativo vinculado: las alarmas no pueden crear ticket automático.{" "}
                    <a href="#integra-client-link" style={{ color: "var(--primary)", fontWeight: 600 }}>
                      Vincula un cliente OPS abajo
                    </a>{" "}
                    o crea el sitio con cliente operativo.
                  </p>
                )}
                <p className={styles.empty} style={{ padding: "8px 10px", textAlign: "left" }}>
                  Activa o desactiva lo que verá el operador en este sitio.
                  {selected.provider === "HCT" && (
                    <> Personas / Visitas / Vehículos / ANPR son solo Artemis — no se pueden habilitar en Hik-Connect.</>
                  )}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 10px 10px" }}>
                  {MODULE_KEYS.map((k) => {
                    const on = selected.modulesOverride?.[k] !== false;
                    const artemisOnly = selected.provider === "HCT" && HCT_ARTEMIS_ONLY.has(k);
                    return (
                      <IgBtn
                        key={k}
                        disabled={busy || artemisOnly}
                        onClick={async () => {
                          if (artemisOnly) return;
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
                        <span style={{ opacity: artemisOnly ? 0.35 : on ? 1 : 0.45, textDecoration: on && !artemisOnly ? "none" : "line-through" }}>
                          {MODULE_LABELS[k] || k}{artemisOnly ? " · Artemis" : ""}
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
