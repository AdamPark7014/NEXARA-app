"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useUser } from "./UserContext";
import { hasPermission, PERMISSIONS } from "../lib/permissions";
import { getDeviceIdentityHeaders } from "@/lib/device-identity";

type PanelLoginProps = {
  redirectTo: string;
  requiredPermission?: string;
  mode?: "console" | "client" | "branch";
  onClientLogin?: (data: { access_token: string; client: { id: number; name: string; logoUrl?: string | null } }) => void;
  onBranchLogin?: (data: { access_token: string; branch: { id: number; name: string; branchNumber?: string | null; clientId: number; clientName?: string | null } }) => void;
  title?: string;
  subtitle?: string;
};

export default function PanelLogin({ redirectTo, requiredPermission, mode = "console", onClientLogin, onBranchLogin, title, subtitle }: PanelLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { setUser } = useUser();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const deviceHeaders = await getDeviceIdentityHeaders();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
      const endpoint = mode === "client"
        ? `${API_URL}/client-auth/login`
        : mode === "branch"
          ? `${API_URL}/branch-auth/login`
          : `${API_URL}/auth/login`;
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
          background:
            radial-gradient(circle at 4% -12%, rgba(59, 130, 246, 0.34), transparent 44%),
            radial-gradient(circle at 96% -4%, rgba(34, 211, 238, 0.18), transparent 46%),
            linear-gradient(140deg, #070b1f 0%, #0d1833 46%, #111a36 100%);
          position: relative;
          overflow: hidden;
          isolation: isolate;
          padding: clamp(14px, 2.2vw, 30px);
        }

        .login-container::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.18) 0%, transparent 70%);
          animation: rotate 26s linear infinite;
          z-index: -2;
        }

        .login-container::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(rgba(118, 158, 219, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(118, 158, 219, 0.08) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: radial-gradient(circle at 50% 36%, black 16%, transparent 78%);
          z-index: -1;
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .login-card {
          position: relative;
          width: 100%;
          max-width: 540px;
          background:
            radial-gradient(circle at 86% -22%, rgba(59, 130, 246, 0.22), transparent 48%),
            linear-gradient(160deg, rgba(16, 29, 52, 0.92), rgba(14, 24, 45, 0.94));
          backdrop-filter: blur(16px);
          border-radius: 26px;
          padding: clamp(26px, 4vw, 48px) clamp(20px, 3.2vw, 40px);
          box-shadow:
            0 20px 50px rgba(4, 12, 28, 0.62),
            0 8px 18px rgba(4, 12, 28, 0.32),
            inset 0 1px 0 rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(124, 173, 255, 0.2);
          animation: slideUp 0.44s ease-out;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .logo-container {
          text-align: center;
          margin-bottom: clamp(26px, 2.8vw, 40px);
        }

        .logo {
          width: 92px;
          height: 92px;
          margin: 0 auto 12px;
          background: linear-gradient(135deg, rgba(17, 41, 73, 0.94), rgba(10, 25, 45, 0.9));
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 12px 26px rgba(4, 12, 25, 0.54);
          border: 1px solid rgba(86, 151, 255, 0.36);
        }

        .logoImage {
          width: 64px;
          height: 64px;
          object-fit: contain;
          filter: drop-shadow(0 6px 12px rgba(59, 130, 246, 0.4));
        }

        .brandName {
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.26rem;
          color: rgba(194, 217, 252, 0.8);
          margin: 0 0 8px;
          font-weight: 700;
        }

        .title {
          font-size: clamp(1.74rem, 2.8vw, 2.18rem);
          font-weight: 780;
          color: #ffffff;
          margin: 0 0 8px 0;
          letter-spacing: -0.025em;
          line-height: 1.12;
          text-wrap: balance;
        }

        .subtitle {
          font-size: clamp(0.88rem, 1.4vw, 0.98rem);
          color: rgba(199, 217, 243, 0.9);
          margin: 0;
          line-height: 1.56;
          text-wrap: pretty;
        }

        .form {
          margin-top: clamp(22px, 2.2vw, 32px);
        }

        .input-group {
          margin-bottom: 18px;
          position: relative;
        }

        .input-label {
          display: block;
          font-size: 0.92rem;
          font-weight: 620;
          color: rgba(206, 221, 246, 0.94);
          margin-bottom: 8px;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          min-width: 0;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          width: 20px;
          height: 20px;
          color: rgba(255, 255, 255, 0.4);
          pointer-events: none;
          transition: color 0.3s ease;
          z-index: 2;
        }

        .login-card .input {
          width: 100%;
          padding: 14px 16px 14px 50px;
          background: linear-gradient(180deg, rgba(248, 252, 255, 0.14), rgba(235, 245, 255, 0.08)) !important;
          border: 1px solid rgba(132, 179, 255, 0.26) !important;
          border-radius: 12px;
          color: #f7fbff !important;
          font-size: 15px;
          line-height: 1.35;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
          outline: none;
        }

        .login-card .input:hover {
          border-color: rgba(132, 179, 255, 0.42);
          background: linear-gradient(180deg, rgba(248, 252, 255, 0.18), rgba(235, 245, 255, 0.11)) !important;
        }

        .input-has-toggle {
          padding-right: 56px;
        }

        .login-card .input:focus {
          background: linear-gradient(180deg, rgba(248, 252, 255, 0.22), rgba(235, 245, 255, 0.14)) !important;
          border-color: #62a3ff !important;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.24);
        }

        .input:focus + .input-icon {
          color: #3b82f6;
        }

        .login-card .input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .login-card .input:-webkit-autofill,
        .login-card .input:-webkit-autofill:hover,
        .login-card .input:-webkit-autofill:focus,
        .login-card .input:-webkit-autofill:active {
          -webkit-text-fill-color: #f7fbff;
          caret-color: #f7fbff;
          border: 1px solid rgba(132, 179, 255, 0.34);
          -webkit-box-shadow: 0 0 0 1000px rgba(26, 43, 69, 0.96) inset;
          box-shadow: 0 0 0 1000px rgba(26, 43, 69, 0.96) inset;
          transition: background-color 9999s ease-out 0s;
        }

        .login-card .input:autofill,
        .login-card .input:autofill:hover,
        .login-card .input:autofill:focus {
          color: #f7fbff;
          caret-color: #f7fbff;
          background: linear-gradient(180deg, rgba(248, 252, 255, 0.22), rgba(235, 245, 255, 0.14)) !important;
          border: 1px solid rgba(132, 179, 255, 0.34);
        }

        .password-toggle {
          position: absolute;
          right: 10px;
          width: 32px;
          height: 32px;
          background: none;
          border: none;
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.3s ease;
          z-index: 3;
        }

        .password-toggle:hover {
          color: rgba(255, 255, 255, 0.7);
        }

        .password-toggle:focus-visible {
          outline: 2px solid rgba(124, 173, 255, 0.8);
          outline-offset: 2px;
        }

        .submit-button {
          width: 100%;
          min-height: 52px;
          padding: 14px 16px;
          background: linear-gradient(135deg, #3f8af9 0%, #2d6eea 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
          box-shadow: 0 10px 24px rgba(59, 130, 246, 0.34);
          position: relative;
          overflow: hidden;
        }

        .submit-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s ease;
        }

        .submit-button:hover::before {
          left: 100%;
        }

        .submit-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 28px rgba(59, 130, 246, 0.42);
          filter: brightness(1.03);
        }

        .submit-button:active {
          transform: translateY(0);
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          filter: saturate(0.7);
        }

        .submit-button:focus-visible {
          outline: 3px solid rgba(133, 184, 255, 0.8);
          outline-offset: 2px;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.13);
          border: 1px solid rgba(239, 68, 68, 0.42);
          color: #ffd2d2;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 14px;
          margin-top: 20px;
          animation: shake 0.5s ease;
          line-height: 1.4;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }

        .footer {
          margin-top: 32px;
          text-align: center;
          padding-top: 24px;
          border-top: 1px solid rgba(134, 181, 255, 0.16);
        }

        .footer-text {
          font-size: 13px;
          color: rgba(186, 208, 241, 0.8);
          margin: 0;
        }

        .loader {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-right: 8px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
          .login-container {
            padding: 14px;
          }

          .login-card {
            padding: 30px 18px;
            border-radius: 18px;
            max-width: 100%;
            box-shadow:
              0 4px 24px rgba(0, 0, 0, 0.5),
              0 0 0 1px rgba(255, 255, 255, 0.06),
              inset 0 0 0 1px rgba(255, 255, 255, 0.06);
          }

          .logo-container {
            margin-bottom: 24px;
          }

          .logo {
            width: 76px;
            height: 76px;
            border-radius: 18px;
            margin-bottom: 10px;
          }

          .logoImage {
            width: 52px;
            height: 52px;
          }

          .brandName {
            font-size: 12px;
            letter-spacing: 0.25rem;
            margin-bottom: 6px;
          }

          .title {
            font-size: 22px;
            letter-spacing: -0.3px;
            margin-bottom: 6px;
          }

          .subtitle {
            font-size: 13px;
            line-height: 1.5;
            padding: 0 8px;
          }

          .form {
            margin-top: 22px;
          }

          .input-group {
            margin-bottom: 20px;
          }

          .input-label {
            font-size: 13px;
            margin-bottom: 7px;
          }

          .input {
            min-height: 48px;
            padding: 14px 12px 14px 44px;
            font-size: 16px;
            border-radius: 10px;
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
          }

          .input-has-toggle {
            padding-right: 54px;
          }

          .input-icon {
            left: 14px;
            width: 19px;
            height: 19px;
          }

          .password-toggle {
            right: 8px;
            width: 34px;
            height: 34px;
          }

          .submit-button {
            min-height: 50px;
            padding: 14px;
            font-size: 16px;
            border-radius: 10px;
            font-weight: 700;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
          }

          .error-message {
            padding: 14px 16px;
            font-size: 13px;
            margin-top: 16px;
            line-height: 1.4;
          }

          .footer {
            margin-top: 28px;
            padding-top: 20px;
          }

          .footer-text {
            font-size: 12px;
          }

          .loader {
            width: 16px;
            height: 16px;
          }
        }

        @media (max-width: 380px) {
          .login-card {
            padding: 24px 14px;
          }

          .logo {
            width: 68px;
            height: 68px;
          }

          .logoImage {
            width: 46px;
            height: 46px;
          }

          .title {
            font-size: 20px;
          }

          .subtitle {
            font-size: 12px;
          }

          .input {
            padding: 13px 10px 13px 40px;
            font-size: 15px;
          }

          .input-has-toggle {
            padding-right: 52px;
          }

          .input-icon {
            left: 12px;
          }

          .password-toggle {
            right: 7px;
            width: 32px;
            height: 32px;
          }

          .submit-button {
            padding: 16px 14px;
            font-size: 15px;
          }
        }

        @media (min-width: 481px) and (max-width: 768px) {
          .login-card {
            max-width: 460px;
            padding: 40px 32px;
          }

          .title {
            font-size: 26px;
          }
        }

        @media (min-width: 1024px) {
          .login-card {
            max-width: 560px;
          }

          .form {
            margin-top: 30px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-container::before,
          .login-card,
          .submit-button::before,
          .loader,
          .error-message {
            animation: none !important;
          }

          .submit-button,
          .input,
          .password-toggle {
            transition: none !important;
          }
        }
      `}</style>

      <div className="login-container">
        <div className="login-card">
          <div className="logo-container">
            <div className="logo">
              <Image src="/logo-nexara.png" alt="Nexara" width={64} height={64} className="logoImage" priority />
            </div>
            <p className="brandName">Nexara</p>
            <h1 className="title">{title || "Iniciar sesion"}</h1>
            <p className="subtitle">{subtitle || "Ingresa a tu cuenta de Nexara"}</p>
          </div>

          <form className="form" onSubmit={handleLogin}>
            <div className="input-group">
              <label className="input-label" htmlFor="email">
                Correo electronico
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
                Contrasena
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
                  aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
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
              {isLoading ? "Iniciando sesion..." : "Entrar"}
            </button>

            {error && (
              <div className="error-message" role="alert">
                <strong>Error:</strong> {error}
              </div>
            )}
          </form>

          <div className="footer">
            <p className="footer-text">Tecnologia que impulsa tu negocio</p>
          </div>
        </div>
      </div>
    </>
  );
}
