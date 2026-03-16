"use client";

import PanelLogin from "@/components/PanelLogin";

export default function LoginPage() {
  return (
    <PanelLogin
      redirectTo="/dashboard"
      title="Iniciar sesión"
      subtitle="Ingresa a tu cuenta de Nexara"
    />
  );
}

