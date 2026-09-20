/**
 * Pre-nómina operativa (NO CFDI N).
 *
 * Fórmula del monto sugerido:
 * - `UserProfile.sueldoSemanal` cubre una semana ordinaria = 5 × 480 min (L–V, 8 h netas).
 * - `minutoOrdinario = sueldoSemanal / (5 * 480)`
 * - Solo minutos de overtime en estado APROBADO cuentan (el caller pasa `minutosExtraAprobados`).
 * - Los extras se topean a los minutos laborados del periodo.
 * - `minutosOrdinarios = max(0, minutosLaborados - minutosExtraAprobados)`
 * - `suggestedAmount = minutosOrdinarios * minutoOrdinario
 *                     + minutosExtraAprobados * minutoOrdinario * OT_MULTIPLIER`
 * - `OT_MULTIPLIER = 2` (doble del minuto ordinario; política simple de pre-nómina).
 * - Sin sueldo semanal válido → `suggestedAmount = null` (RH captura a mano).
 */
export const JORNADA_ORDINARIA_MIN = 480;
export const DIAS_LABORABLES_SEMANA = 5;
export const OT_MULTIPLIER = 2;

export type PrenominaAmountInput = {
  sueldoSemanal: number | null | undefined;
  minutosLaborados: number;
  minutosExtraAprobados: number;
};

export type PrenominaAmountResult = {
  sueldoSemanal: number | null;
  minutoOrdinario: number | null;
  minutosOrdinarios: number;
  minutosExtraAprobados: number;
  suggestedAmount: number | null;
  formula: string;
};

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculatePrenominaAmount(input: PrenominaAmountInput): PrenominaAmountResult {
  const laborados = Math.max(0, Number(input.minutosLaborados) || 0);
  const extrasRaw = Math.max(0, Number(input.minutosExtraAprobados) || 0);
  const extras = Math.min(extrasRaw, laborados);
  const ordinarios = laborados - extras;

  const sueldoRaw = input.sueldoSemanal == null ? null : Number(input.sueldoSemanal);
  const sueldoOk = sueldoRaw != null && Number.isFinite(sueldoRaw) && sueldoRaw > 0;

  if (!sueldoOk) {
    return {
      sueldoSemanal: null,
      minutoOrdinario: null,
      minutosOrdinarios: ordinarios,
      minutosExtraAprobados: extras,
      suggestedAmount: null,
      formula: 'Sin sueldoSemanal válido: captura manual del monto.',
    };
  }

  const minutoOrdinario = sueldoRaw / (DIAS_LABORABLES_SEMANA * JORNADA_ORDINARIA_MIN);
  const suggestedAmount = roundMoney(
    ordinarios * minutoOrdinario + extras * minutoOrdinario * OT_MULTIPLIER,
  );

  return {
    sueldoSemanal: sueldoRaw,
    minutoOrdinario,
    minutosOrdinarios: ordinarios,
    minutosExtraAprobados: extras,
    suggestedAmount,
    formula:
      `ordinario=${ordinarios}×${roundMoney(minutoOrdinario)}` +
      ` + extraAprobado=${extras}×${roundMoney(minutoOrdinario)}×${OT_MULTIPLIER}`,
  };
}
