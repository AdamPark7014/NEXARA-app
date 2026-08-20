"use client";

import { getSocketBaseUrl, buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Socket } from "socket.io-client";
import { useUser } from "./UserContext";
import { hasPermission, PERMISSIONS } from "../lib/permissions";
import { getDeviceIdentityHeaders, getLocalDeviceLabel } from "@/lib/device-identity";
import { getUserHomeUrl, getUserHomeUrlAbsolute } from "@/lib/panel-home";
import { isCapacitorNative } from "@/lib/capacitor-env";
import { setSharedCookie, SHARED_COOKIE_KEYS } from "@/lib/shared-cookies";
import { createRealtimeSocket } from '@/lib/realtime-socket';

type PanelLoginProps = {
  redirectTo: string;
  requiredPermission?: string;
  mode?: "console" | "client" | "branch" | "tickets";
  onClientLogin?: (data: { access_token: string; client: { id: number; name: string; logoUrl?: string | null } }) => void;
  onBranchLogin?: (data: { access_token: string; branch: { id: number; name: string; branchNumber?: string | null; clientId: number; clientName?: string | null } }) => void;
  title?: string;
  subtitle?: string;
  accessNotice?: string;
  /**
   * Si es `true`, después del login se redirige al panel HOME del usuario
   * (ventas/operacion/contabilidad/console según su rol) en vez de a la
   * ruta `redirectTo` fija. Útil para `core.nexara.com.mx/login` donde no
   * sabemos a qué panel debe ir cada persona.
   */
  smartRedirect?: boolean;
};

export default function PanelLogin({ redirectTo, requiredPermission, mode = "console", onClientLogin, onBranchLogin, title, subtitle, accessNotice, smartRedirect = false }: PanelLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const { setUser } = useUser();
  const router = useRouter();

  useEffect(() => {
    void fetch(buildApiUrl("auth/oidc/status"))
      .then((r) => r.json())
      .then((d) => setSsoEnabled(Boolean(d?.enabled)))
      .catch(() => setSsoEnabled(false));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || mode !== "console") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("sso") === "error") {
      setError("SSO falló. Revisa OIDC o que el usuario exista en NEXARA.");
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
        };
        if (typeof document !== "undefined") {
          const isHttps = window.location.protocol === "https:";
          const secureFlag = isHttps ? "; Secure" : "";
          const isProduction = window.location.hostname.includes("nexara.com.mx");
          const domainFlag = isProduction ? "; Domain=.nexara.com.mx" : "";
          document.cookie = `nx_session=1; Path=/; SameSite=Lax; Max-Age=86400${domainFlag}${secureFlag}`;
        }
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
        window.history.replaceState({}, "", window.location.pathname);
        if (smartRedirect) {
          router.replace(getUserHomeUrl(userData));
        } else {
          router.replace(redirectTo);
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
        ...(companySlugFromHost && (mode === "tickets" || mode === "client" || mode === "branch")
          ? { companySlug: companySlugFromHost }
          : {}),
      };

      const loginToEndpoint = async (endpoint: string) => {
        const res = await fetch(endpoint, {
          method: "POST",
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
      if (typeof document !== "undefined") {
        const isHttps = window.location.protocol === "https:";
        const secureFlag = isHttps ? "; Secure" : "";
        const isProduction = window.location.hostname.includes("nexara.com.mx");
        const domainFlag = isProduction ? "; Domain=.nexara.com.mx" : "";
        document.cookie = `nx_session=1; Path=/; SameSite=Lax; Max-Age=86400${domainFlag}${secureFlag}`;
      }

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

      if (smartRedirect) {
        // URLs absolutas con subdominio para cambios cross-panel
        const homeUrl = getUserHomeUrlAbsolute(userData);
        window.location.assign(homeUrl);
        return;
      }

      router.replace(redirectTo);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Error desconocido");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style jsx>{`
        .login-shell {
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
          position: relative;
          isolation: isolate;
          overflow: hidden;
          background: #071018;
          color: #e8eef5;
          font-family: var(--nx-font-body, "Manrope", system-ui, sans-serif);
        }

        .brand-pane {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: clamp(28px, 4vw, 56px);
          background:
            radial-gradient(ellipse 80% 60% at 18% 20%, rgba(46, 200, 216, 0.22), transparent 55%),
            radial-gradient(ellipse 70% 50% at 85% 75%, rgba(240, 138, 30, 0.16), transparent 50%),
            linear-gradient(155deg, #0a1520 0%, #0d1c28 42%, #081018 100%);
          overflow: hidden;
        }

        .brand-pane::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(140, 190, 220, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(140, 190, 220, 0.07) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 70% 65% at 40% 35%, black 10%, transparent 75%);
          pointer-events: none;
          animation: grid-drift 18s linear infinite;
        }

        .brand-pane::after {
          content: "";
          position: absolute;
          width: 420px;
          height: 420px;
          right: -120px;
          bottom: -140px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(16, 161, 131, 0.28), transparent 68%);
          pointer-events: none;
        }

        @keyframes grid-drift {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(24px, 16px, 0); }
        }

        .brand-top {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-mark {
          width: 52px;
          height: 52px;
          object-fit: contain;
          filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.35));
        }

        .brand-word {
          margin: 0;
          font-family: var(--nx-font-display, "Space Grotesk", system-ui, sans-serif);
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #f4fbff;
        }

        .brand-hero {
          position: relative;
          z-index: 1;
          max-width: 34rem;
          margin: clamp(40px, 8vh, 90px) 0;
          animation: rise-in 0.55s ease-out both;
        }

        .brand-kicker {
          margin: 0 0 14px;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #7ec8d8;
        }

        .brand-title {
          margin: 0 0 16px;
          font-family: var(--nx-font-display, "Space Grotesk", system-ui, sans-serif);
          font-size: clamp(2rem, 3.4vw, 3rem);
          line-height: 1.08;
          letter-spacing: -0.03em;
          font-weight: 700;
          color: #f7fbff;
          text-wrap: balance;
        }

        .brand-copy {
          margin: 0;
          max-width: 32ch;
          font-size: 1.02rem;
          line-height: 1.55;
          color: rgba(210, 226, 238, 0.82);
        }

        .brand-foot {
          position: relative;
          z-index: 1;
          font-size: 0.82rem;
          color: rgba(180, 205, 220, 0.55);
        }

        .form-pane {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(20px, 3vw, 40px);
          background:
            linear-gradient(180deg, #f3f7fb 0%, #e8eef4 100%);
          color: #122033;
        }

        .form-pane::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 90% 8%, rgba(16, 161, 131, 0.08), transparent 36%),
            radial-gradient(circle at 10% 90%, rgba(110, 197, 216, 0.1), transparent 40%);
          pointer-events: none;
        }

        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          padding: clamp(28px, 3.5vw, 40px);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(18, 42, 64, 0.08);
          box-shadow: 0 24px 48px rgba(12, 28, 44, 0.1);
          animation: rise-in 0.45s ease-out 0.08s both;
        }

        @keyframes rise-in {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .mobile-brand {
          display: none;
          text-align: center;
          margin-bottom: 22px;
        }

        .mobile-brand img {
          width: 72px;
          height: 72px;
          object-fit: contain;
          margin: 0 auto 10px;
        }

        .mobile-brand span {
          display: block;
          font-family: var(--nx-font-display, "Space Grotesk", system-ui, sans-serif);
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #5a7288;
        }

        .logo-container {
          margin-bottom: 26px;
        }

        .title {
          margin: 0 0 8px;
          font-family: var(--nx-font-display, "Space Grotesk", system-ui, sans-serif);
          font-size: clamp(1.55rem, 2.4vw, 1.85rem);
          line-height: 1.15;
          letter-spacing: -0.025em;
          font-weight: 700;
          color: #0f1c2a;
        }

        .subtitle {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.5;
          color: #5b6f82;
        }

        .form {
          margin-top: 26px;
          display: grid;
          gap: 16px;
        }

        .input-group {
          display: grid;
          gap: 7px;
        }

        .input-label {
          font-size: 0.8rem;
          font-weight: 650;
          letter-spacing: 0.02em;
          color: #3d5266;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          min-width: 0;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          width: 18px;
          height: 18px;
          color: #7a90a4;
          pointer-events: none;
          z-index: 1;
          transition: color 0.2s ease;
        }

        .login-card :global(.input),
        .login-card .field {
          width: 100%;
          min-height: 48px;
          padding: 0 14px 0 44px;
          border-radius: 12px;
          border: 1px solid rgba(18, 42, 64, 0.14);
          background: #f7fafc;
          color: #122033;
          font-size: 0.95rem;
          font-family: inherit;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }

        .login-card :global(.input):hover,
        .login-card .field:hover {
          border-color: rgba(16, 161, 131, 0.35);
        }

        .login-card :global(.input):focus,
        .login-card .field:focus {
          outline: none;
          border-color: #10a183;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(16, 161, 131, 0.16);
        }

        .login-card :global(.input):focus + .input-icon,
        .input-wrapper:focus-within .input-icon {
          color: #0b7d65;
        }

        .input-has-toggle {
          padding-right: 48px !important;
        }

        .password-toggle {
          position: absolute;
          right: 8px;
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 9px;
          background: transparent;
          color: #7a90a4;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s ease, background-color 0.2s ease;
        }

        .password-toggle:hover {
          color: #122033;
          background: rgba(18, 42, 64, 0.06);
        }

        .submit-button {
          width: 100%;
          margin-top: 4px;
          min-height: 50px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #0b7d65 0%, #10a183 55%, #2a9fb8 100%);
          color: #fff;
          font-size: 0.98rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          font-family: var(--nx-font-ui, "Inter Tight", system-ui, sans-serif);
          cursor: pointer;
          transition: transform 0.2s ease, filter 0.2s ease;
        }

        .submit-button:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.04);
        }

        .submit-button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .sso-button {
          width: 100%;
          min-height: 46px;
          border-radius: 12px;
          border: 1px solid rgba(18, 42, 64, 0.16);
          background: #fff;
          color: #1c3348;
          font-size: 0.92rem;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease;
        }

        .sso-button:hover {
          border-color: rgba(16, 161, 131, 0.4);
          background: #f4fbf9;
        }

        .access-notice {
          margin-bottom: 16px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(16, 161, 131, 0.28);
          background: rgba(16, 161, 131, 0.08);
          color: #1c3348;
          font-size: 0.87rem;
          line-height: 1.45;
        }

        .error-message {
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(180, 50, 50, 0.28);
          background: rgba(180, 50, 50, 0.08);
          color: #8a1f1f;
          font-size: 0.87rem;
          line-height: 1.45;
        }

        .footer {
          margin-top: 24px;
          padding-top: 18px;
          text-align: center;
          border-top: 1px solid rgba(18, 42, 64, 0.08);
        }

        .footer-text {
          margin: 0;
          font-size: 0.78rem;
          letter-spacing: 0.04em;
          color: #7a90a4;
        }

        .loader {
          display: inline-block;
          width: 15px;
          height: 15px;
          margin-right: 8px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.32);
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
          vertical-align: text-bottom;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 920px) {
          .login-shell {
            grid-template-columns: 1fr;
          }

          .brand-pane {
            display: none;
          }

          .mobile-brand {
            display: block;
          }

          .form-pane {
            min-height: 100vh;
            min-height: 100dvh;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .brand-pane::before,
          .brand-hero,
          .login-card,
          .loader {
            animation: none;
          }

          .submit-button {
            transition: none;
          }
        }
      `}</style>

      <div className="login-shell">
        <aside className="brand-pane" aria-hidden="true">
          <div className="brand-top">
            <Image
              src="/logo-nexara-platform.png"
              alt=""
              width={52}
              height={52}
              className="brand-mark"
              priority
            />
            <p className="brand-word">Nexara</p>
          </div>
          <div className="brand-hero">
            <p className="brand-kicker">Plataforma operativa</p>
            <h2 className="brand-title">Control, campo y continuidad en una sola firma.</h2>
            <p className="brand-copy">
              Accede a tu panel para gestionar CCTV, redes, soporte TI y la operación del día a día.
            </p>
          </div>
          <p className="brand-foot">nexara.com.mx · Puebla · CDMX · cobertura nacional</p>
        </aside>

        <main className="form-pane">
          <div className="login-card">
            {accessNotice ? (
              <div className="access-notice" role="status">
                {accessNotice}
              </div>
            ) : null}

            <div className="mobile-brand">
              <Image
                src="/logo-nexara-platform.png"
                alt="Nexara"
                width={72}
                height={72}
                priority
              />
              <span>Nexara</span>
            </div>

            <div className="logo-container">
              <h1 className="title">{title || "Iniciar sesión"}</h1>
              <p className="subtitle">{subtitle || "Ingresa a tu cuenta de Nexara"}</p>
            </div>

            <form className="form" onSubmit={handleLogin}>
              <div className="input-group">
                <label className="input-label" htmlFor="email">
                  Correo electrónico
                </label>
                <div className="input-wrapper">
                  <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 8L10.89 13.26C11.5412 13.6788 12.4588 13.6788 13.11 13.26L21 8M5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    id="email"
                    type="email"
                    className="input field"
                    placeholder="gerencia@nexara.com.mx"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="password">
                  Contraseña
                </label>
                <div className="input-wrapper">
                  <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 15V17M6 21H18C19.1046 21 20 20.1046 20 19V13C20 11.8954 19.1046 11 18 11H6C4.89543 11 4 11.8954 4 13V19C4 20.1046 4.89543 21 6 21ZM16 11V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V11H16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="input field input-has-toggle"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2.45801 12C3.73201 7.943 7.52301 5 12 5C16.478 5 20.268 7.943 21.542 12C20.268 16.057 16.478 19 12 19C7.52301 19 3.73201 16.057 2.45801 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {mfaRequired && (
                <div className="input-group">
                  <label className="input-label" htmlFor="mfaCode">
                    Código MFA
                  </label>
                  <div className="input-wrapper">
                    <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <input
                      id="mfaCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="input field"
                      placeholder="000000"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      autoFocus
                    />
                  </div>
                </div>
              )}

              <button type="submit" className="submit-button" disabled={isLoading}>
                {isLoading && <span className="loader"></span>}
                {isLoading ? "Iniciando sesión..." : mfaRequired ? "Verificar MFA" : "Entrar"}
              </button>

              {mode === "console" && ssoEnabled && (
                <button
                  type="button"
                  className="sso-button"
                  onClick={() => {
                    window.location.href = buildApiUrl("auth/oidc/start");
                  }}
                >
                  Continuar con SSO / OIDC
                </button>
              )}

              {error && (
                <div className="error-message" role="alert">
                  <strong>Error:</strong> {error}
                </div>
              )}
            </form>

            <div className="footer">
              <p className="footer-text">Tecnología que impulsa tu negocio</p>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}


