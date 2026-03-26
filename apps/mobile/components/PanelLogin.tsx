"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { useUser } from "./UserContext";
import { hasPermission, PERMISSIONS } from "../lib/permissions";
import { getDeviceIdentityHeaders } from "@/lib/device-identity";
import { getApiBase, getSocketBaseUrl } from "@/lib/api-base";
import { getAccessiblePanels, setActivePanel } from "@/lib/panel-routing";

type PanelLoginProps = {
  redirectTo: string;
  requiredPermission?: string;
  title?: string;
  subtitle?: string;
};

export default function PanelLogin({ redirectTo, requiredPermission, title, subtitle }: PanelLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [brandLogoSrc, setBrandLogoSrc] = useState('/logo-nexara.png');
  const { setUser } = useUser();
  const router = useRouter();

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
      const API_URL = getApiBase();
      const endpoint = `${API_URL}/auth/login`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...deviceHeaders },
        body: JSON.stringify({
          email,
          password,
          ...(requiredPermission === PERMISSIONS.PANEL_VENTAS ? { panel: "ventas" } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Credenciales incorrectas");

      const userData = {
        id: data.user.id,
        nombre: data.user.nombre,
        email: data.user.email,
        role: data.user.role,
        roleId: data.user.roleId,
        department: data.user.department,
        departmentId: data.user.departmentId,
        token: data.access_token,
        avatarUrl: data.user.avatarUrl || "",
        permissions: data.user.permissions || [],
        isSuperAdmin: data.user.isSuperAdmin || false,
        loginDevice: data.loginDevice || data.user.loginDevice,
      };

      if (requiredPermission && !hasPermission(userData, requiredPermission)) {
        throw new Error("No tienes permisos para acceder a este panel");
      }

      if (typeof window !== 'undefined' && data.loginGreeting) {
        window.sessionStorage.setItem('nexara_login_greeting', data.loginGreeting);
      }

      setUser(userData);

      const accessiblePanels = getAccessiblePanels(userData);
      if (accessiblePanels.length === 1) {
        const singlePanel = accessiblePanels[0];
        setActivePanel(singlePanel.key);
        router.replace(singlePanel.entryPath);
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
            radial-gradient(circle at 12% -10%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 42%),
            radial-gradient(circle at 88% -4%, color-mix(in srgb, var(--secondary) 16%, transparent), transparent 44%),
            radial-gradient(circle at 50% 110%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 38%),
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

        .login-container::after {
          content: "";
          position: absolute;
          inset: auto auto 8% 50%;
          width: min(66vw, 520px);
          height: min(66vw, 520px);
          transform: translateX(-50%);
          border-radius: 50%;
          background: radial-gradient(circle, color-mix(in srgb, var(--primary) 10%, transparent), transparent 62%);
          filter: blur(18px);
          opacity: 0.85;
          z-index: -1;
        }

        .login-card {
          position: relative;
          width: 100%;
          max-width: 560px;
          border-radius: 24px;
          padding: clamp(26px, 4vw, 44px) clamp(18px, 3vw, 36px);
          background:
            radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 42%),
            linear-gradient(165deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--surface-2) 88%, transparent));
          border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
          box-shadow:
            0 22px 54px color-mix(in srgb, var(--shadow) 42%, transparent),
            inset 0 1px 0 color-mix(in srgb, #fff 24%, transparent);
          backdrop-filter: blur(14px) saturate(1.15);
          -webkit-backdrop-filter: blur(14px) saturate(1.15);
          animation: login-card-enter 0.34s ease-out;
          overflow: hidden;
        }

        .login-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 24px;
          right: 24px;
          height: 2px;
          border-radius: 0 0 4px 4px;
          background: linear-gradient(90deg, transparent, var(--primary), transparent);
          opacity: 0.82;
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

        .login-shell {
          display: grid;
          gap: 18px;
        }

        .hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          margin: 0 auto 12px;
          padding: 0.38rem 0.72rem;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--primary) 22%, var(--border));
          background: color-mix(in srgb, var(--surface) 88%, var(--primary) 12%);
          color: var(--primary-strong);
          font-size: 0.76rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          box-shadow: 0 8px 18px color-mix(in srgb, var(--primary) 14%, transparent);
        }

        .hero-kicker-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--primary);
          box-shadow: 0 0 10px color-mix(in srgb, var(--primary) 66%, transparent);
        }

        .logo {
          width: 96px;
          height: 96px;
          margin: 0 auto 12px;
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.08), transparent 38%),
            linear-gradient(145deg, color-mix(in srgb, var(--surface) 84%, var(--primary) 16%), color-mix(in srgb, var(--surface-2) 80%, var(--secondary) 20%));
          border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
          box-shadow:
            0 16px 30px color-mix(in srgb, var(--shadow) 34%, transparent),
            inset 0 1px 0 color-mix(in srgb, #fff 22%, transparent);
        }

        .logoImage {
          width: 70px;
          height: 70px;
          object-fit: contain;
          filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.18));
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
          max-width: 32rem;
          margin-inline: auto;
        }

        .hero-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
          margin-top: 18px;
        }

        .metric {
          padding: 0.8rem 0.85rem;
          border-radius: 16px;
          border: 1px solid color-mix(in srgb, var(--primary) 16%, var(--border));
          background: color-mix(in srgb, var(--surface) 94%, transparent);
          box-shadow: 0 10px 22px color-mix(in srgb, var(--shadow) 16%, transparent);
        }

        .metric-value {
          display: block;
          font-family: var(--font-heading);
          font-size: 1.02rem;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.05;
        }

        .metric-label {
          display: block;
          margin-top: 4px;
          font-size: 0.72rem;
          line-height: 1.35;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .form {
          margin-top: clamp(20px, 2vw, 30px);
          padding: 1rem;
          border-radius: 20px;
          border: 1px solid color-mix(in srgb, var(--primary) 14%, var(--border));
          background: color-mix(in srgb, var(--surface) 88%, transparent);
          box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 18%, transparent);
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
          margin-top: 10px;
          min-height: 54px;
          border: none;
          border-radius: 16px;
          background: linear-gradient(140deg, var(--secondary) 0%, var(--primary) 52%, var(--primary-strong) 100%);
          color: #fff;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.015em;
          cursor: pointer;
          box-shadow:
            0 14px 30px color-mix(in srgb, var(--primary) 32%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.22);
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

        .trust-row {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 0.9rem;
        }

        .trust-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.38rem 0.7rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--surface-2) 90%, transparent);
          border: 1px solid color-mix(in srgb, var(--primary) 14%, var(--border));
          color: var(--text-secondary);
          font-size: 0.74rem;
          font-weight: 700;
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

          .hero-metrics {
            grid-template-columns: 1fr;
            gap: 0.55rem;
          }

          .logo {
            width: 82px;
            height: 82px;
            border-radius: 16px;
          }

          .logoImage {
            width: 58px;
            height: 58px;
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
          <div className="login-shell">
          <div className="logo-container">
            <div className="hero-kicker">
              <span className="hero-kicker-dot" aria-hidden="true"></span>
              Acceso seguro
            </div>
            <div className="logo">
              <img
                src={brandLogoSrc}
                alt="Nexara"
                width={64}
                height={64}
                className="logoImage"
                onError={() => setBrandLogoSrc('/icon.png')}
              />
            </div>
            <p className="brandName">Nexara</p>
            <h1 className="title">{title || "Iniciar sesión"}</h1>
            <p className="subtitle">{subtitle || "Ingresa a tu cuenta de Nexara"}</p>
            <div className="hero-metrics" aria-hidden="true">
              <div className="metric">
                <span className="metric-value">Roles</span>
                <span className="metric-label">Acceso por permisos</span>
              </div>
              <div className="metric">
                <span className="metric-value">Seguro</span>
                <span className="metric-label">Validación por dispositivo</span>
              </div>
              <div className="metric">
                <span className="metric-value">Tiempo real</span>
                <span className="metric-label">Operación conectada</span>
              </div>
            </div>
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

            <button type="submit" className="submit-button" disabled={isLoading}>
              {isLoading && <span className="loader"></span>}
              {isLoading ? "Iniciando sesión..." : "Entrar"}
            </button>

            {error && (
              <div className="error-message" role="alert">
                <strong>Error:</strong> {error}
              </div>
            )}
          </form>

          <div className="footer">
            <p className="footer-text">Tecnología que impulsa tu negocio</p>
            <div className="trust-row" aria-hidden="true">
              <span className="trust-pill">Control operacional</span>
              <span className="trust-pill">Permisos por usuario</span>
              <span className="trust-pill">Acceso corporativo</span>
            </div>
          </div>
          </div>
        </div>
      </div>
    </>
  );
}

