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

const RAIL = [
  { id: "tareas", label: "Tareas", href: "/erp/actividades/tareas" },
  { id: "proyectos", label: "Proyectos", href: "/erp/actividades/proyectos" },
  { id: "servicios", label: "Servicios", href: "/erp/actividades/servicios" },
] as const;

export default function ErpActividadesProyectosPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getActivitiesSectionConfig(user), [user]);

  return (
    <>
      <ContextRail
        ariaLabel="Tipos de actividad"
        items={RAIL.map((i) => ({ ...i, active: i.id === "proyectos" }))}
      />
      <PageHeader
        eyebrow="ERP · Actividades"
        title="Proyectos"
        subtitle="Actividades ligadas a un proyecto."
        actions={
          cfg.canCreate ? (
            <Link href="/ops/activities/new?mode=proyecto" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="sm">
                Nueva de proyecto
              </Button>
            </Link>
          ) : undefined
        }
      />
      <OpsActivitiesBoard bucket="projects" hideProjectSegments newHref="/ops/activities/new?mode=proyecto" />
    </>
  );
}
