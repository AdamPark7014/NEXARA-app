"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getActivitiesCanonicalPath,
  getEvidencesCanonicalPath,
  getViaticsCanonicalPath,
  getVehiclesCanonicalPath,
  type OpsNavPair,
} from "@/lib/section-views";
import type { UserAccessInput } from "@/lib/rbac/role-mapping";

const CANONICAL_GETTERS: Record<
  OpsNavPair,
  (user: UserAccessInput | null | undefined) => string
> = {
  activities: getActivitiesCanonicalPath,
  evidences: getEvidencesCanonicalPath,
  viatics: getViaticsCanonicalPath,
  vehicles: getVehiclesCanonicalPath,
};

/** Redirige a la ruta canónica del par OPS (equipo vs propio) según rol. */
export function useOpsCanonicalRoute(
  user: UserAccessInput | null | undefined,
  pair: OpsNavPair,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!user) return;
    const target = CANONICAL_GETTERS[pair](user);
    const current = pathname?.split("?")[0] ?? "";
    if (!current || current === target) return;
    const qs = searchParams?.toString();
    router.replace(qs ? `${target}?${qs}` : target);
  }, [user, pathname, searchParams, pair, router]);
}
