"use client";
import AttendanceForm from '../../../../components/AttendanceForm';
import ConsoleAttendanceTable from './ConsoleAttendanceTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

export default function AttendancePage() {
  const { user } = useUser();

  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE)) {
    return (
      <RoleGuard permissions={[PERMISSIONS.ATTENDANCE_VIEW]}>
        <AttendanceForm />
        <HelpTab module="attendance" user={user} />
      </RoleGuard>
    );
  }

  return <>
    <ConsoleAttendanceTable />
    <HelpTab module="attendance" user={user} />
  </>;
}
