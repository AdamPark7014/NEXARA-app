/**
 * Pre-nómina operativa (sin CFDI N).
 *
 * Tasa por minuto = sueldoSemanal / (5 días × 480 min).
 * Ordinarios = max(0, laborados − extrasAprobados) (extras no pueden superar laborados).
 * Extra se paga con OT_MULTIPLIER.
 */

export const OT_MULTIPLIER = 2;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePrenominaAmount(input: {
  sueldoSemanal: number | null | undefined;
  minutosLaborados: number;
  minutosExtraAprobados?: number;
}): {
  suggestedAmount: number | null;
  minutosOrdinarios: number;
  minutosExtraAprobados: number;
  ratePerMinute: number;
} {
  const laborados = Math.max(0, Number(input.minutosLaborados) || 0);
  let extras = Math.max(0, Number(input.minutosExtraAprobados) || 0);
  extras = Math.min(extras, laborados);
  const minutosOrdinarios = laborados - extras;

  const sueldo = input.sueldoSemanal == null ? null : Number(input.sueldoSemanal);
  if (sueldo == null || !Number.isFinite(sueldo) || sueldo <= 0) {
    return {
      suggestedAmount: laborados === 0 && extras === 0 ? 0 : null,
      minutosOrdinarios,
      minutosExtraAprobados: extras,
      ratePerMinute: 0,
    };
  }

  // Spec: negative minutes → suggestedAmount 0 (not null)
  if (laborados === 0 && extras === 0 && (Number(input.minutosLaborados) < 0 || Number(input.minutosExtraAprobados) < 0)) {
    return {
      suggestedAmount: 0,
      minutosOrdinarios: 0,
      minutosExtraAprobados: 0,
      ratePerMinute: sueldo / (5 * 480),
    };
  }

  const rate = sueldo / (5 * 480);
  const amount = roundMoney(minutosOrdinarios * rate + extras * rate * OT_MULTIPLIER);
  return {
    suggestedAmount: amount,
    minutosOrdinarios,
    minutosExtraAprobados: extras,
    ratePerMinute: rate,
  };
}
