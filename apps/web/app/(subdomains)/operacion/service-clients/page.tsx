"use client";

import { useEffect } from "react";
import { getConsoleUrl } from "@/lib/panel-urls";

/** Legacy route: clientes operativos viven en Administración → Clientes. */
export default function ServiceClientsRedirectPage() {
  useEffect(() => {
    window.location.replace(getConsoleUrl("/clients"));
  }, []);

  return (
    <div style={{ padding: 24, color: "var(--text-secondary)" }}>
      Redirigiendo al hub unificado de clientes…
    </div>
  );
}
