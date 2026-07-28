"use client";

import { getSocketBaseUrl, buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { io, Socket } from "socket.io-client";
import { useUser } from "./UserContext";
import { hasPermission, PERMISSIONS } from "../lib/permissions";
import { getDeviceIdentityHeaders, getLocalDeviceLabel } from "@/lib/device-identity";
import { getUserHomeUrl, getUserHomeUrlAbsolute } from "@/lib/panel-home";
import { isCapacitorNative } from "@/lib/capacitor-env";
import { setSharedCookie, SHARED_COOKIE_KEYS } from "@/lib/shared-cookies";

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
    const socket: Socket = io(socketUrl, { transports: ['websocket', 'polling'] });

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
        .login-container {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          isolation: isolate;
          overflow: hidden;
          padding: clamp(14px, 2.2vw, 30px);
          background:
            radial-gradient(circle at 12% -10%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 42%),
            radial-gradient(circle at 88% -4%, color-mix(in srgb, var(--secondary) 12%, transparent), transparent 44%),
            linear-gradient(180deg, var(--background) 0%, color-mix(in srgb, var(--surface-2) 88%, var(--background)) 100%);
        }

        .login-container::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, color-mix(in srgb, var(--border) 40%, transparent) 1px, transparent 1px),
            linear-gradient(color-mix(in srgb, var(--border) 40%, transparent) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: radial-gradient(circle at 50% 30%, black 14%, transparent 76%);
          opacity: 0.32;
          z-index: -1;
        }

        .login-card {
          position: relative;
          width: 100%;
          max-width: 540px;
          border-radius: 24px;
          padding: clamp(26px, 4vw, 44px) clamp(18px, 3vw, 36px);
          background:
            linear-gradient(165deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--surface-2) 88%, transparent));
          border: 1px solid var(--border);
          box-shadow: var(--elev-2);
          animation: login-card-enter 0.34s ease-out;
        }

        @keyframes login-card-enter {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .logo-container {
          text-align: center;
          margin-bottom: clamp(22px, 2.8vw, 34px);
        }

        .logo {
          width: 88px;
          height: 88px;
          margin: 0 auto 12px;
          border-radius: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          box-shadow: none;
        }

        .logoImage {
          width: 78px;
          height: 78px;
          object-fit: contain;
        }

        .brandName {
          margin: 0 0 8px;
          text-transform: uppercase;
          letter-spacing: 0.22rem;
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-tertiary);
        }

        .title {
          margin: 0 0 8px;
          font-size: clamp(1.72rem, 2.8vw, 2.16rem);
          line-height: 1.14;
          letter-spacing: -0.02em;
          text-wrap: balance;
          color: var(--text-primary);
        }

        .subtitle {
          margin: 0;
          font-size: clamp(0.9rem, 1.5vw, 0.98rem);
          line-height: 1.54;
          color: var(--text-secondary);
          text-wrap: pretty;
        }

        .form {
          margin-top: clamp(20px, 2vw, 30px);
        }

        .input-group {
          margin-bottom: 16px;
        }

        .input-label {
          display: block;
          margin-bottom: 7px;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-secondary);
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
          color: var(--text-tertiary);
          pointer-events: none;
          transition: color 0.2s ease;
          z-index: 1;
        }

        .login-card .input {
          padding-left: 44px;
          font-size: 0.94rem;
          color: var(--text-primary);
          background: color-mix(in srgb, var(--surface) 94%, var(--surface-2));
          border-color: var(--border);
        }

        .login-card .input:hover {
          border-color: var(--border-strong);
        }

        .login-card .input:focus {
          border-color: color-mix(in srgb, var(--primary) 58%, var(--border));
          box-shadow: var(--ring-soft);
          background: color-mix(in srgb, var(--surface) 98%, #fff);
          outline: none;
        }

        .login-card .input:focus + .input-icon {
          color: var(--primary);
        }

        .login-card .input::placeholder {
          color: var(--text-tertiary);
          opacity: 0.84;
        }

        .input-has-toggle {
          padding-right: 52px;
        }

        .password-toggle {
          position: absolute;
          right: 8px;
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: var(--text-tertiary);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s ease, background-color 0.2s ease;
        }

        .password-toggle:hover {
          color: var(--text-primary);
          background: color-mix(in srgb, var(--surface-2) 80%, transparent);
        }

        .password-toggle:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--primary) 46%, transparent);
          outline-offset: 1px;
        }

        .submit-button {
          width: 100%;
          margin-top: 6px;
          min-height: 50px;
          border: none;
          border-radius: var(--radius-sm);
          background: linear-gradient(140deg, var(--primary) 0%, var(--secondary) 100%);
          color: #fff;
          font-size: 0.98rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
          box-shadow: 0 10px 24px color-mix(in srgb, var(--primary) 28%, transparent);
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }

        .submit-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 26px color-mix(in srgb, var(--primary) 30%, transparent);
          filter: saturate(1.04) brightness(1.03);
        }

        .submit-button:active {
          transform: translateY(0);
        }

        .submit-button:disabled {
          opacity: 0.66;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .submit-button:focus-visible {
          outline: 3px solid color-mix(in srgb, var(--primary) 40%, transparent);
          outline-offset: 2px;
        }

        .access-notice {
          margin-bottom: 14px;
          padding: 12px 14px;
          border-radius: var(--radius-sm);
          border: 1px solid color-mix(in srgb, var(--primary) 42%, var(--border));
          background: color-mix(in srgb, var(--primary) 10%, var(--surface));
          color: var(--text-primary);
          font-size: 0.87rem;
          line-height: 1.45;
        }

        .error-message {
          margin-top: 18px;
          padding: 12px 14px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--state-danger-border);
          background: var(--state-danger-bg);
          color: var(--state-danger-text);
          font-size: 0.87rem;
          line-height: 1.45;
        }

        .footer {
          margin-top: 28px;
          padding-top: 20px;
          text-align: center;
          border-top: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
        }

        .footer-text {
          margin: 0;
          font-size: 0.8rem;
          color: var(--text-tertiary);
        }

        .loader {
          display: inline-block;
          width: 16px;
          height: 16px;
          margin-right: 8px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.32);
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
          vertical-align: text-bottom;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 520px) {
          .login-container {
            padding: 12px;
          }

          .login-card {
            border-radius: 18px;
            padding: 24px 14px;
          }

          .logo {
            width: 74px;
            height: 74px;
            border-radius: 0;
          }

          .logoImage {
            width: 64px;
            height: 64px;
          }

          .title {
            font-size: 1.52rem;
          }

          .subtitle {
            font-size: 0.86rem;
          }

          .footer {
            margin-top: 22px;
            padding-top: 16px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-card,
          .loader {
            animation: none;
          }

          .submit-button,
          .password-toggle,
          .input-icon {
            transition: none;
          }
        }
      `}</style>

      <div className="login-container">
        <div className="login-card">
          {accessNotice ? (
            <div className="access-notice" role="status">
              {accessNotice}
            </div>
          ) : null}
          <div className="logo-container">
            <div className="logo">
              <Image src="/logo-nexara-platform.png" alt="Nexara" width={78} height={78} className="logoImage" priority />
            </div>
            <p className="brandName">Nexara</p>
            <h1 className="title">{title || "Iniciar sesión"}</h1>
            <p className="subtitle">{subtitle || "Ingresa a tu cuenta de Nexara"}</p>
          </div>

          <form className="form" onSubmit={handleLogin}>
            <div className="input-group">
              <label className="input-label" htmlFor="email">
                Correo electrónico
              </label>
              <div className="input-wrapper">
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 8L10.89 13.26C11.5412 13.6788 12.4588 13.6788 13.11 13.26L21 8M5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <input
                  id="email"
                  type="email"
                  className="input"
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
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 15V17M6 21H18C19.1046 21 20 20.1046 20 19V13C20 11.8954 19.1046 11 18 11H6C4.89543 11 4 11.8954 4 13V19C4 20.1046 4.89543 21 6 21ZM16 11V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V11H16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input input-has-toggle"
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
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                  <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    id="mfaCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="input"
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
                className="submit-button"
                style={{ marginTop: 10, background: "transparent", border: "1px solid var(--border, #ccc)", color: "inherit" }}
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
      </div>
    </>
  );
}

