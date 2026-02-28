"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./console.module.css";
import { useUser } from '@/components/UserContext';
import { useTheme } from '@/components/ThemeContext';
import Image from "next/image";
import { hasAnyPermission, hasPermission, PERMISSIONS } from '@/lib/permissions';
import { useState, useEffect } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  if (!user) return null;

  // Detectar si es móvil
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Cerrar menú al hacer Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMenuOpen) {
        closeMenu();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMenuOpen]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user.isSuperAdmin;
  const isConsoleUser = hasAnyPermission(user, [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN]);

  type MenuItem = {
    label: string;
    href: string;
    permissions?: string[];
    anyPermissions?: string[];
  };

  // Menú por permisos
  const menu: MenuItem[] = [
    { label: "Dashboard", href: "/dashboard", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Actividades", href: "/activities", permissions: [PERMISSIONS.CONSOLE_ACCESS] },
    { label: "Evidencias", href: "/evidences", permissions: [PERMISSIONS.CONSOLE_ACCESS] },
    { label: "Viáticos", href: "/viatics", permissions: [PERMISSIONS.CONSOLE_ACCESS] },
    { label: "Vehículos", href: "/vehicles", permissions: [PERMISSIONS.CONSOLE_ACCESS] },
    { label: "Clientes", href: "/clients", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Tickets clientes", href: "/client-tickets", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Usuarios", href: "/users", permissions: [PERMISSIONS.USERS_MANAGE] },
    { label: "Mi Perfil", href: "/my-profile", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Entradas/Salidas", href: "/attendance", permissions: [PERMISSIONS.ATTENDANCE_VIEW] },
    { label: "Mapa GPS", href: "/gps", permissions: [PERMISSIONS.GPS_VIEW] },
    { label: "Cotizaciones", href: "/cotizaciones", permissions: [PERMISSIONS.COTIZACIONES_ACCESS] },
  ];

  // Solo admin y superadmin ven multas globales
  if (isAdmin || isSuperAdmin) {
    menu.push({ label: "Multas", href: "/fines", anyPermissions: [PERMISSIONS.CONSOLE_ADMIN] });
  }

  // Usuarios de consola (incluyendo no admin) ven la sección de herramientas
  if (isConsoleUser) {
    menu.push({ label: "Herramientas", href: "/tools", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] });
  }

  // Avatar: usa user.avatarUrl si existe, si no, usa un avatar generado por ui-avatars.com
  const avatarUrl = user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre)}&background=0D8ABC&color=fff&size=96`;

  return (
    <aside className={`${styles.sidebar} ${isMenuOpen && isMobile ? styles.sidebarOpen : ''}`}>
      {/* Header del Sidebar con Logo y Hamburguesa */}
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}>
          <span className={styles.brandMark}>NEXARA</span>
          {isMobile && <span className={styles.brandSub}>Console</span>}
        </div>
        {isMobile && (
          <button
            className={`${styles.hamburgerButton} ${isMenuOpen ? styles.hamburgerActive : ''}`}
            onClick={toggleMenu}
            aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isMenuOpen}
            aria-controls="sidebar-menu"
          >
            <span className={styles.hamburgerLine}></span>
            <span className={styles.hamburgerLine}></span>
            <span className={styles.hamburgerLine}></span>
          </button>
        )}
      </div>

      {/* Overlay para móvil */}
      {isMobile && isMenuOpen && (
        <div className={styles.sidebarOverlay} onClick={closeMenu} role="presentation"></div>
      )}

      {/* Contenedor del menú que se desplaza en móvil */}
      <div className={`${styles.sidebarContent} ${isMenuOpen && isMobile ? styles.sidebarContentOpen : ''}`} id="sidebar-menu">
        <div className={styles.sidebarUser}>
          <div className={styles.sidebarAvatar}>
            <Image 
              className={styles.avatarImage} 
              src={avatarUrl} 
              alt={user.nombre}
              width={64} 
              height={64}
              priority={false}
              loading="lazy"
            />
          </div>
          <div className={styles.sidebarName}>{user.nombre}</div>
          <div className={styles.sidebarEmail}>{user.email}</div>
          <div className={styles.sidebarMeta}>
            <span className={styles.rolePill}>{user.role}</span>
            {user.isSuperAdmin && <span className={styles.levelPill}>Superadmin</span>}
          </div>
        </div>
        <div className={styles.menuTitle}>Menu principal</div>
        <ul className={styles.sidebarMenu}>
          {menu.filter(item => {
            if (item.permissions && !item.permissions.every((permission) => hasPermission(user, permission))) {
              return false;
            }
            if (item.anyPermissions && !hasAnyPermission(user, item.anyPermissions)) {
              return false;
            }
            return true;
          }).map((item) => (
            <li key={item.href} className={styles.sidebarMenuItem}>
              <Link
                href={item.href}
                className={
                  pathname && pathname === item.href
                    ? `${styles.menuLink} ${styles.active}`
                    : styles.menuLink
                }
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className={styles.sidebarFooter}>
          <button
            onClick={toggleDarkMode}
            className={styles.themeSwitcher}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
          >
            <span className={styles.themeIcon}>{darkMode ? '🌙' : '☀️'}</span>
            <span className={styles.themeLabel}>{darkMode ? 'Oscuro' : 'Claro'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
