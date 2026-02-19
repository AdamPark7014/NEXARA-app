"use client";
import ActivitiesTable from '../../../../components/ActivitiesTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';

export default function ActivitiesPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <ActivitiesTable />
    </RoleGuard>
  );
}
