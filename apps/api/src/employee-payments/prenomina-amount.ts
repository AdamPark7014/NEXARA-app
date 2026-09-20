/**
 * Pre-nómina operativa (sin CFDI N).
 *
 * Monto sugerido =
 *   (sueldoSemanal / 48 h) * (minutosLaborados / 60)
 *   + (sueldoSemanal / 48 h) * (minutosExtraAprobados / 60)
 *
 * Solo minutos de OvertimeApproval en APROBADO deben pasar como extras.
 */

export function calculatePrenominaAmount(input: {
  sueldoSemanal: number | null | undefined;
  minutosLaborados: number;
  minutosExtraAprobados?: number;
}): {
  suggestedAmount: number;
  hourlyRate: number;
  basePay: number;
  overtimePay: number;
} {
  const sueldo = Number(input.sueldoSemanal || 0);
  const hourlyRate = sueldo > 0 ? Math.round((sueldo / 48) * 100) / 100 : 0;
  const hours = Math.max(0, Number(input.minutosLaborados || 0)) / 60;
  const otHours = Math.max(0, Number(input.minutosExtraAprobados || 0)) / 60;
  const basePay = Math.round(hours * hourlyRate * 100) / 100;
  const overtimePay = Math.round(otHours * hourlyRate * 100) / 100;
  return {
    suggestedAmount: Math.round((basePay + overtimePay) * 100) / 100,
    hourlyRate,
    basePay,
    overtimePay,
  };
}

/** Alias usado en pruebas antiguas del mismo módulo. */
export function suggestPayrollAmount(input: {
  sueldoSemanal: number | null | undefined;
  periodFrom: Date;
  periodTo: Date;
  approvedOvertimeMinutes?: number;
}) {
  const ms = Math.max(0, input.periodTo.getTime() - input.periodFrom.getTime());
  const days = ms / 86_400_000 + 1;
  const weeks = Math.max(1, Math.round((days / 7) * 100) / 100);
  const sueldo = Number(input.sueldoSemanal || 0);
  const base = Math.round(sueldo * weeks * 100) / 100;
  const hourlyRate = sueldo > 0 ? Math.round((sueldo / 48) * 100) / 100 : 0;
  const overtimePay =
    Math.round(((Number(input.approvedOvertimeMinutes || 0) / 60) * hourlyRate) * 100) / 100;
  return {
    amount: Math.round((base + overtimePay) * 100) / 100,
    base,
    overtimePay,
    hourlyRate,
    weeks,
  };
}

export function weeksInRange(from: Date, to: Date): number {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const days = ms / 86_400_000 + 1;
  return Math.max(1, Math.round((days / 7) * 100) / 100);
}
