"use client";

import { getSocketBaseUrl, buildApiUrl } from "@/lib/api-base";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Socket } from "socket.io-client";
import { useUser } from "./UserContext";
import { hasPermission, PERMISSIONS } from "../lib/permissions";
import { getDeviceIdentityHeaders, getLocalDeviceLabel } from "@/lib/device-identity";
import { getUserHomeUrl, getUserHomeUrlAbsolute } from "@/lib/panel-home";
import { canUserAccessPanel } from "@/lib/user-access";
import {
  buildCrossPanelUrl,
  detectCurrentPanelId,
  panelHomeInternalPath,
} from "@/lib/cross-panel-handoff";
import { isCapacitorNative } from "@/lib/capacitor-env";
import { setSharedCookie, SHARED_COOKIE_KEYS } from "@/lib/shared-cookies";
import { createRealtimeSocket } from '@/lib/realtime-socket';
import styles from './PanelLogin.module.scss';

/**
 * Ruta de aterrizaje tras el login, respetando el panel del subdominio.
 *
 * Antes esto estaba cableado a `integra`/`lab`: en cualquier otro subdominio
 * —`sales`, `core`, `ops`, `studio`— el login ignoraba dónde estabas y te
 * mandaba al panel HOME de tu rol. Como solo `vendedor` y `coord_ventas`
 * tienen CRM por home, entrar a `sales.nexara.com.mx` y loguearte te expulsaba
 * a otro subdominio. `detectCurrentPanelId` ya mapea los 15 subdominios, así
 * que la regla se deriva en vez de enumerarse.
 *
 * El caso que la regla vieja resolvía sigue cubierto: los paneles cuyo home no
 * es `/dashboard` (integra y lab entran por `/panel`) caen a `/` en vez de a
 * una ruta que ahí no existe.
 */
function resolveLandingPath(redirectTo: string): string {
  if (redirectTo !== "/dashboard") return redirectTo;
  const panel = detectCurrentPanelId();
  if (!panel) return redirectTo;
  return panelHomeInternalPath(panel).endsWith("/dashboard") ? redirectTo : "/";
}

/**
 * `?next=/erp/cotizaciones/4`: lo pone el middleware cuando abres un enlace sin sesión. Después de
 * entrar se sigue ahí; solo rutas internas, nunca otra web ni el propio login.
 */
function destinoNext(): string | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("next") ?? "";
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  if (/^\/(auth\/)?login(\/|\?|$)/.test(v)) return null;
  return v;
}

type ProveedorSso = "google" | "microsoft" | "oidc";

/** Lo que pasó en el regreso de Google / Microsoft (`?sso=error&motivo=`), en una frase. */
const MENSAJES_SSO: Record<string, string> = {
  no_provisionado:
    "Ese correo no tiene cuenta en NEXARA. Pide que te den de alta con el mismo correo de tu empresa.",
  inactivo: "Tu cuenta de NEXARA está desactivada; habla con tu administrador.",
  correo_no_verificado: "Tu proveedor no confirmó el correo; entra con tu correo y contraseña.",
  dominio_no_coincide: "Esa cuenta de Microsoft no pertenece al dominio de su correo.",
  cancelado: "Se canceló el inicio de sesión.",
  estado: "El inicio de sesión tardó demasiado o se abrió en otra ventana; inténtalo de nuevo.",
  token: "No se pudo validar tu cuenta con el proveedor; inténtalo de nuevo.",
  proveedor: "Ese acceso no está disponible por ahora; entra con tu correo y contraseña.",
};

function cookieSesion(recordar: boolean) {
  const isHttps = window.location.protocol === "https:";
  const secureFlag = isHttps ? "; Secure" : "";
  const isProduction = window.location.hostname.includes("nexara.com.mx");
  const domainFlag = isProduction ? "; Domain=.nexara.com.mx" : "";
  const maxAge = recordar ? 30 * 86400 : 86400;
  document.cookie = `nx_session=1; Path=/; SameSite=Lax; Max-Age=${maxAge}${domainFlag}${secureFlag}`;
}

type PanelLoginProps = {
  redirectTo: string;
  requiredPermission?: string;
  mode?: "console" | "client" | "branch" | "tickets";
  onClientLogin?: (data: { access_token: string; client: { id: number; name: string; logoUrl?: string | null } }) => void;
  onBranchLogin?: (data: { access_token: string; branch: { id: number; name: string; branchNumber?: string | null; clientId: number; clientName?: string | null } }) => void;
  title?: string;
  subtitle?: string;
  accessNotice?: string;
  /** Skin visual del panel (p. ej. integra) — preferir desde SSR vía Host. */
  skin?: "default" | "integra";
  /**
   * Si es `true`, después del login se redirige al panel HOME del usuario
   * (ventas/operacion/contabilidad/console según su rol) en vez de a la
   * ruta `redirectTo` fija. Útil para `core.nexara.com.mx/login` donde no
   * sabemos a qué panel debe ir cada persona.
   */
  smartRedirect?: boolean;
};

export default function PanelLogin({ redirectTo, requiredPermission, mode = "console", onClientLogin, onBranchLogin, title, subtitle, accessNotice, skin = "default", smartRedirect = false }: PanelLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mostrarOlvido, setMostrarOlvido] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [sso, setSso] = useState<Record<ProveedorSso, boolean>>({ google: false, microsoft: false, oidc: false });
  const [panelSkin, setPanelSkin] = useState<"default" | "integra">(skin);
  const { setUser, user: usuarioActual, isContextReady } = useUser();
  const router = useRouter();
  // Ya hay una navegación en curso (entrar, SSO): no competir con ella desde el efecto de abajo.
  const navegando = useRef(false);

  // «Recordarme»: si al abrir el login ya hay una sesión recordada en este navegador, seguir de largo.
  useEffect(() => {
    if (mode !== "console" || !isContextReady || navegando.current) return;
    if (!usuarioActual?.remember || usuarioActual.offlineDegraded) return;
    if (new URLSearchParams(window.location.search).has("sso")) return;
    navegando.current = true;
    router.replace(destinoNext() ?? (smartRedirect ? getUserHomeUrl(usuarioActual) : resolveLandingPath(redirectTo)));
  }, [mode, isContextReady, usuarioActual, smartRedirect, redirectTo, router]);

  // La casilla recuerda lo último que eligió este navegador (no la sesión: eso lo decide la API).
  useEffect(() => {
    try {
      if (window.localStorage.getItem("nx_recordarme") === "1") setRememberMe(true);
    } catch {
      /* almacenamiento bloqueado */
    }
  }, []);

  const cambiarRecordarme = (valor: boolean) => {
    setRememberMe(valor);
    try {
      window.localStorage.setItem("nx_recordarme", valor ? "1" : "0");
    } catch {
      /* almacenamiento bloqueado */
    }
  };

  const irASso = (proveedor: ProveedorSso) => {
    navegando.current = true;
    const q = new URLSearchParams({ proveedor, recordar: rememberMe ? "1" : "0", vuelta: window.location.origin });
    const destino = destinoNext();
    if (destino) q.set("next", destino);
    window.location.href = `${buildApiUrl("auth/oidc/start")}?${q.toString()}`;
  };

  useEffect(() => {
    setPanelSkin(skin);
  }, [skin]);

  useEffect(() => {
    if (skin !== "default") return;
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    if (host.startsWith("integra.") || host.includes(".integra.")) {
      setPanelSkin("integra");
    }
  }, [skin]);

  useEffect(() => {
    void fetch(buildApiUrl("auth/oidc/status"))
      .then((r) => r.json())
      .then((d) =>
        setSso({
          google: Boolean(d?.proveedores?.google),
          microsoft: Boolean(d?.proveedores?.microsoft),
          // API anterior: solo `enabled` (OIDC genérico).
          oidc: Boolean(d?.proveedores ? d.proveedores.oidc : d?.enabled),
        }),
      )
      .catch(() => setSso({ google: false, microsoft: false, oidc: false }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || mode !== "console") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("sso") === "error") {
      setError(MENSAJES_SSO[params.get("motivo") ?? ""] ?? "SSO falló: revisa OIDC o que el usuario exista en NEXARA.");
      return;
    }
    if (params.get("sso") !== "ok") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    try {
      const pad = hash.length % 4 === 0 ? "" : "=".repeat(4 - (hash.length % 4));
      const b64 = hash.replace(/-/g, "+").replace(/_/g, "/") + pad;
      const data = JSON.parse(atob(b64));
      if (!data?.access_token || !data?.user) throw new Error("Sesión SSO incompleta");
      navegando.current = true;
      void (async () => {
        const userData = {
          id: data.user.id,
          nombre: data.user.nombre,
          email: data.user.email,
          role: data.user.role,
          roleId: data.user.roleId,
          roleKey: data.user.roleKey ?? null,
          orgRoleKey: data.user.orgRoleKey ?? null,
          nivelAutoridad: data.user.nivelAutoridad ?? 0,
          roleFlags: data.user.roleFlags || undefined,
          department: data.user.department,
          departmentId: data.user.departmentId,
          token: data.access_token,
          expiresAt: data.expiresAt ?? null,
          avatarUrl: data.user.avatarUrl || "",
          permissions: data.user.permissions || [],
          isSuperAdmin: data.user.isSuperAdmin || false,
          isPlatformOwner: data.user.isPlatformOwner || false,
          loginDevice: data.loginDevice || data.user.loginDevice,
          remember: data.rememberMe === true,
        };
        if (typeof document !== "undefined") cookieSesion(userData.remember);
        const firstName =
          String(data.user?.nombre || "")
            .trim()
            .split(/\s+/)[0] || "equipo";
        const title =
          typeof data.loginGreeting === "string" && data.loginGreeting.trim()
            ? data.loginGreeting.trim()
            : `Hola, ${firstName}`;
        const device =
          (typeof data.loginDeviceLabel === "string" && data.loginDeviceLabel.trim()) ||
          (typeof data.loginDevice === "string" && data.loginDevice.trim()) ||
          (await getLocalDeviceLabel());
        window.sessionStorage.setItem(
          "nexara_login_greeting",
          JSON.stringify({ title, device }),
        );
        setUser(userData);
        const destino = destinoNext();
        window.history.replaceState({}, "", window.location.pathname);
        if (destino) {
          router.replace(destino);
          return;
        }
        if (smartRedirect) {
          const currentPanel = detectCurrentPanelId();
          if (currentPanel && canUserAccessPanel(userData, currentPanel)) {
            const path = panelHomeInternalPath(currentPanel);
            window.location.assign(
              buildCrossPanelUrl(currentPanel, path, JSON.stringify(userData)),
            );
            return;
          }
          router.replace(getUserHomeUrl(userData));
        } else {
          router.replace(resolveLandingPath(redirectTo));
        }
      })();
    } catch {
      setError("No se pudo completar el SSO");
    }
  }, [mode, redirectTo, router, setUser, smartRedirect]);

  useEffect(() => {
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['websocket', 'polling'] });

    let clearErrorTimeout: ReturnType<typeof setTimeout> | null = null;
    const relevantModels = new Set(['user', 'role', 'department']);

    const onEntityUpdated = (event: { model?: string }) => {
      const normalizedModel = event?.model?.toLowerCase();
      if (!normalizedModel || !relevantModels.has(normalizedModel)) return;

      if (clearErrorTimeout) clearTimeout(clearErrorTimeout);
      clearErrorTimeout = setTimeout(() => {
        setError('');
      }, 300);
    };

    socket.on('entity:updated', onEntityUpdated);
    return () => {
      if (clearErrorTimeout) clearTimeout(clearErrorTimeout);
      socket.off('entity:updated', onEntityUpdated);
      socket.disconnect();
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const deviceHeaders = await getDeviceIdentityHeaders();
      const companySlugFromHost = (() => {
        if (typeof window === "undefined") return null;
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get("company") || params.get("companySlug");
        if (fromQuery?.trim()) return fromQuery.trim().toLowerCase();
        const host = window.location.hostname.toLowerCase();
        // e.g. acme.tickets.nexara.com.mx or acme.localhost
        const parts = host.split(".");
        if (parts.length >= 3 && parts[0] && !["www", "core", "app", "tickets", "localhost"].includes(parts[0])) {
          return parts[0];
        }
        return null;
      })();
      const payload = {
        email,
        password,
        ...(mfaCode.trim() ? { mfaCode: mfaCode.trim() } : {}),
        ...(requiredPermission === PERMISSIONS.PANEL_VENTAS ? { panel: "ventas" } : {}),
        // "Recordarme" solo existe en el login de consola (auth/login).
        ...(mode === "console" && rememberMe ? { rememberMe: true } : {}),
        ...(companySlugFromHost && (mode === "tickets" || mode === "client" || mode === "branch")
          ? { companySlug: companySlugFromHost }
          : {}),
      };

      const loginToEndpoint = async (endpoint: string) => {
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...deviceHeaders },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        return { res, data };
      };

      if (mode === "tickets") {
        const { res, data } = await loginToEndpoint(buildApiUrl("portal/login"));
        if (!res.ok) {
          throw new Error(data.message || data.error || "Credenciales incorrectas");
        }
        if (data.portalKind === "branch" || data.branch) {
          onBranchLogin?.(data);
          if (!onBranchLogin) router.replace(redirectTo);
          return;
        }
        onClientLogin?.(data);
        if (!onClientLogin) router.replace(redirectTo);
        return;
      }

      const endpoint =
        mode === "client"
          ? buildApiUrl("client-auth/login")
          : mode === "branch"
            ? buildApiUrl("branch-auth/login")
            : buildApiUrl("auth/login");
      const { res, data } = await loginToEndpoint(endpoint);
      const msg = typeof data.message === "string" ? data.message : Array.isArray(data.message) ? data.message.join(" ") : "";
      if (!res.ok) {
        if (mode === "console" && (msg === "MFA_REQUIRED" || String(data.error || "").includes("MFA"))) {
          setMfaRequired(true);
          setError("Ingresa el código de tu autenticador (MFA)");
          return;
        }
        throw new Error(msg || data.error || "Credenciales incorrectas");
      }
      setMfaRequired(false);

      if (mode === "client") {
        onClientLogin?.(data);
        router.replace(redirectTo);
        return;
      }

      if (mode === "branch") {
        onBranchLogin?.(data);
        router.replace(redirectTo);
        return;
      }

      const userData = {
        id: data.user.id,
        nombre: data.user.nombre,
        email: data.user.email,
        role: data.user.role,
        roleId: data.user.roleId,
        // RBAC v2: clave canónica (super_admin, ceo, dir_admin…). El backend
        // la incluye en `mapSessionUser`. Sin esto, `useUser().user.roleKey`
        // queda undefined y `canOpenPage()` en el AppShell no puede aplicar.
        roleKey: data.user.roleKey ?? null,
        orgRoleKey: data.user.orgRoleKey ?? null,
        nivelAutoridad: data.user.nivelAutoridad ?? 0,
        roleFlags: data.user.roleFlags || undefined,
        department: data.user.department,
        departmentId: data.user.departmentId,
        token: data.access_token,
        expiresAt: data.expiresAt ?? null,
        avatarUrl: data.user.avatarUrl || "",
        permissions: data.user.permissions || [],
        isSuperAdmin: data.user.isSuperAdmin || false,
        isPlatformOwner: data.user.isPlatformOwner || false,
        loginDevice: data.loginDevice || data.user.loginDevice,
        remember: data.rememberMe === true,
      };

      if (requiredPermission && !hasPermission(userData, requiredPermission)) {
        throw new Error("No tienes permisos para acceder a este panel");
      }

      if (typeof window !== 'undefined') {
        const firstName =
          String(data.user?.nombre || '')
            .trim()
            .split(/\s+/)[0] || 'equipo';
        const title =
          typeof data.loginGreeting === 'string' && data.loginGreeting.trim()
            ? data.loginGreeting.trim()
            : `Hola, ${firstName}`;
        const device =
          (typeof data.loginDeviceLabel === 'string' && data.loginDeviceLabel.trim()) ||
          (typeof data.loginDevice === 'string' && data.loginDevice.trim()) ||
          (await getLocalDeviceLabel());
        window.sessionStorage.setItem(
          'nexara_login_greeting',
          JSON.stringify({ title, device }),
        );
      }

      // Setear cookie de sesión inmediatamente (sin esperar al ciclo de
      // React) — el middleware la lee en el siguiente request para
      // permitir el acceso a `/erp/...`, `/crm/...`, etc.
      if (typeof document !== "undefined") cookieSesion(userData.remember);

      navegando.current = true;
      setUser(userData);

      // App nativa: cookies compartidas cross-subdominio. En navegador cada
      // pestaña guarda su JWT solo en sessionStorage (UserContext).
      if (typeof document !== "undefined" && isCapacitorNative()) {
        setSharedCookie(SHARED_COOKIE_KEYS.ACCESS_TOKEN, data.access_token, {
          maxAge: 86400,
          sameSite: 'Lax',
        });
        setSharedCookie(SHARED_COOKIE_KEYS.USER, JSON.stringify(userData), {
          maxAge: 86400,
          sameSite: 'Lax',
        });
      }

      const destino = destinoNext();
      if (destino) {
        router.replace(destino);
        return;
      }

      if (smartRedirect) {
        // Te quedas en el panel del subdominio donde te has logueado, si tienes
        // acceso. Ver `resolveLandingPath` para por qué esto no puede ir
        // cableado a integra/lab.
        const currentPanel = detectCurrentPanelId();
        if (currentPanel && canUserAccessPanel(userData, currentPanel)) {
          const path = panelHomeInternalPath(currentPanel);
          window.location.assign(
            buildCrossPanelUrl(currentPanel, path, JSON.stringify(userData)),
          );
          return;
        }
        const homeUrl = getUserHomeUrlAbsolute(userData);
        window.location.assign(homeUrl);
        return;
      }

      router.replace(resolveLandingPath(redirectTo));
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Error desconocido");
    } finally {
      setIsLoading(false);
    }
  };

  const esPersonal = mode === "console";
  const hayProveedores = esPersonal && (sso.microsoft || sso.google || sso.oidc);

  return (
    <div className={`${styles.stage} ${esPersonal ? "" : styles.stagePortal}`} data-panel={panelSkin}>
      <aside className={styles.marca} aria-label="NEXARA">
        <svg className={styles.marcaHexagono} viewBox="0 0 620 620" aria-hidden="true">
          <polygon points="310,20 561,165 561,455 310,600 59,455 59,165" className={styles.hexFondo} />
          <polygon points="310,80 509,195 509,425 310,540 111,425 111,195" className={styles.hexFondo} />
          <polyline points="111,195 310,80 509,195" className={styles.hexTeal} />
          <polyline points="509,195 509,425" className={styles.hexCian} />
          <polyline points="509,425 310,540" className={styles.hexNaranja} />
          <polyline points="310,540 111,425" className={styles.hexMorado} />
        </svg>

        <div className={styles.marcaLogo}>
          <Image src="/logo-nexara-platform.png" alt="" width={40} height={40} priority />
          <span className={styles.marcaNombre}>NEXARA</span>
          {panelSkin === "integra" ? <span className={styles.marcaSub}>Integra</span> : null}
        </div>

        <div className={styles.marcaCuerpo}>
          <p className={styles.marcaEtiqueta}>{esPersonal ? "Plataforma NEXARA" : "Portal de clientes"}</p>
          <p className={styles.marcaLema}>
            {esPersonal ? "Todo tu trabajo, en un solo acceso." : "Tus servicios con NEXARA, en un solo lugar."}
          </p>
          <p className={styles.marcaBajada}>
            {esPersonal
              ? "ERP, operación en campo, videovigilancia y ventas con la misma cuenta."
              : "Reportes, tickets y el seguimiento de cada visita técnica."}
          </p>
          {esPersonal ? (
            <ul className={styles.marcaPuntos}>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                <span>Entra con tu correo de empresa, con Microsoft 365 o con Google.</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <span>«Recordarme» te mantiene dentro 30 días en este equipo.</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>
                <span>La misma cuenta en la app de celular.</span>
              </li>
            </ul>
          ) : null}
        </div>

        <p className={styles.marcaPie}>
          © {new Date().getFullYear()} NEXARA ·{" "}
          <a href="https://nexara.com.mx/legal/privacidad">Aviso de privacidad</a>
        </p>
      </aside>

      <main className={styles.panel}>
      <div className={styles.wrap}>
        {accessNotice ? (
          <div className={styles.notice} role="status">
            {accessNotice}
          </div>
        ) : null}

        <div className={styles.encabezado}>
          <h1 className={styles.heading}>{title || "Iniciar sesión"}</h1>
          <p className={styles.subheading}>{subtitle || "Usa tu cuenta de NEXARA."}</p>
        </div>

        {/* Cada botón aparece solo si su proveedor está configurado en la API. */}
        {hayProveedores ? (
          <>
            <div className={styles.ssoGrupo}>
              {sso.microsoft && (
                <button type="button" className={styles.sso} onClick={() => irASso("microsoft")}>
                  <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                  <span>Continuar con Microsoft</span>
                </button>
              )}
              {sso.google && (
                <button type="button" className={styles.sso} onClick={() => irASso("google")}>
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>Continuar con Google</span>
                </button>
              )}
              {sso.oidc && (
                <button type="button" className={styles.sso} onClick={() => irASso("oidc")}>
                  <span>Continuar con SSO / OIDC</span>
                </button>
              )}
            </div>
            <div className={styles.separador}>
              <span>o con tu correo</span>
            </div>
          </>
        ) : null}

        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="email">
              {esPersonal ? "Correo de empresa" : "Correo electrónico"}
            </label>
            <div className={styles.control}>
              <svg className={styles.controlIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 8L10.89 13.26C11.5412 13.6788 12.4588 13.6788 13.11 13.26L21 8M5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <input
                id="email"
                type="email"
                className={styles.field}
                placeholder={esPersonal ? "nombre@nexara.com.mx" : "nombre@empresa.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.labelFila}>
              <label className={styles.label} htmlFor="password">
                Contraseña
              </label>
              <button
                type="button"
                className={styles.enlace}
                aria-expanded={mostrarOlvido}
                aria-controls="ayuda-olvido"
                onClick={() => setMostrarOlvido((v) => !v)}
              >
                ¿La olvidaste?
              </button>
            </div>
            <div className={`${styles.control} ${styles.hasToggle}`}>
              <svg className={styles.controlIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 15V17M6 21H18C19.1046 21 20 20.1046 20 19V13C20 11.8954 19.1046 11 18 11H6C4.89543 11 4 11.8954 4 13V19C4 20.1046 4.89543 21 6 21ZM16 11V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V11H16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className={styles.field}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2.45801 12C3.73201 7.943 7.52301 5 12 5C16.478 5 20.268 7.943 21.542 12C20.268 16.057 16.478 19 12 19C7.52301 19 3.73201 16.057 2.45801 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </div>
            {mostrarOlvido ? (
              <p id="ayuda-olvido" className={styles.ayudaCampo}>
                {esPersonal
                  ? "Tu administrador te da una contraseña nueva desde Accesos. Si tu empresa usa Microsoft 365 o Google, también puedes entrar con ese botón."
                  : "Escríbenos por WhatsApp o a tu ejecutivo de NEXARA y te damos una contraseña nueva."}
              </p>
            ) : null}
          </div>

          {mfaRequired && (
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="mfaCode">
                Código MFA
              </label>
              <div className={styles.control}>
                <svg className={styles.controlIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <input
                  id="mfaCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={styles.field}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoFocus
                />
              </div>
            </div>
          )}

          {esPersonal && (
            <label className={styles.remember} htmlFor="rememberMe">
              <input
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                className={styles.rememberBox}
                checked={rememberMe}
                onChange={(e) => cambiarRecordarme(e.target.checked)}
              />
              <span className={styles.rememberTexto}>
                <span>Recordarme 30 días</span>
                <span className={styles.rememberAyuda}>Solo en este equipo. Desmárcalo en computadoras compartidas.</span>
              </span>
            </label>
          )}

          {error && (
            <div className={styles.error} role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}

          <button type="submit" className={styles.submit} disabled={isLoading}>
            {isLoading && <span className={styles.loader} />}
            <span>{isLoading ? "Iniciando sesión..." : mfaRequired ? "Verificar MFA" : "Entrar"}</span>
            {!isLoading && (
              <svg className={styles.submitFlecha} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            )}
          </button>
        </form>

        <p className={styles.ayuda}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <span>
            {esPersonal
              ? "¿Sin acceso? Pide a tu administrador que te dé de alta con tu correo de empresa."
              : "¿Sin acceso? Pide tu usuario a tu ejecutivo de NEXARA."}
          </span>
        </p>
      </div>
      </main>
    </div>
  );
}
