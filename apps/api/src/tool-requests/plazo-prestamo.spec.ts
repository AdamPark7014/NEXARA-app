import { BadRequestException } from '@nestjs/common';
import { diaDePrestamo, fechaDePrestamo, nuevaDevolucion, plazoDePrestamo } from './plazo-prestamo.js';

describe('Plazo de un préstamo de herramienta', () => {
  it('lee el día que la persona quiso decir, lo mande quien lo mande', () => {
    // La web de antes: el día a medianoche UTC (en México todavía es la tarde anterior).
    expect(diaDePrestamo('2026-11-24T00:00:00.000Z')).toBe('2026-11-24');
    // Las apps: el día a mediodía UTC.
    expect(diaDePrestamo('2026-11-24T12:00:00.000Z')).toBe('2026-11-24');
    // La prórroga de la web: 23:59 del día elegido en México, que en UTC ya es el día siguiente.
    expect(diaDePrestamo('2026-11-25T05:59:00.000Z')).toBe('2026-11-24');
    // Una integración: solo el día.
    expect(diaDePrestamo('2026-11-24')).toBe('2026-11-24');
    expect(diaDePrestamo(new Date('2026-11-24T18:00:00.000Z'))).toBe('2026-11-24');
  });

  it('guarda siempre el mediodía de México de ese día', () => {
    for (const entrada of ['2026-11-24', '2026-11-24T00:00:00.000Z', '2026-11-24T12:00:00.000Z', '2026-11-25T05:59:00.000Z']) {
      expect(fechaDePrestamo(entrada)?.toISOString()).toBe('2026-11-24T18:00:00.000Z');
    }
  });

  it('acepta lo que manda la web y limpia el motivo', () => {
    const plazo = plazoDePrestamo({
      reason: '  Instalación en planta ',
      startDate: '2026-11-21T18:00:00.000Z',
      expectedReturnDate: '2026-11-22T18:00:00.000Z',
    });
    expect(plazo.reason).toBe('Instalación en planta');
    expect(plazo.startDate.toISOString()).toBe('2026-11-21T18:00:00.000Z');
    expect(plazo.expectedReturnDate.toISOString()).toBe('2026-11-22T18:00:00.000Z');
  });

  it('dice qué falta en vez de «parámetros inválidos»', () => {
    const base = { reason: 'Obra', startDate: '2026-11-21', expectedReturnDate: '2026-11-22' };
    expect(() => plazoDePrestamo({ ...base, reason: '   ' })).toThrow('Cuenta para qué necesitas la herramienta');
    expect(() => plazoDePrestamo({ ...base, startDate: 'mañana' })).toThrow('Indica desde qué día necesitas la herramienta');
    expect(() => plazoDePrestamo({ ...base, expectedReturnDate: undefined })).toThrow('Indica qué día la devuelves');
    expect(() => plazoDePrestamo({ ...base, expectedReturnDate: null })).toThrow(BadRequestException);
  });

  it('no deja devolver antes de recoger', () => {
    expect(() =>
      plazoDePrestamo({ reason: 'Obra', startDate: '2026-11-22', expectedReturnDate: '2026-11-21' }),
    ).toThrow('El día de devolución no puede ser antes del día en que la recoges');
  });

  it('se puede pedir y regresar el mismo día, como lo mandan las apps (las dos fechas a mediodía)', () => {
    const plazo = plazoDePrestamo({
      reason: 'Obra',
      startDate: '2026-11-22T12:00:00.000Z',
      expectedReturnDate: '2026-11-22T12:00:00.000Z',
    });
    expect(plazo.expectedReturnDate.getTime()).toBe(plazo.startDate.getTime());
    expect(() => plazoDePrestamo({ reason: 'Obra', startDate: '2026-11-22', expectedReturnDate: '2026-11-22' })).not.toThrow();
  });

  it('una fecha que no existe no pasa', () => {
    expect(fechaDePrestamo('2026-13-45')).toBeNull();
    expect(fechaDePrestamo('2026-02-30')).toBeNull();
    expect(fechaDePrestamo('')).toBeNull();
    expect(fechaDePrestamo(42)).toBeNull();
    expect(fechaDePrestamo(new Date('nada'))).toBeNull();
  });

  it('la prórroga guarda el día elegido y avisa si no viene', () => {
    expect(nuevaDevolucion('2026-11-26T05:59:00.000Z').toISOString()).toBe('2026-11-25T18:00:00.000Z');
    expect(() => nuevaDevolucion(undefined)).toThrow('Indica hasta qué día necesitas la herramienta');
  });
});
