"use client";

import PanelLogin from "@/components/PanelLogin";

export default function LoginPage() {
  return (
    <PanelLogin
      redirectTo="/dashboard"
      title="Iniciar sesion"
      subtitle="Accede a tu cuenta NEXARA para gestionar tu operacion diaria."
    />
  );
}
