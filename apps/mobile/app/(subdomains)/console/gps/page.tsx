"use client";

import { RoleGuard } from '../../../../components/RoleGuard';
import GpsMap from '../../../../components/GpsMap';
import HelpTab from '@/components/HelpTab';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';

export default function GpsPage() {
  const { user } = useUser();

  return (
    <RoleGuard permissions={[PERMISSIONS.GPS_VIEW]}>
      <HelpTab module="gps" user={user} />
      <GpsMap />
    </RoleGuard>
  );
}
