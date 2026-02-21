import ViaticTable from '../../../../components/ViaticTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';

export default function ViaticsPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <ViaticTable />
    </RoleGuard>
  );
}
