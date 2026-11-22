"use client";

import { usePathname } from "next/navigation";
import ContextRail from "@/components/ui/ContextRail";
import { useUser } from "@/components/UserContext";
import { canUserAccessPath } from "@/lib/user-access";

/**
 * Subnavegación densa del módulo RRHH — rodea asistencia híbrida sin tocarla.
 *
 * Solo aparecen las secciones que quien mira puede abrir: decide `canUserAccessPath`, la misma
 * función de la guarda de ruta y del menú. Antes salían las seis a todos y dos de ellas llevaban
 * a Coordinación Administrativa a una página que le negaba el paso.
 */
const HR_LINKS = [
  { id: "plantilla", label: "Plantilla", href: "/erp/hr" },
  { id: "org", label: "Organigrama", href: "/erp/hr/orgchart" },
  { id: "kpis", label: "Indicadores", href: "/erp/hr/kpis" },
  { id: "multas", label: "Multas y sanciones", href: "/erp/hr/fines" },
  { id: "bitacora", label: "Bitácora de incidencias", href: "/erp/hr/incidencias" },
  { id: "prenomina", label: "Prenómina", href: "/erp/hr/prenomina" },
] as const;

function isHrPlantillaPath(pathname: string): boolean {
  if (pathname === "/erp/hr") return true;
  return /^\/erp\/hr\/\d+(\/|$)/.test(pathname);
}

export default function HrModuleRail() {
  const pathname = usePathname() ?? "";
  const { user } = useUser();
  const visibles = HR_LINKS.filter((l) => canUserAccessPath(user, l.href));

  // Una fila con una sola pestaña no lleva a ningún lado.
  if (visibles.length < 2) return null;

  return (
    <ContextRail
      ariaLabel="Secciones de Recursos Humanos"
      items={visibles.map((l) => {
        const active =
          l.id === "plantilla"
            ? isHrPlantillaPath(pathname)
            : pathname === l.href || pathname.startsWith(`${l.href}/`);
        return { id: l.id, label: l.label, href: l.href, active };
      })}
    />
  );
}