"use client";

/**
 * NEXARA · AppShell
 * =================
 *
 * Componente único de layout para los 5 paneles (ERP / CRM / OPS / STUDIO / LAB).
 * Reemplaza todos los Sidebar.tsx / OperacionSidebar.tsx / VentasSidebar.tsx
 * heredados con una experiencia consistente y elegante.
 *
 * Consume:
 *   - access-matrix.ts → qué módulos puede ver el usuario en este panel
 *   - org-roles.ts     → resolver el rol del usuario
 *   - tokens globales  → colors / shadows / motion del manual de marca
 *
 * Uso:
 *   <AppShell panel="erp" accent="#0ea5e9">
 *     {children}
 *   </AppShell>
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { useTheme } from "@/components/ThemeContext";
import CompanySwitcher from "@/components/CompanySwitcher";
import { NEXARA_LOGO_MARK } from "@/lib/brand";
import {
  MODULES,
  PANEL_META,
  getModuleUrl,
  type ModuleEntry,
  type ModuleId,
  type PanelId,
  type PanelMeta,
} from "@/lib/access-matrix";
import {
  buildUserSidebar,
  canUserAccessPanel,
  canUserAccessPath,
  getUserAllowedPanels,
  getUserHomePanel,
  getUserHomePath,
  getUserPanelEntryPath,
  getUserPanelSwitchPath,
  getUserRoleLabel,
  resolveDisplayOrgRoleKey,
  resolveV2RoleKey,
} from "@/lib/user-access";
import {
  getCachedCapabilities,
  moduleAllowedByCaps,
  subscribeCapabilities,
} from "@/app/(panels)/integra/_caps";
import type { IntegraCapabilities } from "@/app/(panels)/integra/_lib";
import { getUserHomeUrlAbsolute } from "@/lib/panel-home";
import type { User } from "@/components/UserContext";
import { buildCrossPanelUrl } from "@/lib/cross-panel-handoff";
import { buildFreshLoginUrl } from "@/lib/tab-session";
import { buildApiUrl } from "@/lib/api-base";
import styles from "./AppShell.module.scss";
import CommandPalette from "./CommandPalette";
import ShellConnectionStatus from "./ShellConnectionStatus";

type AppShellProps = {
  panel: PanelId;
  children: React.ReactNode;
};

export default function AppShell({ panel, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isContextReady } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();

  // ── Auth gate ─────────────────────────────────────────────────────────
  // Si la sesión cargó y no hay usuario, redirigir a /login. Esto evita el
  // bug en el que `/erp/dashboard` (y cualquier otra ruta de panel) se
  // pintaba al público sin sidebar ni autenticación.
  useEffect(() => {
    if (!isContextReady) return;
    if (user) return;
    const nextPath = pathname || `/${panel}`;
    const loginUrl =
      typeof window !== "undefined"
        ? `/login?next=${encodeURIComponent(nextPath)}`
        : "/login";
    router.replace(loginUrl);
  }, [isContextReady, user, pathname, panel, router]);

  // ── Token expirado / corrupto ─────────────────────────────────────────
  // Si el user en sessionStorage no tiene `token` válido, también lo
  // tratamos como sesión muerta y forzamos login. Cubre el caso clásico:
  // el navegador conserva un `nexara_user` viejo de un build anterior.
  useEffect(() => {
    if (!isContextReady || !user) return;
    if (!user.token || typeof user.token !== "string") {
      logout?.();
      router.replace("/login");
    }
  }, [isContextReady, user, logout, router]);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const switcherRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.token) return;
    const loadUnread = async () => {
      try {
        const res = await fetch(buildApiUrl("notifications/count/unread"), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setUnreadNotifs(Number(data?.unreadCount ?? data?.count ?? 0));
      } catch {
        /* non-critical */
      }
    };
    void loadUnread();
    const id = window.setInterval(loadUnread, 45000);
    return () => window.clearInterval(id);
  }, [user?.token]);

  const panelMeta = PANEL_META[panel];

  useEffect(() => {
    setMobileOpen(false);
    setSwitcherOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setSwitcherOpen(false);
        setUserMenuOpen(false);
      }
      // Cmd+K / Ctrl+K abre la paleta global
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const orgRoleKey = useMemo(() => {
    if (!user) return null;
    return resolveDisplayOrgRoleKey(user);
  }, [user]);

  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const v2RoleKey = resolveV2RoleKey(user);

  const [integraCaps, setIntegraCaps] = useState<IntegraCapabilities | null>(null);
  useEffect(() => {
    if (panel !== "integra") return;
    setIntegraCaps(getCachedCapabilities());
    return subscribeCapabilities((c) => setIntegraCaps(c));
  }, [panel]);

  const sidebarGroups = useMemo(() => {
    const groups = buildUserSidebar(panel, user);
    if (panel !== "integra" || !integraCaps) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((item) => moduleAllowedByCaps(item.id, integraCaps)),
      }))
      .filter((g) => g.items.length > 0);
  }, [panel, user, integraCaps]);

  const allowedPanels = useMemo(
    () => getUserAllowedPanels(user),
    [user],
  );

  const homeUrl = useMemo(() => getUserHomePath(user), [user]);
  const canAccessPanel = useMemo(() => canUserAccessPanel(user, panel), [user, panel]);
  const panelEntryPath = useMemo(() => getUserPanelEntryPath(user, panel), [user, panel]);
  const notificationsUrl = useMemo(() => {
    const target = `/${panel}/notifications-center`;
    return canUserAccessPath(user, target) ? target : null;
  }, [user, panel]);
  const profileUrl = useMemo(() => {
    const target = `/${panel}/my-profile`;
    return canUserAccessPath(user, target) ? target : null;
  }, [user, panel]);

  // Si el user está logueado PERO no tiene ningún rol resoluble, su sidebar
  // queda vacío y la experiencia es ambigua: parece "público sin login".
  // Forzamos el redirect al hub `/paneles` que muestra una pantalla clara
  // ("tu cuenta no tiene rol asignado, contacta a tu administrador") en vez
  // de dejar la página renderizada sin navegación.
  const hasAnyAccess = isSuperAdmin || sidebarGroups.length > 0 || allowedPanels.length > 0 || Boolean(v2RoleKey);
  useEffect(() => {
    if (!isContextReady || !user) return;
    if (hasAnyAccess) return;
    router.replace("/paneles");
  }, [isContextReady, user, hasAnyAccess, router]);

  const filteredGroups = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return sidebarGroups;
    return sidebarGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) =>
          `${it.label} ${it.description}`.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [navQuery, sidebarGroups]);

  const accessGuardWarning = useMemo(() => {
    const path = pathname || "/";
    return !canUserAccessPath(user, path);
  }, [user, pathname]);

  // Ruta bloqueada dentro de un panel permitido → redirigir a la entrada del panel
  // (no al home global, evita saltos cross-panel y parpadeos).
  useEffect(() => {
    if (!isContextReady || !user) return;
    if (isSuperAdmin) return;
    if (!canAccessPanel) return;
    if (!accessGuardWarning) return;
    const target = panelEntryPath ?? homeUrl;
    if (!target) return;
    if (pathname === target || pathname?.startsWith(`${target}/`)) return;
    router.replace(target);
  }, [isContextReady, user, isSuperAdmin, canAccessPanel, accessGuardWarning, panelEntryPath, homeUrl, pathname, router]);

  if (!user) {
    return (
      <div
        className={`${styles.shell} nx-app-shell`}
        style={{ "--panel-accent": panelMeta.accent } as React.CSSProperties}
        data-auth-state={isContextReady ? "redirecting" : "loading"}
      >
        <main className={styles.main}>
          <div
            className={styles.contentInner}
            style={{
              minHeight: "60vh",
              display: "grid",
              placeItems: "center",
              color: "var(--text-tertiary, #64748b)",
              fontSize: 14,
              gap: 8,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-secondary, #475569)" }}>
                {isContextReady ? "Redirigiendo a inicio de sesión…" : "Cargando tu sesión…"}
              </div>
              <div style={{ marginTop: 4, fontSize: 12.5 }}>
                NEXARA · {panelMeta.name}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Sesión truthy pero sin acceso a NINGÚN panel/módulo: la UI no tiene
  // jerarquía válida (sidebar vacío, no hay home). Mostramos un estado
  // explícito y ofrecemos cerrar sesión / volver al login en vez de dejar
  // la página suelta sin navegación.
  if (!hasAnyAccess) {
    return (
      <div
        className={`${styles.shell} nx-app-shell`}
        style={{ "--panel-accent": panelMeta.accent } as React.CSSProperties}
        data-auth-state="no-access"
      >
        <main className={styles.main}>
          <div
            className={styles.contentInner}
            style={{
              minHeight: "60vh",
              display: "grid",
              placeItems: "center",
              padding: 24,
            }}
          >
            <div style={{ textAlign: "center", maxWidth: 420 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: "var(--text-primary)", marginBottom: 8 }}>
                Tu cuenta no tiene un rol asignado
              </div>
              <div style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 18 }}>
                Estás autenticado como <strong>{user.email}</strong>, pero todavía
                no se te ha asignado un rol con permisos. Pide a tu
                administrador que te asigne uno desde <em>ERP · Usuarios</em>.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={() => { logout?.(); router.replace("/login"); }}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "1px solid var(--nx-panel-hairline)",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const initials = (user.nombre || user.email || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const isPathActive = (target: string) => {
    if (!pathname) return false;
    if (pathname === target) return true;
    return pathname.startsWith(`${target}/`);
  };

  const handleLogout = () => {
    logout?.();
    router.replace("/login");
  };

  const isChatRoute = Boolean(pathname && /\/chat(\/|$)/.test(pathname));

  // Panel completo sin permiso (p.ej. administrativo en /crm o diseño en /erp sin rutas)
  if (!isSuperAdmin && user && !canAccessPanel) {
    return (
      <PanelAccessDenied
        panelMeta={panelMeta}
        user={user}
        homeUrlAbsolute={getUserHomeUrlAbsolute(user)}
        roleLabel={getUserRoleLabel(user)}
        allowedPanels={allowedPanels}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div
      className={`${styles.shell} nx-app-shell`}
      data-mobile-open={mobileOpen ? "true" : "false"}
      data-collapsed={collapsed ? "true" : "false"}
      data-chat={isChatRoute ? "true" : "false"}
      style={{ "--panel-accent": panelMeta.accent } as React.CSSProperties}
    >
      {/* ───────── SIDEBAR ───────── */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandLogo} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.brandLogoMark}
              src={NEXARA_LOGO_MARK}
              alt=""
            />
          </div>
          <div className={styles.brandText}>
            <div className={styles.brandName}>Nexara</div>
            <div className={styles.brandPanel}>
              {panelMeta.name.replace(/^NEXARA\s+/i, "")}
            </div>
          </div>
        </div>

        <div className={styles.search}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">
              🔍
            </span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Buscar en el menú…"
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
            />
          </div>
        </div>

        <nav className={styles.menu} aria-label="Menú principal">
          {filteredGroups.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
              No hay secciones disponibles en este panel para tu rol.
            </div>
          ) : (
            filteredGroups.map((group) => (
            <div key={group.id} className={styles.group}>
              <p className={styles.groupTitle}>{group.title}</p>
              {group.items.map((item) => {
                const target = `/${panel}${item.path === "/" ? "" : item.path}`;
                const active = isPathActive(target);
                return (
                  <Link
                    key={item.id}
                    href={target}
                    className={`${styles.menuItem} ${active ? styles.active : ""}`.trim()}
                    title={item.description}
                  >
                    <span className={styles.menuItemIcon} aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className={styles.menuItemLabel}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))
          )}
        </nav>

        <div className={styles.userBlock} ref={userMenuRef}>
          <div className={styles.avatar} aria-hidden="true">
            {initials || "U"}
          </div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{user.nombre || user.email}</div>
            <div className={styles.userRole}>
              {getUserRoleLabel(user)}
            </div>
          </div>
          <button
            type="button"
            className={styles.userMenuBtn}
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            aria-label="Menú de usuario"
          >
            ⋮
          </button>

          {userMenuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                bottom: 68,
                left: 12,
                right: 12,
                background: "var(--surface)",
                border: "1px solid var(--nx-panel-hairline)",
                borderRadius: 14,
                boxShadow: "0 4px 8px rgba(8,24,38,0.08), 0 24px 48px rgba(8,24,38,0.18)",
                padding: 6,
                zIndex: 40,
                animation: "switcherIn 200ms var(--nx-ease-out)",
              }}
            >
              <div
                style={{
                  padding: "8px 10px 6px",
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-tertiary)",
                }}
              >
                Cuenta
              </div>
              <Link
                href={profileUrl ?? homeUrl}
                onClick={() => setUserMenuOpen(false)}
                style={menuItemStyle()}
              >
                <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>👤</span>
                Mi perfil
              </Link>
              <button type="button" onClick={toggleDarkMode} style={menuItemStyle()}>
                <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>
                  {darkMode ? "☀️" : "🌙"}
                </span>
                {darkMode ? "Modo claro" : "Modo oscuro"}
              </button>
              <Link
                href={buildFreshLoginUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setUserMenuOpen(false)}
                style={menuItemStyle()}
              >
                <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>👥</span>
                Otra cuenta (nueva pestaña)
              </Link>
              <hr style={{ border: 0, borderTop: "1px solid var(--nx-panel-hairline-soft)", margin: "4px 6px" }} />
              <button type="button" onClick={handleLogout} style={{ ...menuItemStyle(), color: "var(--danger)" }}>
                <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>🚪</span>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>

      <div
        className={styles.overlay}
        role="presentation"
        onClick={() => setMobileOpen(false)}
      />

      {/* ───────── TOPBAR ───────── */}
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.mobileMenuBtn}
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
        >
          ☰
        </button>

        <button
          type="button"
          className={styles.collapseBtn}
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          {collapsed ? "›" : "‹"}
        </button>

        <Breadcrumbs panel={panel} pathname={pathname || ""} panelHome={panelEntryPath} />

        <div className={styles.topbarActions}>
          <CompanySwitcher compact />

          {(isSuperAdmin || orgRoleKey) && (
            <div
              className={styles.roleBadge}
              title="Tu rol corporativo"
              data-tier={
                isSuperAdmin
                  ? "executive"
                  : orgRoleKey?.startsWith("director")
                    ? "director"
                    : orgRoleKey?.includes("manager") || orgRoleKey === "noc_lead" || orgRoleKey === "accountant" || orgRoleKey === "maintenance_coordinator" || orgRoleKey === "warehouse_manager"
                      ? "manager"
                      : "operative"
              }
            >
              <span aria-hidden="true">●</span>
              <span>{getUserRoleLabel(user)}</span>
            </div>
          )}

          {allowedPanels.length > 1 && (
            <div ref={switcherRef} style={{ position: "relative" }}>
              <button
                type="button"
                className={styles.switcherBtn}
                onClick={() => setSwitcherOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={switcherOpen}
              >
                <span className={styles.switcherBtnIcon}>{panelMeta.icon}</span>
                <span>{panelMeta.name.replace(/^NEXARA\s+/i, "")}</span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
              </button>

              {switcherOpen && (
                <div className={styles.switcherDropdown} role="menu">
                  <div className={styles.switcherTitle}>Mis paneles</div>
                  {allowedPanels.map((p) => {
                    const isCurrent = p.id === panel;
                    const isHome = homeUrl.startsWith(`/${p.id}`);
                    const userJson = user ? JSON.stringify(user) : null;
                    const panelHref = buildCrossPanelUrl(
                      p.id,
                      getUserPanelSwitchPath(user, p.id),
                      userJson,
                    );
                    return (
                      <a
                        key={p.id}
                        href={panelHref}
                        className={styles.switcherItem}
                        data-current={isCurrent ? "true" : "false"}
                      >
                        <span className={styles.switcherItemIcon}>{p.icon}</span>
                        <div className={styles.switcherItemBody}>
                          <div className={styles.switcherItemHead}>
                            <span className={styles.switcherItemName}>{p.name}</span>
                            {isCurrent && (
                              <span className={styles.switcherPill} data-variant="current">
                                Actual
                              </span>
                            )}
                            {!isCurrent && isHome && (
                              <span className={styles.switcherPill} data-variant="home">
                                Mi base
                              </span>
                            )}
                          </div>
                          <div className={styles.switcherItemTagline}>{p.tagline}</div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <ShellConnectionStatus />

          <button
            type="button"
            className={styles.paletteBtn}
            onClick={() => setPaletteOpen(true)}
            title="Buscar (⌘K)"
            aria-label="Abrir paleta de comandos"
          >
            <span aria-hidden="true">🔍</span>
            <span className={styles.paletteBtnLabel}>Buscar…</span>
            <kbd className={styles.paletteBtnKbd}>⌘K</kbd>
          </button>

          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleDarkMode}
            aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={darkMode ? "Modo claro" : "Modo oscuro"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

          {notificationsUrl && (
            <Link href={notificationsUrl} className={styles.iconBtn} title="Notificaciones" style={{ position: "relative" }}>
              🔔
              {unreadNotifs > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: 999,
                    background: "var(--danger)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                  }}
                >
                  {unreadNotifs > 99 ? "99+" : unreadNotifs}
                </span>
              )}
            </Link>
          )}
        </div>
      </header>

      {/* ───────── MAIN ───────── */}
      <main className={`${styles.main}${isChatRoute ? ` ${styles.mainFullBleed}` : ""}`}>
        <div className={`${styles.contentInner}${isChatRoute ? ` ${styles.contentInnerFullBleed}` : ""}`}>
          {children}
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        user={user}
        token={user.token}
        onToggleDark={toggleDarkMode}
        onLogout={handleLogout}
      />
    </div>
  );
}

function PanelAccessDenied({
  panelMeta,
  user,
  homeUrlAbsolute,
  roleLabel,
  allowedPanels,
  onLogout,
}: {
  panelMeta: PanelMeta;
  user: User;
  /** URL absoluta del panel home del usuario (puede ser cross-subdomain). */
  homeUrlAbsolute: string;
  roleLabel: string;
  allowedPanels: PanelMeta[];
  onLogout: () => void;
}) {
  // Auto-redirect al panel correcto después de 4 segundos.
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.assign(homeUrlAbsolute);
    }, 4000);
    return () => clearTimeout(t);
  }, [homeUrlAbsolute]);

  return (
    <div
      className={`${styles.shell} nx-app-shell`}
      style={{ "--panel-accent": panelMeta.accent } as React.CSSProperties}
      data-auth-state="panel-denied"
    >
      <main className={styles.main}>
        <div
          className={styles.contentInner}
          style={{
            minHeight: "70vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 480 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🚫</div>
            <div style={{ fontWeight: 700, fontSize: 20, color: "var(--text-primary)", marginBottom: 8 }}>
              No tienes acceso a este panel
            </div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 20 }}>
              Estás autenticado como <strong>{user.nombre || user.email}</strong>
              {roleLabel ? <> ({roleLabel})</> : null}. Tu rol no incluye módulos en{" "}
              <strong>{panelMeta.name.replace(/^NEXARA\s+/i, "")}</strong>.
              <br />
              <span style={{ fontSize: 12.5, opacity: 0.75 }}>
                Serás redirigido a tu panel en unos segundos…
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {/* Anchor nativo — necesario para navegar cross-subdomain */}
              <a
                href={homeUrlAbsolute}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  background: "var(--primary)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Ir a mi panel ({allowedPanels[0]?.name.replace(/^NEXARA\s+/i, "") ?? "inicio"})
              </a>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--nx-panel-hairline)",
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cerrar sesión
              </button>
            </div>
            {allowedPanels.length > 1 && (
              <div style={{ marginTop: 22, fontSize: 12.5, color: "var(--text-tertiary)" }}>
                Paneles disponibles:{" "}
                {allowedPanels.map((p) => p.name.replace(/^NEXARA\s+/i, "")).join(" · ")}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function menuItemStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "left",
    padding: "9px 12px",
    border: "none",
    background: "transparent",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-primary)",
    cursor: "pointer",
    borderRadius: 9,
    textDecoration: "none",
    transition: "background 140ms ease",
  };
}

/**
 * Lookup precomputado de path completo → ModuleEntry, para que las
 * breadcrumbs muestren el `label` oficial del módulo (p.ej. "Mis actividades"
 * en lugar de "My Activities") cuando el path coincide con uno registrado.
 */
const MODULES_BY_URL: Map<string, ModuleEntry> = (() => {
  const map = new Map<string, ModuleEntry>();
  for (const id of Object.keys(MODULES) as ModuleId[]) {
    map.set(getModuleUrl(id), MODULES[id]);
  }
  return map;
})();

/**
 * Breadcrumbs derivadas del pathname actual + del catálogo de módulos del
 * access-matrix. Cuando el path acumulado matchea un módulo registrado, se
 * usa su `label` y `icon` canónicos. Para segmentos genéricos, se humaniza
 * el slug con un diccionario de tecnicismos (NOC, SLA, KPIs, AI, etc.).
 */
function Breadcrumbs({
  panel,
  pathname,
  panelHome,
}: {
  panel: PanelId;
  pathname: string;
  panelHome: string | null;
}) {
  const homeHref =
    panelHome ??
    (panel === "lab" || panel === "integra" ? `/${panel}` : `/${panel}/dashboard`);
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .slice(1); // saltamos el slug del panel

  if (segments.length === 0) {
    return (
      <div className={styles.breadcrumbs}>
        <span className={styles.crumbCurrent}>{PANEL_META[panel].name}</span>
      </div>
    );
  }

  const accumulated: string[] = [];
  return (
    <div className={styles.breadcrumbs}>
      <Link href={homeHref}>{PANEL_META[panel].name}</Link>
      {segments.map((seg, idx) => {
        accumulated.push(seg);
        const isLast = idx === segments.length - 1;
        const target = `/${panel}/${accumulated.join("/")}`;
        const moduleHit = MODULES_BY_URL.get(target);
        const label = moduleHit?.label || humanize(seg);
        return (
          <span key={target} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span className={styles.crumbSep}>/</span>
            {isLast ? (
              <span className={styles.crumbCurrent}>{label}</span>
            ) : (
              <Link href={target}>{label}</Link>
            )}
          </span>
        );
      })}
    </div>
  );
}

const SLUG_DICTIONARY: Record<string, string> = {
  my: "Mis",
  ai: "AI",
  bi: "BI",
  hr: "RRHH",
  kpi: "KPI",
  kpis: "KPIs",
  sla: "SLA",
  noc: "NOC",
  crm: "CRM",
  ops: "OPS",
  erp: "ERP",
  cfdi: "CFDI",
  cvs: "CVs",
  ot: "OT",
  kb: "Knowledge",
  rh: "RRHH",
};

function humanize(slug: string) {
  const words = slug.split("-").map((w) => {
    const lower = w.toLowerCase();
    if (SLUG_DICTIONARY[lower]) return SLUG_DICTIONARY[lower];
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
  return words.join(" ");
}

export { AppShell };
