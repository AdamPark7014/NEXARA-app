"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { getHrSectionConfig } from "@/lib/section-views";

/** Redirige usuarios sin acceso a gestión de plantilla RH. */
export function useHrManagementGuard(fallbackPath = "/erp/hr/attendance") {
  const { user } = useUser();
  const router = useRouter();
  const cfg = useMemo(() => getHrSectionConfig(user), [user]);

  useEffect(() => {
    if (!cfg.canAccess) {
      router.replace(fallbackPath);
    }
  }, [cfg.canAccess, router, fallbackPath]);

  return cfg;
}
