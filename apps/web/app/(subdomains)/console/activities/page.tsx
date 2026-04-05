"use client";
import ActivitiesTable from '../../../../components/ActivitiesTable';
import MyActivitiesTable from '../../../../components/MyActivitiesTable';
import FinesTable from '../../../../components/FinesTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

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
            <div className="activities-page-head">
              <p className="activities-page-kicker">Mi espacio de trabajo</p>
              <h2 className="activities-page-title">Mis Actividades</h2>
            </div>
            <MyActivitiesTable />
            
            <div style={{ marginTop: 24 }}>
              <FinesTable tipo="actividad" usuarioId={user?.id} showUser={false} />
            </div>
          </section>
        )}
        <HelpTab module="activities" user={user} />
      </div>

      <style jsx>{`
        .activities-page-shell {
          display: grid;
          gap: 22px;
        }

        .activities-page-section {
          display: grid;
          gap: 14px;
        }

        .activities-page-head {
          display: grid;
          gap: 2px;
        }

        .activities-page-kicker {
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--text-tertiary);
        }

        .activities-page-title {
          margin: 0;
          font-size: clamp(1.55rem, 2.1vw, 1.95rem);
          line-height: 1.15;
          color: var(--foreground);
        }
      `}</style>
    </RoleGuard>
  );
}
