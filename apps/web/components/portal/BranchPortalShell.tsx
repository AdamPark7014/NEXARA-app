"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PanelLogin from "@/components/PanelLogin";
import { useTheme } from "@/components/ThemeContext";
import { getApiAssetOrigin } from "@/lib/api-base";
import { isPanelDrawerViewport } from "@/lib/panel-drawer-breakpoint";
import { OFFLINE_QUEUE_STORAGE_KEY } from "@/lib/offline-queue";
import {
  clearPortalSessions,
  readBranchSession,
  writeBranchSession,
  type BranchPortalSession,
  PORTAL_SESSION_CHANGED,
} from "@/lib/portal-session";
import consoleStyles from "@/app/(subdomains)/console/console.module.css";
import styles from "@/app/(subdomains)/tickets/tickets.module.css";

type BranchPortalContextValue = {
  session: BranchPortalSession;
  token: string;
  displayName: string;
  logoUrl: string | null;
  clientName: string;
  logout: () => void;
};

const BranchPortalContext = createContext<BranchPortalContextValue | null>(null);

export function useBranchPortalSession(): BranchPortalContextValue {
  const ctx = useContext(BranchPortalContext);
  if (!ctx) throw new Error("useBranchPortalSession debe usarse dentro de BranchPortalShell");
  return ctx;
}

function getAssetUrl(url?: string | null) {
  if (!url) return "";
  const raw = url.trim();
  if (!raw) return "";
  if (/^(data:|blob:|\/\/)/i.test(raw)) return raw;
  const base = getApiAssetOrigin();
  const normalizedPath = raw
    .replace(/\\+/g, "/")
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api(?=\/uploads\/)/i, "")
    .replace(/^\/?uploads\//i, "")
    .replace(/^\/+/, "")
    .replace(/\?.*$/, "");
  const normalized = `/uploads/${normalizedPath}`.replace(/\/uploads\/+/, "/uploads/");
  return `${base}${encodeURI(normalized)}`;
}

export default function BranchPortalShell({ children }: { children: React.ReactNode }) {
  const { darkMode, toggleDarkMode } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<BranchPortalSession | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  const refresh = useCallback(() => {
    setSession(readBranchSession());
    setAvatarLoadError(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    refresh();
    const onChange = () => refresh();
    window.addEventListener(PORTAL_SESSION_CHANGED, onChange);
    return () => window.removeEventListener(PORTAL_SESSION_CHANGED, onChange);
  }, [refresh]);

  useEffect(() => {
    const onResize = () => setIsMobile(isPanelDrawerViewport(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileMenuOpen(false);
      return;
    }
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, mobileMenuOpen]);

  useEffect(() => {
    const sync = () => {
      setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
      try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        setQueued(Array.isArray(parsed) ? parsed.length : 0);
      } catch {
        setQueued(0);
      }
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("nexara-offline-queue", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("nexara-offline-queue", sync);
    };
  }, []);

  const ctx = useMemo(() => {
    if (!session) return null;
    return {
      session,
      token: session.token,
      displayName: session.branch.name,
      logoUrl: session.branch.logoUrl ?? null,
      clientName: session.branch.clientName ?? "Cliente corporativo",
      logout: () => {
        clearPortalSessions();
        refresh();
        window.location.replace("/tickets");
      },
    };
  }, [session, refresh]);

  if (!mounted) return null;

  if (!session || !ctx) {
    return (
      <div className={styles.authWrap}>
        <PanelLogin
          mode="branch"
          redirectTo="/"
          onBranchLogin={(data) => {
            writeBranchSession({ token: data.access_token, branch: data.branch });
            refresh();
          }}
          title="Portal de sucursal"
          subtitle="Acceso operativo para reportar solicitudes de servicio"
        />
      </div>
    );
  }

  const logoUrl = ctx.logoUrl;

  return (
    <BranchPortalContext.Provider value={ctx}>
      <div className={`${consoleStyles.consoleLayout} ${styles.ticketsConsole}`}>
        <aside
          className={consoleStyles.sidebar}
          data-mobile={isMobile ? "true" : "false"}
          data-open={mobileMenuOpen ? "true" : "false"}
        >
          <div className={consoleStyles.sidebarHeader}>
            <div className={consoleStyles.sidebarLogo}>
              <span className={consoleStyles.brandMark}>NEXARA</span>
              <span className={consoleStyles.brandSub}>Sucursal</span>
            </div>
            {isMobile && (
              <button
                type="button"
                className={consoleStyles.hamburgerButton}
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={mobileMenuOpen}
                aria-controls="branch-portal-sidebar"
                data-open={mobileMenuOpen ? "true" : "false"}
              >
                <span className={consoleStyles.hamburgerLine} />
                <span className={consoleStyles.hamburgerLine} />
                <span className={consoleStyles.hamburgerLine} />
              </button>
            )}
          </div>

          {isMobile && mobileMenuOpen && (
            <div
              className={consoleStyles.sidebarOverlay}
              onClick={() => setMobileMenuOpen(false)}
              role="presentation"
            />
          )}

          {(!isMobile || mobileMenuOpen) && (
            <div
              className={consoleStyles.sidebarContent}
              id="branch-portal-sidebar"
              data-open={isMobile && mobileMenuOpen ? "true" : undefined}
            >
              <div className={consoleStyles.sidebarUser}>
                <div className={consoleStyles.sidebarAvatar}>
                  {logoUrl && !avatarLoadError ? (
                    <img
                      className={consoleStyles.avatarImage}
                      src={getAssetUrl(logoUrl)}
                      alt={ctx.displayName}
                      width={64}
                      height={64}
                      onError={() => setAvatarLoadError(true)}
                    />
                  ) : (
                    <span className={consoleStyles.sidebarName}>
                      {ctx.displayName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className={consoleStyles.sidebarName}>{ctx.displayName}</div>
                <div className={consoleStyles.sidebarEmail}>{ctx.clientName}</div>
                <div className={consoleStyles.sidebarMeta}>
                  <span className={consoleStyles.rolePill}>Sucursal</span>
                </div>
              </div>

              <div className={consoleStyles.menuTitle}>Navegación</div>
              <ul className={consoleStyles.sidebarMenu}>
                <li className={consoleStyles.sidebarMenuItem}>
                  <Link
                    href="/tickets"
                    className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    🏢 Portal corporativo
                  </Link>
                </li>
                <li className={consoleStyles.sidebarMenuItem}>
                  <Link
                    href="/tickets/ayuda"
                    className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    🆘 Centro de ayuda
                  </Link>
                </li>
              </ul>

              <div className={consoleStyles.menuTitle}>Sesión</div>
              <ul className={consoleStyles.sidebarMenu}>
                <li className={consoleStyles.sidebarMenuItem}>
                  <span
                    role="status"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 10px",
                      margin: "4px 12px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      background: online
                        ? "color-mix(in srgb, var(--success) 18%, var(--surface))"
                        : "color-mix(in srgb, var(--warning) 22%, var(--surface))",
                      border: "1px solid var(--nx-panel-hairline-soft)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: online ? "var(--success)" : "var(--warning)",
                      }}
                    />
                    {online ? (queued > 0 ? `Sync ${queued}` : "En línea") : "Sin conexión"}
                  </span>
                </li>
                <li className={consoleStyles.sidebarMenuItem}>
                  <button
                    type="button"
                    className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
                    onClick={toggleDarkMode}
                  >
                    {darkMode ? "☀️ Vista clara" : "🌙 Vista oscura"}
                  </button>
                </li>
                <li className={consoleStyles.sidebarMenuItem}>
                  <button
                    type="button"
                    className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
                    onClick={ctx.logout}
                  >
                    ⎋ Cerrar sesión
                  </button>
                </li>
              </ul>
            </div>
          )}
        </aside>

        <main className={consoleStyles.consoleMain}>{children}</main>
      </div>
    </BranchPortalContext.Provider>
  );
}
