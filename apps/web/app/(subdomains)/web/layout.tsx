"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeContext";
import { useUser } from "@/components/UserContext";
import { isPanelDrawerViewport } from "@/lib/panel-drawer-breakpoint";
import consoleStyles from "../console/console.module.css";
import styles from "./layout.module.css";
import { getAvatarSrc, getRoleLabel, isPlatformAdmin } from "@/lib/panel-user";

export default function WebPanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { darkMode, toggleDarkMode } = useTheme();
  const { user } = useUser();
  const userAvatarSrc = getAvatarSrc(user);
  const userRoleLabel = getRoleLabel(user);
  const isAdmin = isPlatformAdmin(user);
  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Clientes", href: "/clientes" },
    { label: "Proyectos", href: "/proyectos" },
    { label: "Contactos", href: "/contactos" },
    { label: "Noticias", href: "/noticias" },
  ];

  useEffect(() => {
    const sync = () => {
      const narrow = isPanelDrawerViewport(window.innerWidth);
      setIsMobile(narrow);
      if (!narrow) setMobileMenuOpen(false);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, mobileMenuOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (pathname && pathname.includes("/login")) {
    return (
      <main className={styles.webPanelMain} data-nx-panel="web">
        {children}
      </main>
    );
  }

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <div className={`${consoleStyles.consoleLayout} ${styles.webPanelShell}`} data-nx-panel="web">
      {isMobile && (
        <header className={styles.webMobileTopbar}>
          <div className={`${styles.webMobileBrand} ${consoleStyles.sidebarLogo}`}>
            <img src="/logo-nexara.png" alt="" className={consoleStyles.brandLogo} width={32} height={32} />
            <span className={consoleStyles.brandMark}>NEXARA</span>
            <span className={consoleStyles.brandSub}>Panel Web</span>
          </div>
          <button
            type="button"
            className={consoleStyles.hamburgerButton}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileMenuOpen}
            aria-controls="web-panel-sidebar-menu"
            data-open={mobileMenuOpen ? "true" : "false"}
          >
            <span className={consoleStyles.hamburgerLine} />
            <span className={consoleStyles.hamburgerLine} />
            <span className={consoleStyles.hamburgerLine} />
          </button>
        </header>
      )}

      {isMobile && mobileMenuOpen && (
        <div
          role="presentation"
          className={consoleStyles.sidebarOverlay}
          onClick={closeMenu}
        />
      )}

      {(!isMobile || mobileMenuOpen) && (
        <aside
          className={consoleStyles.sidebar}
          data-mobile={isMobile ? "true" : "false"}
          data-open={mobileMenuOpen ? "true" : "false"}
        >
          <div className={consoleStyles.sidebarHeader}>
            <div className={consoleStyles.sidebarLogo}>
              <img src="/logo-nexara.png" alt="" className={consoleStyles.brandLogo} width={32} height={32} />
              <span className={consoleStyles.brandMark}>NEXARA</span>
              <span className={consoleStyles.brandSub}>Panel Web</span>
            </div>
            {isMobile && (
              <button
                type="button"
                className={styles.drawerClose}
                onClick={closeMenu}
                aria-label="Cerrar menú"
              >
                ×
              </button>
            )}
          </div>

          <div
            id="web-panel-sidebar-menu"
            className={consoleStyles.sidebarContent}
            data-open={isMobile && mobileMenuOpen ? "true" : undefined}
          >
            <div className={consoleStyles.sidebarUser}>
              <div className={consoleStyles.sidebarAvatar}>
                <Image
                  className={`${consoleStyles.avatarImage}${user?.isSuperAdmin ? ` ${consoleStyles.avatarImageLogo}` : ""}`}
                  src={userAvatarSrc}
                  alt={user?.isSuperAdmin ? "NEXARA" : user?.nombre || "Usuario"}
                  width={70}
                  height={70}
                  sizes="70px"
                  loading="lazy"
                  unoptimized
                />
              </div>
              <div className={consoleStyles.sidebarName}>{user?.nombre || "Usuario Web"}</div>
              <div className={consoleStyles.sidebarEmail}>{user?.email || "panel@nexara.com.mx"}</div>
              <div className={consoleStyles.sidebarMeta}>
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

            <div className={consoleStyles.menuTitle}>Menú principal</div>
            <ul className={consoleStyles.sidebarMenu}>
              {navItems.map((item, index) => {
                const itemPath = item.href.replace(/\/+$/, "");
                const isActive = itemPath === currentPath;
                return (
                  <li
                    key={item.href}
                    className={consoleStyles.sidebarMenuItem}
                    style={{ animationDelay: `${0.08 + index * 0.05}s` }}
                  >
                    <Link
                      href={item.href}
                      className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${isActive ? consoleStyles.active : ""}`}
                      onClick={closeMenu}
                    >
                      <span className={consoleStyles.menuLinkText}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className={consoleStyles.menuTitle}>Cuenta</div>
            <ul className={consoleStyles.sidebarMenu}>
              <li className={consoleStyles.sidebarMenuItem}>
                <Link
                  href="/paneles"
                  className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
                  onClick={closeMenu}
                >
                  Cambiar panel
                </Link>
              </li>
              <li className={consoleStyles.sidebarMenuItem}>
                <button
                  type="button"
                  className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
                  onClick={toggleDarkMode}
                  aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                >
                  {darkMode ? "Cambiar a vista clara" : "Cambiar a vista oscura"}
                </button>
              </li>
            </ul>

            <div className={styles.webPanelFooterStrip}>
              <span>Estado</span>
              <strong>Online</strong>
            </div>
          </div>
        </aside>
      )}

      <main className={styles.webPanelMain}>{children}</main>
    </div>
  );
}
