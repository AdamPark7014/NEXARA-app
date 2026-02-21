"use client";
import AttendanceForm from '../../../../components/AttendanceForm';
import ConsoleAttendanceTable from './ConsoleAttendanceTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function AttendancePage() {
  const { user } = useUser();

  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE)) {
    return (
      <RoleGuard permissions={[PERMISSIONS.ATTENDANCE_VIEW]}>
        <AttendanceForm />
      </RoleGuard>
    );
  }

  return <ConsoleAttendanceTable />;
}
