import React from 'react';
import Link from 'next/link';
import { useUser } from './UserContext';

const SidebarMenu = () => {
  const { user } = useUser();
  if (!user) return null;

  return (
    <aside className="sidebar">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <li className="menu-item"><Link href="/Panel-Admin">Dashboard</Link></li>
        {(user.nivelAutoridad >= 50) && (
          <li className="menu-item"><Link href="/console/users">Gestión de Usuarios</Link></li>
        )}
        {(user.nivelAutoridad >= 50) && (
          <li className="menu-item"><Link href="/console/activities">Actividades</Link></li>
        )}
        {(user.nivelAutoridad >= 50) && (
          <li className="menu-item"><Link href="/console/evidences">Evidencias</Link></li>
        )}
        {(user.nivelAutoridad >= 50) && (
          <li className="menu-item"><Link href="/console/vehicles">Vehículos</Link></li>
        )}
        {(user.nivelAutoridad >= 50) && (
          <li className="menu-item"><Link href="/console/viatics">Viáticos</Link></li>
        )}
        {(user.nivelAutoridad === 100) && (
          <li className="menu-item"><Link href="/console/reports">Reportes</Link></li>
        )}
        {(user.nivelAutoridad === 10) && (
          <>
            <li className="menu-item"><Link href="/console/my-activities">Mis Actividades</Link></li>
            <li className="menu-item"><Link href="/console/my-evidences">Mis Evidencias</Link></li>
            <li className="menu-item"><Link href="/console/my-viatics">Mis Viáticos</Link></li>
            <li className="menu-item"><Link href="/console/my-vehicles">Mis Vehículos</Link></li>
            <li className="menu-item"><Link href="/console/attendance">Entradas/Salidas</Link></li>
          </>
        )}
        <li className="menu-item"><Link href="/console/gps">Mapa GPS</Link></li>
      </ul>
    </aside>
  );
};

export default SidebarMenu;
