"use client";

import { DashPanel, ListRow } from "@/components/dashboard/DashKit";
import type { ExecutiveBiDrillLink } from "@/lib/executive-widgets";

export function ExecutiveBiDrillPanel({ links }: { links: ExecutiveBiDrillLink[] }) {
  if (!links.length) return null;

  return (
    <DashPanel
      title="Para profundizar"
      subtitle="Análisis detallado en Analítica"
      action="Abrir Analítica"
      actionHref="/erp/analytics/bi"
      flush
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 4 }}>
        {links.map((link) => (
          <ListRow key={link.id} href={link.href} title={link.label} sub={link.desc} trail={<span aria-hidden="true">→</span>} />
        ))}
      </div>
    </DashPanel>
  );
}
