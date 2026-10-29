import { diaDeLaSemana } from '../me/kpis-equipo.js';
import {
  areaDe,
  diasDeLaSemana,
  filaControl,
  lugarAutomatico,
  ocultarMontos,
  sueldoDelPeriodo,
  type EntradaDia,
  type HorarioNomina,
} from './control-nomina.js';
import { divisorDeHorario } from './sugerencia-nomina.js';

/**
 * Festivos en el control de nómina: semana del lunes 16-11-2026 (Día de la Revolución),
 * consultada el lunes 23 (ya cerrada). Datos ficticios.
 */
const LUNES = '2026-11-16';
const HOY = '2026-11-23';
const SEMANA = diasDeLaSemana(LUNES).map((d) => d.fecha);
const OFICINA = 'Oficina';
const HORARIO: HorarioNomina = {
  etiqueta: 'Oficina · 10:00 a 18:00',
  entrada: '10:00',
  salida: '18:00',
  jornadaOrdinariaMin: 480,
  dias: [1, 2, 3, 4, 5],
  personalizado: false,
};
const iso = (fecha: string, hhmm: string) => new Date(`${fecha}T${hhmm}:00-06:00`).toISOString();
const REVOLUCION = 'Día de la Revolución';

function dia(fecha: string, extra: Partial<EntradaDia> = {}): EntradaDia {
  const dow = diaDeLaSemana(fecha);
  return {
    fecha,
    laborable: dow >= 1 && dow <= 5,
    pasado: fecha < HOY,
    checadas: [],
    oficina: OFICINA,
    entrada: null,
    salida: null,
    minutosLaborados: 0,
    ...extra,
  };
}

function trabajado(fecha: string, entrada = '10:00', salida = '18:00', extra: Partial<EntradaDia> = {}): EntradaDia {
  const brutos = (new Date(iso(fecha, salida)).getTime() - new Date(iso(fecha, entrada)).getTime()) / 60_000;
  return dia(fecha, {
    entrada: iso(fecha, entrada),
    salida: iso(fecha, salida),
    minutosLaborados: brutos,
    checadas: [
      { tipo: 'entrada', sitioNombre: OFICINA, fueraDeSitio: false },
      { tipo: 'salida', sitioNombre: OFICINA, fueraDeSitio: false },
    ],
    ...extra,
  });
}

function fila(dias: EntradaDia[]) {
  return filaControl({
    userId: 1,
    nombre: 'Ana Prueba',
    area: areaDe({ roleKey: null, departamento: null }),
    semana: { inicio: LUNES, fin: SEMANA[6] },
    hoy: HOY,
    horario: HORARIO,
    sueldoSemanal: 7000,
    dias,
    viaticos: [],
    extrasMinutosAprobados: 0,
    extrasMinutosPendientes: 0,
    descuentos: [],
  });
}

describe('control de nómina: festivos', () => {
  it('un festivo que no le toca es descanso pagado: ni falta, ni descuento, ni baja el sueldo', () => {
    const f = fila([
      dia(LUNES, { laborable: false, festivo: { nombre: REVOLUCION, trabaja: false, pagoDoble: false } }),
      ...SEMANA.slice(1, 5).map((d) => trabajado(d)),
      dia(SEMANA[5]),
      dia(SEMANA[6]),
    ]);
    expect(f.dias[0]).toMatchObject({
      lugar: 'Descanso',
      motivoLugar: `Festivo: ${REVOLUCION}`,
      falta: false,
      festivo: { nombre: REVOLUCION, trabajado: false },
    });
    expect(f.faltasInjustificadas).toBe(0);
    expect(f.descuentosSugeridos).toEqual([]);
    expect(f.sueldoPeriodo).toBe(7000);
    expect(f.festivosTrabajados).toEqual([]);
    expect(f.festivosMonto).toBe(0);
  });

  it('sin festivo marcado, ese lunes sin checada era falta (lo que pasaba antes)', () => {
    const f = fila([dia(LUNES), ...SEMANA.slice(1, 5).map((d) => trabajado(d)), dia(SEMANA[5]), dia(SEMANA[6])]);
    expect(f.dias[0].lugar).toBe('Falta');
    expect(f.faltasInjustificadas).toBe(1);
  });

  it('festivo trabajado: lugar por sus checadas, salario doble aparte y sus horas no cuentan para el sueldo', () => {
    const f = fila([
      trabajado(LUNES, '10:00', '14:00', { festivo: { nombre: REVOLUCION, trabaja: true, pagoDoble: true } }),
      ...SEMANA.slice(1, 5).map((d) => trabajado(d)),
      dia(SEMANA[5]),
      dia(SEMANA[6]),
    ]);
    expect(f.dias[0].lugar).toBe('Oficina');
    expect(f.dias[0].motivoLugar).toMatch(/^Festivo trabajado \(Día de la Revolución\) · /);
    expect(f.dias[0].festivo).toEqual({ nombre: REVOLUCION, trabajado: true });
    expect(f.sueldoPeriodo).toBe(7000);
    expect(f.festivosTrabajados).toEqual([{ fecha: LUNES, nombre: REVOLUCION }]);
    expect(f.festivosMonto).toBe(2000);
    expect(f.subtotal).toBe(9000);
    expect(f.avisos.some((a) => /^Festivo trabajado el LUNES 16\/11 \(Día de la Revolución\): salario doble/.test(a))).toBe(true);

    const oculta = ocultarMontos(f);
    expect(oculta.festivosMonto).toBeNull();
    expect(oculta.avisos.some((a) => /salario/.test(a))).toBe(false);
  });

  it('sin pago doble (dirección lo quitó) se trabaja el festivo sin prima', () => {
    const f = fila([
      trabajado(LUNES, '10:00', '14:00', { festivo: { nombre: REVOLUCION, trabaja: true, pagoDoble: false } }),
      ...SEMANA.slice(1, 7).map((d) => (diaDeLaSemana(d) <= 5 ? trabajado(d) : dia(d))),
    ]);
    expect(f.festivosTrabajados).toEqual([]);
    expect(f.subtotal).toBe(7000);
  });

  it('el sueldo del periodo no espera ni suma las horas de un festivo', () => {
    const divisor = divisorDeHorario(HORARIO.dias, HORARIO.jornadaOrdinariaMin);
    const r = sueldoDelPeriodo({
      sueldoSemanal: 7000,
      divisor,
      jornadaMin: 480,
      semana: { desde: LUNES, hasta: SEMANA[6] },
      hoy: HOY,
      dias: [
        { fecha: LUNES, lugar: 'Oficina', minutos: 240, festivo: true },
        ...SEMANA.slice(1, 5).map((f) => ({ fecha: f, lugar: 'Oficina' as const, minutos: 480 })),
        ...SEMANA.slice(5).map((f) => ({ fecha: f, lugar: 'Descanso' as const, minutos: 0 })),
      ],
    });
    expect(r.minutosEsperados).toBe(4 * 480);
    expect(r.minutosLaborados).toBe(4 * 480);
    expect(r.sueldoPeriodo).toBe(7000);
  });

  it('el lugar de un festivo de fin de semana con guardia sigue siendo «Guardia»', () => {
    const r = lugarAutomatico({
      laborable: false,
      pasado: true,
      checadas: [{ tipo: 'entrada', sitioNombre: OFICINA, fueraDeSitio: false }],
      oficina: OFICINA,
      guardia: true,
      festivo: { nombre: 'Día del Trabajo', trabaja: true, pagoDoble: true },
    });
    expect(r.lugar).toBe('Guardia');
    expect(r.motivo).toBe('Festivo trabajado (Día del Trabajo) · Guardia programada');
  });
});
