"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CORE_SURFACE_ONLY } from "@/lib/core-surface";
import CrmClientsPageLegacy from "./clients-legacy";

/** En Core ola1 el panel CRM no tiene menú — la entrada oficial es /erp/clientes. */
export default function CrmClientsPage() {
  const router = useRouter();

  useEffect(() => {
    if (CORE_SURFACE_ONLY) {
      router.replace("/erp/clientes");
    }
  }, [router]);

  if (CORE_SURFACE_ONLY) {
    return (
      <p style={{ color: "var(--text-secondary)", fontSize: 14, padding: 24 }}>
        Redirigiendo a Clientes…
      </p>
    );
  }

  return <CrmClientsPageLegacy />;
}
