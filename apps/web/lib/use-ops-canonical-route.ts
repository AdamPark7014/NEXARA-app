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
import { coreVehiclesHome, isCoreMount } from "@/lib/recursos-core";
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

/**
 * Ruta canónica del par para la página actual. Montada en Core (`/erp/vehiculos`), la flotilla
 * y «Mis vehículos» tienen sus propias rutas: mandar a `/ops/...` rebotaba otra vez a Core y
 * la página entraba en un ciclo de redirecciones.
 */
function canonicalTarget(
  user: UserAccessInput,
  pair: OpsNavPair,
  current: string,
): string {
  if (pair === "vehicles" && isCoreMount(current)) return coreVehiclesHome(user);
  return CANONICAL_GETTERS[pair](user);
}

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
    const current = pathname?.split("?")[0] ?? "";
    if (!current) return;
    const target = canonicalTarget(user, pair, current);
    if (current === target) return;
    const qs = searchParams?.toString();
    router.replace(qs ? `${target}?${qs}` : target);
  }, [user, pathname, searchParams, pair, router]);
}
