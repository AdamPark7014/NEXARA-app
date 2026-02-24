"use client";
import ActivitiesTable from '../../../../components/ActivitiesTable';
import MyActivitiesTable from '../../../../components/MyActivitiesTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function ActivitiesPage() {
  const { user } = useUser();
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 24 }}>
        {/* Admin y superadmin ven tabla de gestion */}
        {isAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>{isSuperAdmin ? 'Actividades de Todos' : 'Gestión de Actividades'}</h2>
            <ActivitiesTable />
          </div>
        )}

        {/* Usuario normal y admin (no superadmin) ven su tabla personal */}
        {!isSuperAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>Mis Actividades</h2>
            <MyActivitiesTable />
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
