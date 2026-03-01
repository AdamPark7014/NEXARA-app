"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./console.module.css";
import { useUser } from '@/components/UserContext';
import { useTheme } from '@/components/ThemeContext';
import Image from "next/image";
import { hasAnyPermission, hasPermission, PERMISSIONS } from '@/lib/permissions';
import { useEffect, useState } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  if (!user) return null;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 900);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen, isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    setIsMenuOpen(false);
  }, [pathname, isMobile]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMenuOpen) setIsMenuOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);

  // Menú por permisos
  const menu = [
    { label: "Dashboard", href: "/dashboard", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Actividades", href: "/activities", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Evidencias", href: "/evidences", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Viáticos", href: "/viatics", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Vehículos", href: "/vehicles", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Clientes", href: "/clients", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Tickets clientes", href: "/client-tickets", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Usuarios", href: "/users", permissions: [PERMISSIONS.USERS_MANAGE] },
    { label: "Mis Actividades", href: "/my-activities", permissions: [PERMISSIONS.CONSOLE_ACCESS], hideForAdmins: true },
    { label: "Mi Perfil", href: "/my-profile", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Mis Evidencias", href: "/my-evidences", permissions: [PERMISSIONS.CONSOLE_ACCESS], hideForAdmins: true },
    { label: "Mis Viáticos", href: "/my-viatics", permissions: [PERMISSIONS.CONSOLE_ACCESS], hideForAdmins: true },
    { label: "Mis Vehículos", href: "/my-vehicles", permissions: [PERMISSIONS.CONSOLE_ACCESS], hideForAdmins: true },
    { label: "Entradas/Salidas", href: "/attendance", permissions: [PERMISSIONS.ATTENDANCE_VIEW] },
    { label: "Mapa GPS", href: "/gps", permissions: [PERMISSIONS.GPS_VIEW] },
    { label: "Cotizaciones", href: "/cotizaciones", permissions: [PERMISSIONS.COTIZACIONES_ACCESS] },
  ];

  // Superadmin: mostrar logo Nexara en lugar de foto
  const avatarUrl = user.isSuperAdmin
    ? "/logo-nexara.png"
    : (user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre)}&background=0D8ABC&color=fff&size=96`);

  return (
    <aside className={`${styles.sidebar} ${isMenuOpen && isMobile ? styles.sidebarOpen : ''}`} data-mobile={isMobile ? 'true' : 'false'} data-open={isMenuOpen ? 'true' : 'false'}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}>
          <span className={styles.brandMark}>NEXARA</span>
          <span className={styles.brandSub}>Console</span>
        </div>
        {isMobile && (
          <button
            className={`${styles.hamburgerButton} ${isMenuOpen ? styles.hamburgerActive : ''}`}
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isMenuOpen}
            aria-controls="sidebar-menu"
            data-open={isMenuOpen ? 'true' : 'false'}
          >
            <span className={styles.hamburgerLine}></span>
            <span className={styles.hamburgerLine}></span>
            <span className={styles.hamburgerLine}></span>
          </button>
        )}
      </div>

      {isMobile && isMenuOpen && <div className={styles.sidebarOverlay} onClick={closeMenu} role="presentation" />}

      {(!isMobile || isMenuOpen) && (
      <div
        className={`${styles.sidebarContent} ${isMenuOpen && isMobile ? styles.sidebarContentOpen : ''}`}
        id="sidebar-menu"
        data-open={isMenuOpen ? 'true' : 'false'}
        style={
          isMobile
            ? {
                display: 'flex',
                opacity: 1,
                visibility: 'visible',
                transform: 'translateY(0) scale(1)',
              }
            : undefined
        }
      >
      <div className={styles.sidebarUser}>
        <div className={styles.sidebarAvatar}>
          <Image
            className={`${styles.avatarImage} ${user.isSuperAdmin ? styles.avatarImageLogo : ""}`}
            src={avatarUrl}
            alt={user.isSuperAdmin ? "NEXARA" : user.nombre}
            width={64}
            height={64}
            unoptimized
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
          if (item.hideForAdmins && user.isSuperAdmin) return false;
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
      )}
    </aside>
  );
}
