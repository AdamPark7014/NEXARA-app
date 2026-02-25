"use client";
import AttendanceForm from '../../../../components/AttendanceForm';
import ConsoleAttendanceTable from './ConsoleAttendanceTable';
import FinesTable from '../../../../components/FinesTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function AttendancePage() {
  const { user } = useUser();
  const isAdmin = hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE);
  const isSuperAdmin = user?.email && ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'].includes(user.email.toLowerCase());

  return (
    <RoleGuard permissions={[PERMISSIONS.ATTENDANCE_VIEW]}>
      <div style={{ display: 'grid', gap: 24 }}>
        {/* Usuario normal y admin ven su formulario */}
        {!isSuperAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>Mi Asistencia</h2>
            <AttendanceForm />
            
            <div style={{ marginTop: 24 }}>
              <FinesTable tipo="asistencia" usuarioId={user?.id} showUser={false} />
            </div>
          </div>
        )}

        {/* Solo admins y superadmins ven tabla de otros usuarios */}
        {isAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>{isSuperAdmin ? 'Asistencia de Todos' : 'Asistencia de Equipo'}</h2>
            <ConsoleAttendanceTable />
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
