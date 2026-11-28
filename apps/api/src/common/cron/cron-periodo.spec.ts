import { huecoMaximoMinutos } from './cron-periodo';

describe('huecoMaximoMinutos', () => {
  it.each([
    ['*/5 * * * *', 5],
    ['* * * * *', 1],
    ['0 * * * *', 60],
    ['0 8,16 * * *', 960],
    ['0 8 * * *', 1440],
    ['0 9 * * 1-6', 2880], // de sábado a lunes
    ['0 8 * * 1-5', 4320], // de viernes a lunes
    ['0 3 * * 0', 10080],
    ['15 4 1 * *', 44640], // el mes más largo entre dos días 1
    ['* 12-18 * * *', 1021], // de 18:59 a las 12:00 del día siguiente
    ['*/10 8-20 * * *', 670], // de 20:50 a las 08:00
    ['0 */30 * * * *', 30], // con segundos (6 campos): el primero se ignora
  ])('«%s» deja un hueco máximo de %i minutos', (expr, esperado) => {
    expect(huecoMaximoMinutos(expr)).toBe(esperado);
  });

  it('entiende las expresiones de CronExpression de @nestjs/schedule', () => {
    expect(huecoMaximoMinutos('0 0-23/1 * * *')).toBe(60); // EVERY_HOUR
    expect(huecoMaximoMinutos('0 0-23/2 * * *')).toBe(120); // EVERY_2_HOURS
    expect(huecoMaximoMinutos('0 */5 * * * *')).toBe(5); // EVERY_5_MINUTES
    expect(huecoMaximoMinutos('0 08 * * *')).toBe(1440); // EVERY_DAY_AT_8AM (con cero a la izquierda)
    expect(huecoMaximoMinutos('0 03 * * *')).toBe(1440); // EVERY_DAY_AT_3AM
  });

  it('el domingo puede escribirse 0 o 7', () => {
    expect(huecoMaximoMinutos('0 3 * * 7')).toBe(10080);
    expect(huecoMaximoMinutos('0 3 * * 5-7')).toBe(7200); // viernes, sábado y domingo: del domingo al viernes hay 5 días
  });

  it('un paso desde un número arranca ahí y llega al final del campo', () => {
    expect(huecoMaximoMinutos('5/20 * * * *')).toBe(20); // :05, :25 y :45
  });

  it('con el día del mes y el de la semana restringidos basta que se cumpla uno', () => {
    // Día 1 o lunes: nunca pasan más de 7 días entre disparos.
    expect(huecoMaximoMinutos('0 8 1 * 1')).toBeLessThanOrEqual(7 * 1440);
  });

  it('el resultado no depende del día en que se corra', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-02-10T12:00:00Z'));
      const antes = huecoMaximoMinutos('15 4 1 * *');
      jest.setSystemTime(new Date('2027-08-31T23:59:00Z'));
      expect(huecoMaximoMinutos('15 4 1 * *')).toBe(antes);
    } finally {
      jest.useRealTimers();
    }
  });

  it('una expresión inválida lanza Error con el motivo', () => {
    expect(() => huecoMaximoMinutos('99 * * * *')).toThrow(/fuera de rango/);
    expect(() => huecoMaximoMinutos('* * * *')).toThrow(/5 o 6 campos/);
    expect(() => huecoMaximoMinutos('')).toThrow(/vacía/);
    expect(() => huecoMaximoMinutos('0 0 * * MON')).toThrow(/no es un número/);
    expect(() => huecoMaximoMinutos('0 12-8 * * *')).toThrow(/al revés/);
    expect(() => huecoMaximoMinutos('*/0 * * * *')).toThrow(/fuera de rango/);
  });
});
