"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeContext";
import { useUser } from "@/components/UserContext";
import { getAvatarSrc, getRoleLabel, isPlatformAdmin } from "@/lib/panel-user";
import consoleStyles from "../console/console.module.css";
import styles from "./layout.module.css";
import { setActivePanel } from "@/lib/panel-routing";
import BottomNav from "@/components/BottomNav";
import PageTransition from "@/components/PageTransition";
import { hapticTap } from "@/lib/haptics";

export default function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  const MOBILE_BREAKPOINT = 980;
  const pathname = usePathname();
  const router = useRouter();
  const { darkMode, toggleDarkMode } = useTheme();
  const { user, logout } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [workspaceDateLabel, setWorkspaceDateLabel] = useState("");

  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";
  const userName = user?.nombre || "Panel Contabilidad";
  const userEmail = user?.email || "Dirección financiera corporativa";
  const userRole = getRoleLabel(user);
  const userAvatarSrc = getAvatarSrc(user);

  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const isAdmin = isPlatformAdmin(user);
  const inPrefixedContaPath = Boolean(pathname && pathname.startsWith('/contabilidad'));

  const resolveContaHref = (href: string) => {
    if (!href.startsWith('/')) return href;
    if (href === '/paneles' || href === '/login') return href;
    if (href === '/contabilidad' || href.startsWith('/contabilidad/')) return href;
    return inPrefixedContaPath ? `/contabilidad${href}` : href;
  };

  const navGroups = [
    {
      title: "Panorama financiero",
      items: [
        { icon: "📊", label: "Resumen ejecutivo", href: resolveContaHref("/dashboard") },
        { icon: "💼", label: "Capital y liquidez", href: resolveContaHref("/capital") },
        { icon: "📒", label: "Contabilidad (GL)", href: resolveContaHref("/accounting") },
        { icon: "📈", label: "Reportes financieros", href: resolveContaHref("/accounting/reports") },
      ],
    },
    {
      title: "RRHH y control de personal",
      items: [
        { icon: "⏱️", label: "Control de horas", href: resolveContaHref("/horas") },
        { icon: "🧳", label: "Viáticos", href: resolveContaHref("/viaticos") },
        { icon: "⚖️", label: "Multas y sanciones", href: resolveContaHref("/multas") },
        { icon: "💰", label: "Nómina y pagos", href: resolveContaHref("/employee-payments") },
      ],
    },
    {
      title: "Operación financiera",
      items: [
        { icon: "📊", label: "Gastos operativos", href: resolveContaHref("/expenses") },
        { icon: "🏗️", label: "Proyectos de obra", href: resolveContaHref("/work-projects") },
        { icon: "🧾", label: "Facturación", href: resolveContaHref("/invoicing") },
        { icon: "🏦", label: "Banca y conciliaciones", href: resolveContaHref("/banking") },
      ],
    },
  ];

  const flatNavItems = useMemo(() => navGroups.flatMap((group) => group.items), []);
  const activeNavItem = useMemo(() => {
    return flatNavItems.find((item) => {
      const itemPath = item.href.replace(/\/+$/, "");
      return currentPath === itemPath || currentPath.endsWith(itemPath);
    });
  }, [flatNavItems, currentPath]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileMenuOpen(false);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [MOBILE_BREAKPOINT]);

  useEffect(() => {
    if (!isMobile) {
      setMobileMenuOpen(false);
      return;
    }
  }, [mobileMenuOpen, isMobile]);

  useEffect(() => {
    setWorkspaceDateLabel(new Date().toLocaleDateString("es-MX"));
    setActivePanel("contabilidad");
  }, []);

  const handleLogout = () => {
    void hapticTap("heavy");
    logout();
    setMobileMenuOpen(false);
    router.replace("/login");
  };

  // Si estamos en login, no renderizar el sidebar
  if (pathname && pathname.includes("/login")) {
    return <>{children}</>;
  }

  return (
    <div className={`${consoleStyles.consoleLayout} ${styles.contaRoot}`}>
      <header className={styles.mobileTopbar}>
        <div className={`${styles.mobileBrand} ${consoleStyles.sidebarLogo}`}>
          <img src="/logo-nexara.png" alt="NEXARA" className={styles.mobileBrandLogo} />
          <div className={styles.mobileBrandText}>
            <span className={consoleStyles.brandMark}>NEXARA</span>
            <span className={consoleStyles.brandSub}>Contabilidad</span>
          </div>
        </div>
        <button
          type="button"
          className={consoleStyles.hamburgerButton}
          onClick={() => {
            void hapticTap("light");
            setMobileMenuOpen((prev) => !prev);
          }}
          aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileMenuOpen}
          aria-controls="conta-mobile-menu"
          data-open={mobileMenuOpen ? "true" : "false"}
        >
          <span className={consoleStyles.hamburgerLine}></span>
          <span className={consoleStyles.hamburgerLine}></span>
          <span className={consoleStyles.hamburgerLine}></span>
        </button>
      </header>

      {isMobile && mobileMenuOpen && (
        <button
          type="button"
          className={styles.mobileBackdrop}
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      <aside
        id="conta-mobile-menu"
        className={`${consoleStyles.sidebar} ${styles.contaSidebar} ${isMobile && mobileMenuOpen ? styles.contaSidebarOpen : ""}`}
      >
        <div className={consoleStyles.sidebarLogo}>
          <span className={consoleStyles.brandMark}>NEXARA</span>
          <span className={consoleStyles.brandSub}>Contabilidad</span>
        </div>

        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.sidebarAvatar}>
            <Image
              className={`${consoleStyles.avatarImage} ${isSuperAdmin ? consoleStyles.avatarImageLogo : ""}`}
              src={userAvatarSrc}
              alt={isSuperAdmin ? "NEXARA" : userName}
              width={64}
              height={64}
              unoptimized
            />
          </div>
          <div className={consoleStyles.sidebarName}>{userName}</div>
          <div className={consoleStyles.sidebarEmail}>{userEmail}</div>
          <div className={consoleStyles.sidebarMeta}>
            <span className={consoleStyles.rolePill}>{userRole}</span>
            {isSuperAdmin && <span className={consoleStyles.levelPill}>Superadmin</span>}
            {!isSuperAdmin && isAdmin && <span className={consoleStyles.levelPill}>Admin</span>}
          </div>
        </div>

        {navGroups.map((group, groupIndex) => (
          <div key={group.title}>
            <div className={consoleStyles.menuTitle}>{group.title}</div>
            <ul className={consoleStyles.sidebarMenu}>
              {group.items.map((item, index) => {
                const itemPath = item.href.replace(/\/+$/, "");
                const isActive = itemPath === currentPath;
                return (
                  <li key={item.href} className={consoleStyles.sidebarMenuItem} style={{ animationDelay: `${0.08 + (groupIndex * 0.12) + index * 0.05}s` }}>
                    <Link
                      href={item.href}
                      className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${isActive ? consoleStyles.active : ""}`}
                      onClick={() => {
                        void hapticTap("selection");
                        setMobileMenuOpen(false);
                      }}
                    >
                      <span className={consoleStyles.menuLinkIcon} aria-hidden="true">{item.icon}</span>
                      <span className={consoleStyles.menuLinkText}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className={consoleStyles.menuTitle}>Cuenta y sesión</div>
        <ul className={consoleStyles.sidebarMenu}>
          <li className={consoleStyles.sidebarMenuItem}>
            <Link
              href="/paneles"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
              onClick={() => {
                void hapticTap("selection");
                setMobileMenuOpen(false);
              }}
            >
              Cambiar panel
            </Link>
          </li>

          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
              onClick={() => {
                void hapticTap("medium");
                toggleDarkMode();
              }}
              aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {darkMode ? "Cambiar a vista clara" : "Cambiar a vista oscura"}
            </button>
          </li>

          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
              onClick={handleLogout}
              aria-label="Cerrar sesión"
            >
              Cerrar sesión
            </button>
          </li>
        </ul>
      </aside>
      <main className={consoleStyles.consoleMain}>
        <section className={styles.workspaceShell}>
          <div className={styles.workspaceHeader}>
            <div>
              <p className={styles.workspaceKicker}>Panel contabilidad</p>
              <h1 className={styles.workspaceTitle}>{activeNavItem?.label || "Resumen ejecutivo"}</h1>
              <p className={styles.workspaceSubtitle}>
                Control operativo-financiero con seguimiento en tiempo real para decisiones más rápidas.
              </p>
            </div>
            <div className={styles.workspaceMeta}>
              <span className={styles.workspaceMetaPill}>{workspaceDateLabel}</span>
              <span className={styles.workspaceMetaPill}>{userRole}</span>
            </div>
          </div>

          <div className={styles.quickLinksRow}>
            {flatNavItems.map((item) => {
              const itemPath = item.href.replace(/\/+$/, "");
              const isActive = currentPath === itemPath || currentPath.endsWith(itemPath);
              return (
                <Link
                  key={`quick-${item.href}`}
                  href={item.href}
                  className={`${styles.quickLink} ${isActive ? styles.quickLinkActive : ""}`}
                  onClick={() => {
                    void hapticTap("selection");
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className={styles.workspaceContent}><PageTransition>{children}</PageTransition></div>
        </section>
      </main>
      <BottomNav
        items={[
          { icon: "📊", label: "Resumen", href: resolveContaHref("/dashboard"), hapticIntent: "selection" },
          { icon: "📒", label: "Contabilidad", href: resolveContaHref("/accounting"), hapticIntent: "selection" },
          { icon: "💰", label: "Nómina", href: resolveContaHref("/employee-payments"), hapticIntent: "selection" },
          { icon: "📊", label: "Gastos", href: resolveContaHref("/expenses"), hapticIntent: "selection" },
          { icon: "☰", label: "Menú", onPress: () => setMobileMenuOpen(true), hapticIntent: "medium" },
        ]}
      />
    </div>
  );
}
