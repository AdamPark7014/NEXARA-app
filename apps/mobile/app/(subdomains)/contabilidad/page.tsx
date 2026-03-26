"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setActivePanel } from "@/lib/panel-routing";
import { useUser } from "@/components/UserContext";

export default function ContabilidadIndex() {
  const router = useRouter();
  const { user, isContextReady } = useUser();

  useEffect(() => {
    if (!isContextReady) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    setActivePanel("contabilidad");
    router.replace("/contabilidad/dashboard");
  }, [router, user, isContextReady]);

  return null;
}
