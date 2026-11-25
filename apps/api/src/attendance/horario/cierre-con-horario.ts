/**
 * Cierre automático cuando hay horario citado: salida citada + gracia.
 * Sin horario válido devuelve null para que el caller use la lógica histórica.
 */

import { workDateKey, workDayAtClock } from '../../common/time/workday.js';
import { hmAMinutos, horaValida, sumaDias } from './horario-de.js';

export function cierreAutomaticoConHorario(
  entrada: Date,
  tz: string,
  horario?: {
    horaEntrada?: string | null;
    horaSalida?: string | null;
    graciaMin?: number | null;
  } | null,
): Date | null {
  const ent = horaValida(horario?.horaEntrada);
  const sal = horaValida(horario?.horaSalida);
  if (!ent || !sal) return null;

  const fecha = workDateKey(entrada, tz);
  const eMin = hmAMinutos(ent);
  const sMin = hmAMinutos(sal);
  const diaSalida = sMin <= eMin ? sumaDias(fecha, 1) : fecha;
  const [y, m, d] = diaSalida.split('-').map(Number);
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  const [hh, mm] = sal.split(':').map(Number);
  const citada = workDayAtClock(base, hh, mm, tz);
  const gracia =
    typeof horario?.graciaMin === 'number' && horario.graciaMin >= 0 ? Math.round(horario.graciaMin) : 15;
  const conMargen = new Date(citada.getTime() + gracia * 60_000);
  // Entró después de su salida citada: no se inventa una jornada de cero minutos.
  return conMargen.getTime() > entrada.getTime() ? conMargen : null;
}
