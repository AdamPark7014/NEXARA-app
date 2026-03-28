"use client";
import ActivitiesTable from '../../../../components/ActivitiesTable';
import MyActivitiesTable from '../../../../components/MyActivitiesTable';
import FinesTable from '../../../../components/FinesTable';
import HelpTab from '@/components/HelpTab';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function ActivitiesPage() {
  const { user } = useUser();
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div className="activities-page-shell">
        {/* Admin y superadmin ven tabla de gestion */}
        {isAdmin && (
          <section className="activities-page-section">
            <ActivitiesTable />
          </section>
        )}

        {/* Usuario normal y admin (no superadmin) ven su tabla personal */}
        {!isSuperAdmin && (
          <section className="activities-page-section">
            <MyActivitiesTable />
            
            <div className="activities-fines-wrap">
              <FinesTable tipo="actividad" usuarioId={user?.id} showUser={false} />
            </div>
          </section>
        )}
        <HelpTab module="activities" user={user} />

        <style jsx>{`
          .activities-page-shell {
            display: grid;
            gap: 12px;
          }

          .activities-page-section {
            display: grid;
            gap: 8px;
          }

          .activities-fines-wrap {
            margin-top: 8px;
          }
        `}</style>
      </div>
    </RoleGuard>
  );
}
