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
import { getOrgRoleLabel, resolveOrgRoleKey } from "@/lib/org-roles";
import {
  MODULES,
  PANEL_META,
  buildSidebar,
  canAccessUrl,
  getAllowedPanels,
  getHomeUrl,
  getModuleUrl,
  type ModuleEntry,
  type ModuleId,
  type PanelId,
} from "@/lib/access-matrix";
import styles from "./AppShell.module.scss";
import CommandPalette from "./CommandPalette";

type AppShellProps = {
  panel: PanelId;
  children: React.ReactNode;
};

export default function AppShell({ panel, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

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
    return resolveOrgRoleKey(user.role, (user as { orgRoleKey?: string }).orgRoleKey);
  }, [user]);

  const isSuperAdmin = Boolean(user?.isSuperAdmin);

  const sidebarGroups = useMemo(
    () => buildSidebar(panel, orgRoleKey, isSuperAdmin),
    [panel, orgRoleKey, isSuperAdmin],
  );

  const allowedPanels = useMemo(
    () => getAllowedPanels(orgRoleKey, isSuperAdmin),
    [orgRoleKey, isSuperAdmin],
  );

  const homeUrl = useMemo(() => getHomeUrl(orgRoleKey, isSuperAdmin), [orgRoleKey, isSuperAdmin]);

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

  if (!user) {
    return (
      <div className={styles.shell} style={{ "--panel-accent": panelMeta.accent } as React.CSSProperties}>
        <main className={styles.main}>
          <div className={styles.contentInner}>{children}</div>
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

  const accessGuardWarning = !canAccessUrl(orgRoleKey, pathname || "/", isSuperAdmin);

  return (
    <div
      className={styles.shell}
      data-mobile-open={mobileOpen ? "true" : "false"}
      data-collapsed={collapsed ? "true" : "false"}
      style={{ "--panel-accent": panelMeta.accent } as React.CSSProperties}
    >
      {/* ───────── SIDEBAR ───────── */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandLogo} aria-hidden="true">
            N
          </div>
          <div className={styles.brandText}>
            <div className={styles.brandName}>NEXARA</div>
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
          {filteredGroups.map((group) => (
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
          ))}
        </nav>

        <div className={styles.userBlock} ref={userMenuRef}>
          <div className={styles.avatar} aria-hidden="true">
            {initials || "U"}
          </div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{user.nombre || user.email}</div>
            <div className={styles.userRole}>
              {isSuperAdmin ? "Superadmin" : user.role || "Equipo NEXARA"}
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
                href={`/${panel}/my-profile`}
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

        <Breadcrumbs panel={panel} pathname={pathname || ""} />

        <div className={styles.topbarActions}>
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
              <span>{getOrgRoleLabel(user.role, orgRoleKey, isSuperAdmin) || "Equipo"}</span>
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
                    return (
                      <a
                        key={p.id}
                        href={`/${p.id}${p.entryPath}`}
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

          <Link href={`/${panel}/notifications-center`} className={styles.iconBtn} title="Notificaciones">
            🔔
          </Link>
        </div>
      </header>

      {/* ───────── MAIN ───────── */}
      <main className={styles.main}>
        <div className={styles.contentInner}>
          {accessGuardWarning && !isSuperAdmin && (
            <div
              role="alert"
              style={{
                padding: "14px 18px",
                background: "var(--state-warning-bg)",
                border: "1px solid var(--state-warning-border)",
                color: "var(--state-warning-text)",
                borderRadius: 12,
                marginBottom: 18,
                fontSize: 13.5,
              }}
            >
              ⚠️ Tu rol no tiene acceso a esta URL. Si crees que es un error, contacta a tu administrador.
            </div>
          )}
          {children}
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        orgRoleKey={orgRoleKey}
        isSuperAdmin={isSuperAdmin}
        onToggleDark={toggleDarkMode}
        onLogout={handleLogout}
      />
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
function Breadcrumbs({ panel, pathname }: { panel: PanelId; pathname: string }) {
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
      <Link href={`/${panel}${PANEL_META[panel].entryPath}`}>{PANEL_META[panel].name}</Link>
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
