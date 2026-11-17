import { BadRequestException } from '@nestjs/common';

/** Salario mínimo diario general 2026 (MXN). Ajustable sin migración. */
export const SALARIO_MINIMO_DIARIO_MX = 278.8;

export type CuotaCargo = { semanaIso: string; monto: number };

export function sueldoMensualDeSemanal(sueldoSemanal: number): number {
  if (!Number.isFinite(sueldoSemanal) || sueldoSemanal <= 0) {
    throw new BadRequestException('Falta el sueldo semanal de la persona para calcular el tope del art. 110.');
  }
  return Math.round(((sueldoSemanal * 52) / 12) * 100) / 100;
}

export function topeSemanalArt110(sueldoSemanal: number, minimoDiario = SALARIO_MINIMO_DIARIO_MX): number {
  const minimoSemanal = minimoDiario * 7;
  const excedente = Math.max(0, sueldoSemanal - minimoSemanal);
  return Math.round(excedente * 0.3 * 100) / 100;
}

/**
 * Plan de cuotas semanales: total ≤ 1 mes de salario; cada cuota ≤ 30 % del excedente del mínimo.
 * `semanaInicio` = lunes ISO AAAA-MM-DD.
 */
export function planCuotasCargoPerdida(input: {
  montoTotal: number;
  sueldoSemanal: number;
  semanaInicio: string;
  minimoDiario?: number;
}): { cuotas: CuotaCargo[]; topeMensual: number; topeSemanal: number } {
  const monto = Number(input.montoTotal);
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new BadRequestException('El monto de la pérdida debe ser mayor a cero.');
  }
  const topeMensual = sueldoMensualDeSemanal(input.sueldoSemanal);
  if (monto > topeMensual + 0.009) {
    throw new BadRequestException(
      `El cargo no puede pasar de un mes de salario (tope $${topeMensual.toFixed(2)}). Art. 110 fr. I LFT.`,
    );
  }
  const topeSemanal = topeSemanalArt110(input.sueldoSemanal, input.minimoDiario);
  if (topeSemanal <= 0) {
    throw new BadRequestException(
      'Con este sueldo no hay excedente sobre el mínimo: no se puede descontar por art. 110 fr. I.',
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.semanaInicio)) {
    throw new BadRequestException('La semana de inicio debe ser AAAA-MM-DD (lunes).');
  }

  const cuotas: CuotaCargo[] = [];
  let restante = Math.round(monto * 100) / 100;
  let semana = input.semanaInicio;
  let guard = 0;
  while (restante > 0.009 && guard < 120) {
    const parte = Math.min(restante, topeSemanal);
    const montoCuota = Math.round(parte * 100) / 100;
    cuotas.push({ semanaIso: semana, monto: montoCuota });
    restante = Math.round((restante - montoCuota) * 100) / 100;
    semana = sumarDias(semana, 7);
    guard += 1;
  }
  return { cuotas, topeMensual, topeSemanal };
}

function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}
