import React from 'react';
import Link from 'next/link';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { usePathname } from 'next/navigation';
import styles from './SidebarMenu.module.css';

const SidebarMenu = () => {
  const { user } = useUser();
  const pathname = usePathname();
  if (!user) return null;

  const isActive = (href: string) => {
    if (!pathname) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="sidebar">
      <ul className={styles.listReset}>
        <li className="sidebarSectionTitle">Principal</li>
        <li className={`menu-item ${isActive('/dashboard') ? 'active' : ''}`}><Link className="menuLink" href="/dashboard">Dashboard</Link></li>

        <li className="sidebarSectionTitle">Operación</li>
        {hasPermission(user, PERMISSIONS.USERS_MANAGE) && (
          <li className={`menu-item ${isActive('/console/users') ? 'active' : ''}`}><Link className="menuLink" href="/console/users">Gestión de Usuarios</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.ACTIVITIES_VIEW) && (
          <li className={`menu-item ${isActive('/console/activities') ? 'active' : ''}`}><Link className="menuLink" href="/console/activities">Actividades</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.EVIDENCES_VIEW) && (
          <li className={`menu-item ${isActive('/console/evidences') ? 'active' : ''}`}><Link className="menuLink" href="/console/evidences">Evidencias</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.ATTENDANCE_VIEW) && (
          <li className={`menu-item ${isActive('/console/attendance') ? 'active' : ''}`}><Link className="menuLink" href="/console/attendance">Entradas/Salidas</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VEHICLES_VIEW) && (
          <li className={`menu-item ${isActive('/console/vehicles') ? 'active' : ''}`}><Link className="menuLink" href="/console/vehicles">Vehículos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VIATICS_VIEW) && (
          <li className={`menu-item ${isActive('/console/viatics') ? 'active' : ''}`}><Link className="menuLink" href="/console/viatics">Viáticos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.CONTABILIDAD_VIEW) && (
          <li className={`menu-item ${isActive('/console/reports') ? 'active' : ''}`}><Link className="menuLink" href="/console/reports">Reportes</Link></li>
        )}

        <li className="sidebarSectionTitle">Mi espacio</li>
        {hasPermission(user, PERMISSIONS.ACTIVITIES_VIEW) && (
          <li className={`menu-item ${isActive('/console/my-activities') ? 'active' : ''}`}><Link className="menuLink" href="/console/my-activities">Mis Actividades</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.EVIDENCES_VIEW) && (
          <li className={`menu-item ${isActive('/console/my-evidences') ? 'active' : ''}`}><Link className="menuLink" href="/console/my-evidences">Mis Evidencias</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VIATICS_VIEW) && (
          <li className={`menu-item ${isActive('/console/my-viatics') ? 'active' : ''}`}><Link className="menuLink" href="/console/my-viatics">Mis Viaticos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VEHICLES_VIEW) && (
          <li className={`menu-item ${isActive('/console/my-vehicles') ? 'active' : ''}`}><Link className="menuLink" href="/console/my-vehicles">Mis Vehiculos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.GPS_VIEW) && (
          <li className={`menu-item ${isActive('/console/gps') ? 'active' : ''}`}><Link className="menuLink" href="/console/gps">Mapa GPS</Link></li>
        )}

        {/* Herramientas - Sección unificada con vistas internas por rol */}
        {(hasPermission(user, PERMISSIONS.TOOLS_REQUEST) || hasPermission(user, PERMISSIONS.TOOLS_MANAGE)) && (
          <li className={`menu-item ${isActive('/console/tools') ? 'active' : ''}`}><Link className="menuLink" href="/console/tools">Herramientas</Link></li>
        )}
      </ul>
    </aside>
  );
};

export default SidebarMenu;
