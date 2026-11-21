export type PersonaParaMarca = {
  userId: number;
  estado: "PRESENTE" | "COMPLETO" | "JUSTIFICADA" | "AUSENTE" | string;
};

export type BoardHint = {
  id: number;
  entradaHoyAt?: string | null;
  currentActivity?: unknown | null;
  openActivities?: unknown[] | null;
  status?: string | null;
};

/** Sin checada pero con actividad en curso en la pizarra. */
export function idsTrabajandoSinEntrada(boardUsers: BoardHint[]): Set<number> {
  const out = new Set<number>();
  for (const u of boardUsers) {
    const sinEntrada = u.entradaHoyAt == null || u.entradaHoyAt === "";
    const conActividad = Boolean(u.currentActivity) || (Array.isArray(u.openActivities) && u.openActivities.length > 0) || u.status === "activo" || u.status === "atrasado";
    if (sinEntrada && conActividad) out.add(u.id);
  }
  return out;
}

export function etiquetaTrabajandoSinEntrada(fila: PersonaParaMarca, ids: Set<number>): string | null {
  if (fila.estado !== "AUSENTE") return null;
  return ids.has(fila.userId) ? "Trabajando sin entrada" : null;
}