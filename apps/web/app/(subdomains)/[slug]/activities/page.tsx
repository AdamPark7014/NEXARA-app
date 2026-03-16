"use client";
import ActivitiesTable from '../../../../components/ActivitiesTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';
import { useUser } from '@/components/UserContext';

export default function ActivitiesPage() {
  const { user } = useUser();
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <ActivitiesTable />
      <HelpTab module="activities" user={user} />
    </RoleGuard>
  );
}
