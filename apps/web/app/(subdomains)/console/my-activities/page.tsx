import { RoleGuard } from '../../../../components/RoleGuard';
import MyActivitiesTable from '../../../../components/MyActivitiesTable';
import { PERMISSIONS } from '@/lib/permissions';

export default function MyActivitiesPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 16 }}>
        <MyActivitiesTable />
      </div>
    </RoleGuard>
  );
}
