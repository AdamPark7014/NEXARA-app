"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import PanelLogin from "@/components/PanelLogin";
import { useTheme } from "@/components/ThemeContext";
import { getApiAssetOrigin } from "@/lib/api-base";
import { isPanelDrawerViewport } from "@/lib/panel-drawer-breakpoint";
import {
  clearPortalSessions,
  readClientSession,
  readBranchSession,
  writeClientSession,
  writeBranchSession,
  type ClientPortalSession,
  type BranchPortalSession,
  PORTAL_SESSION_CHANGED,
} from "@/lib/portal-session";
import consoleStyles from "@/app/(subdomains)/console/console.module.css";
import styles from "@/app/(subdomains)/tickets/tickets.module.css";
import { OFFLINE_QUEUE_STORAGE_KEY } from "@/lib/offline-queue";

type PortalSessionState = {
  client: ClientPortalSession | null;
  branch: BranchPortalSession | null;
  token: string | null;
  displayName: string;
  logoUrl: string | null;
  roleLabel: string;
  refresh: () => void;
  logout: () => void;
  onClientLogin: (data: { access_token: string; client: ClientPortalSession["client"] }) => void;
};

const PortalSessionContext = createContext<PortalSessionState | null>(null);

export function usePortalSession(): PortalSessionState {
  const ctx = useContext(PortalSessionContext);
  if (!ctx) throw new Error("usePortalSession debe usarse dentro de PortalShell");
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

type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

const NAV_ACCOUNT: NavItem[] = [
  { href: "/tickets?tab=profile", label: "🪪 Mi perfil corporativo", match: (p) => p.includes("tab=profile") || p === "/tickets" },
  { href: "/tickets/mis-sucursales", label: "🏬 Gestión de sucursales", match: (p) => p.endsWith("/mis-sucursales") },
];

const NAV_SERVICE: NavItem[] = [
  { href: "/tickets?tab=tickets", label: "🎫 Estado de tickets", match: (p) => p.includes("tab=tickets") },
  { href: "/tickets?tab=new-ticket", label: "➕ Nueva solicitud", match: (p) => p.includes("tab=new-ticket") },
  { href: "/tickets/mis-servicios", label: "🛎️ Mis servicios", match: (p) => p.endsWith("/mis-servicios") },
  { href: "/tickets?tab=inventories", label: "🧰 Inventarios", match: (p) => p.includes("tab=inventories") },
  { href: "/tickets/ayuda", label: "🆘 Centro de ayuda", match: (p) => p.endsWith("/ayuda") },
];

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const navHref = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
  const { darkMode, toggleDarkMode } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [client, setClient] = useState<ClientPortalSession | null>(null);
  const [branch, setBranch] = useState<BranchPortalSession | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  const refresh = useCallback(() => {
    setClient(readClientSession());
    setBranch(readBranchSession());
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

  const token = client?.token ?? branch?.token ?? null;
  const displayName = client?.client.name ?? branch?.branch.name ?? "Portal";
  const logoUrl = client?.client.logoUrl ?? null;
  const roleLabel = client ? "Cliente" : branch ? "Sucursal" : "Portal";

  const sessionValue = useMemo<PortalSessionState>(
    () => ({
      client,
      branch,
      token,
      displayName,
      logoUrl,
      roleLabel,
      refresh,
      logout: () => {
        clearPortalSessions();
        refresh();
        window.location.replace("/tickets");
      },
      onClientLogin: (data) => {
        writeClientSession({ token: data.access_token, client: data.client });
        refresh();
      },
    }),
    [client, branch, token, displayName, logoUrl, roleLabel, refresh],
  );

  if (!mounted) return null;

  if (!token) {
    return (
      <div className={styles.authWrap}>
        <PanelLogin
          mode="tickets"
          redirectTo={pathname.replace(/^\/tickets/, "") || "/"}
          onClientLogin={sessionValue.onClientLogin}
          onBranchLogin={(data) => {
            writeBranchSession({ token: data.access_token, branch: data.branch });
            const slug = data.branch.branchNumber || `branch-${data.branch.id}`;
            window.location.replace(`/tickets/${slug}`);
          }}
          title="Iniciar sesión"
          subtitle="Ingresa a tu cuenta de NEXARA"
        />
      </div>
    );
  }

  const navLink = (item: NavItem) => {
    const active = item.match(navHref);
    return (
      <li className={consoleStyles.sidebarMenuItem} key={item.href}>
        <Link
          href={item.href}
          className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${active ? consoleStyles.active : ""}`}
          onClick={() => setMobileMenuOpen(false)}
        >
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <PortalSessionContext.Provider value={sessionValue}>
      <div className={`${consoleStyles.consoleLayout} ${styles.ticketsConsole}`}>
        <aside
          className={consoleStyles.sidebar}
          data-mobile={isMobile ? "true" : "false"}
          data-open={mobileMenuOpen ? "true" : "false"}
        >
          <div className={consoleStyles.sidebarHeader}>
            <div className={consoleStyles.sidebarLogo}>
              <span className={consoleStyles.brandMark}>NEXARA</span>
              <span className={consoleStyles.brandSub}>Portal</span>
            </div>
            {isMobile && (
              <button
                type="button"
                className={consoleStyles.hamburgerButton}
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={mobileMenuOpen}
                aria-controls="portal-sidebar-menu"
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
              id="portal-sidebar-menu"
              data-open={isMobile && mobileMenuOpen ? "true" : undefined}
            >
              <div className={consoleStyles.sidebarUser}>
                <div className={consoleStyles.sidebarAvatar}>
                  {logoUrl && !avatarLoadError ? (
                    <img
                      className={consoleStyles.avatarImage}
                      src={getAssetUrl(logoUrl)}
                      alt={displayName}
                      width={64}
                      height={64}
                      onError={() => setAvatarLoadError(true)}
                    />
                  ) : (
                    <span className={consoleStyles.sidebarName}>{displayName.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className={consoleStyles.sidebarName}>{displayName}</div>
                <div className={consoleStyles.sidebarEmail}>Seguimiento de servicio y soporte</div>
                <div className={consoleStyles.sidebarMeta}>
                  <span className={consoleStyles.rolePill}>{roleLabel}</span>
                </div>
              </div>

              <div className={consoleStyles.menuTitle}>Cuenta corporativa</div>
              <ul className={consoleStyles.sidebarMenu}>{NAV_ACCOUNT.map(navLink)}</ul>

              <div className={consoleStyles.menuTitle}>Servicio y solicitudes</div>
              <ul className={consoleStyles.sidebarMenu}>{NAV_SERVICE.map(navLink)}</ul>

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
                    onClick={sessionValue.logout}
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
    </PortalSessionContext.Provider>
  );
}
