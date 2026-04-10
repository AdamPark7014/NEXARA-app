"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "../console/console.module.css";
import { useUser } from '@/components/UserContext';
import { useTheme } from '@/components/ThemeContext';
import Image from "next/image";
import { hasAnyPermission, hasPermission, PERMISSIONS } from '@/lib/permissions';
import { getAvatarSrc, getRoleLabel, isPlatformAdmin } from '@/lib/panel-user';
import { useEffect, useState } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  if (!user) return null;
  const isAdmin = isPlatformAdmin(user);
  const userRoleLabel = getRoleLabel(user);
  const closeMenu = () => setIsMenuOpen(false);
  const handleLogout = () => {
    logout();
    closeMenu();
    router.replace('/login');
  };

  // Menú por permisos
  const menu = [
    { icon: "📊", label: "Dashboard", href: "/dashboard", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🗂️", label: "Actividades", href: "/activities", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📸", label: "Evidencias", href: "/evidences", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "💼", label: "Viáticos", href: "/viatics", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🚗", label: "Vehículos", href: "/vehicles", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🏢", label: "Clientes", href: "/clients", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🎫", label: "Tickets clientes", href: "/client-tickets", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🧑‍💼", label: "Usuarios", href: "/users", permissions: [PERMISSIONS.USERS_MANAGE] },
    { icon: "📄", label: "Gestión CVs", href: "/cvs", anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "✅", label: "Mis Actividades", href: "/my-activities", permissions: [PERMISSIONS.CONSOLE_ACCESS], hideForAdmins: true },
    { icon: "👤", label: "Mi Perfil", href: "/my-profile", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🧷", label: "Mis Evidencias", href: "/my-evidences", permissions: [PERMISSIONS.CONSOLE_ACCESS], hideForAdmins: true },
    { icon: "🧳", label: "Mis Viáticos", href: "/my-viatics", permissions: [PERMISSIONS.CONSOLE_ACCESS], hideForAdmins: true },
    { icon: "🚙", label: "Mis Vehículos", href: "/my-vehicles", permissions: [PERMISSIONS.CONSOLE_ACCESS], hideForAdmins: true },
    { icon: "🕒", label: "Entradas/Salidas", href: "/attendance", permissions: [PERMISSIONS.ATTENDANCE_VIEW] },
    { icon: "🛰️", label: "Mapa GPS", href: "/gps", permissions: [PERMISSIONS.GPS_VIEW] },
    { icon: "🧾", label: "Cotizaciones", href: "/cotizaciones", permissions: [PERMISSIONS.COTIZACIONES_ACCESS] },
  ];

  const avatarUrl = getAvatarSrc(user);

  return (
    <aside className={styles.sidebar} data-mobile={isMobile ? 'true' : 'false'} data-open={isMenuOpen ? 'true' : 'false'}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}>
          <img src="/logo-nexara.png" alt="NEXARA" className={styles.brandLogo} />
          <span className={styles.brandMark}>NEXARA</span>
          <span className={styles.brandSub}>Console</span>
        </div>
        {isMobile && (
          <button
            type="button"
            className={styles.hamburgerButton}
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

      {isMobile && isMenuOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={closeMenu}
          role="presentation"
        />
      )}

      {(!isMobile || isMenuOpen) && (
      <div
        className={styles.sidebarContent}
        id="sidebar-menu"
        data-open={isMobile && isMenuOpen ? 'true' : undefined}
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
          {user.isSuperAdmin ? (
            <span className={styles.levelPill}>Superadmin</span>
          ) : (
            <>
              <span className={styles.rolePill}>{userRoleLabel}</span>
              {isAdmin && userRoleLabel !== 'Admin' && (
                <span className={styles.levelPill}>Admin</span>
              )}
            </>
          )}
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
              <span className={styles.menuLinkIcon} aria-hidden="true">{item.icon}</span>
              <span className={styles.menuLinkText}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.sidebarFooter}>
        <div className={styles.sidebarFooterActions}>
          <button
            onClick={toggleDarkMode}
            className={styles.themeSwitcher}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
          >
            <span className={styles.themeIcon}>{darkMode ? '🌙' : '☀️'}</span>
            <span className={styles.themeLabel}>{darkMode ? 'Oscuro' : 'Claro'}</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className={styles.logoutButton}
            aria-label="Cerrar sesión"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
      </div>
      )}
    </aside>
  );
}
