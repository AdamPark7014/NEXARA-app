import {
  WORKDAY_TIMEZONE,
  calendarMonthColumnRange,
  parseWorkDate,
  parseWorkDateEnd,
  workDateColumn,
  workDateKey,
  workDateRange,
  workDayBounds,
  workDayEnd,
  workDayStart,
  workMonth,
  workMonthOf,
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

describe('rango de días para un reporte', () => {
  it('el día termina a las 23:59:59.999 de México, no a las 18:00', () => {
    expect(parseWorkDateEnd('2026-11-21', MX).toISOString()).toBe('2026-11-22T05:59:59.999Z');
  });

  it('lo registrado a las 19:30 entra en el reporte de su día y no en el del siguiente', () => {
    // 21-nov 19:30 en México = 22-nov 01:30 UTC. Con el tope en UTC quedaba fuera del 21.
    const registrado = new Date('2026-11-22T01:30:00.000Z');
    const del21 = workDateRange('2026-11-01', '2026-11-21', MX)!;
    expect(registrado.getTime()).toBeGreaterThanOrEqual(del21.gte!.getTime());
    expect(registrado.getTime()).toBeLessThanOrEqual(del21.lte!.getTime());
    const del22 = workDateRange('2026-11-22', '2026-11-22', MX)!;
    expect(registrado.getTime()).toBeLessThan(del22.gte!.getTime());
  });

  it('un solo día cubre sus 24 horas y dos días seguidos no se enciman ni dejan hueco', () => {
    const a = workDateRange('2026-11-20', '2026-11-20', MX)!;
    const b = workDateRange('2026-11-21', '2026-11-21', MX)!;
    expect(a.lte!.getTime() - a.gte!.getTime()).toBe(24 * 3_600_000 - 1);
    expect(b.gte!.getTime() - a.lte!.getTime()).toBe(1);
  });

  it('acepta un solo extremo y no filtra por uno vacío o ilegible', () => {
    expect(workDateRange('2026-11-01', undefined, MX)).toEqual({ gte: new Date('2026-11-01T06:00:00.000Z') });
    expect(workDateRange(null, '2026-11-21', MX)).toEqual({ lte: new Date('2026-11-22T05:59:59.999Z') });
    // Sin ningún extremo válido no hay filtro (Prisma ignora `undefined`).
    expect(workDateRange('', '  ', MX)).toBeUndefined();
    expect(workDateRange('no es fecha', 'tampoco', MX)).toBeUndefined();
    expect(workDateRange(undefined, undefined, MX)).toBeUndefined();
  });

  it('un extremo que ya trae hora se respeta tal cual', () => {
    expect(parseWorkDateEnd('2026-11-21T20:00:00Z', MX).toISOString()).toBe('2026-11-21T20:00:00.000Z');
    expect(workDateRange('2026-11-21T08:00:00Z', '2026-11-21T20:00:00Z', MX)).toEqual({
      gte: new Date('2026-11-21T08:00:00.000Z'),
      lte: new Date('2026-11-21T20:00:00.000Z'),
    });
  });
});

describe('mes de la empresa', () => {
  it('el 30 de noviembre a las 19:30 sigue siendo noviembre aunque el servidor ya esté en diciembre', () => {
    // 30-nov 19:30 en México = 1-dic 01:30 UTC.
    const mes = workMonth(new Date('2026-12-01T01:30:00.000Z'), MX);
    expect(mes).toEqual({
      year: 2026,
      month: 11,
      start: new Date('2026-11-01T06:00:00.000Z'),
      end: new Date('2026-12-01T05:59:59.999Z'),
    });
  });

  it('un mes pedido por número cubre de su día 1 al último, sin hueco con el siguiente', () => {
    const nov = workMonthOf(2026, 11, MX);
    const dic = workMonthOf(2026, 12, MX);
    expect(nov.start.toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect(dic.start.getTime() - nov.end.getTime()).toBe(1);
    // Diciembre termina en enero del año siguiente.
    expect(dic.end.toISOString()).toBe('2027-01-01T05:59:59.999Z');
    expect(dic).toMatchObject({ year: 2026, month: 12 });
  });

  it('el mes anterior a enero es diciembre del año pasado', () => {
    const enero = workMonth(new Date('2027-01-15T18:00:00.000Z'), MX);
    expect(workMonthOf(enero.year, enero.month - 1, MX)).toMatchObject({
      year: 2026,
      month: 12,
      start: new Date('2026-12-01T06:00:00.000Z'),
    });
  });

  it('para columnas de solo día da el mes calendario, del 1 al último a medianoche UTC', () => {
    expect(calendarMonthColumnRange(2026, 11)).toEqual({
      gte: new Date('2026-11-01T00:00:00.000Z'),
      lte: new Date('2026-11-30T23:59:59.999Z'),
    });
    expect(calendarMonthColumnRange(2026, 2)).toEqual({
      gte: new Date('2026-02-01T00:00:00.000Z'),
      lte: new Date('2026-02-28T23:59:59.999Z'),
    });
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
