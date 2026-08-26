"use client";

import Link from "next/link";
import { DashPanel, ListRow } from "@/components/dashboard/DashKit";
import type { ExecutiveBiDrillLink } from "@/lib/executive-widgets";

export function ExecutiveBiDrillPanel({ links }: { links: ExecutiveBiDrillLink[] }) {
  if (!links.length) return null;

  return (
    <DashPanel title="Análisis profundo" subtitle="Drill-down a BI y pipeline" flush>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 4 }}>
        {links.map((link) => (
          <ListRow key={link.id} href={link.href} title={link.label} sub={link.desc} trail="→" />
        ))}
      </div>
      <div style={{ padding: "8px 12px 4px" }}>
        <Link href="/erp/analytics/bi" style={{ fontSize: 12, color: "var(--primary)" }}>
          Abrir tablero BI completo
        </Link>
      </div>
    </DashPanel>
  );
}
