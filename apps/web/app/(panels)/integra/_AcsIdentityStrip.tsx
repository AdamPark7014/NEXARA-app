"use client";

import { EnSitioStrip } from "@/components/presence/EnSitioStrip";

/**
 * Identidad ACS al lado del video — misma franja «En sitio» cross-panel.
 * No es Face ID sobre AcuSense: caras vienen del control de acceso.
 */
export function IntegraAcsIdentityStrip({ enabled }: { enabled: boolean }) {
  return (
    <EnSitioStrip
      enabled={enabled}
      variant="aside"
      title="En sitio · ACS"
      pollMs={6_000}
    />
  );
}
