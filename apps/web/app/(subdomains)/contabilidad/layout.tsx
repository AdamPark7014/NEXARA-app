"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeContext";
import consoleStyles from "../console/console.module.css";
import styles from "./layout.module.css";

export default function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { darkMode, toggleDarkMode } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";

  const navItems = [
    { label: "Resumen ejecutivo", href: "/dashboard" },
    { label: "Viáticos", href: "/viaticos" },
    { label: "Multas y sanciones", href: "/multas" },
    { label: "Control de horas", href: "/horas" },
    { label: "Pagos y dispersión", href: "/pagos" },
    { label: "Proyectos y costos", href: "/proyectos" },
    { label: "Capital y liquidez", href: "/capital" },
  ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
          className={`${consoleStyles.hamburgerButton} ${mobileMenuOpen ? consoleStyles.hamburgerActive : ""}`}
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileMenuOpen}
          aria-controls="conta-mobile-menu"
        >
          <span className={consoleStyles.hamburgerLine} />
          <span className={consoleStyles.hamburgerLine} />
          <span className={consoleStyles.hamburgerLine} />
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

      <aside id="conta-mobile-menu" className={`${consoleStyles.sidebar} ${styles.contaSidebar} ${mobileMenuOpen ? styles.contaSidebarOpen : ""}`}>
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

        <div className={consoleStyles.menuTitle}>Centro de control</div>
        <ul className={consoleStyles.sidebarMenu}>
          {navItems.map((item, index) => {
            const itemPath = item.href.replace(/\/+$/, "");
            const isActive = itemPath === currentPath;
            return (
              <li key={item.href} className={consoleStyles.sidebarMenuItem} style={{ animationDelay: `${0.08 + index * 0.05}s` }}>
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
      </aside>
      <main className={consoleStyles.consoleMain}>{children}</main>
    </div>
  );
}
