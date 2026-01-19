import ViaticTable from '../../../components/ViaticTable';
import { RoleGuard } from '../../../components/RoleGuard';

export default function ViaticsPage() {
  return (
    <RoleGuard minLevel={10}>
      <ViaticTable />
    </RoleGuard>
  );
}
