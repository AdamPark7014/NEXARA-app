"use client";

import { usePathname } from "next/navigation";
import ContextRail from "@/components/ui/ContextRail";

const LINKS = [
  { id: "checadas", label: "Checadas", href: "/erp/hr/attendance" },
  { id: "comidas", label: "Comidas", href: "/erp/hr/lunch-breaks" },
] as const;

export default function OpsAttendanceRail() {
  const pathname = usePathname() ?? "";
  return (
    <ContextRail
      ariaLabel="Asistencia corporativa"
      items={LINKS.map((l) => ({
        id: l.id,
        label: l.label,
        href: l.href,
        active: pathname === l.href || pathname.startsWith(`${l.href}/`),
      }))}
    />
  );
}
