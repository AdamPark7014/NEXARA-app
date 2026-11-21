import { BadRequestException } from '@nestjs/common';

/**
 * Fechas y motivo de una solicitud de préstamo. Lo que se pacta es un DÍA, no una hora, y cada
 * cliente lo mandaba distinto: la web a medianoche UTC (que en México es la tarde del día
 * anterior: la lista mostraba un día menos y lo daba por vencido desde las 6 de la tarde), la
 * prórroga de la web a las 23:59 locales (el día siguiente en UTC) y las apps a mediodía UTC.
 * Aquí se lee qué día quiso decir la persona y se guarda siempre a mediodía de México, que cae
 * en el mismo día para cualquiera que lo lea.
 */

const ZONA = 'America/Mexico_City';
/** México central no cambia de horario desde 2022: el mediodía local es las 18:00 UTC. */
const MEDIODIA_LOCAL = 'T12:00:00-06:00';

const diaEnMexico = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** El día (`AAAA-MM-DD`) que la persona quiso decir, o `null` si no es una fecha. */
export function diaDePrestamo(valor: unknown): string | null {
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) {
    const dia = valor.trim();
    const fecha = new Date(`${dia}${MEDIODIA_LOCAL}`);
    // «2026-02-30» no existe: el motor lo recorre a marzo y deja de coincidir.
    return !Number.isNaN(fecha.getTime()) && diaEnMexico.format(fecha) === dia ? dia : null;
  }
  const fecha = valor instanceof Date ? valor : typeof valor === 'string' && valor.trim() ? new Date(valor.trim()) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  const iso = fecha.toISOString();
  // Medianoche UTC exacta es un día suelto (así lo mandaba la web): vale el día escrito.
  if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10);
  return diaEnMexico.format(fecha);
}

/** Convierte lo que llegue al mediodía de México de ese día, o `null`. */
export function fechaDePrestamo(valor: unknown): Date | null {
  const dia = diaDePrestamo(valor);
  return dia ? new Date(`${dia}${MEDIODIA_LOCAL}`) : null;
}

export type PlazoDePrestamo = { startDate: Date; expectedReturnDate: Date; reason: string };

/** Valida motivo y fechas de la solicitud; lanza 400 con la frase que la persona puede corregir. */
export function plazoDePrestamo(datos: {
  reason?: unknown;
  startDate?: unknown;
  expectedReturnDate?: unknown;
}): PlazoDePrestamo {
  const reason = typeof datos.reason === 'string' ? datos.reason.trim() : '';
  if (!reason) throw new BadRequestException('Cuenta para qué necesitas la herramienta');
  const startDate = fechaDePrestamo(datos.startDate);
  if (!startDate) throw new BadRequestException('Indica desde qué día necesitas la herramienta');
  const expectedReturnDate = fechaDePrestamo(datos.expectedReturnDate);
  if (!expectedReturnDate) throw new BadRequestException('Indica qué día la devuelves');
  // El mismo día sí vale: lo que se usa en una actividad de un día se regresa ese día.
  if (expectedReturnDate.getTime() < startDate.getTime()) {
    throw new BadRequestException('El día de devolución no puede ser antes del día en que la recoges');
  }
  return { startDate, expectedReturnDate, reason };
}

/** Nuevo día de devolución de una prórroga, ya a mediodía de México. */
export function nuevaDevolucion(valor: unknown): Date {
  const fecha = fechaDePrestamo(valor);
  if (!fecha) throw new BadRequestException('Indica hasta qué día necesitas la herramienta');
  return fecha;
}
