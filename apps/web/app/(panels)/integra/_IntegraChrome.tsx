"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { subscribeActiveCompany } from "@/lib/tenant";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac/roles";
import Button from "@/components/ui/Button";
import { toast } from "@/components/Toast";
import {
  integraApi,
  type IntegraCapabilities,
} from "./_lib";
import {
  arrancarConsolaIntegra,
  claveArranqueActual,
  olvidarArranque,
  tomarArranque,
} from "./_arranque";
import { IntegraSiteSwitcher } from "./_SiteSwitcher";
import {
  getCachedCapabilities,
  moduleAllowedByCaps,
  setCachedCapabilities,
  setCachedProvider,
  getCachedProvider,
  subscribeCapabilities,
} from "./_caps";
import styles from "./integra.module.css";

const PATH_TO_MODULE: Record<string, string> = {
  "/integra": "integra-home",
  "/integra/video": "integra-video",
  "/integra/access": "integra-access",
  "/integra/people": "integra-people",
  "/integra/schedules": "integra-schedules",
  "/integra/espacios": "integra-espacios",
  "/integra/events": "integra-events",
  "/integra/vehicles": "integra-vehicles",
  "/integra/alarms": "integra-alarms",
  "/integra/visitors": "integra-visitors",
  "/integra/attendance": "integra-attendance",
  "/integra/anpr": "integra-anpr",
  "/integra/settings": "integra-settings",
  "/integra/audit": "integra-audit",
  "/integra/map": "integra-map",
};

type HealthBrief = {
  connected?: boolean;
  configured?: boolean;
  provider?: string;
  host?: string | null;
};

type DashBrief = {
  cameras?: number;
  doors?: number;
  doorsOnline?: number;
  people?: number;
  /** Cuándo se reconcilió el espejo por última vez. Lo devuelve la API y hasta
   *  ahora no se pintaba en ninguna parte. */
  lastSync?: string | null;
};

/** A partir de aquí el espejo se considera rancio y se avisa. */
const SYNC_STALE_MS = 60 * 60 * 1000;

/**
 * ¿Dice el health del panel que go2rtc está caído?
 *
 * Sin indicador no se alarma: un health que no reporta video no es un video
 * caído. Y el health devuelve `status: 200` —el código HTTP— mientras que antes
 * se comparaba contra los textos "up"/"ok"; como "200" no es ninguno, el aviso
 * «Video offline» quedaba encendido de forma permanente con el video viéndose
 * perfectamente. Una alarma que siempre miente enseña a ignorar las alarmas, así
 * que se aceptan las dos formas.
 *
 * Estaba metido a mano dentro del efecto; sale aquí para que la respuesta pueda
 * venir tanto del sondeo periódico como del arranque adelantado.
 */
export function mediaCaido(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const raiz = json as Record<string, unknown>;
  let g: Record<string, unknown> | null = null;
  for (const contenedor of [raiz.info, raiz.error, raiz.details]) {
    if (!contenedor || typeof contenedor !== "object") continue;
    const candidato = (contenedor as Record<string, unknown>).go2rtc;
    if (candidato && typeof candidato === "object") {
      g = candidato as Record<string, unknown>;
      break;
    }
  }
  if (!g) return false;
  const crudo = g.status;
  if (crudo == null) return false;
  const comoNumero = Number(crudo);
  const sano = Number.isFinite(comoNumero)
    ? comoNumero >= 200 && comoNumero < 300
    : ["up", "ok", "healthy"].includes(String(crudo).toLowerCase());
  return !sano;
}

/**
 * Antigüedad del espejo en lenguaje llano. Importa más de lo que parece: todo
 * lo que enseña el panel —cámaras, puertas, personas— sale del espejo, así que
 * un espejo viejo no da una pantalla vacía, da una pantalla que miente con
 * aplomo. Sin este dato no había forma de saberlo desde la interfaz.
 */
export function syncAge(iso?: string | null): { label: string; stale: boolean } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const ms = Date.now() - t;
  if (ms < 0) return { label: "recién", stale: false };
  const stale = ms > SYNC_STALE_MS;
  const min = Math.floor(ms / 60000);
  if (min < 1) return { label: "hace menos de 1 min", stale };
  if (min < 60) return { label: `hace ${min} min`, stale };
  const h = Math.floor(min / 60);
  if (h < 24) return { label: `hace ${h} h`, stale };
  return { label: `hace ${Math.floor(h / 24)} d`, stale };
}

/** Barra de contexto del sitio — la nav vive en AppShell (como CRM/ERP). */
export function IntegraChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const isClient = resolveV2RoleKey(user) === ROLES.CLIENTE;
  const [caps, setCaps] = useState<IntegraCapabilities | null>(null);
  const [health, setHealth] = useState<HealthBrief | null>(null);
  const [dash, setDash] = useState<DashBrief | null>(null);
  const [mediaDown, setMediaDown] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tick, setTick] = useState(0);

  /**
   * Capacidades, salud y panel ya no se piden en fila desde aquí: el layout las
   * lanzó todas juntas antes de que este componente existiera. `tomarArranque`
   * recoge la que ya viene volando; si no hay ninguna —refresco periódico,
   * cambio de sitio, botón «Reconciliar»— se pide como siempre.
   */
  const refreshCaps = useCallback(async () => {
    try {
      const clave = claveArranqueActual();
      const c = await (tomarArranque<IntegraCapabilities>("capabilities", clave) ??
        integraApi<IntegraCapabilities>("integra/capabilities"));
      setCaps(c);
      setCachedCapabilities(c);
    } catch {
      /* sin sesión */
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const clave = claveArranqueActual();
      const [h, d] = await Promise.all([
        tomarArranque<HealthBrief>("health", clave) ??
          integraApi<HealthBrief>("integra/health"),
        (
          tomarArranque<DashBrief>("dashboard", clave) ??
          integraApi<DashBrief>("integra/dashboard")
        ).catch(() => null),
      ]);
      setHealth(h);
      if (h?.provider) setCachedProvider(h.provider);
      if (d) setDash(d);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    setCaps(getCachedCapabilities());
    // Red de seguridad: si por lo que sea el layout no llegó a lanzar el
    // arranque (montaje directo de este componente en una prueba, ruta rara),
    // se lanza aquí. Es idempotente por clave, así que no duplica tráfico.
    arrancarConsolaIntegra();
    void refreshCaps();
    void refreshHealth();
    const unsub = subscribeActiveCompany(() => {
      // Cambió la empresa: lo que viniera volando era de la anterior.
      olvidarArranque();
      setTick((t) => t + 1);
      void refreshCaps();
      void refreshHealth();
    });
    const unsubCaps = subscribeCapabilities((c) => setCaps(c));

    const probeMedia = async (adelantada?: Promise<unknown> | null) => {
      try {
        const json = adelantada
          ? await adelantada
          : await fetch("/api/health", { cache: "no-store" }).then((res) =>
              res.ok ? (res.json() as Promise<unknown>) : null,
            );
        // Sin respuesta no se toca el estado anterior: un sondeo fallido no es
        // un video caído.
        if (json == null) return;
        setMediaDown(mediaCaido(json));
      } catch {
        /* no tocar el estado anterior */
      }
    };
    void probeMedia(tomarArranque<unknown>("media", claveArranqueActual()));
    const mediaIv = setInterval(() => void probeMedia(), 60000);

    const iv = setInterval(() => void refreshHealth(), 30000);
    return () => {
      unsub();
      unsubCaps();
      clearInterval(iv);
      clearInterval(mediaIv);
    };
  }, [refreshCaps, refreshHealth, tick]);

  useEffect(() => {
    if (!caps || !pathname) return;
    const clean = pathname.replace(/\/$/, "") || "/integra";
    const moduleId = PATH_TO_MODULE[clean];
    if (!moduleId || moduleId === "integra-home") return;
    const provider = health?.provider || getCachedProvider();
    if (provider === "HCT" && ["integra-people", "integra-visitors", "integra-vehicles", "integra-anpr"].includes(moduleId)) {
      router.replace("/integra");
      return;
    }
    if (isClient && !moduleAllowedByCaps(moduleId, caps)) {
      router.replace("/integra");
    }
  }, [caps, pathname, router, isClient, health?.provider]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await integraApi("integra/sync", { method: "POST" });
      await refreshHealth();
      await refreshCaps();
      setTick((t) => t + 1);
      toast.success("Espejo reconciliado (inventario)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reconciliar el sitio");
    } finally {
      setSyncing(false);
    }
  };

  const healthTone =
    health?.connected === true ? "ok" : health?.configured ? "warn" : "off";
  const healthLabel = health?.connected
    ? "Sitio conectado"
    : health?.configured
      ? "Sin enlace al servidor"
      : isClient
        ? "Pendiente de activación"
        : "Sin sitio";

  const showKpis = Boolean(
    dash && ((dash.cameras ?? 0) > 0 || (dash.doors ?? 0) > 0 || (dash.people ?? 0) > 0),
  );

  const sync = syncAge(dash?.lastSync);

  const showVideo = caps?.video !== false;
  const showPeople = caps?.people !== false && health?.provider !== "HCT";
  const showEvents = caps?.events !== false;
  const showAccess = caps?.access !== false;

  return (
    <div className={styles.shell} data-client={isClient ? "1" : undefined}>
      <div className={styles.contextBar}>
        <div className={styles.contextLeft}>
          <span className={styles.healthPill} data-tone={healthTone}>
            <span className={styles.hudHealth} data-tone={healthTone} />
            {healthLabel}
          </span>
          {mediaDown && (
            <span
              className={styles.healthPill}
              data-tone="warn"
              title="go2rtc no responde. El vivo y el playback 24h pueden fallar hasta que vuelva."
            >
              Video offline
            </span>
          )}
          <IntegraSiteSwitcher
            onChange={() => {
              // Otro sitio: lo adelantado era del anterior y no vale.
              olvidarArranque();
              setTick((t) => t + 1);
              void refreshCaps();
              void refreshHealth();
            }}
          />
          {showKpis && (
            <div className={styles.contextKpis} aria-label="Resumen del sitio">
              <span className={styles.kpiChip}>
                <strong>{dash?.cameras ?? 0}</strong> cámaras
              </span>
              <span className={styles.kpiChip}>
                <strong>
                  {dash?.doorsOnline != null
                    ? `${dash.doorsOnline}/${dash.doors ?? 0}`
                    : dash?.doors ?? 0}
                </strong>{" "}
                puertas
              </span>
              <span className={styles.kpiChip}>
                <strong>{dash?.people ?? 0}</strong> personas
              </span>
              {sync && (
                <span
                  className={styles.kpiChip}
                  data-tone={sync.stale ? "warn" : undefined}
                  title={
                    sync.stale
                      ? "El espejo lleva más de una hora sin reconciliarse. Las cifras de arriba pueden no coincidir con lo que hay ahora mismo en los equipos. Pulsa «Reconciliar»."
                      : "Última reconciliación del espejo con los equipos."
                  }
                >
                  Espejo <strong>{sync.label}</strong>
                </span>
              )}
            </div>
          )}
          {!sync && dash != null && (
            <span
              className={styles.healthPill}
              data-tone="warn"
              title="No consta ninguna reconciliación del espejo. El inventario que ves puede estar incompleto."
            >
              Espejo sin reconciliar
            </span>
          )}
        </div>
        <div className={styles.contextRight}>
          <div className={styles.contextQuick} aria-label="Accesos rápidos">
            {showVideo && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/integra/video")}
                title="Muro en vivo y playback de las últimas 24 h"
              >
                Video · 24h
              </Button>
            )}
            {showAccess && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/integra/access")}
                title="Puertas y privilegios ACS"
              >
                Accesos
              </Button>
            )}
            {showAccess && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/integra/schedules")}
                title="Horarios de acceso por persona y puerta"
              >
                Horarios
              </Button>
            )}
            {showPeople && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/integra/people")}
                title="Alta de persona y Face ID en terminales"
              >
                Alta persona
              </Button>
            )}
            {showEvents && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/integra/events")}
                title="Timeline ACS con foto de rostros"
              >
                Eventos Face
              </Button>
            )}
          </div>
          {!isClient && caps?.settings !== false && (
            <Button
              variant="secondary"
              size="sm"
              loading={syncing}
              disabled={syncing}
              onClick={() => void syncNow()}
              title="Reconciliar espejo desde equipos (recuperación). Los cambios de personas ya van en vivo."
            >
              {syncing ? "Reconciliando…" : "Reconciliar"}
            </Button>
          )}
        </div>
      </div>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
