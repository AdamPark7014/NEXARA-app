import {
  calculaKpisPersona,
  esLaborable,
  horarioDelDia,
  horarioDePlantilla,
  type ChecadaKpi,
  type EntradaKpiPersona,
  type FestivoKpi,
} from './kpis-equipo';

/** Desempeño con festivos: lunes 16-11-2026 (Día de la Revolución). Hora de México (UTC−6). */
const M = (hhmm: string, dia = '16') => new Date(`2026-11-${dia}T${hhmm}:00-06:00`);
const oficina = horarioDePlantilla('office_hours');
const direccion = horarioDePlantilla('always_on');
const FECHA = '2026-11-16';

const NO_SE_LABORA: FestivoKpi = { nombre: 'Día de la Revolución', trabaja: false, entrada: null, salida: null };
const DE_10_A_14: FestivoKpi = { nombre: 'Día de la Revolución', trabaja: true, entrada: '10:00', salida: '14:00' };

const checada = (tipo: 'entrada' | 'salida', hhmm: string): ChecadaKpi => ({ tipo, at: M(hhmm) });

function calcula(parcial: Partial<EntradaKpiPersona>) {
  return calculaKpisPersona({
    desde: FECHA,
    hasta: FECHA,
    ahora: M('20:00', '17'),
    horario: oficina,
    checadas: [],
    comidas: [],
    actividades: [],
    ...parcial,
  });
}

describe('desempeño con festivos', () => {
  it('un festivo que no le toca no se le exige: no sale como día sin checada', () => {
    const conFestivo = calcula({ festivos: { [FECHA]: NO_SE_LABORA } });
    expect(conFestivo.dias.find((d) => d.fecha === FECHA)).toBeUndefined();
    const sinFestivo = calcula({});
    expect(sinFestivo.dias.find((d) => d.fecha === FECHA)?.sinChecada).toBe(true);
  });

  it('con horario propio: retardo contra su entrada y la jornada del día es la del festivo', () => {
    const tarde = calcula({
      festivos: { [FECHA]: DE_10_A_14 },
      checadas: [checada('entrada', '10:20'), checada('salida', '14:30')],
    });
    const d = tarde.dias.find((x) => x.fecha === FECHA)!;
    expect(d.laborable).toBe(true);
    expect(d.retardo).toBe(true);
    expect(d.minutosTarde).toBe(20);
    // 4 h 10 min trabajadas contra 4 h del festivo: 10 min de extra.
    expect(d.minutosExtra).toBe(10);

    const puntual = calcula({
      festivos: { [FECHA]: DE_10_A_14 },
      checadas: [checada('entrada', '10:05'), checada('salida', '14:00')],
    });
    expect(puntual.dias.find((x) => x.fecha === FECHA)?.retardo).toBe(false);
  });

  it('reglas sueltas', () => {
    expect(esLaborable(oficina, FECHA, null)).toBe(true);
    expect(esLaborable(oficina, FECHA, NO_SE_LABORA)).toBe(false);
    expect(esLaborable(oficina, FECHA, DE_10_A_14)).toBe(true);
    // Un sábado con horario propio sí; con la jornada completa, no (no era su día).
    expect(esLaborable(oficina, '2026-11-21', DE_10_A_14)).toBe(true);
    expect(esLaborable(oficina, '2026-11-21', { ...DE_10_A_14, entrada: null, salida: null })).toBe(false);
    // Dirección (24/7) nunca.
    expect(esLaborable(direccion, FECHA, DE_10_A_14)).toBe(false);
    expect(horarioDelDia(oficina, DE_10_A_14)).toMatchObject({ entrada: '10:00', salida: '14:00', jornadaOrdinariaMin: 240 });
    expect(horarioDelDia(oficina, NO_SE_LABORA)).toBe(oficina);
  });
});
