"use client";

import { usePathname } from "next/navigation";
import ContextRail from "@/components/ui/ContextRail";

const LINKS = [
  { id: "lista", label: "Lista", href: "/crm/opportunities" },
  { id: "kanban", label: "Kanban", href: "/crm/pipeline" },
] as const;

export default function CrmPipelineRail() {
  const pathname = usePathname() ?? "";
  return (
    <ContextRail
      ariaLabel="Vistas del pipeline"
      items={LINKS.map((l) => ({
        id: l.id,
        label: l.label,
        href: l.href,
        active: pathname === l.href || pathname.startsWith(`${l.href}/`),
      }))}
    />
  );
}
