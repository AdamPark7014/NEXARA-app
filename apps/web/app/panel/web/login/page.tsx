"use client";

import PanelLogin from "@/components/PanelLogin";
import { PERMISSIONS } from "@/lib/permissions";

export default function WebPanelLoginPage() {
  return <PanelLogin redirectTo="/panel/web/dashboard" requiredPermission={PERMISSIONS.PANEL_WEB} />;
}
