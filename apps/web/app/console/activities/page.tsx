"use client";
import ActivitiesTable from '../../../components/ActivitiesTable';
import { RoleGuard } from '../../../components/RoleGuard';

export default function ActivitiesPage() {
  return (
    <RoleGuard minLevel={10}>
      <ActivitiesTable />
    </RoleGuard>
  );
}
