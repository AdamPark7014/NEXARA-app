"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./VentasSidebar.module.css";
import { useUser } from "@/components/UserContext";
import { useTheme } from "@/components/ThemeContext";
import { useState, useMemo } from "react";
import { getRoleLabel } from "@/lib/panel-user";

interface MenuItem {
  label: string;
  href: string;
  icon: string;
  section?: string;
  description?: string;
}

const menuItems: MenuItem[] = [
  // PRINCIPAL
  { label: "Dashboard", icon: "📊", href: "/dashboard", section: "Principal", description: "Visión general de ventas" },

  // PETICIONES
  { label: "Leads", icon: "🎯", href: "/leads", section: "Peticiones", description: "Gestiona leads potenciales" },
  { label: "Oportunidades", icon: "💼", href: "/oportunidades", section: "Peticiones", description: "Oportunidades comerciales" },

  // GESTIÓN
  { label: "Clientes", icon: "👥", href: "/clientes", section: "Gestión", description: "Base de datos de clientes" },
  { label: "Proyectos", icon: "📁", href: "/proyectos", section: "Gestión", description: "Proyectos en desarrollo" },
  { label: "Cotizaciones", icon: "📄", href: "/cotizaciones", section: "Gestión", description: "Gestiona cotizaciones" },

  // OPERACIONES (Nuevos features)
  { label: "Plantillas", icon: "🎨", href: "/plantillas", section: "Operaciones", description: "Plantillas de órdenes PDF" },
  { label: "Notificaciones", icon: "🔔", href: "/notificaciones", section: "Operaciones", description: "Centro de notificaciones" },

  // ANÁLISIS
  { label: "Reportes", icon: "📈", href: "/reportes", section: "Análisis", description: "Reportes detallados" },
  { label: "Crecimiento", icon: "📶", href: "/crecimiento", section: "Análisis", description: "Análisis de crecimiento" },
];

export default function VentasSidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isActive = (href: string) => {
    if (!pathname) return false;
    return pathname.startsWith(href);
  };

  const groupedItems = useMemo(() => {
    const groups: { [key: string]: MenuItem[] } = {};
    menuItems.forEach((item) => {
      const section = item.section || "Principal";
      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(item);
    });

    return groups;
  }, []);

  if (!user) return null;

  return (
    <aside className={`${styles.ventasSidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarCollapsed}`}>
      {/* Header con Logo */}
      <div className={styles.sidebarHeader}>
        <div className={styles.logoContainer}>
          <img src="/logo-nexara.png" alt="NEXARA Logo" className={styles.logoIcon} />
          {sidebarOpen && <h2 className={styles.logoText}>NEXARA</h2>}
        </div>
        <button
          className={styles.toggleBtn}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? "Contraer" : "Expandir"}
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>
      </div>

      {/* User Info Card */}
      {sidebarOpen && (
        <div className={styles.userCard}>
          <div className={styles.userAvatar}>
            {user.nombre.charAt(0).toUpperCase()}
          </div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{user.nombre}</p>
            <p className={styles.userRole}>{getRoleLabel(user)}</p>
            {user.isSuperAdmin && <span className={styles.badgeAdmin}>Superadmin</span>}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className={styles.navContainer}>
        {Object.entries(groupedItems).map(([section, items]) => (
          <div key={section} className={styles.navSection}>
            {sidebarOpen && <div className={styles.sectionTitle}>{section}</div>}
            <ul className={styles.navList}>
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href} className={styles.navListItem}>
                    <Link
                      href={item.href}
                      className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                      title={item.label}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className={styles.navIcon}>{item.icon}</span>
                      {sidebarOpen && (
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
      </nav>

      {/* Botón de tema */}
      <div className={styles.themeSection}>
        <button
          onClick={toggleDarkMode}
          className={styles.themeButton}
          data-collapsed={sidebarOpen ? 'false' : 'true'}
          aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          <span className={styles.themeIcon}>{darkMode ? '🌙' : '☀️'}</span>
          {sidebarOpen && <span>{darkMode ? 'Modo Oscuro' : 'Modo Claro'}</span>}
        </button>
      </div>

      {/* Footer */}
      <div className={styles.sidebarFooter}>
        {sidebarOpen ? (
          <>
            <div className={styles.statusIndicator} />
            <span className={styles.statusText}>En línea</span>
          </>
        ) : (
          <div className={styles.statusIndicatorSmall} />
        )}
      </div>
    </aside>
  );
}
