import {
  WORKDAY_TIMEZONE,
  parseWorkDate,
  workDateColumn,
  workDateKey,
  workDayBounds,
  workDayEnd,
  workDayStart,
} from './workday.js';

/**
 * La jornada se mide en hora de México, no en UTC.
 *
 * Los casos de abajo salen de los datos reales de producción: 10 de 15
 * registros caían en un día distinto según se midiera de una u otra forma.
 */

const MX = 'America/Mexico_City';

describe('zona de la jornada', () => {
  it('por defecto es la de la empresa', () => {
    expect(WORKDAY_TIMEZONE).toBe('America/Mexico_City');
  });
});

describe('día laboral de un instante', () => {
  it('una salida a las 19:18 hora de México es del MISMO día que su entrada', () => {
    // Caso real: entrada 30-jun 22:07 UTC (16:07 mx), salida 01-jul 01:18 UTC
    // (19:18 mx). En UTC caían en días distintos y la jornada nunca cerraba.
    const entrada = new Date('2026-06-30T22:07:52Z');
    const salida = new Date('2026-07-01T01:18:04Z');

    expect(workDateKey(entrada, MX)).toBe('2026-06-30');
    expect(workDateKey(salida, MX)).toBe('2026-06-30');
  });

  it('medido en UTC habrían sido días distintos', () => {
    const salida = new Date('2026-07-01T01:18:04Z');
    expect(salida.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(workDateKey(salida, MX)).toBe('2026-06-30');
  });

  it('la madrugada en México sigue siendo el día anterior en UTC', () => {
    // 2026-07-07 04:44 UTC = 2026-07-06 22:44 mx
    expect(workDateKey(new Date('2026-07-07T04:44:19Z'), MX)).toBe('2026-07-06');
  });

  it('una hora de oficina cae donde uno espera', () => {
    // 2026-08-15 16:49 UTC = 10:49 mx
    expect(workDateKey(new Date('2026-08-15T16:49:44Z'), MX)).toBe('2026-08-15');
  });
});

describe('límites del día', () => {
  it('empieza a medianoche local, que en UTC son las 06:00', () => {
    const inicio = workDayStart(new Date('2026-08-15T16:49:44Z'), MX);
    expect(inicio.toISOString()).toBe('2026-08-15T06:00:00.000Z');
  });

  it('termina un milisegundo antes del siguiente inicio', () => {
    const dia = new Date('2026-08-15T16:49:44Z');
    const fin = workDayEnd(dia, MX);
    const inicioSiguiente = workDayStart(new Date(fin.getTime() + 1), MX);
    expect(inicioSiguiente.getTime() - fin.getTime()).toBe(1);
  });

  it('el día dura 24 horas', () => {
    const { start, end } = workDayBounds(new Date('2026-08-15T16:49:44Z'), MX);
    expect(end.getTime() - start.getTime() + 1).toBe(24 * 3_600_000);
  });

  it('la entrada y la salida del caso real caen dentro del mismo rango', () => {
    const { start, end } = workDayBounds(new Date('2026-06-30T22:07:52Z'), MX);
    const salida = new Date('2026-07-01T01:18:04Z');
    expect(salida >= start && salida <= end).toBe(true);
  });

  it('el instante justo anterior al inicio pertenece al día previo', () => {
    const inicio = workDayStart(new Date('2026-08-15T16:49:44Z'), MX);
    expect(workDateKey(new Date(inicio.getTime() - 1), MX)).toBe('2026-08-14');
  });
});

describe('valor para columna @db.Date', () => {
  it('sus componentes UTC son el día laboral', () => {
    // Prisma deriva la fecha de una columna DATE de los componentes UTC.
    const col = workDateColumn(new Date('2026-07-01T01:18:04Z'), MX);
    expect(col.toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });

  it('coincide con la clave de texto', () => {
    for (const iso of [
      '2026-06-30T22:07:52Z',
      '2026-07-01T01:18:04Z',
      '2026-08-15T16:49:44Z',
      '2026-01-01T05:59:59Z',
    ]) {
      const d = new Date(iso);
      expect(workDateColumn(d, MX).toISOString().slice(0, 10)).toBe(workDateKey(d, MX));
    }
  });
});

describe('interpretar AAAA-MM-DD', () => {
  it('devuelve el inicio del día en hora de México', () => {
    expect(parseWorkDate('2026-08-15', MX).toISOString()).toBe('2026-08-15T06:00:00.000Z');
  });

  it('ida y vuelta: la clave del inicio es la fecha pedida', () => {
    for (const f of ['2026-01-01', '2026-06-30', '2026-12-31']) {
      expect(workDateKey(parseWorkDate(f, MX), MX)).toBe(f);
    }
  });

  it('un texto que no es una fecha simple se deja pasar a Date', () => {
    expect(parseWorkDate('2026-08-15T20:00:00Z', MX).getTime()).toBe(
      new Date('2026-08-15T20:00:00Z').getTime(),
    );
  });
});

describe('zonas con cambio de horario', () => {
  it('el día sigue empezando a medianoche local aunque la zona cambie de hora', () => {
    // México ya no cambia de horario, pero el calculo no debe darlo por hecho.
    // Madrid pasa a horario de verano el 29-mar-2026 a las 02:00.
    const inicio = workDayStart(new Date('2026-03-29T12:00:00Z'), 'Europe/Madrid');
    expect(workDateKey(inicio, 'Europe/Madrid')).toBe('2026-03-29');
  });

  it('ese día dura 23 horas y el cálculo no se descuadra', () => {
    const { start, end } = workDayBounds(new Date('2026-03-29T12:00:00Z'), 'Europe/Madrid');
    expect(end.getTime() - start.getTime() + 1).toBe(23 * 3_600_000);
  });
});
