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
  /** Estado del anticipo: entregado, comprobado y saldo. */
  liquidacion?: {
    entregado: number;
    comprobado: number | null;
    saldo: number | null;
    estado: "SIN_COMPROBAR" | "CUADRADO" | "POR_DEVOLVER" | "POR_REEMBOLSAR";
  };
  repartos?: { id: number; actividadId: number; monto: number | string }[];
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

/** Importe → centavos enteros: el cuadre del reparto no puede depender de la coma flotante. */
export function centavosViatico(valor: string | number): number {
  const n = typeof valor === "number" ? valor : parseFloat(valor);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function pesosViatico(centavos: number): string {
  return `$${(centavos / 100).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Una fila del editor de reparto, todavía como texto de formulario. */
export type ParteForm = { actividadId: string; monto: string; nota: string };

/**
 * ¿Cuadra el reparto con el total del viático?
 *
 * Devuelve el problema listo para enseñarse bajo el campo, o `undefined` si
 * todo suma. Es la misma regla que aplica el servidor: aquí solo se adelanta,
 * para que nadie descubra al guardar que le faltaban doscientos pesos.
 */
export function revisarCuadreReparto(
  partes: ParteForm[],
  total: string | number,
): string | undefined {
  if (partes.length === 0) return undefined;
  if (partes.some((p) => !p.actividadId.trim())) {
    return "Cada parte necesita la actividad a la que se carga. Completa la que falta o quítala.";
  }
  const totalCent = centavosViatico(total);
  const sumaCent = partes.reduce((acc, p) => acc + centavosViatico(p.monto), 0);
  if (sumaCent === totalCent) return undefined;
  const diferencia = totalCent - sumaCent;
  return diferencia > 0
    ? `Faltan ${pesosViatico(diferencia)} por repartir: las partes suman ${pesosViatico(sumaCent)} y el viático es de ${pesosViatico(totalCent)}.`
    : `Sobran ${pesosViatico(-diferencia)}: las partes suman ${pesosViatico(sumaCent)} y el viático es de ${pesosViatico(totalCent)}.`;
}

/**
 * El saldo del anticipo, dicho en una frase.
 *
 * `null` cuando no hay nada que decir: sin comprobar todavía, o ya cuadrado.
 */
export function frasesSaldoViatico(row: ViaticoRow): string | null {
  const l = row.liquidacion;
  if (!l || l.saldo == null) return null;
  if (l.estado === "CUADRADO") return null;
  const cifra = pesosViatico(Math.round(Math.abs(l.saldo) * 100));
  return l.estado === "POR_DEVOLVER"
    ? `Sobraron ${cifra}: pendientes de devolver`
    : `Gastaste ${cifra} de más: pendiente de reembolso`;
}
