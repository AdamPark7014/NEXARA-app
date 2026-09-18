import {
  camposDePeriodo,
  claveDia,
  diaDelPeriodo,
  diasDelPeriodo,
  encadenarEtapas,
  esMultiDia,
  etiquetaDelPeriodo,
  fechaCorta,
  finDelPeriodo,
  limiteDeActividad,
  periodoDeActividad,
  periodoDto,
  periodoFuturo,
  periodosSeEmpalman,
  periodoTocaRango,
  validarPeriodo,
} from './actividad-periodo';

// El ejemplo del dueño: diez días del 16 al 25 de septiembre, visto el viernes 18.
const P = { inicio: '2026-09-16', fin: '2026-09-25' };

describe('días de calendario', () => {
  it('lee columnas @db.Date en UTC y textos AAAA-MM-DD', () => {
    expect(claveDia(new Date('2026-09-21T00:00:00.000Z'))).toBe('2026-09-21');
    expect(claveDia('2026-09-21')).toBe('2026-09-21');
    expect(claveDia('2026-09-21T00:00:00.000Z')).toBe('2026-09-21');
  });

  it('rechaza días que no existen o texto suelto', () => {
    expect(claveDia('2026-02-31')).toBeNull();
    expect(claveDia('mañana')).toBeNull();
    expect(claveDia('')).toBeNull();
    expect(claveDia(null)).toBeNull();
  });

  it('cuenta los dos extremos', () => {
    expect(diasDelPeriodo(P)).toBe(10);
    expect(diasDelPeriodo({ inicio: '2026-09-16', fin: '2026-09-16' })).toBe(1);
    // Cruza mes.
    expect(diasDelPeriodo({ inicio: '2026-09-28', fin: '2026-10-02' })).toBe(5);
  });

  it('fecha corta en español sin depender del ICU', () => {
    expect(fechaCorta('2026-09-25')).toBe('vie 25 sep');
    expect(fechaCorta('2026-09-16')).toBe('mié 16 sep');
    expect(fechaCorta('2026-12-06')).toBe('dom 6 dic');
  });
});

describe('día N de M', () => {
  it('dentro del periodo', () => {
    expect(diaDelPeriodo(P, '2026-09-16')).toBe(1);
    expect(diaDelPeriodo(P, '2026-09-18')).toBe(3);
    expect(diaDelPeriodo(P, '2026-09-25')).toBe(10);
  });

  it('fuera del periodo no hay día', () => {
    expect(diaDelPeriodo(P, '2026-09-15')).toBeNull();
    expect(diaDelPeriodo(P, '2026-09-26')).toBeNull();
  });

  it('etiquetas', () => {
    expect(etiquetaDelPeriodo(P, '2026-09-18')).toBe('Día 3 de 10 · termina vie 25 sep');
    expect(etiquetaDelPeriodo(P, '2026-09-25')).toBe('Día 10 de 10 · termina hoy');
    expect(etiquetaDelPeriodo(P, '2026-09-15')).toBe('Empieza mañana · 10 días');
    expect(etiquetaDelPeriodo(P, '2026-09-10')).toBe('Empieza mié 16 sep · 10 días');
    expect(etiquetaDelPeriodo(P, '2026-09-26')).toBe('Terminaba vie 25 sep · 1 día de atraso');
    expect(etiquetaDelPeriodo(P, '2026-09-28')).toBe('Terminaba vie 25 sep · 3 días de atraso');
    expect(etiquetaDelPeriodo(P, '2026-09-20', true)).toBe('Del mié 16 sep al vie 25 sep');
    expect(etiquetaDelPeriodo({ inicio: '2026-09-16', fin: '2026-09-16' }, '2026-09-20', true)).toBe('El mié 16 sep');
  });

  it('«hoy» es el día de México, no el del servidor en UTC', () => {
    const fila = { periodoInicio: new Date('2026-09-16T00:00:00Z'), periodoFin: new Date('2026-09-25T00:00:00Z') };
    // 23:00 del jueves 18 en México ya es viernes 19 en UTC.
    const noche = periodoDto(fila, new Date('2026-09-19T05:00:00.000Z'));
    expect(noche?.dia).toBe(3);
    expect(noche?.etiqueta).toBe('Día 3 de 10 · termina vie 25 sep');
    expect(noche?.estado).toBe('en_curso');
    expect(noche?.multiDia).toBe(true);
    expect(noche?.dias).toBe(10);
  });

  it('cerrada no cuenta días', () => {
    const fila = { periodoInicio: '2026-09-16', periodoFin: '2026-09-25' };
    const dto = periodoDto(fila, new Date('2026-09-18T17:00:00Z'), true);
    expect(dto?.estado).toBe('cerrada');
    expect(dto?.dia).toBeNull();
  });

  it('sin periodo no hay nada que decir', () => {
    expect(periodoDto({ periodoInicio: null, periodoFin: null })).toBeNull();
    expect(periodoDeActividad({ periodoInicio: '2026-09-25', periodoFin: '2026-09-16' })).toBeNull();
  });

  it('programada y de varios días', () => {
    expect(periodoFuturo(P, '2026-09-15')).toBe(true);
    expect(periodoFuturo(P, '2026-09-16')).toBe(false);
    expect(esMultiDia(P)).toBe(true);
    expect(esMultiDia({ inicio: '2026-09-16', fin: '2026-09-16' })).toBe(false);
    expect(esMultiDia(null)).toBe(false);
  });
});

describe('empalmes', () => {
  it('el periodo toca el rango de la pizarra', () => {
    expect(periodoTocaRango(P, '2026-09-18', '2026-09-18')).toBe(true);
    expect(periodoTocaRango(P, '2026-09-25', '2026-09-30')).toBe(true);
    expect(periodoTocaRango(P, '2026-09-10', '2026-09-16')).toBe(true);
    expect(periodoTocaRango(P, '2026-09-26', '2026-09-30')).toBe(false);
    expect(periodoTocaRango(P, '2026-09-01', '2026-09-15')).toBe(false);
  });

  it('dos periodos que comparten un día se empalman; seguidos no', () => {
    expect(periodosSeEmpalman(P, { inicio: '2026-09-25', fin: '2026-09-30' })).toBe(true);
    expect(periodosSeEmpalman(P, { inicio: '2026-09-26', fin: '2026-09-30' })).toBe(false);
    expect(periodosSeEmpalman({ inicio: '2026-09-20', fin: '2026-09-21' }, P)).toBe(true);
  });
});

describe('validar y guardar', () => {
  it('sin fechas no hay periodo; con una sola es error', () => {
    expect(validarPeriodo(undefined, '')).toEqual({ periodo: null });
    expect(validarPeriodo('2026-09-16', null).error).toMatch(/inicio y día de fin/);
    expect(validarPeriodo('2026-09-25', '2026-09-16').error).toMatch(/anterior/);
    expect(validarPeriodo('2026-09-16', '2028-01-01').error).toMatch(/año/);
    expect(validarPeriodo('ayer', '2026-09-16').error).toMatch(/no son válidas/);
    expect(validarPeriodo('2026-09-16', '2026-09-25T00:00:00.000Z')).toEqual({ periodo: P });
  });

  it('la fecha máxima y la entrega son el fin del último día en México', () => {
    const c = camposDePeriodo(P);
    expect(c.periodoInicio.toISOString()).toBe('2026-09-16T00:00:00.000Z');
    expect(c.periodoFin.toISOString()).toBe('2026-09-25T00:00:00.000Z');
    expect(c.fechaMaxima.toISOString()).toBe('2026-09-26T05:59:59.999Z');
    expect(c.fechaEntregaEsperada.toISOString()).toBe(c.fechaMaxima.toISOString());
    // Sin hora: el primer día a las 9:00 de México.
    expect(c.fechaInicio.toISOString()).toBe('2026-09-16T15:00:00.000Z');
  });

  it('respeta la hora de inicio si cae dentro del periodo', () => {
    expect(camposDePeriodo(P, '2026-09-17T16:30:00.000Z').fechaInicio.toISOString()).toBe('2026-09-17T16:30:00.000Z');
    // Fuera del periodo, se vuelve al primer día.
    expect(camposDePeriodo(P, '2026-09-30T16:30:00.000Z').fechaInicio.toISOString()).toBe('2026-09-16T15:00:00.000Z');
  });

  it('el límite es el fin del periodo aunque la fecha máxima diga otra cosa', () => {
    const limite = limiteDeActividad({
      fechaMaxima: new Date('2026-09-16T15:00:00.000Z'),
      periodoInicio: '2026-09-16',
      periodoFin: '2026-09-25',
    });
    expect(limite?.toISOString()).toBe(finDelPeriodo('2026-09-25').toISOString());
    const sinPeriodo = new Date('2026-09-16T15:00:00.000Z');
    expect(limiteDeActividad({ fechaMaxima: sinPeriodo })).toBe(sinPeriodo);
  });
});

describe('etapas encadenadas', () => {
  it('cada etapa empieza el día siguiente a que termina la anterior', () => {
    const r = encadenarEtapas(
      [
        { id: 1, plannedDate: '2026-09-25' },
        { id: 2, plannedDate: new Date('2026-10-09T00:00:00Z') },
        { id: 3, plannedDate: '2026-10-30' },
      ],
      '2026-09-21',
      '2026-10-30',
    );
    expect(r.map((e) => [e.inicio, e.fin, e.dias])).toEqual([
      ['2026-09-21', '2026-09-25', 5],
      ['2026-09-26', '2026-10-09', 14],
      ['2026-10-10', '2026-10-30', 21],
    ]);
    expect(r.every((e) => !e.ajustada)).toBe(true);
    for (let i = 1; i < r.length; i++) expect(periodosSeEmpalman(r[i - 1], r[i])).toBe(false);
  });

  it('las etapas sin fecha se reparten los días hasta la siguiente con fecha', () => {
    const r = encadenarEtapas(
      [
        { id: 1, plannedDate: '2026-09-25' },
        { id: 2, plannedDate: null },
        { id: 3 },
        { id: 4, plannedDate: '2026-10-30' },
      ],
      '2026-09-21',
    );
    expect(r.map((e) => [e.inicio, e.fin])).toEqual([
      ['2026-09-21', '2026-09-25'],
      ['2026-09-26', '2026-10-12'],
      ['2026-10-13', '2026-10-29'],
      ['2026-10-30', '2026-10-30'],
    ]);
  });

  it('sin fechas se reparten hasta el fin del proyecto; sin fin, una semana cada una', () => {
    expect(
      encadenarEtapas([{ id: 1 }, { id: 2 }], '2026-09-01', '2026-09-10').map((e) => [e.inicio, e.fin]),
    ).toEqual([
      ['2026-09-01', '2026-09-05'],
      ['2026-09-06', '2026-09-10'],
    ]);
    expect(encadenarEtapas([{ id: 1 }, { id: 2 }], '2026-09-01').map((e) => [e.inicio, e.fin])).toEqual([
      ['2026-09-01', '2026-09-07'],
      ['2026-09-08', '2026-09-14'],
    ]);
  });

  it('una fecha planeada que se quedó atrás se recorre sin encimarse', () => {
    const r = encadenarEtapas(
      [
        { id: 1, plannedDate: '2026-09-25' },
        { id: 2, plannedDate: '2026-09-20' },
        { id: 3, plannedDate: '2026-09-30' },
      ],
      '2026-09-21',
    );
    expect(r[1]).toMatchObject({ inicio: '2026-09-26', fin: '2026-09-26', ajustada: true, dias: 1 });
    expect(r[2]).toMatchObject({ inicio: '2026-09-27', fin: '2026-09-30', ajustada: false });
  });

  it('sin inicio del proyecto no hay propuesta', () => {
    expect(encadenarEtapas([{ id: 1, plannedDate: '2026-09-25' }], 'sin fecha')).toEqual([]);
  });
});
