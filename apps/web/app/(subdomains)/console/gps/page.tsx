import { RoleGuard } from '../../../../components/RoleGuard';
import GpsMap from '../../../../components/GpsMap';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';
import { useUser } from '../../../../components/UserContext';

export default function GpsPage() {
  const { user } = useUser();
  return (
    <RoleGuard permissions={[PERMISSIONS.GPS_VIEW]}>
      <GpsMap />
      <HelpTab module="gps" user={user} />
    </RoleGuard>
  );
}
