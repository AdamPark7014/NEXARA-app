"use client";

/**
 * Cliente: redirige a otro panel vía URL canónica + handoff.
 * Sustituye `redirect("/erp/...")` del servidor que falla en subdominios.
 */

import { useEffect, useState } from "react";
import type { PanelId } from "@/lib/access-matrix";
import { useUser } from "@/components/UserContext";
import { buildCrossPanelUrl } from "@/lib/cross-panel-handoff";

export default function CrossPanelRedirect({
  panel,
  path,
  label = "Redirigiendo…",
}: {
  panel: PanelId;
  path: string;
  label?: string;
}) {
  const { user, isContextReady } = useUser();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isContextReady) return;
    try {
      const userJson = user ? JSON.stringify(user) : null;
      const url = buildCrossPanelUrl(panel, path, userJson);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo redirigir");
    }
  }, [isContextReady, user, panel, path]);

  return (
    <div
      style={{
        padding: 48,
        textAlign: "center",
        color: "var(--text-secondary)",
        fontSize: 14,
      }}
      role="status"
    >
      {error ?? label}
    </div>
  );
}
