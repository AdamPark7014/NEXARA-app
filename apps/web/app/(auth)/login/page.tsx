"use client";

import PanelLogin from "@/components/PanelLogin";

export default function LoginPage() {
  return (
    <PanelLogin
      redirectTo="/dashboard"
      title="Iniciar sesion"
      subtitle="Ingresa a tu cuenta de Nexara"
    />
  );
}
