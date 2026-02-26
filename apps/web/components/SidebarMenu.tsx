import React from 'react';
import Link from 'next/link';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

const SidebarMenu = () => {
  const { user } = useUser();
  if (!user) return null;

  return (
    <aside className="sidebar">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <li className="menu-item"><Link href="/dashboard">Dashboard</Link></li>
        {hasPermission(user, PERMISSIONS.USERS_MANAGE) && (
          <li className="menu-item"><Link href="/console/users">Gestión de Usuarios</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.ACTIVITIES_VIEW) && (
          <li className="menu-item"><Link href="/console/activities">Actividades</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.EVIDENCES_VIEW) && (
          <li className="menu-item"><Link href="/console/evidences">Evidencias</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.ATTENDANCE_VIEW) && (
          <li className="menu-item"><Link href="/console/attendance">Entradas/Salidas</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.ATTENDANCE_VIEW) && (
          <li className="menu-item"><Link href="/console/lunch-breaks">🍽️ Horas de Comida</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VEHICLES_VIEW) && (
          <li className="menu-item"><Link href="/console/vehicles">Vehículos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VIATICS_VIEW) && (
          <li className="menu-item"><Link href="/console/viatics">Viáticos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.CONTABILIDAD_VIEW) && (
          <li className="menu-item"><Link href="/console/reports">Reportes</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.ACTIVITIES_VIEW) && (
          <li className="menu-item"><Link href="/console/my-activities">Mis Actividades</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.EVIDENCES_VIEW) && (
          <li className="menu-item"><Link href="/console/my-evidences">Mis Evidencias</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VIATICS_VIEW) && (
          <li className="menu-item"><Link href="/console/my-viatics">Mis Viaticos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.VEHICLES_VIEW) && (
          <li className="menu-item"><Link href="/console/my-vehicles">Mis Vehiculos</Link></li>
        )}
        {hasPermission(user, PERMISSIONS.GPS_VIEW) && (
          <li className="menu-item"><Link href="/console/gps">Mapa GPS</Link></li>
        )}

        {/* Herramientas - Solo vista para usuarios normales que pueden solicitar */}
        {hasPermission(user, PERMISSIONS.TOOLS_REQUEST) && !hasPermission(user, PERMISSIONS.TOOLS_MANAGE) && (
          <li className="menu-item"><Link href="/console/my-tools">Mis Herramientas</Link></li>
        )}

        {/* Herramientas - Vistas para admins y Super admin */}
        {hasPermission(user, PERMISSIONS.TOOLS_MANAGE) && (
          <>
            <li className="menu-item"><Link href="/console/tools">Solicitudes de Herramientas</Link></li>
            <li className="menu-item"><Link href="/console/tools/renewals">Renovaciones</Link></li>
            <li className="menu-item"><Link href="/console/my-tools">Mis Herramientas</Link></li>
          </>
        )}
      </ul>
    </aside>
  );
};

export default SidebarMenu;
