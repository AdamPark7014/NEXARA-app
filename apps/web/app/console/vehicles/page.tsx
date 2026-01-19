import VehicleTable from '../../../components/VehicleTable';
import { RoleGuard } from '../../../components/RoleGuard';

export default function VehiclesPage() {
  return (
    <RoleGuard minLevel={10}>
      <VehicleTable />
    </RoleGuard>
  );
}
