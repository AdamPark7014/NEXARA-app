"use client";

import { useEffect } from "react";
import { CORE_SURFACE_ONLY } from "@/lib/core-surface";
import CrmClientsPageLegacy from "./clients-legacy";

/** En Core ola1 el panel CRM no tiene menú — la entrada oficial es /erp/clientes. */
export default function CrmClientsPage() {
  useEffect(() => {
    if (!CORE_SURFACE_ONLY) return;
    // Hard navigation: evita bucles si algún remap legacy interfiere con router.replace.
    window.location.replace("/erp/clientes");
  }, []);

  if (CORE_SURFACE_ONLY) {
    return (
      <p style={{ color: "var(--text-secondary)", fontSize: 14, padding: 24 }}>
        Redirigiendo a Clientes…
      </p>
    );
  }

  return <CrmClientsPageLegacy />;
}
