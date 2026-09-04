"use client";

import { usePathname } from "next/navigation";
import ContextRail from "@/components/ui/ContextRail";

const SETTINGS_LINKS = [
  { id: "params", label: "Parámetros", href: "/erp/settings" },
  { id: "billing", label: "Facturación y asientos", href: "/erp/settings/billing" },
  { id: "webhooks", label: "Webhooks", href: "/erp/settings/webhooks" },
  { id: "api", label: "Claves API", href: "/erp/settings/api-keys" },
  { id: "companies", label: "Empresas", href: "/erp/companies" },
] as const;

export default function SettingsModuleRail() {
  const pathname = usePathname() ?? "";

  return (
    <ContextRail
      ariaLabel="Configuración de la empresa"
      items={SETTINGS_LINKS.map((l) => {
        const active =
          l.id === "params"
            ? pathname === "/erp/settings"
            : pathname === l.href || pathname.startsWith(`${l.href}/`);
        return { id: l.id, label: l.label, href: l.href, active };
      })}
    />
  );
}
