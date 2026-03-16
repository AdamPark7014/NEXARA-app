import { RoleGuard } from '../../../../components/RoleGuard';
import GpsMap from '../../../../components/GpsMap';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

export default function GpsPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.GPS_VIEW]}>
      <GpsMap />
    </RoleGuard>
  );
}
  const { user } = useUser();
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <GpsMap />
      <HelpTab module="gps" user={user} />
    </RoleGuard>
  );
}
