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

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen, isMobile]);

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

  type MenuGroup = {
    id: string;
    title: string;
    items: MenuItem[];
  };

  const canAccessItem = (item: MenuItem) => {
    if (item.permissions && !item.permissions.every((permission) => hasPermission(user, permission))) {
      return false;
    }
    if (item.anyPermissions && !hasAnyPermission(user, item.anyPermissions)) {
      return false;
    }
    return true;
  };

  const profileItems: MenuItem[] = [
    { label: "Mi perfil", href: "/my-profile", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
  ];

  const userItems: MenuItem[] = [
    { label: "Resumen ejecutivo", href: "/dashboard", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Operación: actividades", href: "/activities", permissions: [PERMISSIONS.CONSOLE_ACCESS] },
    { label: "Evidencias de servicio", href: "/evidences", permissions: [PERMISSIONS.CONSOLE_ACCESS] },
    { label: "Viáticos operativos", href: "/viatics", permissions: [PERMISSIONS.CONSOLE_ACCESS] },
    { label: "Control vehicular", href: "/vehicles", permissions: [PERMISSIONS.CONSOLE_ACCESS] },
    { label: "Asistencia", href: "/attendance", permissions: [PERMISSIONS.ATTENDANCE_VIEW] },
    { label: "Monitoreo GPS", href: "/gps", permissions: [PERMISSIONS.GPS_VIEW] },
    { label: "Cotizaciones", href: "/cotizaciones", permissions: [PERMISSIONS.COTIZACIONES_ACCESS] },
  ];

  const adminItems: MenuItem[] = [
    { label: "Clientes corporativos", href: "/clients", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Multas y sanciones", href: "/fines", anyPermissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { label: "Gestión comercial", href: "/gestion-vendedores", anyPermissions: [PERMISSIONS.CONSOLE_ADMIN] },
  ];

  const superAdminItems: MenuItem[] = [
    { label: "Gestión de usuarios", href: "/users", permissions: [PERMISSIONS.USERS_MANAGE] },
    { label: "Herramientas internas", href: "/tools", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
  ];

  const groups: MenuGroup[] = [
    {
      id: "profile",
      title: "Tu cuenta",
      items: profileItems,
    },
    {
      id: "user",
      title: "Acceso usuario",
      items: [...userItems, ...(isAdmin || isSuperAdmin ? [] : isConsoleUser ? [{ label: "Herramientas internas", href: "/tools", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] }] : [])],
    },
    {
      id: "admin",
      title: "Acceso administrador",
      items: [...adminItems, ...(!isSuperAdmin && isAdmin ? [{ label: "Gestión de usuarios", href: "/users", permissions: [PERMISSIONS.USERS_MANAGE] }, ...(isConsoleUser ? [{ label: "Herramientas internas", href: "/tools", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] }] : [])] : [])],
    },
    {
      id: "superadmin",
      title: "Acceso superadmin",
      items: isSuperAdmin ? superAdminItems : [],
    },
  ].filter((group) => group.items.some(canAccessItem));

  // Avatar: usa user.avatarUrl si existe, si no, usa un avatar generado por ui-avatars.com
  const avatarUrl = user.isSuperAdmin
    ? '/logo-nexara.png'
    : (user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre)}&background=0D8ABC&color=fff&size=96`);

  return (
    <aside className={`${styles.sidebar} ${isMenuOpen && isMobile ? styles.sidebarOpen : ''}`}>
      {/* Header del Sidebar con Logo y Hamburguesa */}
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}>
          <span className={styles.brandMark}>NEXARA</span>
          {isMobile && <span className={styles.brandSub}>Consola</span>}
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
              className={`${styles.avatarImage} ${user.isSuperAdmin ? styles.avatarImageLogo : ''}`} 
              src={avatarUrl} 
              alt={user.isSuperAdmin ? 'NEXARA' : user.nombre}
              width={64} 
              height={64}
              priority={false}
              loading="lazy"
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
        {groups.map((group) => (
          <div key={group.id}>
            <div className={styles.menuTitle}>{group.title}</div>
            <ul className={styles.sidebarMenu}>
              {group.items.filter(canAccessItem).map((item) => {
                const isItemActive = pathname === item.href || (pathname?.startsWith(`${item.href}/`) ?? false);
                return (
                  <li key={`${group.id}-${item.href}`} className={styles.sidebarMenuItem}>
                    <Link
                      href={item.href}
                      className={isItemActive ? `${styles.menuLink} ${styles.active}` : styles.menuLink}
                      onClick={closeMenu}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className={styles.sidebarFooter}>
          <button
            onClick={toggleDarkMode}
            className={styles.themeSwitcher}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
          >
            <span className={styles.themeIcon} aria-hidden="true">●</span>
            <span className={styles.themeLabel}>{darkMode ? 'Vista oscura' : 'Vista clara'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
