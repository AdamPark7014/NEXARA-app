"use client";

import Link from "next/link";
import React from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeContext";
import styles from "./layout.module.css";

export default function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { darkMode, toggleDarkMode } = useTheme();

  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";

  const navItems = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Viaticos", href: "/viaticos" },
    { label: "Multas", href: "/multas" },
    { label: "Horas", href: "/horas" },
    { label: "Pagos", href: "/pagos" },
    { label: "Proyectos", href: "/proyectos" },
    { label: "Capital", href: "/capital" },
  ];

  // Si estamos en login, no renderizar el sidebar
  if (pathname && pathname.includes("/login")) {
    return <main className={styles.contaMain}>{children}</main>;
  }

  return (
    <div className={styles.contaRoot}>
      <aside className={styles.contaSidebar}>
        <div className={styles.brandBlock}>
          <span className={styles.brandName}>NEXARA</span>
          <span className={styles.brandSub}>Contabilidad</span>
        </div>
        <div className={styles.sidebarDivider} />
        <p className={styles.menuTitle}>Panel financiero</p>
        <nav className={styles.nav}>
          {navItems.map((item, index) => {
            const itemPath = item.href.replace(/\/+$/, "");
            const isActive = itemPath === currentPath;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                style={{ animationDelay: `${0.08 + index * 0.05}s` }}
              >
                <span>{item.label}</span>
                <span className={styles.navIndicator} />
              </Link>
            );
          })}
        </nav>
        <div style={{ padding: '1rem', marginTop: 'auto', borderTop: '1px solid var(--border-color)' }}>
          <button
            onClick={toggleDarkMode}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--card-bg)',
              color: 'var(--text-color)',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            <span style={{ fontSize: '1.5rem' }}>{darkMode ? '🌙' : '☀️'}</span>
            <span>{darkMode ? 'Modo Oscuro' : 'Modo Claro'}</span>
          </button>
        </div>
        <div className={styles.sidebarFooter}>
          <span>Estado</span>
          <strong>Conectado</strong>
        </div>
      </aside>
      <main className={styles.contaMain}>{children}</main>
    </div>
  );
}
