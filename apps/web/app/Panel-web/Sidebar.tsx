"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "./panel.module.css";

interface MenuItem {
  label: string;
  icon: string;
  href: string;
  section?: string;
  description?: string;
}

const menuItems: MenuItem[] = [
  { label: "Dashboard", icon: "📊", href: "/Panel-web", section: "Principal", description: "Vista general del sistema" },
  { section: "Gestión", label: "", icon: "", href: "" },
  { label: "Proyectos", icon: "📁", href: "/Panel-web/proyectos", section: "Gestión", description: "Administra tus proyectos" },
  { label: "Contactos", icon: "👥", href: "/Panel-web/contactos", section: "Gestión", description: "Gestiona contactos" },
  { label: "Clientes", icon: "👤", href: "/Panel-web/clientes", section: "Gestión", description: "Base de clientes" },
  { section: "Comercio", label: "", icon: "", href: "" },
  { label: "Tienda", icon: "🛒", href: "/Panel-web/tienda", section: "Comercio", description: "Gestión de tienda" },
];

export default function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === "/Panel-web") {
      return pathname === "/Panel-web" || (pathname.startsWith("/Panel-web") && pathname.split("/").length === 3);
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
      <div className={styles.sidebarHeader}>
        <div className={styles.logoBox}>
          <span className={styles.logoIcon}>⚙️</span>
          {sidebarOpen && <h2 className={styles.logoText}>Panel Admin</h2>}
        </div>
        <button
          className={styles.toggleBtn}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? "Contraer sidebar" : "Expandir sidebar"}
          aria-label={sidebarOpen ? "Contraer" : "Expandir"}
        >
          {sidebarOpen ? "←" : "→"}
        </button>
      </div>

      <nav className={styles.sidebarNav}>
        {menuItems.map((item, idx) => {
          // Mostrar separador de sección
          if (item.section && !item.label) {
            return (
              <div key={`section-${idx}`} className={styles.navSection}>
                {sidebarOpen && <span className={styles.sectionLabel}>{item.section}</span>}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive(item.href) ? styles.active : ""}`}
              title={item.label}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {sidebarOpen && (
                <div className={styles.navContent}>
                  <span className={styles.navLabel}>{item.label}</span>
                  {item.description && <span className={styles.navDescription}>{item.description}</span>}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={styles.sidebarFooter}>
        {sidebarOpen && (
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>👨‍💼</div>
            <div className={styles.userDetails}>
              <p className={styles.userName}>Admin</p>
              <p className={styles.userRole}>Administrador</p>
            </div>
          </div>
        )}
        <button 
          className={styles.logoutBtn} 
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          🚪
        </button>
      </div>
    </aside>
  );
}
