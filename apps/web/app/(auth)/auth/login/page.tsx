"use client";

import PanelLogin from "@/components/PanelLogin";

export default function LoginPage() {
  return (
    <PanelLogin
      redirectTo="/dashboard"
      title="Iniciar sesión"
      subtitle="Bienvenido de nuevo. Ingresa para continuar en tu panel de trabajo."
    />
  );
}

