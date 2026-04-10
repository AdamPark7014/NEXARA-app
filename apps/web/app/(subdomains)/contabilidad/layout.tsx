"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeContext";
import { useUser } from "@/components/UserContext";
import { canAccessContabilidadPanel, getAvatarSrc, getRoleLabel, isPlatformAdmin } from "@/lib/panel-user";
import { isCapacitorNative } from "@/lib/capacitor-env";
import consoleStyles from "../console/console.module.css";
import styles from "./layout.module.css";

export default function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  const MOBILE_BREAKPOINT = 980;
  const pathname = usePathname();
  const router = useRouter();
  const { darkMode, toggleDarkMode } = useTheme();
  const { user, logout, isContextReady } = useUser();
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

  const navGroups = [
    {
      title: "Panorama financiero",
      items: [
        { icon: "📊", label: "Resumen ejecutivo", href: "/dashboard" },
        { icon: "💼", label: "Capital y liquidez", href: "/capital" },
        { icon: "📒", label: "Contabilidad (GL)", href: "/accounting" },
        { icon: "📈", label: "Reportes financieros", href: "/accounting/reports" },
      ],
    },
    {
      title: "RRHH y control de personal",
      items: [
        { icon: "⏱️", label: "Control de horas", href: "/horas" },
        { icon: "🧳", label: "Viáticos", href: "/viaticos" },
        { icon: "⚖️", label: "Multas y sanciones", href: "/multas" },
        { icon: "💰", label: "Nómina y pagos", href: "/employee-payments" },
      ],
    },
    {
      title: "Operación financiera",
      items: [
        { icon: "📊", label: "Gastos operativos", href: "/expenses" },
        { icon: "🏗️", label: "Proyectos de obra", href: "/work-projects" },
        { icon: "🧾", label: "Facturación", href: "/invoicing" },
        { icon: "🏦", label: "Banca y conciliaciones", href: "/banking" },
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
      return;
    }
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen, isMobile]);

  useEffect(() => {
    setWorkspaceDateLabel(new Date().toLocaleDateString("es-MX"));
  }, []);

  useEffect(() => {
    if (!isContextReady || (pathname && pathname.includes("/login"))) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canAccessContabilidadPanel(user)) {
      const dest = isCapacitorNative() ? "/paneles" : "/login?denied=contabilidad";
      router.replace(dest);
    }
  }, [isContextReady, user, pathname, router]);

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
    router.replace("/login");
  };

  // Si estamos en login, no renderizar el sidebar
  if (pathname && pathname.includes("/login")) {
    return <>{children}</>;
  }

  const accessBlocked =
    isContextReady && (!user || (user && !canAccessContabilidadPanel(user)));
  if (!isContextReady || accessBlocked) {
    return (
      <div className={styles.contaRoot} style={{ minHeight: "50vh", display: "grid", placeItems: "center", padding: 24 }}>
        <p style={{ margin: 0, color: "var(--text-secondary, #445668)" }}>Cargando panel…</p>
      </div>
    );
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
          onClick={() => setMobileMenuOpen((prev) => !prev)}
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

      {(!isMobile || mobileMenuOpen) && (
      <aside
        id="conta-mobile-menu"
        className={`${consoleStyles.sidebar} ${styles.contaSidebar} ${mobileMenuOpen ? styles.contaSidebarOpen : ""}`}
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
            {isSuperAdmin ? (
              <span className={consoleStyles.levelPill}>Superadmin</span>
            ) : (
              <>
                <span className={consoleStyles.rolePill}>{userRole}</span>
                {isAdmin && userRole !== 'Admin' && (
                  <span className={consoleStyles.levelPill}>Admin</span>
                )}
              </>
            )}
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
                      onClick={() => setMobileMenuOpen(false)}
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
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
              onClick={toggleDarkMode}
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
      )}
      <main className={`${consoleStyles.consoleMain} ${styles.contaMain}`}>
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
                <Link key={`quick-${item.href}`} href={item.href} className={`${styles.quickLink} ${isActive ? styles.quickLinkActive : ""}`}>
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className={styles.workspaceContent}>{children}</div>
        </section>
      </main>
    </div>
  );
}
