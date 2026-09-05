"use client";

import { useCallback, useEffect, useState } from "react";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
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
import { diagnosticar, pedirIntegra, type Diagnostico } from "../_fallosApi";
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

/** Cliente del ERP. El endpoint devuelve lista suelta o envuelta, y el nombre
 *  viaja en `name` o en `nombre` según la versión: se normaliza aquí. */
type ServiceClient = { id: number; name: string };

/** Forma cruda de `service-clients`: nada garantizado, todo se valida. */
type ServiceClientRaw = {
  id?: unknown;
  name?: unknown;
  nombre?: unknown;
};

function normalizarClientes(raw: unknown): ServiceClient[] {
  const filas: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown })?.items)
      ? ((raw as { items: unknown[] }).items)
      : Array.isArray((raw as { data?: unknown })?.data)
        ? ((raw as { data: unknown[] }).data)
        : [];
  const salida: ServiceClient[] = [];
  for (const fila of filas) {
    if (!fila || typeof fila !== "object") continue;
    const c = fila as ServiceClientRaw;
    const id = Number(c.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const nombre =
      typeof c.name === "string" && c.name
        ? c.name
        : typeof c.nombre === "string" && c.nombre
          ? c.nombre
          : `#${id}`;
    salida.push({ id, name: nombre });
  }
  return salida;
}

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
  const [serviceClients, setServiceClients] = useState<ServiceClient[]>([]);
  const [targetCompanyId, setTargetCompanyId] = useState("");
  /** Diagnóstico del último fallo: distingue permiso de servidor caído. */
  const [fallo, setFallo] = useState<Diagnostico | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Site | null>(null);
  /** Diálogo del producto — sustituye al `window.confirm` del navegador. */
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    setFallo(null);
    setLoading(true);
    try {
      setSites(await pedirIntegra<Site[]>("integra/sites"));
      try {
        setServiceClients(normalizarClientes(await pedirIntegra<unknown>("service-clients?limit=200")));
      } catch {
        /* Listado opcional: sin él el sitio se crea igual, solo que sin
           vincular cliente operativo. No merece bloquear la pantalla. */
      }
    } catch (e) {
      setFallo(diagnosticar(e, "cargar los sitios"));
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
    void pedirIntegra<typeof lastSyncRun>(`integra/sync/last?siteId=${selected.id}`)
      .then((r) => setLastSyncRun(r))
      .catch(() => setLastSyncRun(null));
  }, [selected]);

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("es-MX", { hour12: false }) : "Nunca";

  const sincronizar = async (site: Site) => {
    setBusy(true);
    setFallo(null);
    try {
      await pedirIntegra(`integra/sync?siteId=${site.id}`, { method: "POST" });
      await load();
      setSelected(site);
    } catch (e) {
      setFallo(diagnosticar(e, `sincronizar «${site.label || site.name}»`));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Borrar un sitio se lleva por delante su inventario. El `window.confirm`
   * que había aquí ni decía qué sitio era ni qué se pierde: en un navegador
   * moderno sale una franja gris pegada al borde superior, sin nombre y sin
   * contexto, y es fácil aceptarla creyendo que es otra cosa.
   */
  const pedirBorrado = (site: Site) => {
    const inv = site._count;
    const arrastra = inv
      ? ` Arrastra su inventario espejo: ${inv.cameras} cámaras, ${inv.doors} puertas, ${inv.people} personas y ${inv.vehicles} vehículos.`
      : "";
    setConfirmState({
      title: "Eliminar sitio",
      message: `Vas a eliminar «${site.label || site.name}» (${site.host}).${arrastra} Los equipos no se tocan: se pierde la conexión y lo sincronizado.`,
      confirmLabel: "Eliminar sitio",
      danger: true,
      fn: async () => {
        setFallo(null);
        try {
          await pedirIntegra(`integra/sites/${site.id}`, { method: "DELETE" });
          setSelected(null);
          await load();
        } catch (e) {
          setFallo(diagnosticar(e, `eliminar «${site.label || site.name}»`));
        }
      },
    });
  };

  const alternarModulo = async (site: Site, clave: string) => {
    const actual = { ...(site.modulesOverride || {}) };
    actual[clave] = !(actual[clave] !== false);
    setBusy(true);
    setFallo(null);
    try {
      const updated = await pedirIntegra<Site>(`integra/sites/${site.id}`, {
        method: "PATCH",
        body: JSON.stringify({ modulesOverride: actual }),
      });
      setSelected(updated);
      await load();
    } catch (e) {
      setFallo(
        diagnosticar(e, `cambiar el módulo ${MODULE_LABELS[clave] || clave} del sitio`),
      );
    } finally {
      setBusy(false);
    }
  };

  const createSite = async () => {
    setBusy(true);
    setFallo(null);
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
      await pedirIntegra("integra/sites", {
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
      setFallo(diagnosticar(e, "crear el sitio"));
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
      {fallo && <RetryNotice diag={fallo} onRetry={() => void load()} busy={loading} />}

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
                    <div className={a.rowActions}>
                      <IgBtn
                        disabled={busy}
                        aria-label={`Sincronizar el inventario de ${s.label || s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void sincronizar(s);
                        }}
                      >
                        Sync
                        <SyncIcon className={a.btnIcon} aria-hidden />
                      </IgBtn>
                      <IgBtn
                        variant="danger"
                        disabled={busy}
                        aria-label={`Eliminar el sitio ${s.label || s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          pedirBorrado(s);
                        }}
                      >
                        Eliminar
                        <DeleteOutlineIcon className={a.btnIcon} aria-hidden />
                      </IgBtn>
                    </div>
                  ),
                },
              }))}
              empty="Aún no hay sitios. Usa el formulario a la derecha."
            />
            {selected && lastSyncRun && (
              <p className={a.syncLine}>
                Último sync run: <strong>{lastSyncRun.status || "—"}</strong>
                {lastSyncRun.finishedAt ? ` · ${fmt(lastSyncRun.finishedAt)}` : ""}
                {` · ${lastSyncRun.cameras ?? 0} cam / ${lastSyncRun.doors ?? 0} pta`}
                {lastSyncRun.error ? (
                  <span className={a.syncError}>{lastSyncRun.error}</span>
                ) : null}
              </p>
            )}
          </IgPanel>
        }
        right={
          <>
            <IgPanel title="Nuevo sitio">
              <div id="integra-new-site" className={a.formGrid}>
                <IgField label="Tipo de conexión">
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as "ARTEMIS" | "HCT" | "ISAPI")}
                    className={a.control}
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
                    className={a.control}
                  />
                </IgField>
                <IgField label="Etiqueta visible (opcional)">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Cómo lo verá el operador"
                    className={a.control}
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
                    className={a.control}
                  />
                </IgField>
                {/* ISAPI no tiene appKey/appSecret: son las credenciales de la
                    consola web del equipo, guardadas en las mismas columnas. */}
                <IgField label={provider === "ISAPI" ? "Usuario del equipo" : "Clave de acceso"}>
                  <input
                    value={appKey}
                    onChange={(e) => setAppKey(e.target.value)}
                    placeholder={provider === "ISAPI" ? "admin" : undefined}
                    className={a.control}
                  />
                </IgField>
                <IgField label={provider === "ISAPI" ? "Contraseña del equipo" : "Secreto"}>
                  <input
                    type="password"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    className={a.control}
                  />
                </IgField>
                {provider === "ISAPI" && (
                  <p className={a.hint}>
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
                    className={a.control}
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
                        className={a.control}
                      />
                    </IgField>
                    <p className={`${a.hint} ${a.advancedNote}`}>
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
                  <p className={a.linkWarn}>
                    Sin cliente operativo vinculado: las alarmas no pueden crear ticket automático.{" "}
                    <a href="#integra-client-link" className={a.linkWarnAnchor}>
                      Vincula un cliente OPS abajo
                    </a>{" "}
                    o crea el sitio con cliente operativo.
                  </p>
                )}
                <p className={`${a.hint} ${a.hintLeft}`}>
                  Activa o desactiva lo que verá el operador en este sitio.
                  {selected.provider === "HCT" && (
                    <> Personas / Visitas / Vehículos / ANPR son solo Artemis — no se pueden habilitar en Hik-Connect.</>
                  )}
                </p>
                <div className={a.switchGrid} role="group" aria-label="Módulos visibles en este sitio">
                  {MODULE_KEYS.map((k) => {
                    const on = selected.modulesOverride?.[k] !== false;
                    const artemisOnly = selected.provider === "HCT" && HCT_ARTEMIS_ONLY.has(k);
                    return (
                      <ModuleSwitch
                        key={k}
                        label={MODULE_LABELS[k] || k}
                        checked={on && !artemisOnly}
                        disabled={busy || artemisOnly}
                        lockedTag={artemisOnly ? "Artemis" : undefined}
                        lockedReason={
                          artemisOnly
                            ? "Este módulo solo existe en HikCentral (Artemis). Hik-Connect no lo expone."
                            : undefined
                        }
                        onToggle={() => void alternarModulo(selected, k)}
                      />
                    );
                  })}
                </div>
              </IgPanel>
            )}
          </>
        }
      />

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </IgPage>
  );
}
