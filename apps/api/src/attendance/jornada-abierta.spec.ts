import { AttendanceService } from './attendance.service.js';

/**
 * Una jornada abierta no puede acumular más que su propio día.
 *
 * El cálculo en vivo suma el tiempo que lleva corriendo una entrada sin salida,
 * para que la pantalla pueda decir "llevas 3h15 hoy". Pero si nadie registró la
 * salida, eso seguía sumando indefinidamente: en los datos reales una entrada
 * del 16 de julio acumulaba 710 horas porque la siguiente salida era del 15 de
 * agosto, y de ahí sale la nómina.
 */

const service = new AttendanceService({} as any, {} as any, {} as any);
const minutos = (entrada: string, finRango: string): number =>
  (service as any).computeOpenMinutes(new Date(entrada), new Date(finRango));

describe('minutos de una jornada abierta', () => {
  it('cuenta lo corrido cuando el corte cae dentro del mismo día', () => {
    // Entrada 09:00 mx (15:00 UTC), corte 12:00 mx (18:00 UTC) -> 3 h.
    expect(minutos('2026-07-16T15:00:00Z', '2026-07-16T18:00:00Z')).toBe(180);
  });

  it('NO pasa del final de su propio día aunque el rango siga', () => {
    // El caso real: entrada del 16-jul, rango que llega hasta el 15-ago.
    const m = minutos('2026-07-17T02:20:00Z', '2026-08-15T16:49:00Z');
    expect(m).toBeLessThanOrEqual(24 * 60);
  });

  it('una entrada a las 20:20 de México acumula como mucho hasta medianoche', () => {
    // 2026-07-17 02:20 UTC = 2026-07-16 20:20 mx. Quedan 3 h 40 min de día.
    expect(minutos('2026-07-17T02:20:00Z', '2026-08-15T16:49:00Z')).toBe(219);
  });

  it('si el corte del rango llega antes que el fin del día, manda el rango', () => {
    // Entrada 09:00 mx, corte 10:30 mx.
    expect(minutos('2026-07-16T15:00:00Z', '2026-07-16T16:30:00Z')).toBe(90);
  });

  it('sin entrada no acumula nada', () => {
    expect((service as any).computeOpenMinutes(null, new Date())).toBe(0);
  });

  it('un corte anterior a la entrada no da negativo', () => {
    expect(minutos('2026-07-16T18:00:00Z', '2026-07-16T15:00:00Z')).toBe(0);
  });

  it('una fecha inválida no propaga NaN', () => {
    expect((service as any).computeOpenMinutes(new Date('nada'), new Date())).toBe(0);
  });
});
