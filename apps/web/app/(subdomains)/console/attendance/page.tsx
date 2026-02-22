"use client";
import AttendanceForm from '../../../../components/AttendanceForm';
import ConsoleAttendanceTable from './ConsoleAttendanceTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function AttendancePage() {
  const { user } = useUser();
  const isAdmin = hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE);

  return (
    <RoleGuard permissions={[PERMISSIONS.ATTENDANCE_VIEW]}>
      <div style={{ display: 'grid', gap: 24 }}>
        {/* Todo usuario ve su formulario de entradas/salidas */}
        <div>
          <h2 style={{ marginBottom: 16 }}>Mi Asistencia</h2>
          <AttendanceForm />
        </div>

        {/* Solo admins ven tabla de otros usuarios */}
        {isAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>Asistencia de Equipo</h2>
            <ConsoleAttendanceTable />
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
