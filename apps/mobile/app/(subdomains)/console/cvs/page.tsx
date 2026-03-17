"use client";

import { RoleGuard } from "@/components/RoleGuard";
import CvsManagementPanel from "@/components/CvsManagementPanel";
import HelpTab from "@/components/HelpTab";
import { PERMISSIONS } from "@/lib/permissions";
import { useUser } from "@/components/UserContext";

export default function CvsPage() {
  const { user } = useUser();

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CVS_SUPERADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN]}>
      <HelpTab module="cvs" user={user} />
      <CvsManagementPanel />
    </RoleGuard>
  );
}
