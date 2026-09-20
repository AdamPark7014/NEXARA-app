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
import ModuleGuideBanner from "@/components/ModuleGuideBanner";
import { NEXARA_LOGO_MARK } from "@/lib/brand";
import { CORE_SURFACE_ONLY } from "@/lib/core-surface";
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
  moduleShownInIntegraSidebar,
  getCachedProvider,
  subscribeCapabilities,
  subscribeProvider,
} from "@/app/(panels)/integra/_caps";
import type { IntegraCapabilities } from "@/app/(panels)/integra/_lib";
import { getUserHomeUrlAbsolute } from "@/lib/panel-home";
import type { User } from "@/components/UserContext";
import { buildCrossPanelUrl, detectCurrentPanelId, isCrossPanelHref, resolveCrossPanelHref } from "@/lib/cross-panel-handoff";
import { buildFreshLoginUrl } from "@/lib/tab-session";
import { buildApiUrl } from "@/lib/api-base";
import { normalizeLegacyRelatedUrl } from "@/lib/legacy-path-remap";
import { rutaActivaDelMenu } from "@/lib/menu-activo";
import {
  fetchMeNavigationAuthed,
  filterModulesByNavigation,
  type MeNavigation,
} from "@/lib/me-navigation";
import {
  readNavMode,
  writeNavMode,
  subscribeNavMode,
  type NavMode,
} from "@/lib/nav-mode";
import styles from "./AppShell.module.scss";
import CommandPalette from "./CommandPalette";
import ShellConnectionStatus from "./ShellConnectionStatus";
import CelebracionesBanner from "./CelebracionesBanner";
import { ModuleIcon } from "./ShellIcons";
import { IconBadge } from "@/components/ui/IconBadge";
import NotificationKindIcon from "@/components/ui/NotificationKindIcon";
import { stripLeadingEmoji } from "@/lib/notification-kind";
import SearchIcon from "@mui/icons-material/Search";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import SwitchAccountOutlinedIcon from "@mui/icons-material/SwitchAccountOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";

type AppShellProps = {
  panel: PanelId;
  children: React.ReactNode;
};

/**
 * Grupos que son navegación secundaria, no módulos de trabajo: caen al final
 * del menú y bajan de tono. El id lo genera `buildUserSidebar` a partir del
 * título del grupo («Mi cuenta» → `mi-cuenta`); si un panel no lo trae, el
 * grupo se pinta como cualquier otro. Es solo un gancho visual.
 */
const SECONDARY_NAV_GROUP_IDS = new Set(["mi-cuenta"]);

type NotifPreviewItem = {
  id: number;
  title: string;
  message: string;
  category?: string | null;
  isRead: boolean;
  createdAt: string;
  relatedUrl?: string | null;
};

export default function AppShell({ panel, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isContextReady, sessionExpiringSoon, extendSession, sessionEndedMessage, clearSessionEndedMessage } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const [extendingSession, setExtendingSession] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifPreview, setNotifPreview] = useState<NotifPreviewItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [navMode, setNavMode] = useState<NavMode>("operativo");
  const drawerRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    setNavMode(readNavMode());
    return subscribeNavMode(setNavMode);
  }, []);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [serverNav, setServerNav] = useState<MeNavigation | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.token) return;
    const loadUnread = async () => {
      try {
        const res = await fetch(buildApiUrl("notifications/count/unread"), {
          credentials: "include",
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

  useEffect(() => {
    if (!user?.token) {
      setServerNav(null);
      return;
    }
    let cancelled = false;
    void fetchMeNavigationAuthed(user.token).then((nav) => {
      if (!cancelled) setServerNav(nav);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.token]);

  const loadNotifPreview = async () => {
    if (!user?.token) return;
    setNotifLoading(true);
    try {
      const res = await fetch(buildApiUrl("notifications?limit=8"), {
        credentials: "include",
        headers: { Authorization: `Bearer ${user.token}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const items: NotifPreviewItem[] = Array.isArray(data) ? data : (data?.data ?? []);
      // Abrir la campana cuenta como «ya las vi»: se marcan todas como leídas en el servidor y el
      // contador baja a 0, pero en esta vista las nuevas siguen resaltadas para distinguirlas.
      setNotifPreview(items);
      if (items.some((n) => !n.isRead) || unreadNotifs > 0) {
        setUnreadNotifs(0);
        void fetch(buildApiUrl("notifications/read/all"), {
          method: "PATCH",
          credentials: "include",
          headers: { Authorization: `Bearer ${user.token}` },
        }).catch(() => undefined);
      }
    } catch {
      /* non-critical */
    } finally {
      setNotifLoading(false);
    }
  };

  const openNotifPreview = async (n: NotifPreviewItem) => {
    if (!user?.token) return;
    if (!n.isRead) {
      try {
        await fetch(buildApiUrl(`notifications/${n.id}/read`), {
          method: "PATCH",
          credentials: "include",
          headers: { Authorization: `Bearer ${user.token}` },
        });
        setNotifPreview((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
        );
        setUnreadNotifs((c) => Math.max(0, c - 1));
      } catch {
        /* non-critical */
      }
    }
    if (!n.relatedUrl) return;
    const normalized = normalizeLegacyRelatedUrl(n.relatedUrl);
    const current = detectCurrentPanelId(pathname) ?? panel;
    const userJson = JSON.stringify(user);
    setNotifOpen(false);
    if (isCrossPanelHref(normalized, current)) {
      window.location.assign(resolveCrossPanelHref(normalized, userJson, current));
      return;
    }
    router.push(resolveCrossPanelHref(normalized, null, current));
  };

  const panelMeta = PANEL_META[panel];

  useEffect(() => {
    setMobileOpen(false);
    setSwitcherOpen(false);
    setUserMenuOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
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
        setNotifOpen(false);
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

  // Focus trap + restore for mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const focusables = drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first?.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || focusables.length === 0) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      document.removeEventListener("keydown", onTab);
      menuBtnRef.current?.focus();
    };
  }, [mobileOpen]);

  const orgRoleKey = useMemo(() => {
    if (!user) return null;
    return resolveDisplayOrgRoleKey(user);
  }, [user]);

  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const v2RoleKey = resolveV2RoleKey(user);

  const [integraCaps, setIntegraCaps] = useState<IntegraCapabilities | null>(null);
  const [integraProvider, setIntegraProvider] = useState<string | null>(null);
  useEffect(() => {
    if (panel !== "integra") return;
    setIntegraCaps(getCachedCapabilities());
    setIntegraProvider(getCachedProvider());
    const u1 = subscribeCapabilities((c) => setIntegraCaps(c));
    const u2 = subscribeProvider((p) => setIntegraProvider(p));
    return () => {
      u1();
      u2();
    };
  }, [panel]);

  const sidebarGroups = useMemo(() => {
    const groups = buildUserSidebar(panel, user);
    // Integración: misma fuente /me/navigation (webModuleIds + paths), no clip por claves Android.
    const filteredByNav = !serverNav
      ? groups
      : groups
          .map((g) => ({
            ...g,
            items: filterModulesByNavigation(g.items, serverNav),
          }))
          .filter((g) => g.items.length > 0);

    if (panel !== "integra" || !integraCaps) return filteredByNav;
    const isClient = v2RoleKey === "cliente";
    return filteredByNav
      .map((g) => ({
        ...g,
        items: g.items.filter((item) =>
          moduleShownInIntegraSidebar(item.id, integraCaps, {
            isClient,
            provider: integraProvider,
          }),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [panel, user, integraCaps, integraProvider, v2RoleKey, serverNav, navMode]);

  const allowedPanels = useMemo(
    () => getUserAllowedPanels(user),
    [user],
  );

  const homeUrl = useMemo(() => getUserHomePath(user), [user]);
  const canAccessPanel = useMemo(() => canUserAccessPanel(user, panel), [user, panel]);
  const panelEntryPath = useMemo(() => getUserPanelEntryPath(user, panel), [user, panel]);
  const notificationsUrl = useMemo(() => {
    const erpTarget = "/erp/notifications-center";
    const panelTarget = `/${panel}/notifications-center`;
    if (
      !canUserAccessPath(user, erpTarget) &&
      !canUserAccessPath(user, panelTarget)
    ) {
      return null;
    }
    const userJson = user ? JSON.stringify(user) : null;
    return buildCrossPanelUrl("erp", erpTarget, userJson);
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
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <IconBadge icon={LockOutlinedIcon} size={56} />
              </div>
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

  const roleLabel = getUserRoleLabel(user);

  // Solo la opción más específica: en «KPIs del equipo» no se marca también «Asistencias».
  const activeMenuTarget = rutaActivaDelMenu(
    pathname,
    filteredGroups.flatMap((group) => group.items.map((item) => getModuleUrl(item.id))),
  );

  const handleLogout = () => {
    logout?.();
    router.replace("/login");
  };

  const isChatRoute = Boolean(pathname && /\/chat(\/|$)/.test(pathname));
  const isFullBleed = isChatRoute;

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
      data-panel={panel}
      style={{ "--panel-accent": panelMeta.accent } as React.CSSProperties}
    >
      <a href="#nx-main" className={styles.skipToMain}>
        Saltar al contenido
      </a>

      {(sessionExpiringSoon || sessionEndedMessage) && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "10px 16px",
            background: sessionEndedMessage
              ? "color-mix(in srgb, var(--danger) 14%, var(--surface))"
              : "color-mix(in srgb, var(--warning) 16%, var(--surface))",
            borderBottom: "1px solid var(--nx-panel-hairline)",
            fontSize: 13,
            zIndex: 200,
          }}
        >
          <span>
            {sessionEndedMessage ??
              "Tu sesión está por expirar. Extiéndela para no perder el trabajo."}
          </span>
          {sessionExpiringSoon && user && (
            <button
              type="button"
              disabled={extendingSession}
              onClick={async () => {
                setExtendingSession(true);
                await extendSession();
                setExtendingSession(false);
              }}
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                borderRadius: 8,
                padding: "6px 12px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {extendingSession ? "Extendiendo…" : "Extender sesión"}
            </button>
          )}
          {sessionEndedMessage && (
            <button
              type="button"
              onClick={() => clearSessionEndedMessage()}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cerrar
            </button>
          )}
        </div>
      )}

      {/* ───────── SIDEBAR ───────── */}
      <aside
        ref={drawerRef}
        id="nx-sidebar-nav"
        className={styles.sidebar}
        {...(mobileOpen
          ? { role: "dialog", "aria-modal": true, "aria-label": "Menú de navegación" }
          : { "aria-label": "Navegación del panel" })}
      >
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
          {/* Solo en el cajón: cerrar sin tener que acertarle al velo. */}
          <button
            type="button"
            className={styles.drawerClose}
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
            title="Cerrar menú"
          >
            <CloseIcon aria-hidden="true" sx={{ fontSize: 20 }} />
          </button>
        </div>

        <div className={styles.search}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">
              <SearchIcon aria-hidden="true" sx={{ fontSize: 16, display: "block" }} />
            </span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Filtrar…"
              aria-label="Filtrar el menú"
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
            />
          </div>
        </div>

        <nav className={styles.menu} aria-label="Menú principal">
          {filteredGroups.length === 0 ? (
            <p className={styles.menuEmpty}>
              {navQuery.trim()
                ? `Sin resultados para «${navQuery.trim()}».`
                : "Sin módulos disponibles para tu rol."}
            </p>
          ) : (
            filteredGroups.map((group) => {
              const groupLabelId = `nx-nav-group-${group.id}`;
              return (
                <div
                  key={group.id}
                  className={styles.group}
                  role="group"
                  aria-labelledby={groupLabelId}
                  data-kind={SECONDARY_NAV_GROUP_IDS.has(group.id) ? "secondary" : undefined}
                >
                  <p className={styles.groupTitle} id={groupLabelId}>
                    {group.title}
                  </p>
                  {group.items.map((item) => {
                    const target = getModuleUrl(item.id);
                    const active = target === activeMenuTarget;
                    return (
                      <Link
                        key={item.id}
                        href={target}
                        className={`${styles.menuItem} ${active ? styles.active : ""}`.trim()}
                        aria-current={active ? "page" : undefined}
                        // Colapsado el renglón es solo un icono: el globo dice el nombre.
                        title={collapsed ? item.label : item.description || undefined}
                      >
                        <span className={styles.menuItemIcon} aria-hidden="true">
                          <ModuleIcon id={item.id} size={16} />
                        </span>
                        <span className={styles.menuItemLabel}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            })
          )}
        </nav>

        <div className={styles.userBlock} ref={userMenuRef}>
          {/* Todo el bloque es el disparador: también funciona colapsado,
              donde antes el botón de tres puntos desaparecía y dejaba el
              menú de cuenta (y el cierre de sesión) sin acceso. */}
          <button
            type="button"
            className={styles.userTrigger}
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            title={`${user.nombre || user.email} · ${roleLabel}`}
          >
            <span className={styles.avatar} aria-hidden="true">
              {initials || "U"}
            </span>
            <span className={styles.userInfo}>
              <span className={styles.userName}>{user.nombre || user.email}</span>
              <span className={styles.userRole}>{roleLabel}</span>
            </span>
            <span className={styles.userTriggerIcon} aria-hidden="true">
              <MoreVertIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            </span>
          </button>

          {userMenuOpen && (
            <div role="menu" aria-label="Cuenta" className={styles.userMenu}>
              <Link
                href={profileUrl ?? homeUrl}
                role="menuitem"
                onClick={() => setUserMenuOpen(false)}
                className={styles.userMenuItem}
              >
                <span className={styles.userMenuItemIcon} aria-hidden="true">
                  <PersonOutlineIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                </span>
                Mi perfil
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={toggleDarkMode}
                className={styles.userMenuItem}
              >
                <span className={styles.userMenuItemIcon} aria-hidden="true">
                  {darkMode ? (
                    <LightModeOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                  ) : (
                    <DarkModeOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                  )}
                </span>
                {darkMode ? "Modo claro" : "Modo oscuro"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const next = navMode === "avanzado" ? "operativo" : "avanzado";
                  writeNavMode(next);
                  setNavMode(next);
                }}
                className={styles.userMenuItem}
                data-state={navMode === "avanzado" ? "on" : undefined}
                aria-pressed={navMode === "avanzado"}
              >
                <span className={styles.userMenuItemIcon} aria-hidden="true">
                  <TuneOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                </span>
                Menú avanzado
                {navMode === "avanzado" && (
                  <span className={styles.userMenuState} aria-hidden="true" />
                )}
              </button>
              <Link
                href={buildFreshLoginUrl()}
                role="menuitem"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setUserMenuOpen(false)}
                className={styles.userMenuItem}
                title="Se abre en una pestaña nueva"
              >
                <span className={styles.userMenuItemIcon} aria-hidden="true">
                  <SwitchAccountOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                </span>
                Cambiar de cuenta
              </Link>
              <hr className={styles.userMenuSep} />
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className={styles.userMenuItem}
                data-variant="danger"
              >
                <span className={styles.userMenuItemIcon} aria-hidden="true">
                  <LogoutIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                </span>
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
          ref={menuBtnRef}
          className={styles.mobileMenuBtn}
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileOpen}
          aria-controls="nx-sidebar-nav"
        >
          <MenuIcon aria-hidden="true" sx={{ fontSize: 20 }} />
        </button>

        <button
          type="button"
          className={styles.collapseBtn}
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          {collapsed ? (
            <ChevronRightIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          ) : (
            <ChevronLeftIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          )}
        </button>

        <Breadcrumbs panel={panel} pathname={pathname || ""} panelHome={panelEntryPath} />

        <div className={styles.topbarActions}>
          {/* Core ola1: solo NEXARA — sin selector multi-empresa (Demo). */}
          {!CORE_SURFACE_ONLY ? <CompanySwitcher compact /> : null}

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
                <span className={styles.switcherBtnIcon} aria-hidden="true">
                  <AppsOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                </span>
                <span>{panelMeta.name.replace(/^NEXARA\s+/i, "")}</span>
                <KeyboardArrowDownIcon aria-hidden="true" sx={{ fontSize: 16, opacity: 0.6 }} />
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
                        <span className={styles.switcherItemIcon} aria-hidden="true" style={{ color: p.accent }}>
                          <AppsOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                        </span>
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
            <SearchIcon aria-hidden="true" sx={{ fontSize: 16 }} />
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
            {darkMode ? (
              <LightModeOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            ) : (
              <DarkModeOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            )}
          </button>

          {notificationsUrl && (
            <div ref={notifRef} style={{ position: "relative" }}>
              <button
                type="button"
                className={styles.iconBtn}
                title="Notificaciones"
                aria-label="Notificaciones"
                aria-haspopup="dialog"
                aria-expanded={notifOpen}
                style={{ position: "relative" }}
                onClick={() => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next) void loadNotifPreview();
                }}
              >
                <NotificationsNoneOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
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
              </button>
              {notifOpen && (
                <div
                  role="dialog"
                  aria-label="Notificaciones recientes"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    width: 340,
                    maxWidth: "min(340px, 92vw)",
                    background: "var(--surface)",
                    border: "1px solid var(--nx-panel-hairline)",
                    borderRadius: 14,
                    boxShadow: "0 8px 28px rgba(8,24,38,0.16)",
                    zIndex: 60,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid var(--nx-panel-hairline)",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    Notificaciones
                  </div>
                  <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {notifLoading && (
                      <div style={{ padding: 16, fontSize: 13, color: "var(--text-secondary)" }}>
                        Cargando…
                      </div>
                    )}
                    {!notifLoading && notifPreview.length === 0 && (
                      <div style={{ padding: 16, fontSize: 13, color: "var(--text-secondary)" }}>
                        Sin notificaciones recientes.
                      </div>
                    )}
                    {!notifLoading &&
                      notifPreview.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => void openNotifPreview(n)}
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "flex-start",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 14px",
                            border: "none",
                            borderBottom: "1px solid var(--nx-panel-hairline-soft)",
                            background: n.isRead
                              ? "transparent"
                              : "color-mix(in srgb, var(--primary) 6%, transparent)",
                            cursor: n.relatedUrl ? "pointer" : "default",
                            fontFamily: "inherit",
                            color: "inherit",
                          }}
                        >
                          <NotificationKindIcon category={n.category} title={n.title} size={30} muted={n.isRead} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{stripLeadingEmoji(n.title)}</div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--text-secondary)",
                                marginTop: 2,
                                lineHeight: 1.35,
                              }}
                            >
                              {stripLeadingEmoji(n.message)}
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                  <div style={{ padding: 10, borderTop: "1px solid var(--nx-panel-hairline)" }}>
                    {notificationsUrl.startsWith("http") || notificationsUrl.includes("?_nxt=") ? (
                      <a
                        href={notificationsUrl}
                        style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}
                        onClick={() => setNotifOpen(false)}
                      >
                        Ver todas →
                      </a>
                    ) : (
                      <Link
                        href={notificationsUrl}
                        style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}
                        onClick={() => setNotifOpen(false)}
                      >
                        Ver todas →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ───────── MAIN ───────── */}
      <main id="nx-main" className={`${styles.main}${isFullBleed ? ` ${styles.mainFullBleed}` : ""}`} tabIndex={-1}>
        <div className={`${styles.contentInner}${isFullBleed ? ` ${styles.contentInnerFullBleed}` : ""}`}>
          {/* Core (/erp): cumpleaños y aniversarios de hoy; el chat a pantalla completa no lo lleva. */}
          {!isFullBleed && panel === "erp" ? <CelebracionesBanner token={user.token} userId={user.id} /> : null}
          {!isFullBleed && <ModuleGuideBanner />}
          {children}
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        user={user}
        token={user.token}
        navigation={serverNav}
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
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <IconBadge icon={BlockOutlinedIcon} size={60} color="var(--danger, #dc2626)" />
            </div>
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
        // Un id numérico (/indicadores/21, /cotizaciones/7) no dice nada: «Detalle».
        const label = moduleHit?.label || (/^\d+$/.test(seg) ? "Detalle" : humanize(seg));
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
  kb: "Base de conocimiento",
  rh: "RRHH",
  audit: "Auditoría",
  exports: "Exportaciones",
  documents: "Documentos",
  settings: "Configuración",
  billing: "Facturación",
  webhooks: "Webhooks",
  "api-keys": "Claves API",
  architecture: "Mapa del sistema",
  notifications: "Notificaciones",
  "notifications-center": "Notificaciones",
  facilities: "Instalaciones",
  access: "Accesos",
  banking: "Bancos",
  accounting: "Contabilidad",
  invoicing: "Facturación",
  procurement: "Compras",
  warehouse: "Almacén",
  companies: "Empresas",
  approvals: "Aprobaciones",
  attendance: "Asistencia",
  "lunch-breaks": "Comidas",
  fines: "Incidencias",
  orgchart: "Organigrama",
  viatics: "Viáticos",
  expenses: "Gastos",
  "employee-payments": "Pagos a personal",
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
