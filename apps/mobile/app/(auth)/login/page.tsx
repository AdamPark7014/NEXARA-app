"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PanelLogin from "@/components/PanelLogin";

export default function LoginPage() {
  const router = useRouter();

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
    />
  );
}

