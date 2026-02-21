"use client";

import PanelLogin from "@/components/PanelLogin";
import { PERMISSIONS } from "@/lib/permissions";

export default function WebPanelLoginPage() {
  return <PanelLogin redirectTo="/dashboard" requiredPermission={PERMISSIONS.PANEL_WEB} />;
}
