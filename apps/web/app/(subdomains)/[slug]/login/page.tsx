"use client";

import PanelLogin from "@/components/PanelLogin";
import { PERMISSIONS } from "@/lib/permissions";

export default function VentasLoginPage() {
  return (
    <PanelLogin
      redirectTo="/dashboard"
      requiredPermission={PERMISSIONS.PANEL_VENTAS}
      title="Panel de Ventas"
      subtitle="Accede a tu pipeline, oportunidades y reportes comerciales."
    />
  );
}
