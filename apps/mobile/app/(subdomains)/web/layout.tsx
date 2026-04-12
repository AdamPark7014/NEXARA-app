"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeContext";
import { useUser } from "@/components/UserContext";
import { setActivePanel } from "@/lib/panel-routing";
import { getAvatarSrc, getRoleLabel, isPlatformAdmin } from "@/lib/panel-user";
import { useCompactBottomNav } from "@/lib/use-compact-bottom-nav";
import BottomNav from "@/components/BottomNav";
import { hapticTap } from "@/lib/haptics";
import consoleStyles from "../console/console.module.css";
import styles from "./layout.module.css";

const WEB_SHELL_MOBILE_PX = 960;

export default function WebPanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { darkMode, toggleDarkMode } = useTheme();
  const { user, logout } = useUser();
  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";
  const userRoleLabel = getRoleLabel(user);
  const userAvatarSrc = getAvatarSrc(user);
  const isAdmin = isPlatformAdmin(user);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobileShell, setIsMobileShell] = useState(false);
  const showCompactBottomNav = useCompactBottomNav();

  const inWebPath = Boolean(pathname && pathname.startsWith("/web"));
  const resolveWebHref = (path: string) => {
    if (!path.startsWith("/")) return `/web/${path}`;
    if (path === "/paneles" || path === "/login") return path;
    if (path === "/web" || path.startsWith("/web/")) return path;
    return inWebPath ? `/web${path}` : path;
  };

  const navItems = useMemo(
    () => [
      { label: "Dashboard", icon: "📊", href: resolveWebHref("/dashboard") },
      { label: "Clientes", icon: "👥", href: resolveWebHref("/clientes") },
      { label: "Proyectos", icon: "📁", href: resolveWebHref("/proyectos") },
      { label: "Contactos", icon: "✉️", href: resolveWebHref("/contactos") },
      { label: "Noticias", icon: "📰", href: resolveWebHref("/noticias") },
    ],
    [inWebPath],
  );

  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    setActivePanel("web");
  }, []);

  useEffect(() => {
    const update = () => setIsMobileShell(window.innerWidth <= WEB_SHELL_MOBILE_PX);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!isMobileShell) {
      setDrawerOpen(false);
    }
  }, [isMobileShell]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (pathname && pathname.includes("/login")) {
    return <main className={styles.webPanelMain}>{children}</main>;
  }

  return (
    <div className={styles.webPanelRoot}>
      {isMobileShell && (
        <header className={styles.webMobileTopbar}>
          <div className={`${styles.webDrawerHeader} ${styles.webDrawerHeaderInTopbar}`}>
            <img src="/logo-nexara.png" alt="" className={styles.webDrawerHeaderLogo} width={36} height={36} />
            <div className={styles.webDrawerHeaderTitles}>
              <span className={styles.brandMark}>NEXARA</span>
              <span className={styles.brandSub}>Panel Web</span>
            </div>
          </div>
          <button
            type="button"
            className={consoleStyles.hamburgerButton}
            onClick={() => {
              void hapticTap("light");
              setDrawerOpen((prev) => !prev);
            }}
            aria-label={drawerOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={drawerOpen}
            aria-controls="web-panel-sidebar"
          >
            <span className={consoleStyles.hamburgerLine} />
            <span className={consoleStyles.hamburgerLine} />
            <span className={consoleStyles.hamburgerLine} />
          </button>
        </header>
      )}

      {isMobileShell && drawerOpen && (
        <button
          type="button"
          className={styles.webSidebarBackdrop}
          onClick={closeDrawer}
          aria-label="Cerrar menú"
        />
      )}

      <aside
        id="web-panel-sidebar"
        className={`${styles.webPanelSidebar} ${isMobileShell ? styles.webPanelSidebarDrawer : ""} ${isMobileShell && drawerOpen ? styles.webPanelSidebarDrawerOpen : ""}`}
      >
        <div className={styles.webDrawerHeader}>
          <img src="/logo-nexara.png" alt="NEXARA" className={styles.webDrawerHeaderLogo} width={36} height={36} />
          <div className={styles.webDrawerHeaderTitles}>
            <div className={styles.brandMark}>NEXARA</div>
            <div className={styles.brandSub}>Panel Web</div>
          </div>
        </div>
        <div className={styles.webPanelMenuTitle}>Menú principal</div>

        {isMobileShell && !showCompactBottomNav && (
          <div className={styles.webShortcuts} role="navigation" aria-label="Accesos rápidos">
            {navItems.slice(0, 4).map((item) => {
              const itemPath = item.href.replace(/\/+$/, "");
              const active = itemPath === currentPath;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.webShortcutChip} ${active ? styles.webShortcutChipActive : ""}`}
                  onClick={closeDrawer}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}

        <div className={styles.webPanelUserShell}>
          <div className={styles.webDrawerProfile}>
            <div className={styles.webDrawerAvatar}>
              <img
                src={userAvatarSrc}
                alt={user?.isSuperAdmin ? "NEXARA" : user?.nombre || "Usuario"}
                className={user?.isSuperAdmin ? styles.webDrawerAvatarLogo : undefined}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className={styles.webDrawerProfileName}>{user?.nombre || "Usuario Web"}</div>
            <div className={styles.webDrawerProfileEmail}>{user?.email || "panel@nexara.com.mx"}</div>
            <div className={styles.webDrawerProfileMeta}>
              {user?.isSuperAdmin ? (
                <span className={consoleStyles.levelPill}>Superadmin</span>
              ) : (
                <>
                  <span className={consoleStyles.rolePill}>{userRoleLabel}</span>
                  {isAdmin && userRoleLabel !== "Admin" && (
                    <span className={consoleStyles.levelPill}>Admin</span>
                  )}
                </>
              )}
            </div>
          </div>
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
                  onClick={closeDrawer}
                >
                  <span className={styles.navLabel}>{item.label}</span>
                  <span className={styles.navPulse} />
                </Link>
              );
            })}
          </nav>
        </div>
        <div className={styles.themeSection}>
          <Link href="/paneles" className={styles.themeButton} onClick={closeDrawer}>
            <span className={styles.themeIcon}>⇄</span>
            <span>Cambiar panel</span>
          </Link>
          <button
            type="button"
            onClick={toggleDarkMode}
            className={styles.themeButton}
            aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            <span className={styles.themeIcon}>{darkMode ? "🌙" : "☀️"}</span>
            <span>{darkMode ? "Modo Oscuro" : "Modo Claro"}</span>
          </button>
          <button
            type="button"
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
      <main
        className={`${styles.webPanelMain} ${isMobileShell && showCompactBottomNav ? styles.webMainPadForBottomNav : ""}`}
      >
        {children}
      </main>
      {isMobileShell && showCompactBottomNav && (
        <BottomNav
          items={[
            { icon: "📊", label: "Inicio", href: resolveWebHref("/dashboard"), hapticIntent: "selection" },
            { icon: "👥", label: "Clientes", href: resolveWebHref("/clientes"), hapticIntent: "selection" },
            { icon: "📁", label: "Proyectos", href: resolveWebHref("/proyectos"), hapticIntent: "selection" },
            { icon: "✉️", label: "Contactos", href: resolveWebHref("/contactos"), hapticIntent: "selection" },
            {
              icon: "☰",
              label: "Menú",
              onPress: () => setDrawerOpen(true),
              hapticIntent: "medium",
            },
          ]}
        />
      )}
    </div>
  );
}
