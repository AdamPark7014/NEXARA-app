import {
  diasEntre,
  parsearConfigNomina,
  periodoQueCierra,
  periodoRecienCerrado,
  proximoCorte,
  type ConfigNomina,
} from './nomina-calendario.js';

const QUINCENAL: ConfigNomina = { frecuencia: 'quincenal', diaSemanaCorte: 5 };

describe('parsearConfigNomina', () => {
  it('sin valor, JSON roto o frecuencia desconocida = sin cadencia (no se avisa)', () => {
    expect(parsearConfigNomina(null)).toBeNull();
    expect(parsearConfigNomina('')).toBeNull();
    expect(parsearConfigNomina('no es json')).toBeNull();
    expect(parsearConfigNomina('{"frecuencia":"bimestral"}')).toBeNull();
    expect(parsearConfigNomina('[]')).toBeNull();
  });
  it('lee la frecuencia sin importar mayúsculas y da viernes por omisión al semanal', () => {
    expect(parsearConfigNomina('{"frecuencia":"Quincenal"}')).toEqual({ frecuencia: 'quincenal', diaSemanaCorte: 5 });
    expect(parsearConfigNomina('{"frecuencia":"semanal","diaSemanaCorte":4}')?.diaSemanaCorte).toBe(4);
    expect(parsearConfigNomina('{"frecuencia":"semanal","diaSemanaCorte":9}')?.diaSemanaCorte).toBe(5);
  });
});

describe('quincenal', () => {
  it('el 15 cierra la 1.ª quincena y el último día la 2.ª', () => {
    expect(periodoQueCierra('2026-09-15', QUINCENAL)).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-15',
      corte: '2026-09-15',
      etiqueta: '1.ª quincena de septiembre de 2026 (1–15)',
    });
    expect(periodoQueCierra('2026-09-30', QUINCENAL)).toMatchObject({ desde: '2026-09-16', hasta: '2026-09-30' });
  });

  it('entre cortes el último periodo cerrado es el anterior, también cruzando mes y año', () => {
    expect(periodoQueCierra('2026-09-20', QUINCENAL)).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-15' });
    expect(periodoQueCierra('2026-09-10', QUINCENAL)).toMatchObject({ desde: '2026-08-16', hasta: '2026-08-31' });
    expect(periodoQueCierra('2027-01-05', QUINCENAL)).toMatchObject({ desde: '2026-12-16', hasta: '2026-12-31' });
  });

  it('febrero respeta los años bisiestos', () => {
    expect(periodoQueCierra('2028-02-29', QUINCENAL)).toMatchObject({ desde: '2028-02-16', hasta: '2028-02-29' });
    expect(periodoQueCierra('2027-02-28', QUINCENAL)).toMatchObject({ desde: '2027-02-16', hasta: '2027-02-28' });
  });

  it('próximo corte y días que faltan', () => {
    expect(proximoCorte('2026-09-10', QUINCENAL)).toMatchObject({ dias: 5, periodo: { corte: '2026-09-15' } });
    expect(proximoCorte('2026-09-15', QUINCENAL)).toMatchObject({ dias: 0, periodo: { corte: '2026-09-15' } });
    expect(proximoCorte('2026-09-16', QUINCENAL)).toMatchObject({ dias: 14, periodo: { corte: '2026-09-30' } });
    expect(proximoCorte('2026-12-31', QUINCENAL)).toMatchObject({ dias: 0, periodo: { corte: '2026-12-31' } });
  });

  it('«recién cerrada»: desde el día siguiente al corte y hasta 3 días después; nunca el mismo día', () => {
    expect(periodoRecienCerrado('2026-09-15', QUINCENAL)).toBeNull();
    expect(periodoRecienCerrado('2026-09-16', QUINCENAL)?.hasta).toBe('2026-09-15');
    // Corte en viernes, aviso el lunes (3 días después).
    expect(periodoRecienCerrado('2027-01-18', QUINCENAL)?.hasta).toBe('2027-01-15');
    expect(periodoRecienCerrado('2026-09-19', QUINCENAL)).toBeNull();
    expect(periodoRecienCerrado('2026-10-01', QUINCENAL)?.hasta).toBe('2026-09-30');
  });
});

describe('mensual y semanal', () => {
  it('mensual: el último día cierra el mes', () => {
    const cfg: ConfigNomina = { frecuencia: 'mensual', diaSemanaCorte: 5 };
    expect(periodoQueCierra('2026-09-30', cfg)).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(periodoQueCierra('2026-09-12', cfg)).toMatchObject({ desde: '2026-08-01', hasta: '2026-08-31' });
    expect(proximoCorte('2026-09-12', cfg).dias).toBe(18);
  });

  it('semanal: corta el viernes por omisión (2026-09-25 es viernes)', () => {
    const cfg: ConfigNomina = { frecuencia: 'semanal', diaSemanaCorte: 5 };
    expect(periodoQueCierra('2026-09-25', cfg)).toMatchObject({ desde: '2026-09-19', hasta: '2026-09-25' });
    expect(periodoQueCierra('2026-09-28', cfg)).toMatchObject({ hasta: '2026-09-25' });
    expect(proximoCorte('2026-09-28', cfg)).toMatchObject({ dias: 4, periodo: { corte: '2026-10-02' } });
    expect(periodoRecienCerrado('2026-09-28', cfg)?.hasta).toBe('2026-09-25');
  });
});

describe('diasEntre', () => {
  it('cuenta días calendario sin depender de la zona ni del horario de verano', () => {
    expect(diasEntre('2026-03-01', '2026-04-01')).toBe(31);
    expect(diasEntre('2026-09-15', '2026-09-15')).toBe(0);
    expect(() => diasEntre('15/09/2026', '2026-09-15')).toThrow(RangeError);
  });
});
