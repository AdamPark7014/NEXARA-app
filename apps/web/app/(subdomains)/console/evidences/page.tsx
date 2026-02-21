import EvidenceTable from '../../../../components/EvidenceTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';

export default function EvidencesPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <EvidenceTable />
    </RoleGuard>
  );
}
