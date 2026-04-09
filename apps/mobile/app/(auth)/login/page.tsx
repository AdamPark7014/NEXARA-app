"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PanelLogin from "@/components/PanelLogin";

function deniedPanelMessage(denied: string | null): string | undefined {
  if (denied === "contabilidad") {
    return "No tienes acceso al panel de contabilidad. Inicia sesión con una cuenta autorizada o solicita permisos a un administrador.";
  }
  return undefined;
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessNotice = deniedPanelMessage(searchParams.get("denied"));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const branchSessionRaw = window.sessionStorage.getItem("branchSession");
    if (branchSessionRaw) {
      try {
        const branchSession = JSON.parse(branchSessionRaw) as { branch?: { id?: number; branchNumber?: string | null } };
        const branchSlug = branchSession.branch?.branchNumber || (branchSession.branch?.id ? `branch-${branchSession.branch.id}` : null);
        if (branchSlug) {
          router.replace(`/tickets/${branchSlug}`);
          return;
        }
      } catch {
        window.sessionStorage.removeItem("branchSession");
      }
    }

    if (window.sessionStorage.getItem("clientSession")) {
      router.replace("/tickets");
    }
  }, [router]);

  return (
    <PanelLogin
      redirectTo="/paneles"
      title="Iniciar sesión"
      subtitle="Ingresa a tu cuenta de Nexara"
      accessNotice={accessNotice}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <PanelLogin redirectTo="/paneles" title="Iniciar sesión" subtitle="Ingresa a tu cuenta de Nexara" />
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
