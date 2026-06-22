"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PanelLogin from "@/components/PanelLogin";

function deniedPanelMessage(denied: string | null): string | undefined {
  if (denied === "contabilidad") {
    return "No tienes acceso al panel de contabilidad. Inicia sesión con una cuenta autorizada o solicita permisos a un administrador.";
  }
  return undefined;
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const accessNotice = deniedPanelMessage(searchParams.get("denied"));

  return (
    <PanelLogin
      redirectTo="/dashboard"
      title="Iniciar sesión"
      subtitle="Ingresa a tu cuenta de Nexara"
      accessNotice={accessNotice}
      smartRedirect={true}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <PanelLogin redirectTo="/dashboard" title="Iniciar sesión" subtitle="Ingresa a tu cuenta de Nexara" />
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
