"use client";

import { RoleGuard } from "@/components/RoleGuard";
import CvsManagementPanel from "@/components/CvsManagementPanel";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from "@/components/HelpTab";

export default function CvsPage() {
  return (
    <RoleGuard anyPermissions={[PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CVS_SUPERADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN]}>
      <HelpTab module="cvs" />
      <CvsManagementPanel />
    </RoleGuard>
  );
}
