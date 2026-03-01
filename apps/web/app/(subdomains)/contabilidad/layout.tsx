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
    { label: "Dashboard", href: "/dashboard" },
    { label: "Viaticos", href: "/viaticos" },
    { label: "Multas", href: "/multas" },
    { label: "Horas", href: "/horas" },
    { label: "Pagos", href: "/pagos" },
    { label: "Proyectos", href: "/proyectos" },
    { label: "Capital", href: "/capital" },
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
        <button
          type="button"
          className={`${consoleStyles.hamburgerButton} ${mobileMenuOpen ? consoleStyles.hamburgerActive : ""}`}
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
          aria-expanded={mobileMenuOpen}
        >
          <span className={consoleStyles.hamburgerLine} />
          <span className={consoleStyles.hamburgerLine} />
          <span className={consoleStyles.hamburgerLine} />
        </button>
        <div className={`${styles.mobileBrand} ${consoleStyles.sidebarLogo}`}>
          <span className={consoleStyles.brandMark}>NEXARA</span>
          <span className={consoleStyles.brandSub}>Contabilidad</span>
        </div>
      </header>

      {mobileMenuOpen && (
        <button
          type="button"
          className={styles.mobileBackdrop}
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Cerrar menu"
        />
      )}

      <aside className={`${consoleStyles.sidebar} ${styles.contaSidebar} ${mobileMenuOpen ? styles.contaSidebarOpen : ""}`}>
        <div className={consoleStyles.sidebarLogo}>
          <span className={consoleStyles.brandMark}>NEXARA</span>
          <span className={consoleStyles.brandSub}>Contabilidad</span>
        </div>

        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.sidebarAvatar}>
            <span className={consoleStyles.sidebarName}>CO</span>
          </div>
          <div className={consoleStyles.sidebarName}>Panel Contabilidad</div>
          <div className={consoleStyles.sidebarEmail}>Administración financiera</div>
          <div className={consoleStyles.sidebarMeta}>
            <span className={consoleStyles.rolePill}>Contabilidad</span>
          </div>
        </div>

        <div className={consoleStyles.menuTitle}>Menu contable</div>
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
              {darkMode ? "☀️ Modo Claro" : "🌙 Modo Oscuro"}
            </button>
          </li>
        </ul>
      </aside>
      <main className={consoleStyles.consoleMain}>{children}</main>
    </div>
  );
}
