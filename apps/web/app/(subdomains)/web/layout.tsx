"use client";
import Link from "next/link";
import React from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeContext";
import styles from "./layout.module.css";

export default function WebPanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { darkMode, toggleDarkMode } = useTheme();
  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";

  const navItems = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Clientes", href: "/clientes" },
    { label: "Proyectos", href: "/proyectos" },
    { label: "Contactos", href: "/contactos" },
    { label: "Noticias", href: "/noticias" },
  ];

  // Si estamos en login, no renderizar el sidebar
  if (pathname && pathname.includes("/login")) {
    return <main className={styles.webPanelMain}>{children}</main>;
  }
  return (
    <div className={styles.webPanelRoot}>
      <aside className={styles.webPanelSidebar}>
        <div className={styles.webPanelBrand}>
          <div className={styles.brandMark}>NEXARA</div>
          <div className={styles.brandSub}>Panel Web</div>
        </div>
        <div className={styles.webPanelDivider} />
        <div className={styles.webPanelMenuTitle}>Menu principal</div>
        <div className={styles.webPanelNavShell}>
          <nav className={styles.webPanelNav}>
            {navItems.map((item, index) => {
              const itemPath = item.href.replace(/\/+$/, "");
              const isActive = itemPath === currentPath;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${isActive ? styles.active : ""}`}
                  style={{ animationDelay: `${0.08 + index * 0.05}s` }}
                >
                  <span className={styles.navLabel}>{item.label}</span>
                  <span className={styles.navPulse} />
                </Link>
              );
            })}
          </nav>
        </div>
        <div className={styles.themeSection}>
          <button
            onClick={toggleDarkMode}
            className={styles.themeButton}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            <span className={styles.themeIcon}>{darkMode ? '🌙' : '☀️'}</span>
            <span>{darkMode ? 'Modo Oscuro' : 'Modo Claro'}</span>
          </button>
        </div>
        <div className={styles.webPanelFooter}>
          <span>Estado</span>
          <strong>Online</strong>
        </div>
      </aside>
      <main className={styles.webPanelMain}>{children}</main>
    </div>
  );
}
