"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./console.module.css";
import { useUser } from "../../components/UserContext";
import Image from "next/image";

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  if (!user) return null;

  // Menú según nivel de autoridad
  const menu = [
    { label: "Dashboard", href: "/console/dashboard", minLevel: 10 },
    { label: "Actividades", href: "/console/activities", minLevel: 50 },
    { label: "Evidencias", href: "/console/evidences", minLevel: 50 },
    { label: "Viáticos", href: "/console/viatics", minLevel: 50 },
    { label: "Vehículos", href: "/console/vehicles", minLevel: 50 },
    { label: "Usuarios", href: "/console/users", minLevel: 50 },
    { label: "Reportes", href: "/console/reports", minLevel: 100 },
    { label: "Mis Actividades", href: "/console/my-activities", minLevel: 10, only: 10 },
    { label: "Mis Evidencias", href: "/console/my-evidences", minLevel: 10, only: 10 },
    { label: "Mis Viáticos", href: "/console/my-viatics", minLevel: 10, only: 10 },
    { label: "Mis Vehículos", href: "/console/my-vehicles", minLevel: 10, only: 10 },
    { label: "Entradas/Salidas", href: "/console/attendance", minLevel: 10, only: 10 },
    { label: "Mapa GPS", href: "/console/gps", minLevel: 10 },
  ];

  // Avatar: usa user.avatarUrl si existe, si no, usa un avatar generado por ui-avatars.com
  const avatarUrl = user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre)}&background=0D8ABC&color=fff&size=96`;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarLogo}>NEXARA Console</div>
      <div className={styles.sidebarUser} style={{marginBottom: 16, fontSize: 13, color: '#aaa', textAlign: 'center'}}>
        <Image src={avatarUrl} alt={user.nombre} width={64} height={64} style={{borderRadius: '50%', marginBottom: 8}} />
        <div><b>{user.nombre}</b></div>
        <div style={{fontSize: 12}}>{user.email}</div>
        <div style={{fontSize: 12}}>Nivel: {user.nivelAutoridad} ({user.role})</div>
      </div>
      <ul className={styles.sidebarMenu}>
        {menu.filter(item => {
          if (item.only !== undefined) return user.nivelAutoridad === item.only;
          return user.nivelAutoridad >= item.minLevel;
        }).map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={
                pathname && pathname.startsWith(item.href)
                  ? `${styles.active} ${styles.sidebarMenu}`
                  : styles.sidebarMenu
              }
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
