import EvidenceTable from '../../../components/EvidenceTable';
import { RoleGuard } from '../../../components/RoleGuard';

export default function EvidencesPage() {
  return (
    <RoleGuard minLevel={10}>
      <EvidenceTable />
    </RoleGuard>
  );
}
