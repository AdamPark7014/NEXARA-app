"use client";

import Link from "next/link";
import { Stat, StatRow } from "@/components/base";
import type { WorkflowPipeline } from "@/lib/team-board-api";
import { formatPct } from "@/lib/team-board-api";

/** Franja de avance de actividades (mismo lenguaje visual que asistencias/indicadores). */
export default function FlujoKpiStrip({
  workflow,
  detalleHref = "/erp/pizarra/flujo",
}: {
  workflow: WorkflowPipeline;
  detalleHref?: string | null;
}) {
  return (
    <div style={{ marginTop: "var(--ui-s5)", marginBottom: "var(--ui-s4)", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 650 }}>Flujo del periodo</span>
        {detalleHref ? (
          <Link href={detalleHref} style={{ fontSize: 12.5, color: "var(--ui-brand, var(--primary))" }}>
            Ver detalle
          </Link>
        ) : null}
      </div>
      <StatRow cols={6}>
        <Stat label="Asignadas" value={workflow.assigned} />
        <Stat label="Iniciadas" value={workflow.started} />
        <Stat label="Con evidencias" value={workflow.evidence} />
        <Stat label="Cerradas" value={workflow.closed} tone="brand" />
        <Stat
          label="Rechazadas entre compañeros"
          value={workflow.peerRejected}
          tone={workflow.peerRejected > 0 ? "warning" : "default"}
        />
        <Stat
          label="A tiempo"
          value={formatPct(workflow.slaPct)}
          title={`${workflow.slaOnTime} a tiempo · ${workflow.slaLate} tarde`}
          tone={workflow.slaLate > 0 ? "danger" : "default"}
        />
      </StatRow>
    </div>
  );
}
