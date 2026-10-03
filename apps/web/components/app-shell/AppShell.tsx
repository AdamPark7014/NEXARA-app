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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { useTheme } from "@/components/ThemeContext";
import CompanySwitcher from "@/components/CompanySwitcher";
import { cargarContextoAlta } from "@/lib/delegated-users-api";
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
  resolveV2RoleKey,
} from "@/lib/user-access";
import {
  getCachedCapabilities,
  moduleShownInIntegraSidebar,
  getCachedProvider,
  subscribeCapabilities,
  subscribeProvider,
} from "@/lib/integra-shared/_caps";
import type { IntegraCapabilities } from "@/lib/integra-shared/_lib";
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
import ShellConnectionStatus from "./ShellConnectionStatus";
import CelebracionesBanner from "./CelebracionesBanner";
import { ModuleIcon, ShellIcon } from "./ShellIcons";
import {
  CHAT_MODULE_IDS,
  DEFAULT_FOLDED_GROUP_IDS,
  formatNavCount,
  presentSidebarGroups,
  readFoldedGroups,
  writeFoldedGroups,
} from "./sidebar-presentation";
import { IconBadge } from "@/components/ui/IconBadge";
import NotificationKindIcon from "@/components/ui/NotificationKindIcon";
import { stripLeadingEmoji } from "@/lib/notification-kind";
import { resolveUserAvatarUrl } from "@/lib/user-avatar";
import { listMyPendingApprovals } from "@/lib/workflow-api";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";

/** La paleta solo se descarga la primera vez que alguien la abre (⌘K o «Buscar…»). */
const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });

const COLLAPSED_STORAGE_KEY = "nx-shell-collapsed";

/** Acción principal de la barra superior en Core. */
const NEW_ACTIVITY_PATH = "/erp/mis-actividades/nueva";
/** Listas que ya traen su propio «Nuevo» como primario: un solo primario por pantalla. */
const OWN_PRIMARY_ROUTE_RE = /^\/erp\/(clientes|cotizaciones|proyectos|mis-actividades\/nueva)(\/|$)/;

type RailTip = { text: string; meta?: string; kbd?: string; top: number };
type NavCount = { text: string; tone: "neutral" | "hot"; label: string };

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
  const [foldedGroups, setFoldedGroups] = useState<Set<string>>(() => new Set(DEFAULT_FOLDED_GROUP_IDS));
  const [chatUnread, setChatUnread] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [online, setOnline] = useState(true);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [railTip, setRailTip] = useState<RailTip | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMounted, setPaletteMounted] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [serverNav, setServerNav] = useState<MeNavigation | null>(null);
  /** Dirección o quien tenga gente a su cargo con tipos concedidos: «Mi perfil» pasa a «Perfiles». */
  const [puedePerfiles, setPuedePerfiles] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (paletteOpen) setPaletteMounted(true);
  }, [paletteOpen]);

  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) setShortcutLabel("⌘K");
  }, []);

  // El riel colapsado se recuerda entre visitas (solo escritorio).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      /* almacenamiento bloqueado: se queda expandido */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setRailTip(null);
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* sin almacenamiento: vale para esta sesión */
      }
      return next;
    });
  }, []);

  // Grupos plegados («Mi cuenta» de fábrica); se recuerdan entre visitas.
  useEffect(() => {
    setFoldedGroups(readFoldedGroups());
  }, []);

  const toggleGroupFold = useCallback((groupId: string) => {
    setFoldedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      writeFoldedGroups(next);
      return next;
    });
  }, []);

  // Presencia propia: el punto de la foto dice si esta pestaña está conectada.
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.avatarUrl]);

  // Riel colapsado: globo con el nombre (y contador) junto al icono. Fijo a la ventana para que
  // el scroll del menú no lo recorte.
  const showRailTip = useCallback(
    (e: React.SyntheticEvent<HTMLElement>, text: string, extra?: { meta?: string; kbd?: string }) => {
      if (!collapsed || window.matchMedia("(max-width: 900px)").matches) return;
      const r = e.currentTarget.getBoundingClientRect();
      setRailTip({ text, meta: extra?.meta, kbd: extra?.kbd, top: r.top + r.height / 2 });
    },
    [collapsed],
  );
  const hideRailTip = useCallback(() => setRailTip(null), []);

  // Con el cajón abierto la página de atrás no se desplaza (iOS arrastraba el fondo).
  useEffect(() => {
    if (!mobileOpen) return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

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

  useEffect(() => {
    if (!user?.token || panel !== "erp") {
      setPuedePerfiles(false);
      return;
    }
    let cancelled = false;
    void cargarContextoAlta(user.token).then((ctx) => {
      if (!cancelled) setPuedePerfiles(ctx.puede);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.token, panel]);

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
    setRailTip(null);
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

  // Solo presentación: orden de grupos y renglones de la maqueta aprobada. Los módulos son los mismos.
  const navGroups = useMemo(() => presentSidebarGroups(sidebarGroups, panel), [sidebarGroups, panel]);

  const accessGuardWarning = useMemo(() => {
    const path = pathname || "/";
    return !canUserAccessPath(user, path);
  }, [user, pathname]);

  // Solo la opción más específica: en «KPIs del equipo» no se marca también «Asistencias».
  const activeMenuTarget = useMemo(
    () =>
      rutaActivaDelMenu(
        pathname,
        navGroups.flatMap((group) => group.items.map((item) => getModuleUrl(item.id))),
      ),
    [pathname, navGroups],
  );

  const activeGroup = useMemo(
    () => navGroups.find((g) => g.items.some((item) => getModuleUrl(item.id) === activeMenuTarget)) ?? null,
    [navGroups, activeMenuTarget],
  );

  // Si la página actual vive en un grupo plegado, el grupo se abre (sin tocar la preferencia guardada).
  useEffect(() => {
    if (!activeGroup) return;
    setFoldedGroups((prev) => {
      if (!prev.has(activeGroup.id)) return prev;
      const next = new Set(prev);
      next.delete(activeGroup.id);
      return next;
    });
  }, [activeGroup]);

  // Al entrar a un módulo que está al fondo del menú, el renglón activo queda a la vista.
  useEffect(() => {
    const active = menuRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [activeMenuTarget]);

  const userJson = useMemo(() => (user ? JSON.stringify(user) : null), [user]);

  // ── Contadores del menú (solo de endpoints que ya existen) ──────────────
  const menuModuleIds = useMemo(
    () => new Set<string>(sidebarGroups.flatMap((g) => g.items.map((item) => item.id))),
    [sidebarGroups],
  );
  const showsChat = useMemo(() => [...menuModuleIds].some((id) => CHAT_MODULE_IDS.has(id)), [menuModuleIds]);
  const showsApprovals = menuModuleIds.has("approvals");
  const onChatRoute = Boolean(pathname && /\/chat(\/|$)/.test(pathname));

  // Chat: suma de `unreadCount` de `GET chat/channels` (lo mismo que pinta la lista del chat).
  // En el chat mismo no se consulta: al salir se vuelve a leer.
  useEffect(() => {
    if (!user?.token || !showsChat || onChatRoute) return;
    const token = user.token;
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(buildApiUrl("chat/channels"), {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (cancelled || !Array.isArray(data)) return;
        const total = (data as Array<{ unreadCount?: number; muted?: boolean }>).reduce(
          (sum, c) => sum + (c?.muted ? 0 : Number(c?.unreadCount ?? 0) || 0),
          0,
        );
        setChatUnread(total);
      } catch {
        /* non-critical */
      }
    };
    void load();
    const id = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.token, showsChat, onChatRoute]);

  // Aprobaciones: `GET workflow/my-pending` (la misma bandeja de /erp/approvals).
  useEffect(() => {
    if (!user?.token || !showsApprovals) {
      setPendingApprovals(0);
      return;
    }
    const token = user.token;
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const rows = await listMyPendingApprovals(token);
        if (!cancelled) setPendingApprovals(rows.length);
      } catch {
        /* non-critical */
      }
    };
    void load();
    const id = window.setInterval(load, 120000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.token, showsApprovals, activeMenuTarget]);

  const navCounts = useMemo(() => {
    const counts: Record<string, NavCount> = {};
    const chat = onChatRoute ? null : formatNavCount(chatUnread);
    if (chat) {
      for (const id of CHAT_MODULE_IDS) counts[id] = { text: chat, tone: "neutral", label: `${chatUnread} sin leer` };
    }
    const approvals = formatNavCount(pendingApprovals);
    if (approvals) counts.approvals = { text: approvals, tone: "hot", label: `${pendingApprovals} por decidir` };
    const notifs = formatNavCount(unreadNotifs);
    if (notifs) counts["notifications-center"] = { text: notifs, tone: "neutral", label: `${unreadNotifs} sin leer` };
    return counts;
  }, [onChatRoute, chatUnread, pendingApprovals, unreadNotifs]);

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
          <div className={`${styles.contentInner} ${styles.stateScreen}`} role="status" aria-live="polite">
            <div className={styles.stateCard}>
              <span className={styles.stateSpinner} aria-hidden="true" />
              <div className={styles.stateTitle}>
                {isContextReady ? "Te llevamos a iniciar sesión…" : "Cargando tu sesión…"}
              </div>
              <div className={styles.stateMeta}>NEXARA · {panelMeta.name}</div>
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
          <div className={`${styles.contentInner} ${styles.stateScreen}`}>
            <div className={styles.stateCard}>
              <IconBadge icon={LockOutlinedIcon} size={56} />
              <h1 className={styles.stateHeading}>Tu cuenta todavía no tiene un rol</h1>
              <p className={styles.stateText}>
                Entraste como <strong>{user.email}</strong>, pero aún no te asignan permisos. Pide a tu
                administrador que te asigne un rol desde <em>ERP · Usuarios</em>.
              </p>
              <div className={styles.stateActions}>
                <button
                  type="button"
                  className={styles.stateBtn}
                  onClick={() => {
                    logout?.();
                    router.replace("/login");
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

  const handleLogout = () => {
    logout?.();
    router.replace("/login");
  };

  const isChatRoute = onChatRoute;
  const isFullBleed = isChatRoute;

  const panelName = panelMeta.name.replace(/^NEXARA\s+/i, "");
  const avatarSrc = avatarFailed ? "" : resolveUserAvatarUrl(user.avatarUrl);
  const presence = !online || user.offlineDegraded ? "away" : "on";
  const presenceLabel = presence === "on" ? "En línea" : "Sin conexión";
  const showNewActivity =
    panel === "erp" &&
    canUserAccessPath(user, NEW_ACTIVITY_PATH) &&
    !OWN_PRIMARY_ROUTE_RE.test(pathname || "");

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
          className={styles.sessionBanner}
          data-tone={sessionEndedMessage ? "danger" : "warning"}
        >
          <span>
            {sessionEndedMessage ??
              "Tu sesión está por terminar. Extiéndela para no perder lo que estás haciendo."}
          </span>
          {sessionExpiringSoon && user && (
            <button
              type="button"
              className={styles.sessionBannerBtn}
              disabled={extendingSession}
              aria-busy={extendingSession || undefined}
              onClick={async () => {
                setExtendingSession(true);
                await extendSession();
                setExtendingSession(false);
              }}
            >
              {extendingSession ? "Extendiendo…" : "Extender sesión"}
            </button>
          )}
          {sessionEndedMessage && (
            <button
              type="button"
              className={styles.sessionBannerDismiss}
              onClick={() => clearSessionEndedMessage()}
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
        <div className={styles.brand} ref={switcherRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.brandLogoMark} src={NEXARA_LOGO_MARK} alt="" aria-hidden="true" />
          <div className={styles.brandText}>
            <div className={styles.brandName}>NEXARA</div>
            {allowedPanels.length > 1 ? (
              <button
                type="button"
                className={styles.brandPanelBtn}
                onClick={() => setSwitcherOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={switcherOpen}
                title="Cambiar de panel"
              >
                <span className={styles.brandPanel}>{panelName}</span>
                <ShellIcon name="chevrons" size={14} />
              </button>
            ) : (
              <div className={styles.brandPanel}>{panelName}</div>
            )}
          </div>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Mostrar el menú completo" : "Reducir el menú a iconos"}
            aria-controls="nx-sidebar-nav"
            aria-expanded={!collapsed}
            title={collapsed ? "Mostrar menú" : "Reducir menú"}
          >
            <ShellIcon name={collapsed ? "sidebarOpen" : "sidebar"} size={16} />
          </button>
          {/* Solo en el cajón: cerrar sin tener que acertarle al velo. */}
          <button
            type="button"
            className={styles.drawerClose}
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
            title="Cerrar menú"
          >
            <ShellIcon name="x" size={20} />
          </button>

          {switcherOpen && (
            <div className={styles.switcherDropdown} role="menu">
              <div className={styles.switcherTitle}>Mis paneles</div>
              {allowedPanels.map((p) => {
                const isCurrent = p.id === panel;
                const isHome = homeUrl.startsWith(`/${p.id}`);
                const panelHref = buildCrossPanelUrl(p.id, getUserPanelSwitchPath(user, p.id), userJson);
                return (
                  <a
                    key={p.id}
                    href={panelHref}
                    className={styles.switcherItem}
                    role="menuitem"
                    aria-current={isCurrent ? "page" : undefined}
                    data-current={isCurrent ? "true" : "false"}
                  >
                    <span className={styles.switcherItemIcon} aria-hidden="true" style={{ color: p.accent }}>
                      <ShellIcon name="grid" size={18} />
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

        <div className={styles.search}>
          <button
            type="button"
            className={styles.searchBtn}
            onClick={() => {
              setMobileOpen(false);
              setPaletteOpen(true);
            }}
            aria-label="Buscar o ir a… (módulos, clientes y acciones)"
            aria-keyshortcuts="Control+K Meta+K"
            aria-haspopup="dialog"
            aria-expanded={paletteOpen}
            onMouseEnter={(e) => showRailTip(e, "Buscar o ir a…", { kbd: shortcutLabel })}
            onMouseLeave={hideRailTip}
            onFocus={(e) => showRailTip(e, "Buscar o ir a…", { kbd: shortcutLabel })}
            onBlur={hideRailTip}
          >
            <ShellIcon name="search" size={16} />
            <span className={styles.searchLabel}>Buscar o ir a…</span>
            <kbd className={styles.kbd} aria-hidden="true">
              {shortcutLabel}
            </kbd>
          </button>
        </div>

        <nav ref={menuRef} className={styles.menu} aria-label="Menú principal" onScroll={hideRailTip}>
          {navGroups.length === 0 ? (
            <p className={styles.menuEmpty}>Sin módulos disponibles para tu rol.</p>
          ) : (
            navGroups.map((group) => {
              const groupLabelId = `nx-nav-group-${group.id}`;
              const listId = `nx-nav-list-${group.id}`;
              const folded = foldedGroups.has(group.id);
              return (
                <div
                  key={group.id}
                  className={styles.group}
                  role="group"
                  aria-labelledby={groupLabelId}
                  data-kind={SECONDARY_NAV_GROUP_IDS.has(group.id) ? "secondary" : undefined}
                  data-folded={folded ? "true" : undefined}
                >
                  <button
                    type="button"
                    className={styles.groupTitle}
                    id={groupLabelId}
                    aria-expanded={!folded}
                    aria-controls={listId}
                    onClick={() => toggleGroupFold(group.id)}
                  >
                    <span className={styles.groupTitleText}>{group.title}</span>
                    <span className={styles.groupChevron} aria-hidden="true">
                      <ShellIcon name="right" size={14} />
                    </span>
                  </button>
                  <div id={listId} className={styles.groupItems} hidden={folded}>
                    {group.items.map((item) => {
                      // Quien tiene gente a su cargo entra a «Perfiles» en vez del formulario de un
                      // solo perfil: ahí da de alta, cambia fotos y llega al suyo.
                      const esPerfiles = item.id === "my-profile" && puedePerfiles;
                      const target = esPerfiles ? "/erp/perfiles" : getModuleUrl(item.id);
                      const etiqueta = esPerfiles ? "Perfiles" : item.label;
                      const active = target === activeMenuTarget;
                      const count = navCounts[item.id];
                      return (
                        <Link
                          key={item.id}
                          href={target}
                          className={`${styles.menuItem} ${active ? styles.active : ""}`.trim()}
                          aria-current={active ? "page" : undefined}
                          // Colapsado el renglón es solo un icono: el globo (railTip) dice el nombre.
                          title={collapsed ? undefined : (esPerfiles ? "Tu perfil y el de tu gente" : item.description) || undefined}
                          onMouseEnter={(e) => showRailTip(e, etiqueta, { meta: count?.label })}
                          onMouseLeave={hideRailTip}
                          onFocus={(e) => showRailTip(e, etiqueta, { meta: count?.label })}
                          onBlur={hideRailTip}
                        >
                          <span className={styles.menuItemIcon} aria-hidden="true">
                            <ModuleIcon id={item.id} size={18} />
                          </span>
                          <span className={styles.menuItemLabel}>{etiqueta}</span>
                          {count ? (
                            <>
                              <span className={styles.navCount} data-tone={count.tone} aria-hidden="true">
                                {count.text}
                              </span>
                              <span className={styles.srOnly}>, {count.label}</span>
                            </>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </nav>

        {railTip ? (
          <div className={styles.railTip} style={{ top: railTip.top }} role="tooltip">
            <span>{railTip.meta ? `${railTip.text} · ${railTip.meta}` : railTip.text}</span>
            {railTip.kbd ? <kbd className={styles.railTipKbd}>{railTip.kbd}</kbd> : null}
          </div>
        ) : null}

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
            title={`${user.nombre || user.email} · ${roleLabel} · ${presenceLabel}`}
          >
            <span className={styles.avatar} aria-hidden="true">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.avatarImg} src={avatarSrc} alt="" onError={() => setAvatarFailed(true)} />
              ) : (
                initials || "U"
              )}
              <span className={styles.presence} data-state={presence} />
            </span>
            <span className={styles.userInfo}>
              <span className={styles.userName}>{user.nombre || user.email}</span>
              <span className={styles.userRole}>{roleLabel}</span>
              <span className={styles.srOnly}>, {presenceLabel}</span>
            </span>
            <span className={styles.userTriggerIcon} aria-hidden="true">
              <ShellIcon name="chevrons" size={16} />
            </span>
          </button>

          {userMenuOpen && (
            <div role="menu" aria-label="Cuenta" className={styles.userMenu}>
              <Link
                href={puedePerfiles ? "/erp/perfiles" : (profileUrl ?? homeUrl)}
                role="menuitem"
                onClick={() => setUserMenuOpen(false)}
                className={styles.userMenuItem}
                title={puedePerfiles ? "Tu perfil y el de tu gente" : undefined}
              >
                <span className={styles.userMenuItemIcon} aria-hidden="true">
                  <ShellIcon name="user" size={18} />
                </span>
                {puedePerfiles ? "Perfiles" : "Mi perfil"}
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={toggleDarkMode}
                className={styles.userMenuItem}
              >
                <span className={styles.userMenuItemIcon} aria-hidden="true">
                  <ShellIcon name={darkMode ? "sun" : "moon"} size={18} />
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
                  <ShellIcon name="sliders" size={18} />
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
                  <ShellIcon name="switchUser" size={18} />
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
                  <ShellIcon name="logout" size={18} />
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
          <ShellIcon name="menu" size={20} />
        </button>

        <Breadcrumbs
          panel={panel}
          pathname={pathname || ""}
          panelHome={panelEntryPath}
          groupTitle={activeGroup?.title ?? null}
        />

        <div className={styles.topbarActions}>
          {/* Core ola1: solo NEXARA — sin selector multi-empresa (Demo). */}
          {!CORE_SURFACE_ONLY ? <CompanySwitcher compact /> : null}

          <ShellConnectionStatus />

          {/* En escritorio el buscador vive en la barra lateral; en el teléfono, aquí. */}
          <button
            type="button"
            className={styles.paletteBtn}
            onClick={() => setPaletteOpen(true)}
            title={`Buscar (${shortcutLabel})`}
            aria-label="Buscar módulos, clientes y acciones"
            aria-keyshortcuts="Control+K Meta+K"
            aria-haspopup="dialog"
            aria-expanded={paletteOpen}
          >
            <ShellIcon name="search" size={18} />
          </button>

          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleDarkMode}
            aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={darkMode ? "Modo claro" : "Modo oscuro"}
          >
            <ShellIcon name={darkMode ? "sun" : "moon"} size={18} />
          </button>

          {notificationsUrl && (
            <div ref={notifRef} className={styles.popAnchor}>
              <button
                type="button"
                className={styles.iconBtn}
                title="Notificaciones"
                aria-label={
                  unreadNotifs > 0 ? `Notificaciones: ${unreadNotifs} sin leer` : "Notificaciones"
                }
                aria-haspopup="dialog"
                aria-expanded={notifOpen}
                onClick={() => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next) void loadNotifPreview();
                }}
              >
                <ShellIcon name="bell" size={18} />
                {unreadNotifs > 0 && <span className={styles.notifPip} aria-hidden="true" />}
              </button>
              {notifOpen && (
                <div role="dialog" aria-label="Notificaciones recientes" className={styles.notifPop}>
                  <div className={styles.notifHead}>Notificaciones</div>
                  <div className={styles.notifList} aria-busy={notifLoading || undefined}>
                    {notifLoading && (
                      <div className={styles.notifSkeletons} aria-label="Cargando notificaciones">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className={styles.notifSkeletonRow} aria-hidden="true">
                            <span className="ui-skeleton" data-shape="circle" style={{ width: 30, height: 30 }} />
                            <span className={styles.notifSkeletonText}>
                              <span className="ui-skeleton" style={{ width: "62%", height: 11 }} />
                              <span className="ui-skeleton" style={{ width: "88%", height: 10 }} />
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!notifLoading && notifPreview.length === 0 && (
                      <div className={styles.notifEmpty}>
                        <ShellIcon name="bell" size={22} />
                        <span>Estás al día. No hay avisos nuevos.</span>
                      </div>
                    )}
                    {!notifLoading &&
                      notifPreview.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className={styles.notifItem}
                          data-unread={n.isRead ? undefined : "true"}
                          data-link={n.relatedUrl ? "true" : undefined}
                          onClick={() => void openNotifPreview(n)}
                        >
                          <NotificationKindIcon category={n.category} title={n.title} size={30} muted={n.isRead} />
                          <span className={styles.notifItemBody}>
                            <span className={styles.notifItemTitle}>{stripLeadingEmoji(n.title)}</span>
                            <span className={styles.notifItemText}>{stripLeadingEmoji(n.message)}</span>
                          </span>
                        </button>
                      ))}
                  </div>
                  <div className={styles.notifFoot}>
                    {notificationsUrl.startsWith("http") || notificationsUrl.includes("?_nxt=") ? (
                      <a
                        href={notificationsUrl}
                        className={styles.notifFootLink}
                        onClick={() => setNotifOpen(false)}
                      >
                        Ver todas →
                      </a>
                    ) : (
                      <Link
                        href={notificationsUrl}
                        className={styles.notifFootLink}
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

          {showNewActivity && (
            <Link href={NEW_ACTIVITY_PATH} className={styles.primaryAction} aria-label="Nueva actividad">
              <ShellIcon name="plus" size={16} />
              <span className={styles.primaryActionLabel}>Nueva actividad</span>
            </Link>
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

      {paletteMounted ? (
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          user={user}
          token={user.token}
          navigation={serverNav}
          onToggleDark={toggleDarkMode}
          onLogout={handleLogout}
        />
      ) : null}
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
        <div className={`${styles.contentInner} ${styles.stateScreen}`}>
          <div className={styles.stateCard}>
            <IconBadge icon={BlockOutlinedIcon} size={60} color="var(--ui-danger)" />
            <h1 className={styles.stateHeading}>No tienes acceso a este panel</h1>
            <p className={styles.stateText}>
              Entraste como <strong>{user.nombre || user.email}</strong>
              {roleLabel ? <> ({roleLabel})</> : null}. Tu rol no incluye módulos en{" "}
              <strong>{panelMeta.name.replace(/^NEXARA\s+/i, "")}</strong>.
            </p>
            <p className={styles.stateMeta} role="status">
              Te llevamos a tu panel en unos segundos…
            </p>
            <div className={styles.stateActions}>
              {/* Anchor nativo — necesario para navegar cross-subdomain */}
              <a href={homeUrlAbsolute} className={styles.stateBtnPrimary}>
                Ir a mi panel ({allowedPanels[0]?.name.replace(/^NEXARA\s+/i, "") ?? "inicio"})
              </a>
              <button type="button" className={styles.stateBtn} onClick={onLogout}>
                Cerrar sesión
              </button>
            </div>
            {allowedPanels.length > 1 && (
              <p className={styles.stateMeta}>
                Paneles disponibles:{" "}
                {allowedPanels.map((p) => p.name.replace(/^NEXARA\s+/i, "")).join(" · ")}
              </p>
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
  groupTitle,
}: {
  panel: PanelId;
  pathname: string;
  panelHome: string | null;
  /** Grupo del menú donde vive la página («Hoy», «Recursos»…): sustituye al nombre del panel. */
  groupTitle: string | null;
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
      <nav className={styles.breadcrumbs} aria-label="Estás en">
        <span className={styles.crumbCurrent} aria-current="page">
          {PANEL_META[panel].name}
        </span>
      </nav>
    );
  }

  const accumulated: string[] = [];
  return (
    <nav className={styles.breadcrumbs} aria-label="Estás en">
      {groupTitle ? (
        <span className={styles.crumbHome}>{groupTitle}</span>
      ) : (
        <Link href={homeHref} className={styles.crumbHome}>
          {PANEL_META[panel].name}
        </Link>
      )}
      {segments.map((seg, idx) => {
        accumulated.push(seg);
        const isLast = idx === segments.length - 1;
        const target = `/${panel}/${accumulated.join("/")}`;
        const moduleHit = MODULES_BY_URL.get(target);
        // Un id numérico (/indicadores/21, /cotizaciones/7) no dice nada: «Detalle».
        const label = moduleHit?.label || (/^\d+$/.test(seg) ? "Detalle" : humanize(seg));
        return (
          <span key={target} className={styles.crumb} data-last={isLast ? "true" : undefined}>
            <span className={styles.crumbSep} aria-hidden="true">
              <ShellIcon name="right" size={14} />
            </span>
            {isLast ? (
              <span className={styles.crumbCurrent} aria-current="page">
                {label}
              </span>
            ) : (
              <Link href={target}>{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
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
