import { RoleGuard } from '../../../../components/RoleGuard';
import GpsMap from '../../../../components/GpsMap';
import { PERMISSIONS } from '@/lib/permissions';

export default function GpsPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.GPS_VIEW]}>
      <GpsMap />
    </RoleGuard>
  );
}
