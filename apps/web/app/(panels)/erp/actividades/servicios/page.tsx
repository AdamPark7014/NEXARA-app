"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import ContextRail from "@/components/ui/ContextRail";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { getActivitiesSectionConfig } from "@/lib/section-views";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac/roles";

const OpsActivitiesBoard = dynamic(() => import("@/components/ops/OpsActivitiesBoard"), { ssr: false });

export default function ErpActividadesServiciosPage() {
  const { user } = useUser();
  const router = useRouter();
  const cfg = useMemo(() => getActivitiesSectionConfig(user), [user]);
  const v2 = useMemo(() => resolveV2RoleKey(user), [user]);
  const canSeeServices = Boolean(
    user?.isSuperAdmin || v2 === ROLES.CEO || v2 === ROLES.SUPER_ADMIN,
  );

  useEffect(() => {
    if (user && !canSeeServices) {
      router.replace("/erp/actividades/diarias");
    }
  }, [user, canSeeServices, router]);

  if (user && !canSeeServices) return null;

  return (
    <>
      <ContextRail
        ariaLabel="Buckets de actividades"
        items={[
          { id: "diarias", label: "Diarias", href: "/erp/actividades/diarias" },
          { id: "proyectos", label: "Proyectos", href: "/erp/actividades/proyectos" },
          { id: "servicios", label: "Servicios", href: "/erp/actividades/servicios", active: true },
        ]}
      />
      <PageHeader
        eyebrow="ERP · Actividades"
        title="Actividades de servicios"
        subtitle="OT con cliente de servicio (sin proyecto). Visible para CEO; sidebar la oculta para David vía moduleAccess."
        actions={
          cfg.canCreate ? (
            <Link href="/ops/activities/new" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="sm">
                Nueva OT
              </Button>
            </Link>
          ) : undefined
        }
      />
      <OpsActivitiesBoard bucket="services" hideProjectSegments newHref="/ops/activities/new" />
    </>
  );
}
