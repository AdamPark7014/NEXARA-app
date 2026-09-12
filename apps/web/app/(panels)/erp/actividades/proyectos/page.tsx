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

export default function ErpActividadesProyectosPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getActivitiesSectionConfig(user), [user]);

  return (
    <>
      <ContextRail
        ariaLabel="Buckets de actividades"
        items={[
          { id: "diarias", label: "Diarias", href: "/erp/actividades/diarias" },
          { id: "proyectos", label: "Proyectos", href: "/erp/actividades/proyectos", active: true },
          { id: "servicios", label: "Servicios", href: "/erp/actividades/servicios" },
        ]}
      />
      <PageHeader
        eyebrow="ERP · Actividades"
        title="Actividades de proyectos"
        subtitle="OT ligadas a un projectId — misma bandeja OPS filtrada por bucket."
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
      <OpsActivitiesBoard bucket="projects" hideProjectSegments newHref="/ops/activities/new" />
    </>
  );
}
