"use client";

import { usePathname } from "next/navigation";
import ContextRail from "@/components/ui/ContextRail";

const LINKS: { id: string; label: string; href: string; exact?: boolean }[] = [
  { id: "resumen", label: "Resumen", href: "/erp/contabilidad", exact: true },
  { id: "movimientos", label: "Movimientos", href: "/erp/contabilidad/movimientos" },
  { id: "cxc", label: "Cuentas por cobrar", href: "/erp/contabilidad/cuentas-por-cobrar" },
  { id: "cxp", label: "Cuentas por pagar", href: "/erp/contabilidad/cuentas-por-pagar" },
  { id: "conciliacion", label: "Conciliación", href: "/erp/contabilidad/conciliacion" },
  { id: "facturas", label: "Facturas", href: "/erp/contabilidad/facturas" },
  { id: "proveedores", label: "Proveedores", href: "/erp/contabilidad/proveedores" },
  { id: "prenomina", label: "Pre-nómina", href: "/erp/contabilidad/pre-nomina" },
  { id: "pagos", label: "Pagos", href: "/erp/finance/employee-payments" },
  { id: "proyectos", label: "Proyectos", href: "/erp/contabilidad/proyectos" },
  { id: "presupuestos", label: "Presupuestos", href: "/erp/contabilidad/presupuestos" },
  { id: "reportes", label: "Reportes", href: "/erp/contabilidad/reportes" },
  { id: "cierres", label: "Cierres", href: "/erp/contabilidad/cierres" },
  { id: "auditoria", label: "Auditoría", href: "/erp/contabilidad/auditoria" },
];

export default function ContabilidadSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <ContextRail
      ariaLabel="Contabilidad"
      items={LINKS.map((l) => {
        const active = l.exact
          ? pathname === l.href || pathname === `${l.href}/`
          : pathname === l.href || pathname.startsWith(`${l.href}/`);
        return { id: l.id, label: l.label, href: l.href, active };
      })}
    />
  );
}
