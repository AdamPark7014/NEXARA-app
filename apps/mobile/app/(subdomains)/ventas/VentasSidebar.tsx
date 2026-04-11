"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import consoleStyles from "../console/console.module.css";
import styles from "./VentasSidebar.module.css";
import { useUser } from "@/components/UserContext";
import { useTheme } from "@/components/ThemeContext";
import { useState, useMemo, useEffect } from "react";
import { getAvatarSrc, getRoleLabel, isSalesManagerUser } from "@/lib/panel-user";
import { hapticTap } from "@/lib/haptics";
import { PANEL_DRAWER_BREAKPOINT_PX } from "@/lib/panel-drawer-breakpoint";

interface MenuItem {
  label: string;
  href: string;
  icon: string;
  section?: string;
  description?: string;
}

const menuItems: MenuItem[] = [
  { label: "Mi perfil", icon: "👤", href: "/my-profile", section: "Cuenta y panorama", description: "Resumen y datos personales" },
  { label: "Dashboard", icon: "📊", href: "/dashboard", section: "Cuenta y panorama", description: "Visión general de ventas" },

  { label: "Leads", icon: "🎯", href: "/leads", section: "Prospección comercial", description: "Gestiona leads potenciales" },
  { label: "Oportunidades", icon: "💼", href: "/oportunidades", section: "Prospección comercial", description: "Oportunidades comerciales" },

  { label: "Clientes", icon: "👥", href: "/clientes", section: "Clientes y ejecución", description: "Base de datos de clientes" },
  { label: "Proyectos", icon: "📁", href: "/proyectos", section: "Clientes y ejecución", description: "Proyectos en desarrollo" },
  { label: "Cotizaciones", icon: "📄", href: "/cotizaciones", section: "Clientes y ejecución", description: "Gestiona cotizaciones" },
  { label: "Plantillas", icon: "🎨", href: "/plantillas", section: "Clientes y ejecución", description: "Plantillas de órdenes PDF" },

  { label: "Notificaciones", icon: "🔔", href: "/notificaciones", section: "Comunicación y seguimiento", description: "Centro de notificaciones" },
];

const sectionOrder = [
  "Cuenta y panorama",
  "Prospección comercial",
  "Clientes y ejecución",
  "Comunicación y seguimiento",
  "Análisis y estrategia",
];

interface VentasSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  shortcutStrip?: { icon: string; label: string; href: string }[];
}

export default function VentasSidebar({ mobileOpen, onMobileClose, shortcutStrip }: VentasSidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [brandLogoSrc, setBrandLogoSrc] = useState("/icon.png");

  useEffect(() => {
    if (typeof mobileOpen === "boolean") {
      setIsMenuOpen(mobileOpen);
    }
  }, [mobileOpen]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= PANEL_DRAWER_BREAKPOINT_PX);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    setIsMenuOpen(false);
    onMobileClose?.();
  }, [pathname, isMobile, onMobileClose]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMenuOpen) closeMenu();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMenuOpen]);

  const closeMenu = () => {
    setIsMenuOpen(false);
    onMobileClose?.();
  };

  const handleLogout = () => {
    void hapticTap("heavy");
    logout();
    closeMenu();
    router.replace("/login");
  };

  const canManageSellers = isSalesManagerUser(user);
  const userRoleLabel = getRoleLabel(user);
  const userAvatarSrc = getAvatarSrc(user);
  const selectedOwnerId =
    typeof window === "undefined"
      ? undefined
      : Number(new URLSearchParams(window.location.search).get("ownerId") || 0) || undefined;

  const withOwnerFilter = (href: string) => {
    if (!canManageSellers || !selectedOwnerId) return href;
    return `${href}?ownerId=${selectedOwnerId}`;
  };

  const inPrefixedVentasPath = Boolean(pathname && pathname.startsWith("/ventas"));
  const resolveVentasHref = (href: string) => {
    if (!href.startsWith("/")) return href;
    if (href === "/paneles" || href === "/login") return href;
    if (href === "/ventas" || href.startsWith("/ventas/")) return href;
    return inPrefixedVentasPath ? `/ventas${href}` : href;
  };

  const isActive = (href: string) => {
    if (!pathname) return false;
    const resolved = resolveVentasHref(href);
    return pathname === resolved || pathname.startsWith(`${resolved}/`);
  };

  const [navQuery, setNavQuery] = useState("");

  const groupedItems = useMemo(() => {
    const items = [...menuItems];
    if (canManageSellers) {
      items.push({
        label: "Gestión Vendedores",
        icon: "🧠",
        href: "/gestion-vendedores",
        section: "Análisis y estrategia",
        description: "Control ejecutivo y productividad diaria",
      });
      items.push(
        { label: "Reportes", icon: "📈", href: "/reportes", section: "Análisis y estrategia", description: "Reportes ejecutivos del equipo" },
        { label: "Crecimiento", icon: "📶", href: "/crecimiento", section: "Análisis y estrategia", description: "Análisis de crecimiento anual" },
        { label: "Equipo comparativa", icon: "🧮", href: "/equipo-comparativa", section: "Análisis y estrategia", description: "Comparativa por vendedor" },
      );
    }

    const normalizedQuery = navQuery.trim().toLowerCase();
    const filteredItems = normalizedQuery
      ? items.filter((item) => {
          const haystack = `${item.label} ${item.section || ""} ${item.description || ""}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : items;

    const groups: { [key: string]: MenuItem[] } = {};
    filteredItems.forEach((item) => {
      const section = item.section || "Principal";
      if (!groups[section]) groups[section] = [];
      groups[section].push(item);
    });

    return sectionOrder
      .filter((section) => groups[section]?.length)
      .reduce(
        (acc, section) => {
          acc[section] = groups[section];
          return acc;
        },
        {} as { [key: string]: MenuItem[] },
      );
  }, [canManageSellers, navQuery]);

  if (!user) return null;

  return (
    <>
      {isMobile && isMenuOpen && (
        <div
          className={consoleStyles.sidebarOverlay}
          onClick={closeMenu}
          role="presentation"
          aria-label="Cerrar menú"
        />
      )}
      <aside
        className={consoleStyles.sidebar}
        data-mobile={isMobile ? "true" : "false"}
        data-open={isMenuOpen ? "true" : "false"}
      >
        <div className={consoleStyles.sidebarHeader}>
          <div className={consoleStyles.sidebarLogo}>
            <img
              src={brandLogoSrc}
              alt="NEXARA"
              className={consoleStyles.brandLogo}
              onError={() => setBrandLogoSrc("/icon.png")}
            />
            <span className={consoleStyles.brandMark}>NEXARA</span>
            {isMobile && <span className={consoleStyles.brandSub}>Ventas</span>}
          </div>
          {isMobile && isMenuOpen && (
            <button type="button" className={consoleStyles.mobileCloseButton} onClick={closeMenu} aria-label="Cerrar menú">
              <span aria-hidden="true">✕</span>
            </button>
          )}
          {isMobile && !isMenuOpen && (
            <button
              type="button"
              className={consoleStyles.hamburgerButton}
              onClick={() => {
                void hapticTap("light");
                setIsMenuOpen(true);
              }}
              aria-label="Abrir menú"
              aria-expanded={isMenuOpen}
              aria-controls="ventas-sidebar-menu"
              data-open="false"
            >
              <span className={consoleStyles.hamburgerLine} />
              <span className={consoleStyles.hamburgerLine} />
              <span className={consoleStyles.hamburgerLine} />
            </button>
          )}
        </div>

        {(!isMobile || isMenuOpen) && (
          <div className={consoleStyles.sidebarContent} id="ventas-sidebar-menu" data-open={isMobile && isMenuOpen ? "true" : undefined}>
            <div className={consoleStyles.sidebarUser}>
              <div className={consoleStyles.superadminAvatarWrap}>
                <img
                  className={consoleStyles.avatarImage}
                  src={userAvatarSrc}
                  alt={user?.isSuperAdmin ? "NEXARA" : user.nombre}
                  loading="lazy"
                />
              </div>
              <div className={consoleStyles.sidebarName}>{user.nombre}</div>
              <div className={consoleStyles.sidebarEmail}>{user.email}</div>
              <div className={consoleStyles.sidebarMeta}>
                <span className={consoleStyles.rolePill}>{userRoleLabel}</span>
              </div>
            </div>

            {shortcutStrip && shortcutStrip.length > 0 && (
              <div className={styles.shortcutStrip} role="navigation" aria-label="Accesos rápidos">
                {shortcutStrip.map((s) => (
                  <Link key={s.href} href={s.href} className={styles.shortcutChip} onClick={closeMenu}>
                    <span aria-hidden="true">{s.icon}</span>
                    <span>{s.label}</span>
                  </Link>
                ))}
              </div>
            )}

            <div className={styles.navSearchWrap}>
              <input
                className={styles.navSearchInput}
                placeholder="Buscar sección o módulo"
                value={navQuery}
                onChange={(event) => setNavQuery(event.target.value)}
              />
              {navQuery ? (
                <button type="button" className={styles.navSearchClear} onClick={() => setNavQuery("")}>
                  Limpiar
                </button>
              ) : null}
            </div>

            <nav className={styles.navContainer} aria-label="Navegación ventas">
              {Object.entries(groupedItems).map(([section, items]) => (
                <div key={section} className={styles.navSection}>
                  <div className={consoleStyles.menuTitle}>{section}</div>
                  <ul className={consoleStyles.sidebarMenu}>
                    {items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <li key={item.href} className={consoleStyles.sidebarMenuItem}>
                          <Link
                            href={withOwnerFilter(resolveVentasHref(item.href))}
                            className={
                              active
                                ? `${consoleStyles.menuLink} ${consoleStyles.menuButton} ${consoleStyles.active}`
                                : `${consoleStyles.menuLink} ${consoleStyles.menuButton}`
                            }
                            title={item.description}
                            aria-current={active ? "page" : undefined}
                            onClick={closeMenu}
                          >
                            <span className={consoleStyles.menuLinkIcon} aria-hidden="true">
                              {item.icon}
                            </span>
                            <span className={consoleStyles.menuLinkText}>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {Object.keys(groupedItems).length === 0 && (
                <div className={styles.navEmpty}>No hay resultados para la búsqueda actual.</div>
              )}
            </nav>

            <div className={consoleStyles.sidebarFooter}>
              <div className={consoleStyles.sidebarFooterActions}>
                <Link href="/paneles" className={consoleStyles.menuLink} onClick={closeMenu}>
                  Cambiar panel
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void hapticTap("medium");
                    toggleDarkMode();
                  }}
                  className={consoleStyles.themeSwitcher}
                  aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                >
                  <span className={consoleStyles.themeIcon} aria-hidden="true">
                    ●
                  </span>
                  <span className={consoleStyles.themeLabel}>{darkMode ? "Vista oscura" : "Vista clara"}</span>
                </button>
                <button type="button" onClick={handleLogout} className={consoleStyles.logoutButton} aria-label="Cerrar sesión">
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
