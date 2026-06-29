/** Normaliza filas de viáticos desde la API Prisma. */
export interface ViaticoRow {
  id: number;
  concepto?: string;
  motivo?: string;
  montoSolicitado?: number;
  monto?: number;
  estatus?: string;
  approvalStep?: number;
  approvalTrail?: { role: string; userName?: string; action: string; at: string }[];
  contabilidadRef?: string;
  estado?: string;
  fechaSolicitud?: string;
  fecha?: string;
  comprobante?: string;
  ticketEvidenciaUrl?: string;
  usuario?: { id?: number; nombre?: string };
  user?: { id?: number; nombre?: string };
  actividad?: { id?: number; anNumber?: string; titulo?: string; folio?: string } | null;
  activity?: { id?: number; anNumber?: string; titulo?: string } | null;
  actividadId?: number | null;
}

export function normalizeViaticoRow(raw: Record<string, unknown>): ViaticoRow {
  const actividad = (raw.actividad ?? raw.activity) as ViaticoRow["actividad"];
  const usuario = (raw.usuario ?? raw.user) as ViaticoRow["usuario"];
  return {
    ...(raw as unknown as ViaticoRow),
    concepto: (raw.motivo as string | undefined) ?? (raw.concepto as string | undefined),
    montoSolicitado: Number(raw.montoSolicitado ?? raw.monto ?? 0) || 0,
    estatus: (raw.estatus as string | undefined) ?? (raw.estado as string | undefined),
    fechaSolicitud: (raw.fechaSolicitud as string | undefined) ?? (raw.fecha as string | undefined),
    comprobante: (raw.ticketEvidenciaUrl as string | undefined) ?? (raw.comprobante as string | undefined),
    actividad,
    usuario,
    actividadId: (raw.actividadId as number | undefined) ?? actividad?.id ?? null,
  };
}

export function viaticoEstatusVariant(e?: string | null): "positive" | "warning" | "danger" | "accent" | "default" {
  if (!e) return "default";
  if (e === "Aprobado" || e === "Pagado") return "positive";
  if (e === "Rechazado") return "danger";
  if (e === "Aprobado_Coordinador") return "accent";
  return "warning";
}

export function isViaticoPending(e?: string | null): boolean {
  return e === "Pendiente";
}

export function isViaticoInApproval(e?: string | null): boolean {
  return e === "Pendiente";
}

export function formatApprovalProgress(step?: number, trail?: ViaticoRow["approvalTrail"]): string {
  const done = trail?.filter((t) => t.action === "approve").length ?? 0;
  if (step != null && step > 0) return `Paso ${step + 1} · ${done} aprobación(es)`;
  return done > 0 ? `${done} pre-aprobación(es)` : "En revisión";
}
