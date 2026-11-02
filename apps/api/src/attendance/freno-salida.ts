/**
 * Freno de salida (Adam, 01-11-2026, Programa Velocidad Core).
 *
 * «Se confunden y marcan salida en asistencia en lugar de salida de su actividad». Checar salida es
 * un toque, detiene el reloj y deja «No cumplida» lo que vencía: si hay algo de eso en juego, la
 * primera vez se avisa sin registrar nada y hay que volver a tocar. Va en el servidor para que
 * alcance a las apps que ya están instaladas: un 422 con este texto ya sale en su diálogo.
 *
 * Módulo puro (sin Nest ni Prisma).
 */

/** Cuánto vale el aviso: volver a tocar dentro de este tiempo confirma la salida. */
export const VENTANA_CONFIRMAR_SALIDA_MS = 3 * 60_000;

export type RiesgoDeSalida = {
  /** Folios con reloj corriendo. */
  corriendo: string[];
  /** Folios que vencen hoy o antes y esta persona no ha entregado. */
  porCerrar: string[];
};

function cuantas(folios: string[]): string {
  return folios.length === 1 ? folios[0] : `${folios.length} actividades`;
}

/** Lo que se le dice a la persona; null si la salida no pone nada en juego. */
export function mensajeFrenoSalida({ corriendo, porCerrar }: RiesgoDeSalida): string | null {
  if (!corriendo.length && !porCerrar.length) return null;
  const partes = ['Tu salida no se registró todavía.'];
  if (corriendo.length) {
    partes.push(
      corriendo.length === 1
        ? `Tienes ${cuantas(corriendo)} corriendo y su reloj se detendría.`
        : `Tienes ${cuantas(corriendo)} corriendo y sus relojes se detendrían.`,
    );
  }
  if (porCerrar.length) {
    partes.push(
      porCerrar.length === 1
        ? `${cuantas(porCerrar)} vence hoy sin entregar y quedaría «No cumplida».`
        : `${cuantas(porCerrar)} vencen hoy sin entregar y quedarían «No cumplida».`,
    );
  }
  partes.push('Si querías terminar una actividad, ábrela y toma su foto final.');
  partes.push('Si de verdad terminas tu jornada, vuelve a tocar Salida.');
  return partes.join(' ');
}

/** ¿Este intento ya fue avisado hace poco? Entonces es la confirmación. */
export function salidaConfirmada(avisoAt: Date | null | undefined, ahora: Date): boolean {
  if (!avisoAt) return false;
  const pasados = ahora.getTime() - avisoAt.getTime();
  return pasados >= 0 && pasados <= VENTANA_CONFIRMAR_SALIDA_MS;
}
