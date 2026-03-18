"use client";
import Link from "next/link";
import React from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeContext";
import { useUser } from "@/components/UserContext";
import { useEffect } from "react";
import { setActivePanel } from "@/lib/panel-routing";
import { getAvatarSrc, getRoleLabel } from "@/lib/panel-user";
import styles from "./layout.module.css";

export default function WebPanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { darkMode, toggleDarkMode } = useTheme();
  const { user, logout } = useUser();
  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";
  const userRoleLabel = getRoleLabel(user);
  const userAvatarSrc = getAvatarSrc(user);

  useEffect(() => {
    setActivePanel("web");
  }, []);

  const withWebPrefix = (href: string) => {
    if (!href.startsWith('/')) return `/web/${href}`;
    if (href === '/paneles' || href === '/login') return href;
    if (href === '/web' || href.startsWith('/web/')) return href;
    return `/web${href}`;
  };

  const navItems = [
    { label: "Dashboard", href: withWebPrefix("/dashboard") },
    { label: "Clientes", href: withWebPrefix("/clientes") },
    { label: "Proyectos", href: withWebPrefix("/proyectos") },
    { label: "Contactos", href: withWebPrefix("/contactos") },
    { label: "Noticias", href: withWebPrefix("/noticias") },
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
        <div className={styles.webPanelMenuTitle}>Menú principal</div>
        <div className={styles.webPanelUser}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", marginBottom: 8 }}>
            <Image
              src={userAvatarSrc}
              alt={user?.isSuperAdmin ? "NEXARA" : (user?.nombre || "Usuario")}
              width={44}
              height={44}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              unoptimized
            />
          </div>
          <div className={styles.webPanelUserName}>{user?.nombre || "Usuario Web"}</div>
          <div className={styles.webPanelUserEmail}>{user?.email || "panel@nexara.com.mx"}</div>
          <div className={styles.webPanelUserEmail}>{userRoleLabel}</div>
        </div>
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
          <Link href="/paneles" className={styles.themeButton}>
            <span className={styles.themeIcon}>⇄</span>
            <span>Cambiar panel</span>
          </Link>
          <button
            onClick={toggleDarkMode}
            className={styles.themeButton}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            <span className={styles.themeIcon}>{darkMode ? '🌙' : '☀️'}</span>
            <span>{darkMode ? 'Modo Oscuro' : 'Modo Claro'}</span>
          </button>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className={styles.themeButton}
            aria-label="Cerrar sesión"
          >
            <span className={styles.themeIcon}>⎋</span>
            <span>Cerrar sesión</span>
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
