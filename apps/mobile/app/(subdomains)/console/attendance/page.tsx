"use client";

import HelpTab from '@/components/HelpTab';
import AttendanceForm from '../../../../components/AttendanceForm';
import ConsoleAttendanceTable from './ConsoleAttendanceTable';
import FinesTable from '../../../../components/FinesTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { isPlatformAdmin } from '@/lib/panel-user';

export default function AttendancePage() {
  const { user } = useUser();
  
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const isAdmin = Boolean(user && (isSuperAdmin || isPlatformAdmin(user)));

  return (
    <RoleGuard permissions={[PERMISSIONS.ATTENDANCE_VIEW]}>
      <div className="attendanceShell">
        <header className="attendanceHero">
          <p className="attendanceEyebrow">Gestion operativa</p>
          <h1 className="attendanceTitle">Asistencia y jornadas</h1>
          <p className="attendanceDescription">
            Controla marcajes, tiempos de jornada e indicadores del equipo en un solo panel.
          </p>
        </header>

        <HelpTab module="attendance" user={user} />

        <div className="attendanceGrid">
          {!isSuperAdmin && (
            <section className="attendanceSection">
              <div className="attendanceSectionHeader">
                <p className="attendanceSectionEyebrow">Mi jornada</p>
                <h2 className="attendanceSectionTitle">Registro diario</h2>
              </div>

              <div className="attendanceCardFrame">
                <AttendanceForm />
              </div>

              <div className="attendanceCardFrame">
                <FinesTable tipo="asistencia" usuarioId={user?.id} showUser={false} />
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="attendanceSection">
              <div className="attendanceSectionHeader">
                <p className="attendanceSectionEyebrow">Gestion de asistencia</p>
                <h2 className="attendanceSectionTitle">
                  {isSuperAdmin ? 'Asistencia de todos los usuarios' : 'Asistencia del equipo'}
                </h2>
              </div>
              <ConsoleAttendanceTable />
            </section>
          )}
        </div>

        <style jsx>{`
          .attendanceShell {
            width: 100%;
            max-width: 1320px;
            margin: 0 auto;
            padding: clamp(12px, 2.8vw, 24px);
            display: grid;
            gap: 16px;
          }

          .attendanceHero {
            border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
            border-radius: 20px;
            padding: clamp(14px, 3vw, 20px);
            background: linear-gradient(170deg, color-mix(in srgb, var(--surface) 99%, transparent), color-mix(in srgb, var(--surface-2) 88%, transparent));
            box-shadow: 0 18px 34px -28px color-mix(in srgb, var(--foreground) 42%, transparent);
            position: relative;
            overflow: hidden;
            display: grid;
            gap: 4px;
          }

          .attendanceHero::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 84%, white), color-mix(in srgb, var(--secondary) 78%, white));
            opacity: 0.9;
          }

          .attendanceEyebrow {
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.11em;
            font-size: 11px;
            font-weight: 760;
            color: var(--text-tertiary);
          }

          .attendanceTitle {
            margin: 0;
            font-size: clamp(26px, 3.4vw, 34px);
            line-height: 1.08;
            color: var(--foreground);
            font-family: var(--font-heading);
            letter-spacing: var(--panel-title-tracking);
          }

          .attendanceDescription {
            margin: 0;
            color: var(--text-secondary);
            font-size: 14px;
            line-height: 1.45;
            max-width: 60ch;
          }

          .attendanceGrid {
            display: grid;
            gap: 16px;
          }

          .attendanceSection {
            border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
            border-radius: 18px;
            padding: 14px;
            background: linear-gradient(168deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 90%, transparent));
            box-shadow: 0 16px 28px -24px color-mix(in srgb, var(--foreground) 34%, transparent);
            display: grid;
            gap: 12px;
          }

          .attendanceSectionHeader {
            display: grid;
            gap: 3px;
          }

          .attendanceSectionEyebrow {
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-size: 11px;
            font-weight: 700;
            color: var(--text-tertiary);
          }

          .attendanceSectionTitle {
            margin: 0;
            font-size: clamp(20px, 2.4vw, 26px);
            color: var(--foreground);
            font-family: var(--font-heading);
            letter-spacing: var(--panel-title-tracking);
          }

          .attendanceCardFrame {
            border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
            border-radius: 16px;
            padding: 10px;
            background: linear-gradient(165deg, color-mix(in srgb, var(--surface) 99%, transparent), color-mix(in srgb, var(--surface-2) 86%, transparent));
          }

          @media (max-width: 700px) {
            .attendanceSection {
              border-radius: 16px;
              padding: 12px;
            }

            .attendanceTitle {
              font-size: 1.92rem;
            }

            .attendanceSectionTitle {
              font-size: 1.44rem;
            }
          }
        `}</style>
      </div>
    </RoleGuard>
  );
}
