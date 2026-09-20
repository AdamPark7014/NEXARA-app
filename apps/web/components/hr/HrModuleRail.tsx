"use client";

import { usePathname } from "next/navigation";
import ContextRail from "@/components/ui/ContextRail";

/**
 * Subnavegación densa del módulo RRHH — rodea asistencia híbrida sin tocarla.
 */
const HR_LINKS = [
  { id: "plantilla", label: "Plantilla", href: "/erp/hr" },
  { id: "org", label: "Organigrama", href: "/erp/hr/orgchart" },
  { id: "kpis", label: "KPIs", href: "/erp/hr/kpis" },
  { id: "multas", label: "Incidencias", href: "/erp/hr/fines" },
  { id: "prenomina", label: "Pre-nómina", href: "/erp/hr/prenomina" },
] as const;

function isHrPlantillaPath(pathname: string): boolean {
  if (pathname === "/erp/hr") return true;
  return /^\/erp\/hr\/\d+(\/|$)/.test(pathname);
}

export default function HrModuleRail() {
  const pathname = usePathname() ?? "";

  return (
    <ContextRail
      ariaLabel="Módulos RRHH"
      items={HR_LINKS.map((l) => {
        const active =
          l.id === "plantilla"
            ? isHrPlantillaPath(pathname)
            : pathname === l.href || pathname.startsWith(`${l.href}/`);
        return { id: l.id, label: l.label, href: l.href, active };
      })}
    />
  );
}