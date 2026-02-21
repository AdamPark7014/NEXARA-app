"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { useTheme } from "@/components/ThemeContext";
import styles from "./layout.module.css";

export default function WebPanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();  const { darkMode, toggleDarkMode } = useTheme();  const [hydrated, setHydrated] = useState(false);
  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";
  const isWebPanelRoute = Boolean(pathname && pathname.startsWith("/panel/web"));
  const isLoginRoute = Boolean(pathname && pathname.startsWith("/login"));

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !isWebPanelRoute) return;
    if (!user && !isLoginRoute) {
      router.replace("/login");
      return;
    }
    if (user && isLoginRoute) {
      router.replace("/dashboard");
    }
  }, [hydrated, isWebPanelRoute, isLoginRoute, user, router]);
  const navItems = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Clientes", href: "/clientes" },
    { label: "Proyectos", href: "/proyectos" },
    { label: "Contactos", href: "/contactos" },
    { label: "Noticias", href: "/noticias" },
  ];
  // Solo mostrar el sidebar en rutas /*
  if (!pathname || !pathname.startsWith("/panel/web")) {
    return <main className={styles.webPanelMain}>{children}</main>;
  }
  if (isLoginRoute) {
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
              const isActive =
                itemPath === currentPath ||
                (itemPath === "/dashboard" && currentPath === "/panel/web");
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
        <div className={styles.webPanelFooter}>
          <span>Estado</span>
          <strong>Online</strong>
        </div>
      </aside>
      <main className={styles.webPanelMain}>{children}</main>
    </div>
  );
}
