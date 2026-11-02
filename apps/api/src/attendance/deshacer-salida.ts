/**
 * Deshacer la salida de jornada (Adam, 02-11-2026, Programa Velocidad Core).
 *
 * Quien checó por error la deshace sola dentro de 10 minutos. Después, el mismo día, su jefe, con
 * motivo. Más tarde queda la corrección de hora, que no regresa relojes ni «No cumplida».
 *
 * Módulo puro (sin Nest ni Prisma).
 */

export const VENTANA_DESHACER_MS = 10 * 60_000;

/** ¿La propia persona todavía puede deshacerla? */
export function dentroDeVentanaPropia(salidaAt: Date, ahora: Date): boolean {
  const pasados = ahora.getTime() - salidaAt.getTime();
  return pasados >= 0 && pasados <= VENTANA_DESHACER_MS;
}

export type ActividadEnRiesgo = { id: number; folio: string; titulo: string };

export type NoCumplidaRegresada = {
  actividadId: number;
  folio: string | null;
  estatusPrevio: string;
  causa: string;
  limite: string | null;
  registradaAt: string;
};

/** Lo que se le dice a sus jefes. Solo folios: el título ya viajó en el aviso de «No cumplida». */
export function mensajeSalidaDeshecha(p: { hora: string; folios: string[]; motivo?: string | null }): string {
  const partes = [`Salida de las ${p.hora}`];
  if (p.folios.length === 1) partes.push(`${p.folios[0]} ya no queda «No cumplida»`);
  if (p.folios.length > 1) partes.push(`${p.folios.join(', ')} ya no quedan «No cumplida»`);
  if (p.motivo?.trim()) partes.push(p.motivo.trim().slice(0, 160));
  return partes.join(' · ');
}
