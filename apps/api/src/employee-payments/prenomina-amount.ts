/**
 * Pre-nómina operativa (NO CFDI N).
 *
 * Fórmula del monto sugerido:
 * - `UserProfile.sueldoSemanal` cubre una semana ordinaria = 5 × 480 min (L–V, 8 h netas).
 * - `minutoOrdinario = sueldoSemanal / (5 * 480)`
 * - Lo laborado ya trae dentro el tiempo extra. Solo se paga como extra lo APROBADO por un jefe
 *   (`minutosExtraAprobados`, topado a lo laborado); el resto de lo laborado es ordinario hasta lo que
 *   su horario esperaba (`minutosEsperados`): lo laborado de más sin aprobar no se paga.
 * - `minutosOrdinarios = min(minutosLaborados - minutosExtraAprobados, minutosEsperados)`
 * - Extra (LFT arts. 67–68): las primeras 9 h aprobadas de cada semana al doble, el resto al triple.
 * - Sin sueldo semanal válido → `suggestedAmount = null` (RH captura a mano).
 */
export const JORNADA_ORDINARIA_MIN = 480;
export const DIAS_LABORABLES_SEMANA = 5;
/** LFT art. 67: las primeras 9 h extra de la semana se pagan al doble. */
export const EXTRA_DOBLE_MAX_MIN_SEMANA = 9 * 60;
export const OT_DOBLE = 2;
/** LFT art. 68: las que pasen de 9 h a la semana, al triple. */
export const OT_TRIPLE = 3;
/** @deprecated La extra ya no es siempre doble: usa `pagoExtraLft`. */
export const OT_MULTIPLIER = OT_DOBLE;

/**
 * Minutos de extra aprobada al doble y al triple. Con un periodo de varias semanas, el tope del doble es
 * 9 h por semana del periodo (sin el día por día, se supone repartida).
 */
export function minutosExtraLft(minutosAprobados: number, semanas = 1): { dobles: number; triples: number } {
  const min = Math.max(0, Number(minutosAprobados) || 0);
  const dobles = Math.min(min, EXTRA_DOBLE_MAX_MIN_SEMANA * Math.max(1, Math.round(semanas) || 1));
  return { dobles, triples: min - dobles };
}

/** Pago de la extra aprobada con el minuto ordinario: doble hasta 9 h por semana, triple después. */
export function pagoExtraLft(minutosAprobados: number, minutoOrdinario: number, semanas = 1): number {
  const { dobles, triples } = minutosExtraLft(minutosAprobados, semanas);
  return dobles * minutoOrdinario * OT_DOBLE + triples * minutoOrdinario * OT_TRIPLE;
}

export type PrenominaAmountInput = {
  sueldoSemanal: number | null | undefined;
  minutosLaborados: number;
  minutosExtraAprobados: number;
  /** Lo que su horario esperaba en el periodo; sin él no se puede topar lo ordinario. */
  minutosEsperados?: number | null;
  /** Semanas del periodo, para el tope de 9 h dobles por semana. */
  semanas?: number;
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
  const esperados = input.minutosEsperados == null ? null : Math.max(0, Number(input.minutosEsperados) || 0);
  // Lo laborado de más que nadie aprobó no se paga: lo ordinario llega hasta lo esperado.
  const ordinarios = esperados == null ? laborados - extras : Math.min(laborados - extras, esperados);
  const semanas = Math.max(1, Math.round(Number(input.semanas) || 1));
  const { dobles, triples } = minutosExtraLft(extras, semanas);

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
  const suggestedAmount = roundMoney(ordinarios * minutoOrdinario + pagoExtraLft(extras, minutoOrdinario, semanas));

  return {
    sueldoSemanal: sueldoRaw,
    minutoOrdinario,
    minutosOrdinarios: ordinarios,
    minutosExtraAprobados: extras,
    suggestedAmount,
    formula:
      `ordinario=${ordinarios}×${roundMoney(minutoOrdinario)}` +
      ` + extraAprobado=${dobles}×${roundMoney(minutoOrdinario)}×${OT_DOBLE}` +
      (triples ? ` + ${triples}×${roundMoney(minutoOrdinario)}×${OT_TRIPLE}` : '') +
      (esperados != null ? ` (ordinario topado a ${esperados} esperados)` : ''),
  };
}
