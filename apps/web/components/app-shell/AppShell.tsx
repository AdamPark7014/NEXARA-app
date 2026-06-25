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
import { canOpenPage, type RoleKey } from "@/lib/rbac";
import { buildCrossPanelUrl } from "@/lib/cross-panel-handoff";
import styles from "./AppShell.module.scss";
import CommandPalette from "./CommandPalette";

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
  const v2RoleKey = (user as { roleKey?: string } | null)?.roleKey as RoleKey | undefined;

  const sidebarGroups = useMemo(
    () => buildSidebar(panel, orgRoleKey, isSuperAdmin),
    [panel, orgRoleKey, isSuperAdmin],
  );

  const allowedPanels = useMemo(
    () => getAllowedPanels(orgRoleKey, isSuperAdmin),
    [orgRoleKey, isSuperAdmin],
  );

  const homeUrl = useMemo(() => getHomeUrl(orgRoleKey, isSuperAdmin), [orgRoleKey, isSuperAdmin]);

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

  // Gate de acceso jerárquico con preferencia RBAC v2.
  //   - Si el usuario tiene `roleKey` v2 → consultamos `canOpenPage()` con la
  //     matriz canónica de paths (`page-matrix.ts`).
  //   - Si todavía sólo tiene rol legacy → caemos al `canAccessUrl()` previo
  //     basado en `access-matrix.ts` (no rompe usuarios sin migrar).
  const accessGuardWarning = useMemo(() => {
    const path = pathname || "/";
    if (v2RoleKey) return !canOpenPage(v2RoleKey, path);
    return !canAccessUrl(orgRoleKey, path, isSuperAdmin);
  }, [v2RoleKey, orgRoleKey, isSuperAdmin, pathname]);

  // Si el rol del usuario no puede ver la URL actual, redirigirlo a su home
  // (en vez de mostrar la página con un warning).
  useEffect(() => {
    if (!isContextReady || !user) return;
    if (isSuperAdmin) return;
    if (!accessGuardWarning) return;
    if (!homeUrl) return;
    if (pathname && pathname.startsWith(homeUrl)) return; // ya estamos en home
    router.replace(homeUrl);
  }, [isContextReady, user, isSuperAdmin, accessGuardWarning, homeUrl, pathname, router]);

  if (!user) {
    return (
      <div
        className={styles.shell}
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
        className={styles.shell}
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
                    const userJson = user ? JSON.stringify(user) : null;
                    const panelHref = buildCrossPanelUrl(p.id, p.entryPath, userJson);
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
