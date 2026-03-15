"use client";

import PanelLogin from "@/components/PanelLogin";

export default function LoginPage() {
  return (
    <PanelLogin
      redirectTo="/paneles"
      title="NEXARA · Iniciar sesion"
      subtitle="Accede con tu cuenta corporativa para continuar en la app movil."
    />
  );
}
