"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "./VentasSidebar.module.css";
import { useUser } from "@/components/UserContext";
import { useTheme } from "@/components/ThemeContext";
import { useState, useMemo, useEffect } from "react";
import { getAvatarSrc, getRoleLabel, isSalesManagerUser } from "@/lib/panel-user";

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

export default function VentasSidebar() {
  const MOBILE_BREAKPOINT = 768;
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [navQuery, setNavQuery] = useState("");

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [MOBILE_BREAKPOINT]);

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen, isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    setIsMenuOpen(false);
  }, [pathname, isMobile]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMenuOpen) setIsMenuOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);

  const handleLogout = () => {
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

  const isActive = (href: string) => {
    if (!pathname) return false;
    return pathname.startsWith(href);
  };

  const showExpandedContent = sidebarOpen || isMobile;

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
      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(item);
    });

    return sectionOrder
      .filter((section) => groups[section]?.length)
      .reduce((acc, section) => {
        acc[section] = groups[section];
        return acc;
      }, {} as { [key: string]: MenuItem[] });
  }, [canManageSellers, navQuery]);

  if (!user) return null;

  return (
    <aside
      className={`${styles.ventasSidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarCollapsed}`}
      data-mobile={isMobile ? "true" : "false"}
      data-open={isMenuOpen ? "true" : "false"}
    >
      {/* Header con Logo */}
      <div className={styles.sidebarHeader}>
        <div className={styles.logoContainer}>
          <img src="/logo-nexara.png" alt="NEXARA Logo" className={styles.logoIcon} />
          {showExpandedContent && <h2 className={styles.logoText}>NEXARA</h2>}
        </div>
        {isMobile ? (
          <button
            type="button"
            className={styles.hamburgerButton}
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isMenuOpen}
            aria-controls="ventas-sidebar-menu"
            data-open={isMenuOpen ? "true" : "false"}
          >
            <span className={styles.hamburgerLine}></span>
            <span className={styles.hamburgerLine}></span>
            <span className={styles.hamburgerLine}></span>
          </button>
        ) : (
          <button
            className={styles.toggleBtn}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Contraer" : "Expandir"}
            aria-label="Toggle sidebar"
          >
            <span className={styles.toggleGlyph} aria-hidden="true">
              {sidebarOpen ? "◀" : "▶"}
            </span>
          </button>
        )}
      </div>

      {isMobile && isMenuOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={closeMenu}
          role="presentation"
        />
      )}

      {(!isMobile || isMenuOpen) && (
      <div
        className={styles.sidebarContent}
        id="ventas-sidebar-menu"
        data-open={isMobile && isMenuOpen ? "true" : undefined}
      >

      {/* User Info Card */}
      {showExpandedContent && (
        <div className={styles.userCard}>
          <div className={styles.userAvatar}>
            <img
              src={userAvatarSrc}
              alt={user?.isSuperAdmin ? "NEXARA" : user.nombre}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
            />
          </div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{user.nombre}</p>
            <p className={styles.userRole}>{userRoleLabel}</p>
          </div>
        </div>
      )}

      {showExpandedContent && (
        <div className={styles.navSearchWrap}>
          <input
            className={styles.navSearchInput}
            placeholder="Buscar sección o módulo"
            value={navQuery}
            onChange={(event) => setNavQuery(event.target.value)}
          />
          {navQuery && (
            <button type="button" className={styles.navSearchClear} onClick={() => setNavQuery("")}>Limpiar</button>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className={styles.navContainer}>
        {Object.entries(groupedItems).map(([section, items]) => (
          <div key={section} className={styles.navSection}>
            {showExpandedContent && <div className={styles.sectionTitle}>{section}</div>}
            <ul className={styles.navList}>
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href} className={styles.navListItem}>
                    <Link
                      href={withOwnerFilter(item.href)}
                      className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                      title={item.label}
                      aria-current={active ? "page" : undefined}
                      onClick={closeMenu}
                    >
                      <span className={styles.navIcon}>{item.icon}</span>
                      {showExpandedContent && (
                        <div className={styles.navContent}>
                          <span className={styles.navLabel}>{item.label}</span>
                          {item.description && (
                            <span className={styles.navDescription}>{item.description}</span>
                          )}
                        </div>
                      )}
                      <span className={styles.navIndicator} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {showExpandedContent && Object.keys(groupedItems).length === 0 && (
          <div className={styles.navEmpty}>No hay resultados para la búsqueda actual.</div>
        )}
      </nav>

      {/* Botón de tema */}
      <div className={styles.themeSection}>
        <button
          onClick={toggleDarkMode}
          className={styles.themeButton}
          data-collapsed={showExpandedContent ? 'false' : 'true'}
          aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          <span className={styles.themeIcon}>{darkMode ? '🌙' : '☀️'}</span>
          {showExpandedContent && <span>{darkMode ? 'Modo Oscuro' : 'Modo Claro'}</span>}
        </button>

        <button
          onClick={handleLogout}
          className={styles.themeButton}
          data-collapsed={showExpandedContent ? 'false' : 'true'}
          aria-label="Cerrar sesión"
        >
          <span className={styles.themeIcon}>⎋</span>
          {showExpandedContent && <span>Cerrar sesión</span>}
        </button>
      </div>

      {/* Footer */}
      <div className={styles.sidebarFooter}>
        {showExpandedContent ? (
          <>
            <div className={styles.statusIndicator} />
            <span className={styles.statusText}>En línea</span>
          </>
        ) : (
          <div className={styles.statusIndicatorSmall} />
        )}
      </div>
      </div>
      )}
    </aside>
  );
}
