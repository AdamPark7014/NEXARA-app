"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useUser } from "../../../components/UserContext";
import { getDeviceIdentityHeaders } from "@/lib/device-identity";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { setUser } = useUser();
  const router = useRouter();

  const buildApiUrl = (path: string) => {
    const envBase = process.env.NEXT_PUBLIC_API_URL?.trim();
    const fallback = typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3001/api';
    const base = (envBase && envBase.length > 0 ? envBase : fallback).replace(/\/+$/, '');
    return `${base}/${path.replace(/^\/+/, '')}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const deviceHeaders = await getDeviceIdentityHeaders();
      const res = await fetch(buildApiUrl('auth/login'), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...deviceHeaders },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login fallido");
      if (typeof window !== 'undefined' && data.loginGreeting) {
        window.sessionStorage.setItem('nexara_login_greeting', data.loginGreeting);
      }
      setUser({
        ...data.user,
        token: data.access_token,
        loginDevice: data.loginDevice || data.user?.loginDevice,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError('Error desconocido');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style jsx>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0a0e27 0%, #0f1419 50%, #1a1a2e 100%);
          position: relative;
          overflow: hidden;
          padding: 20px;
        }

        .login-container::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
          animation: rotate 30s linear infinite;
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .login-card {
          position: relative;
          width: 100%;
          max-width: 460px;
          font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          padding: 48px 40px;
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.05),
            inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          animation: slideUp 0.6s ease-out;
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
          margin-bottom: 40px;
        }

        .logo {
          width: 92px;
          height: 92px;
          margin: 0 auto 12px;
          background: linear-gradient(135deg, rgba(24, 45, 72, 0.85), rgba(12, 28, 48, 0.85));
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 24px rgba(7, 15, 28, 0.5);
          border: 1px solid rgba(59, 130, 246, 0.25);
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
          letter-spacing: 0.3rem;
          color: rgba(176, 213, 255, 0.88);
          margin: 0 0 8px;
          font-weight: 700;
        }

        .title {
          font-size: 28px;
          font-weight: 800;
          color: #f3f8ff;
          margin: 0 0 8px 0;
          letter-spacing: -0.35px;
        }

        .subtitle {
          font-size: 14px;
          color: rgba(179, 204, 236, 0.9);
          margin: 0;
        }

        .form {
          margin-top: 32px;
        }

        .input-group {
          margin-bottom: 24px;
          position: relative;
        }

        .input-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.8);
          margin-bottom: 8px;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          color: rgba(255, 255, 255, 0.4);
          pointer-events: none;
          transition: color 0.3s ease;
        }

        .input {
          width: 100%;
          padding: 14px 16px 14px 48px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #ffffff;
          font-size: 15px;
          transition: all 0.3s ease;
          outline: none;
        }

        .input:focus {
          background: rgba(255, 255, 255, 0.08);
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }

        .input:focus ~ .input-icon {
          color: #3b82f6;
        }

        .input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .password-toggle {
          position: absolute;
          right: 16px;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          transition: color 0.3s ease;
        }

        .password-toggle:hover {
          color: rgba(255, 255, 255, 0.7);
        }

        .submit-button {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
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
          box-shadow: 0 6px 24px rgba(59, 130, 246, 0.4);
        }

        .submit-button:active {
          transform: translateY(0);
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 14px;
          margin-top: 20px;
          animation: shake 0.5s ease;
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
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .footer-text {
          font-size: 13px;
          font-weight: 600;
          color: rgba(160, 199, 246, 0.86);
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
            padding: 16px;
          }

          .login-card {
            padding: 32px 20px;
            border-radius: 20px;
            max-width: 100%;
          }

          .logo-container {
            margin-bottom: 32px;
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
            padding: 0 10px;
          }

          .form {
            margin-top: 28px;
          }

          .input-group {
            margin-bottom: 20px;
          }

          .input-label {
            font-size: 13px;
            margin-bottom: 7px;
          }

          .input {
            padding: 15px 14px 15px 46px;
            font-size: 16px;
            border-radius: 10px;
            -webkit-appearance: none;
          }

          .input-icon {
            left: 14px;
            width: 19px;
            height: 19px;
          }

          .password-toggle {
            right: 14px;
          }

          .submit-button {
            padding: 17px 16px;
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
            padding: 28px 18px;
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
            padding: 14px 12px 14px 44px;
            font-size: 15px;
          }

          .input-icon {
            left: 12px;
          }

          .password-toggle {
            right: 12px;
          }

          .submit-button {
            padding: 16px 14px;
            font-size: 15px;
          }
        }

        @media (min-width: 481px) and (max-width: 768px) {
          .login-card {
            max-width: 420px;
            padding: 40px 32px;
          }

          .title {
            font-size: 26px;
          }
        }
      `}</style>

      <div className="login-container">
        <div className="login-card">
          <div className="logo-container">
            <div className="logo">
              <img src="/logo-nexara.png" alt="Nexara" width={64} height={64} className="logoImage" />
            </div>
            <p className="brandName">Nexara</p>
            <h1 className="title">Iniciar sesión</h1>
            <p className="subtitle">Ingresa a tu cuenta de Nexara</p>
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
                  className="input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: "48px" }}
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
          </div>
        </div>
      </div>
    </>
  );
}
