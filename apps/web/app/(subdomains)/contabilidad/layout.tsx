"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeContext";
import { useUser } from "@/components/UserContext";
import consoleStyles from "../console/console.module.css";
import styles from "./layout.module.css";

export default function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  const MOBILE_BREAKPOINT = 980;
  const pathname = usePathname();
  const router = useRouter();
  const { darkMode, toggleDarkMode } = useTheme();
  const { logout } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";

  const navGroups = [
    {
      title: "Panorama financiero",
      items: [
        { label: "Resumen ejecutivo", href: "/dashboard" },
        { label: "Capital y liquidez", href: "/capital" },
      ],
    },
    {
      title: "RRHH y control de personal",
      items: [
        { label: "Control de horas", href: "/horas" },
        { label: "Viáticos", href: "/viaticos" },
        { label: "Multas y sanciones", href: "/multas" },
      ],
    },
    {
      title: "Operación contable",
      items: [
        { label: "Pagos y dispersión", href: "/pagos" },
        { label: "Proyectos y costos", href: "/proyectos" },
      ],
    },
  ];

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
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [MOBILE_BREAKPOINT]);

  useEffect(() => {
    const isMobile = typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT : false;
    if (!isMobile) {
      return;
    }
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen, MOBILE_BREAKPOINT]);

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
    router.replace("/login");
  };

  // Si estamos en login, no renderizar el sidebar
  if (pathname && pathname.includes("/login")) {
    return <main className={consoleStyles.consoleMain}>{children}</main>;
  }

  return (
    <div className={`${consoleStyles.consoleLayout} ${styles.contaRoot}`}>
      <header className={styles.mobileTopbar}>
        <div className={`${styles.mobileBrand} ${consoleStyles.sidebarLogo}`}>
          <span className={consoleStyles.brandMark}>NEXARA</span>
          <span className={consoleStyles.brandSub}>Contabilidad</span>
        </div>
        <button
          type="button"
          className={styles.mobileMenuButton}
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileMenuOpen}
          aria-controls="conta-mobile-menu"
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      {mobileMenuOpen && (
        <button
          type="button"
          className={styles.mobileBackdrop}
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      <aside
        id="conta-mobile-menu"
        className={`${consoleStyles.sidebar} ${styles.contaSidebar} ${mobileMenuOpen ? styles.contaSidebarOpen : ""}`}
        style={
          mobileMenuOpen
            ? {
                opacity: 1,
                visibility: "visible",
                transform: "translateY(0) scale(1)",
              }
            : undefined
        }
      >
        <div className={consoleStyles.sidebarLogo}>
          <span className={consoleStyles.brandMark}>NEXARA</span>
          <span className={consoleStyles.brandSub}>Contabilidad</span>
        </div>

        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.sidebarAvatar}>
            <span className={consoleStyles.sidebarName}>CO</span>
          </div>
          <div className={consoleStyles.sidebarName}>Panel Contabilidad</div>
          <div className={consoleStyles.sidebarEmail}>Dirección financiera corporativa</div>
          <div className={consoleStyles.sidebarMeta}>
            <span className={consoleStyles.rolePill}>Contabilidad</span>
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
                      {item.label}
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
      <main className={consoleStyles.consoleMain}>{children}</main>
    </div>
  );
}
