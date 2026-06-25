"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { getCrmManagerCanonicalPath, getCrmManagerSectionConfig } from "@/lib/section-views";

/** Redirige a vendedores que abren páginas solo de gerente comercial. */
export function useCrmManagerGuard() {
  const { user } = useUser();
  const router = useRouter();
  const cfg = useMemo(() => getCrmManagerSectionConfig(user), [user]);

  useEffect(() => {
    if (!cfg.canAccess) {
      router.replace(getCrmManagerCanonicalPath());
    }
  }, [cfg.canAccess, router]);

  return cfg;
}
