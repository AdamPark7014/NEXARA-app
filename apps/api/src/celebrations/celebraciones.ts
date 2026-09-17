/**
 * Cumpleaños y aniversarios de ingreso: qué fecha se celebra hoy.
 *
 * Las fechas de nacimiento e ingreso se guardan como día de calendario (00:00 o 12:00 UTC),
 * así que el mes y el día se leen en UTC; «hoy» sí se mide en la zona de la empresa.
 * Quien nació un 29 de febrero celebra el 28 en los años que no son bisiestos.
 */

export type Dia = { year: number; month: number; day: number };

export type TipoCelebracion = 'cumpleanos' | 'aniversario';

export function esBisiesto(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** «AAAA-MM-DD» (de `workDateKey`) a sus partes. */
export function diaDeClave(clave: string): Dia {
  const [year, month, day] = clave.split('-').map(Number);
  return { year, month, day };
}

/** ¿La fecha guardada cae en el mismo día y mes que hoy? */
export function tocaHoy(fecha: Date | null | undefined, hoy: Dia): boolean {
  if (!fecha || Number.isNaN(fecha.getTime())) return false;
  const mes = fecha.getUTCMonth() + 1;
  const dia = fecha.getUTCDate();
  if (mes === hoy.month && dia === hoy.day) return true;
  return mes === 2 && dia === 29 && hoy.month === 2 && hoy.day === 28 && !esBisiesto(hoy.year);
}

/** Años completos desde la fecha hasta este año (el aniversario de hoy incluido). */
export function aniosDesde(fecha: Date, hoy: Dia): number {
  return hoy.year - fecha.getUTCFullYear();
}

/** Primer nombre para el saludo: «Carolina», no «Carolina Juárez Álvarez». */
export function primerNombre(nombre: string | null | undefined): string {
  const limpio = (nombre || '').trim().split(/\s+/)[0] || '';
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : '';
}

export type AvisoCelebracion = { titulo: string; mensaje: string };

/** Lo que recibe quien celebra. Nunca menciona la edad. */
export function avisoParaQuienCelebra(tipo: TipoCelebracion, nombre: string, anios: number): AvisoCelebracion {
  const quien = primerNombre(nombre);
  if (tipo === 'cumpleanos') {
    return {
      titulo: quien ? `¡Feliz cumpleaños, ${quien}! 🎂` : '¡Feliz cumpleaños! 🎂',
      mensaje: 'Todo el equipo de NEXARA te desea un gran día.',
    };
  }
  const tiempo = anios === 1 ? '1 año' : `${anios} años`;
  return {
    titulo: quien ? `¡Felicidades, ${quien}! 🎉` : '¡Felicidades! 🎉',
    mensaje: `Hoy cumples ${tiempo} en NEXARA. Gracias por todo lo que aportas al equipo.`,
  };
}

/** Lo que recibe el resto del equipo. Tampoco menciona la edad. */
export function avisoParaElEquipo(tipo: TipoCelebracion, nombre: string, anios: number): AvisoCelebracion {
  const quien = (nombre || '').trim() || 'Alguien del equipo';
  if (tipo === 'cumpleanos') {
    return {
      titulo: `Hoy es cumpleaños de ${quien} 🎂`,
      mensaje: 'Mándale una felicitación.',
    };
  }
  const tiempo = anios === 1 ? '1 año' : `${anios} años`;
  return {
    titulo: `${quien} cumple ${tiempo} en NEXARA 🎉`,
    mensaje: 'Felicítale por su aniversario.',
  };
}
