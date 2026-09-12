"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import ContextRail from "@/components/ui/ContextRail";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { getActivitiesSectionConfig } from "@/lib/section-views";

const OpsActivitiesBoard = dynamic(() => import("@/components/ops/OpsActivitiesBoard"), { ssr: false });

export default function ErpActividadesDiariasPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getActivitiesSectionConfig(user), [user]);

  return (
    <>
      <ContextRail
        ariaLabel="Buckets de actividades"
        items={[
          { id: "diarias", label: "Diarias", href: "/erp/actividades/diarias", active: true },
          { id: "proyectos", label: "Proyectos", href: "/erp/actividades/proyectos" },
          { id: "servicios", label: "Servicios", href: "/erp/actividades/servicios" },
        ]}
      />
      <PageHeader
        eyebrow="ERP · Actividades"
        title="Actividades diarias"
        subtitle="OT sin proyecto ni cliente de servicio — alcance David (subtree) vía API."
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
      <OpsActivitiesBoard bucket="daily" hideProjectSegments newHref="/ops/activities/new" />
    </>
  );
}
