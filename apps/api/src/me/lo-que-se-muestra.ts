import type { Prisma } from '@prisma/client';

/**
 * Qué actividades caben en «Mis actividades», dicho una sola vez para la base y para el código.
 *
 * Antes la lista traía TODAS las asignaciones vigentes de la persona (hasta 300, con evidencias, equipo y cambios
 * de horario) y descartaba casi todo en memoria: en producción se mostraban 19 de 816. Este filtro pide a la base
 * solo lo que puede llegar a mostrarse. Es un SUPERCONJUNTO de lo que el código filtra después (el filtrado fino
 * no cambió), así que la respuesta es la misma; en el peor caso trae alguna fila de más, nunca de menos.
 */

/** Palabras que marcan una actividad como cerrada para la cola personal. */
export const PALABRAS_DE_CERRADA = [
  'finalizada',
  'completada',
  'cancelada',
  'aprobada',
  'no cumplida',
  'incumplida',
] as const;

export function esCerradaParaLaCola(estatus: string | null | undefined): boolean {
  const e = (estatus || '').toLowerCase();
  return PALABRAS_DE_CERRADA.some((palabra) => e.includes(palabra));
}

/**
 * Fragmento de `where` sobre Activity con las tres cosas que la pantalla enseña:
 *  1. lo abierto (ninguna palabra de cerrada en el estatus);
 *  2. lo cerrado hoy (día de la empresa): `fechaFinalizacion` desde `dayStart`;
 *  3. lo «No cumplida» de los últimos 7 días, por fecha de inicio o, si no tiene, de asignación.
 *     `cumplid` cubre todas las grafías que `normalizeActivityStatus` reconoce (no cumplida, incumplido…).
 */
export function loQueSeMuestra(dayStart: Date, hace7Dias: Date): Prisma.ActivityWhereInput {
  return {
    OR: [
      {
        NOT: {
          OR: PALABRAS_DE_CERRADA.map((palabra) => ({
            estatus: { contains: palabra, mode: 'insensitive' as const },
          })),
        },
      },
      { fechaFinalizacion: { gte: dayStart } },
      {
        AND: [
          { estatus: { contains: 'cumplid', mode: 'insensitive' as const } },
          {
            OR: [
              { fechaInicio: { gte: hace7Dias } },
              { fechaInicio: null, fechaAsignacion: { gte: hace7Dias } },
            ],
          },
        ],
      },
    ],
  };
}
