"use client";

import PanelLogin from "@/components/PanelLogin";
import { PERMISSIONS } from "@/lib/permissions";

export default function ContabilidadLoginPage() {
  return (
    <PanelLogin
      redirectTo="/dashboard"
      requiredPermission={PERMISSIONS.CONTABILIDAD_VIEW}
    />
  );
}
