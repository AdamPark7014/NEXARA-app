"use client";

import { EnSitioStrip } from "@/components/presence/EnSitioStrip";

/** Quién está en sitio según accesos ACS de hoy — strip compartido. */
export function IntegraOccupancyPanel({ enabled }: { enabled: boolean }) {
  return (
    <EnSitioStrip
      enabled={enabled}
      variant="aside"
      title="En sitio ahora"
      pollMs={20_000}
    />
  );
}
