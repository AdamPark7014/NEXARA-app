import { RoleGuard } from '../../../../components/RoleGuard';
import MyActivitiesTable from '../../../../components/MyActivitiesTable';
import ServiceSheetForm from '../../../../components/ServiceSheetForm';
import { PERMISSIONS } from '@/lib/permissions';

export default function MyActivitiesPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 16 }}>
        <MyActivitiesTable />
        <ServiceSheetForm />
      </div>
    </RoleGuard>
  );
}
