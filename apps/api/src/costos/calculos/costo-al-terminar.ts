/** Proyección informativa; nunca cambia el presupuesto ni los movimientos. */
export function estimarCostoAlTerminar(real: number, avance: number | null, incompleto: boolean): number | null {
  if (incompleto || avance == null || !Number.isFinite(avance) || avance <= 0 || avance > 100) return null;
  if (!Number.isFinite(real) || real < 0) return null;
  return Math.round((real / (avance / 100)) * 100) / 100;
}
