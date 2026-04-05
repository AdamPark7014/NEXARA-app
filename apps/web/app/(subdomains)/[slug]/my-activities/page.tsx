"use client";
import { RoleGuard } from '../../../../components/RoleGuard';
import MyActivitiesTable from '../../../../components/MyActivitiesTable';
import FinesTable from '../../../../components/FinesTable';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';

export default function MyActivitiesPage() {
  const { user } = useUser();

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 16, paddingBottom: 'calc(var(--console-bottom-nav-clearance, 0px) + 20px)' }}>
        <div className="card" style={{ padding: 14 }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>📋 Mis Actividades</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Registro personal de actividades asignadas, progreso y entregas.
          </p>
        </div>
        <MyActivitiesTable />
        <div style={{ marginTop: 24 }}>
          <FinesTable tipo="actividad" usuarioId={user?.id} showUser={false} />
        </div>
      </div>
    </RoleGuard>
  );
}
