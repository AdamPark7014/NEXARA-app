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
          <li className={`menu-item ${isActive('/operacion/activities') ? 'active' : ''}`}><Link className="menuLink" href="/operacion/activities">Actividades</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.EVIDENCES_VIEW) && (
          <li className={`menu-item ${isActive('/operacion/evidences') ? 'active' : ''}`}><Link className="menuLink" href="/operacion/evidences">Evidencias</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.ATTENDANCE_VIEW) && (
          <li className={`menu-item ${isActive('/console/attendance') ? 'active' : ''}`}><Link className="menuLink" href="/console/attendance">Entradas/Salidas</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VEHICLES_VIEW) && (
          <li className={`menu-item ${isActive('/operacion/vehicles') ? 'active' : ''}`}><Link className="menuLink" href="/operacion/vehicles">Vehículos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VIATICS_VIEW) && (
          <li className={`menu-item ${isActive('/operacion/viatics') ? 'active' : ''}`}><Link className="menuLink" href="/operacion/viatics">Viáticos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.CONTABILIDAD_VIEW) && (
          <li className={`menu-item ${isActive('/console/reports') ? 'active' : ''}`}><Link className="menuLink" href="/console/reports">Reportes</Link></li>
        )}

        <li className="sidebarSectionTitle">Mi espacio</li>
        {hasPermission(user, PERMISSIONS.ACTIVITIES_VIEW) && (
          <li className={`menu-item ${isActive('/operacion/my-activities') ? 'active' : ''}`}><Link className="menuLink" href="/operacion/my-activities">Mis Actividades</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.EVIDENCES_VIEW) && (
          <li className={`menu-item ${isActive('/operacion/my-evidences') ? 'active' : ''}`}><Link className="menuLink" href="/operacion/my-evidences">Mis Evidencias</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VIATICS_VIEW) && (
          <li className={`menu-item ${isActive('/operacion/my-viatics') ? 'active' : ''}`}><Link className="menuLink" href="/operacion/my-viatics">Mis Viáticos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VEHICLES_VIEW) && (
          <li className={`menu-item ${isActive('/operacion/my-vehicles') ? 'active' : ''}`}><Link className="menuLink" href="/operacion/my-vehicles">Mis Vehículos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.GPS_VIEW) && (
          <li className={`menu-item ${isActive('/operacion/gps') ? 'active' : ''}`}><Link className="menuLink" href="/operacion/gps">Mapa GPS</Link></li>
        )}

        {/* Herramientas - Sección unificada con vistas internas por rol */}
        {(hasPermission(user, PERMISSIONS.TOOLS_REQUEST) || hasPermission(user, PERMISSIONS.TOOLS_MANAGE)) && (
          <li className={`menu-item ${isActive('/operacion/tools') ? 'active' : ''}`}><Link className="menuLink" href="/operacion/tools">Herramientas</Link></li>
        )}
      </ul>
    </aside>
  );
};

export default SidebarMenu;

