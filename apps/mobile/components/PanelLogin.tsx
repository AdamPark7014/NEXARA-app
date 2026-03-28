"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { useUser } from "./UserContext";
import { hasPermission, PERMISSIONS } from "../lib/permissions";
import { getDeviceIdentityHeaders } from "@/lib/device-identity";
import { getApiBaseCandidates, getSocketBaseUrl } from "@/lib/api-base";
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
      const payload = JSON.stringify({
        email,
        password,
        ...(requiredPermission === PERMISSIONS.PANEL_VENTAS ? { panel: "ventas" } : {}),
      });

      let data: any = null;
      let responseError = "No se pudo conectar con el servidor de autenticacion";

      for (const API_URL of getApiBaseCandidates()) {
        try {
          const endpoint = `${API_URL}/auth/login`;
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...deviceHeaders },
            body: payload,
          });

          const responseText = await res.text();
          const contentType = res.headers.get("content-type") || "";
          const isHtmlResponse = /<html|<!doctype/i.test(responseText) || contentType.includes("text/html");

          let parsedBody: any = null;
          if (responseText) {
            try {
              parsedBody = JSON.parse(responseText);
            } catch {
              parsedBody = null;
            }
          }

          if (res.ok && parsedBody && typeof parsedBody === "object") {
            data = parsedBody;
            break;
          }

          if (isHtmlResponse) {
            responseError = "El servidor respondio HTML en lugar de JSON. Verifica la configuracion de /api en el host movil.";
            continue;
          }

          if (!res.ok) {
            const messageFromArray = Array.isArray(parsedBody?.message) ? parsedBody.message[0] : null;
            const apiMessage = messageFromArray || parsedBody?.message || parsedBody?.error;
            const finalMessage = typeof apiMessage === "string" && apiMessage.trim() ? apiMessage : "Credenciales incorrectas";
            throw new Error(`AUTH_ERROR:${finalMessage}`);
          }

          responseError = "Respuesta invalida del servidor de autenticacion";
        } catch (requestError) {
          if (requestError instanceof Error && requestError.message.startsWith("AUTH_ERROR:")) {
            throw new Error(requestError.message.replace("AUTH_ERROR:", ""));
          }
          responseError = "No se pudo conectar con el servidor de autenticacion";
          continue;
        }
      }

      if (!data) throw new Error(responseError);

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
          padding: clamp(16px, 2.4vw, 30px);
          background:
            radial-gradient(circle at 8% -12%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 40%),
            radial-gradient(circle at 92% -8%, color-mix(in srgb, var(--secondary) 12%, transparent), transparent 42%),
            linear-gradient(180deg, var(--background) 0%, color-mix(in srgb, var(--surface-2) 90%, var(--background)) 100%);
        }

        .login-container::before {
          content: "";
          position: absolute;
          inset: auto auto 6% 50%;
          width: min(72vw, 540px);
          height: min(72vw, 540px);
          transform: translateX(-50%);
          border-radius: 50%;
          background: radial-gradient(circle, color-mix(in srgb, var(--primary) 12%, transparent), transparent 64%);
          filter: blur(18px);
          opacity: 0.78;
          z-index: -1;
        }

        .login-card {
          position: relative;
          width: 100%;
          max-width: 500px;
          border-radius: 22px;
          padding: clamp(24px, 3.7vw, 40px) clamp(18px, 3vw, 32px);
          background:
            linear-gradient(160deg, color-mix(in srgb, var(--surface) 97%, transparent), color-mix(in srgb, var(--surface-2) 90%, transparent));
          border: 1px solid color-mix(in srgb, var(--border-strong) 62%, var(--border));
          box-shadow: 0 20px 44px color-mix(in srgb, var(--shadow) 34%, transparent);
          backdrop-filter: blur(14px) saturate(1.15);
          -webkit-backdrop-filter: blur(14px) saturate(1.15);
          animation: login-card-enter 0.34s ease-out;
          overflow: hidden;
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
          margin-bottom: clamp(20px, 2.6vw, 30px);
        }

        .login-shell {
          display: grid;
          gap: 14px;
        }

        .hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          margin: 0 auto 14px;
          padding: 0.36rem 0.74rem;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
          background: color-mix(in srgb, var(--surface) 92%, var(--primary) 8%);
          color: var(--primary-strong);
          font-size: 0.74rem;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          box-shadow: 0 8px 18px color-mix(in srgb, var(--primary) 10%, transparent);
        }

        .hero-kicker-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--primary);
          box-shadow: 0 0 10px color-mix(in srgb, var(--primary) 66%, transparent);
        }

        .logo {
          width: 88px;
          height: 88px;
          margin: 0 auto 14px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            linear-gradient(145deg, color-mix(in srgb, var(--surface) 90%, var(--primary) 10%), color-mix(in srgb, var(--surface-2) 86%, var(--secondary) 14%));
          border: 1px solid color-mix(in srgb, var(--primary) 24%, var(--border));
          box-shadow: 0 12px 26px color-mix(in srgb, var(--shadow) 28%, transparent);
        }

        .logoImage {
          width: 64px;
          height: 64px;
          object-fit: contain;
          filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.16));
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
          max-width: 26rem;
          margin-inline: auto;
        }

        .subtitle-note {
          margin: 12px auto 0;
          max-width: 24rem;
          font-size: 0.78rem;
          line-height: 1.45;
          color: var(--text-tertiary);
        }

        .form {
          margin-top: clamp(18px, 2vw, 24px);
          padding: 1.05rem;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--border-strong) 58%, var(--border));
          background: color-mix(in srgb, var(--surface) 92%, transparent);
          box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent);
        }

        .input-group {
          margin-bottom: 14px;
        }

        .input-label {
          display: block;
          margin-bottom: 7px;
          font-size: 0.88rem;
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
          margin-top: 8px;
          min-height: 52px;
          border: none;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: #fff;
          font-size: 0.99rem;
          font-weight: 700;
          letter-spacing: 0.012em;
          cursor: pointer;
          box-shadow: 0 12px 26px color-mix(in srgb, var(--primary) 26%, transparent);
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
          margin-top: 22px;
          padding-top: 0;
          text-align: center;
        }

        .footer-text {
          margin: 0;
          font-size: 0.79rem;
          letter-spacing: 0.02em;
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
            border-radius: 16px;
            padding: 22px 14px;
          }

          .logo {
            width: 80px;
            height: 80px;
            border-radius: 16px;
          }

          .logoImage {
            width: 56px;
            height: 56px;
          }

          .title {
            font-size: 1.52rem;
          }

          .subtitle {
            font-size: 0.86rem;
          }

          .subtitle-note {
            font-size: 0.74rem;
          }

          .form {
            padding: 0.9rem;
          }

          .footer {
            margin-top: 18px;
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
              Acceso corporativo
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
            <p className="subtitle-note">Autenticación por roles y validación de dispositivo.</p>
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
            <p className="footer-text">Plataforma operativa Nexara</p>
          </div>
          </div>
        </div>
      </div>
    </>
  );
}

