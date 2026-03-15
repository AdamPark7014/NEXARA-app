"use client";

import PanelLogin from "@/components/PanelLogin";
import { PERMISSIONS } from "@/lib/permissions";

export default function VentasLoginPage() {
  return (
    <PanelLogin
      redirectTo="/dashboard"
      requiredPermission={PERMISSIONS.PANEL_VENTAS}
      title="Iniciar sesion"
      subtitle="Ingresa a tu cuenta de Nexara"
    />
  );
}
