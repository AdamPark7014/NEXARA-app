import { RoleGuard } from '../../../components/RoleGuard';
import GpsMap from '../../../components/GpsMap';

export default function GpsPage() {
  return (
    <RoleGuard minLevel={10}>
      <GpsMap />
    </RoleGuard>
  );
}
