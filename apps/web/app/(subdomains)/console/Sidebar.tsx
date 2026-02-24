"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./console.module.css";
import { useUser } from '@/components/UserContext';
import { useTheme } from '@/components/ThemeContext';
import Image from "next/image";
import { hasAnyPermission, hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  if (!user) return null;

  // Menú por permisos
  const menu = [
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

  // Avatar: usa user.avatarUrl si existe, si no, usa un avatar generado por ui-avatars.com
  const avatarUrl = user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre)}&background=0D8ABC&color=fff&size=96`;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarLogo}>
        <span className={styles.brandMark}>NEXARA</span>
        <span className={styles.brandSub}>Console</span>
      </div>
      <div className={styles.sidebarUser}>
        <div className={styles.sidebarAvatar}>
          <Image className={styles.avatarImage} src={avatarUrl} alt={user.nombre} width={64} height={64} />
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
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <div style={{ padding: '1rem', marginTop: 'auto', borderTop: '1px solid var(--border-color)' }}>
        <button
          onClick={toggleDarkMode}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--card-bg)',
            color: 'var(--text-color)',
            cursor: 'pointer',
            fontSize: '1.5rem',
            transition: 'all 0.2s ease',
          }}
          aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {darkMode ? '🌙' : '☀️'}
        </button>
      </div>
    </aside>
  );
}
