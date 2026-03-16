"use client";
import MyActivitiesTable from '../../../../components/MyActivitiesTable';
import FinesTable from '../../../../components/FinesTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

export default function MyActivitiesPage() {
  const { user } = useUser();

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <HelpTab module="my-activities" user={user} />
        <div className="card" style={{ padding: 16 }}>
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
