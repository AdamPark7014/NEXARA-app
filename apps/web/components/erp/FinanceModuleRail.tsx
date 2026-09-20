"use client";

import { usePathname } from "next/navigation";
import ContextRail from "@/components/ui/ContextRail";

const FINANCE_LINKS = [
  { id: "accounting", label: "Contabilidad", href: "/erp/contabilidad" },
  { id: "invoicing", label: "Facturación CFDI", href: "/erp/invoicing" },
  { id: "banking", label: "Bancos", href: "/erp/banking" },
  { id: "viatics", label: "Viáticos", href: "/erp/finance/viatics" },
  { id: "expenses", label: "Gastos", href: "/erp/finance/expenses" },
  { id: "payments", label: "Pagos a personal", href: "/erp/finance/employee-payments" },
  { id: "prenomina", label: "Pre-nómina", href: "/erp/finance/prenomina" },
] as const;

export default function FinanceModuleRail() {
  const pathname = usePathname() ?? "";

  return (
    <ContextRail
      ariaLabel="Módulos de finanzas"
      items={FINANCE_LINKS.map((l) => ({
        id: l.id,
        label: l.label,
        href: l.href,
        active:
          l.href === "/erp/contabilidad"
            ? pathname === l.href ||
              pathname.startsWith(`${l.href}/`) ||
              pathname === "/erp/accounting" ||
              pathname.startsWith("/erp/accounting/")
            : pathname === l.href || pathname.startsWith(`${l.href}/`),
      }))}
    />
  );
}
