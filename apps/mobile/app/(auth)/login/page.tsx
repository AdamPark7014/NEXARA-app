"use client";

import PanelLogin from "@/components/PanelLogin";

export default function LoginPage() {
  return (
    <PanelLogin
      redirectTo="/paneles"
      title="Iniciar sesión"
      subtitle="Ingresa a tu cuenta de Nexara"
    />
  );
}

