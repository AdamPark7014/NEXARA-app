import { calculaKpisPersona, horarioDePersona } from '../me/kpis-equipo.js';
import type { EntradaPreNomina } from './pre-nomina.js';
import { workDateKey } from '../common/time/workday.js';
import {
  CLAVES_PERIODO,
  HORAS_SEMANALES_LFT,
  divisorDeHorario,
  esClavePeriodo,
  periodoDeClave,
  periodosCalculados,
  semanalDeMensual,
  sueldoDeDias,
  filaSugerencia,
  formulaSugerencia,
  minutosEsperados,
  ordenaSugerencias,
  periodoManual,
  periodoSugerencia,
  totalesSugerencia,
  ventanaDeCalculo,
  type ClavePeriodo,
  type EntradaSugerencia,
} from './sugerencia-nomina.js';

const mx = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-06:00`);

const OFICINA = { etiqueta: 'Oficina · entra 10:00', jornadaOrdinariaMin: 480, dias: [1, 2, 3, 4, 5], personalizado: false };
const SIN_HORARIO = { etiqueta: 'Sin horario fijo (24/7)', jornadaOrdinariaMin: null, dias: [], personalizado: false };

const tot = (over: Partial<EntradaPreNomina['totales']> = {}): EntradaPreNomina['totales'] => ({
  diasConJornada: 0,
  diasSinChecada: 0,
  faltasJustificadas: 0,
  retardos: 0,
  minutosTarde: 0,
  minutosLaborados: 0,
  minutosProductivos: 0,
  minutosInactivos: 0,
  productividadPct: null,
  minutosExtra: 0,
  minutosExtraAprobados: 0,
  minutosExtraPendientes: 0,
  diasExtraPendientes: 0,
  cierresAutomaticos: 0,
  jornadasSinSalida: 0,
  ...over,
});

/**
 * 2.ª quincena de septiembre de 2026, ya cerrada (hoy es 2 de octubre).
 * Del miércoles 16 al miércoles 30 hay 11 días de lunes a viernes: 88 h esperadas en oficina.
 */
const QUINCENA = { desde: '2026-09-16', hasta: '2026-09-30' };
const HOY = '2026-10-02';
const ESPERADOS_OFICINA = 11 * 480;

const entrada = (over: Partial<EntradaSugerencia> = {}): EntradaSugerencia => ({
  userId: 7,
  nombre: 'Ana',
  horario: OFICINA,
  totales: tot({ minutosLaborados: ESPERADOS_OFICINA, minutosProductivos: Math.round(ESPERADOS_OFICINA * 0.8) }),
  sueldoSemanal: 4000,
  periodo: QUINCENA,
  hoy: HOY,
  ...over,
});

describe('el pago por hora sale de su horario', () => {
  it('oficina L–V de 8 h: el sueldo semanal se divide entre 40 h', () => {
    const d = divisorDeHorario(OFICINA);
    expect(d.horasSemanales).toBe(40);
    expect(d.origen).toBe('plantilla');
    expect(d.etiqueta).toContain('8 h × 5 días = 40 h');
  });

  it('un horario propio escrito en RH manda sobre la plantilla', () => {
    const d = divisorDeHorario({ jornadaOrdinariaMin: 540, dias: [1, 2, 3, 4, 5, 6], personalizado: true });
    expect(d.horasSemanales).toBe(54);
    expect(d.origen).toBe('horario_propio');
  });

  it('sin horario fijo se usa la jornada legal de 48 h', () => {
    const d = divisorDeHorario(SIN_HORARIO);
    expect(d.horasSemanales).toBe(HORAS_SEMANALES_LFT);
    expect(d.origen).toBe('lft');
    expect(d.etiqueta).toContain('48 h');
  });

  it('las horas esperadas cuentan solo sus días laborables', () => {
    expect(minutosEsperados(divisorDeHorario(OFICINA), QUINCENA.desde, QUINCENA.hasta)).toBe(ESPERADOS_OFICINA);
    // Con la jornada legal también cuentan los sábados 19 y 26.
    expect(minutosEsperados(divisorDeHorario(SIN_HORARIO), QUINCENA.desde, QUINCENA.hasta)).toBe(13 * 480);
  });
});

describe('periodo de nómina', () => {
  it('sin calendario capturado se asume quincenal y se dice', () => {
    const p = periodoSugerencia(HOY, null);
    expect(p).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-15', origen: 'por_omision', frecuencia: 'quincenal' });
    expect(periodoSugerencia(HOY, null, 'anterior')).toMatchObject({ desde: '2026-09-16', hasta: '2026-09-30' });
  });

  it('semanal con corte en viernes: el vigente cierra hoy y el anterior es la semana previa', () => {
    const cfg = { frecuencia: 'semanal' as const, diaSemanaCorte: 5 };
    expect(periodoSugerencia(HOY, cfg)).toMatchObject({ desde: '2026-09-26', hasta: '2026-10-02', origen: 'calendario' });
    expect(periodoSugerencia(HOY, cfg, 'anterior')).toMatchObject({ desde: '2026-09-19', hasta: '2026-09-25' });
  });

  it('un rango a mano queda marcado como manual', () => {
    expect(periodoManual('2026-09-01', '2026-09-10')).toMatchObject({ origen: 'manual', frecuencia: null });
  });

  it('el día de hoy no se juzga todavía, ni los días antes de su ingreso', () => {
    expect(ventanaDeCalculo(QUINCENA, HOY)).toEqual({ desde: QUINCENA.desde, hasta: QUINCENA.hasta, dias: 15, enCurso: false });
    expect(ventanaDeCalculo({ desde: '2026-10-01', hasta: '2026-10-15' }, HOY)).toMatchObject({
      hasta: '2026-10-01',
      dias: 1,
      enCurso: true,
    });
    expect(ventanaDeCalculo(QUINCENA, HOY, '2026-09-28')).toMatchObject({ desde: '2026-09-28', dias: 3 });
  });
});

describe('la sugerencia por persona', () => {
  it('quien cumplió su jornada: se le sugiere su sueldo del periodo', () => {
    const f = filaSugerencia(entrada());
    expect(f.pagoHora).toBe(100);
    expect(f.horasLaboradas).toBe(88);
    expect(f.horasProductivas).toBe(70.4);
    expect(f.productividadPct).toBe(80);
    expect(f.pagoPorLaboradas).toBe(8800);
    expect(f.pagoPorProductivas).toBe(7040);
    // 4 000 ÷ 7 × 15 días.
    expect(f.sueldoPeriodo).toBe(8571.43);
    expect(f.montoSugerido).toBe(8571.43);
    expect(f.cumplimientoPct).toBe(100);
    expect(f.estado).toBe('ok');
    expect(f.sugerencia).toContain('Cumplió su jornada');
  });

  it('quien laboró la mitad: el sugerido es la mitad', () => {
    const f = filaSugerencia(
      entrada({ totales: tot({ minutosLaborados: ESPERADOS_OFICINA / 2, minutosProductivos: 2000 }) }),
    );
    expect(f.montoSugerido).toBe(4285.71);
    expect(f.cumplimientoPct).toBe(50);
    expect(f.sugerencia).toContain('44 h de 88 h');
  });

  it('productivas por debajo del 60 %: se sugiere revisar y se dice cuánto sería por productivas', () => {
    const f = filaSugerencia(
      entrada({ totales: tot({ minutosLaborados: ESPERADOS_OFICINA, minutosProductivos: ESPERADOS_OFICINA / 2 }) }),
    );
    expect(f.estado).toBe('revisar');
    expect(f.productividadPct).toBe(50);
    expect(f.sugerencia).toContain('50 %');
    expect(f.sugerencia).toContain('$4,400.00');
  });

  it('el tiempo extra no sube el sugerido por encima del sueldo', () => {
    const f = filaSugerencia(
      entrada({ totales: tot({ minutosLaborados: ESPERADOS_OFICINA + 600, minutosProductivos: ESPERADOS_OFICINA }) }),
    );
    expect(f.montoSugerido).toBe(8571.43);
    expect(f.pagoPorLaboradas).toBe(9800);
    expect(f.sugerencia).toContain('tiempo extra');
  });

  it('sin sueldo capturado aparece igual, con sus horas y el motivo', () => {
    const f = filaSugerencia(entrada({ sueldoSemanal: null }));
    expect(f.estado).toBe('sin_sueldo');
    expect(f.montoSugerido).toBeNull();
    expect(f.pagoHora).toBeNull();
    expect(f.horasLaboradas).toBe(88);
    expect(f.sugerencia).toContain('Sin sueldo semanal');
  });

  it('un sueldo en cero o basura cuenta como no capturado', () => {
    expect(filaSugerencia(entrada({ sueldoSemanal: 0 })).estado).toBe('sin_sueldo');
    expect(filaSugerencia(entrada({ sueldoSemanal: Number.NaN })).estado).toBe('sin_sueldo');
  });

  it('sin jornadas aparece con el motivo, no se omite', () => {
    const f = filaSugerencia(entrada({ totales: tot({ diasSinChecada: 11 }) }));
    expect(f.estado).toBe('sin_jornadas');
    expect(f.montoSugerido).toBeNull();
    expect(f.sueldoPeriodo).toBe(8571.43);
    expect(f.sugerencia).toContain('Sin jornadas');
    expect(f.avisos).toContain('11 día(s) laborable(s) sin checar');
  });

  it('sin horario fijo: pago por hora con 48 h', () => {
    const f = filaSugerencia(entrada({ horario: SIN_HORARIO, sueldoSemanal: 4800 }));
    expect(f.pagoHora).toBe(100);
    expect(f.origenDivisor).toBe('lft');
    expect(f.horasEsperadas).toBe(104);
  });

  it('periodo en curso: solo se juzgan los días que ya terminaron', () => {
    const f = filaSugerencia(
      entrada({ periodo: { desde: '2026-10-01', hasta: '2026-10-15' }, totales: tot({ minutosLaborados: 480, minutosProductivos: 400 }) }),
    );
    expect(f.horasEsperadas).toBe(8);
    expect(f.montoSugerido).toBe(571.43);
    expect(f.sueldoPeriodo).toBe(8571.43);
    expect(f.sugerencia).toContain('devengado a la fecha');
  });

  it('quien ingresó a media quincena: lo esperado empieza en su ingreso', () => {
    const f = filaSugerencia(
      entrada({ fechaIngreso: '2026-09-28', totales: tot({ minutosLaborados: 3 * 480, minutosProductivos: 3 * 400 }) }),
    );
    expect(f.horasEsperadas).toBe(24);
    expect(f.montoSugerido).toBe(1714.29);
    expect(f.avisos.some((a) => a.includes('Ingresó el 2026-09-28'))).toBe(true);
  });
});

describe('las horas productivas se recortan a la jornada', () => {
  it('lo trabajado antes de la entrada no cuenta como productivo', () => {
    const DIA = '2026-09-28';
    const { totales } = calculaKpisPersona({
      desde: DIA,
      hasta: DIA,
      ahora: mx(HOY, '10:00'),
      horario: horarioDePersona('office_hours', null),
      checadas: [
        { tipo: 'entrada', at: mx(DIA, '09:00') },
        { tipo: 'salida', at: mx(DIA, '18:00') },
      ],
      comidas: [{ inicio: mx(DIA, '14:00'), fin: mx(DIA, '15:00') }],
      // Sesión de 07:00 a 11:00: solo 09:00–11:00 cae dentro de la jornada.
      actividades: [
        {
          activityId: 1,
          inicio: null,
          fin: null,
          terminada: false,
          sesiones: [{ startedAt: mx(DIA, '07:00'), endedAt: mx(DIA, '11:00') }],
        },
      ],
    });
    expect(totales.minutosLaborados).toBe(480);
    expect(totales.minutosProductivos).toBe(120);

    const f = filaSugerencia(entrada({ periodo: { desde: DIA, hasta: DIA }, totales }));
    expect(f.productividadPct).toBe(25);
    expect(f.pagoPorProductivas).toBe(200);
    expect(f.pagoPorLaboradas).toBe(800);
    expect(f.estado).toBe('revisar');
  });
});

describe('totales y orden', () => {
  const filas = [
    filaSugerencia(entrada({ userId: 1, nombre: 'Zoe' })),
    filaSugerencia(entrada({ userId: 2, nombre: 'Beto', sueldoSemanal: null })),
    filaSugerencia(
      entrada({
        userId: 3,
        nombre: 'Carla',
        totales: tot({ minutosLaborados: ESPERADOS_OFICINA, minutosProductivos: ESPERADOS_OFICINA / 2 }),
      }),
    ),
  ];

  it('suma solo los montos que existen y saca el % de los totales', () => {
    const t = totalesSugerencia(filas);
    expect(t.personas).toBe(3);
    expect(t.sinSueldo).toBe(1);
    expect(t.revisar).toBe(1);
    expect(t.horasLaboradas).toBe(264);
    expect(t.montoSugerido).toBe(17142.86);
    expect(t.pagoPorLaboradas).toBe(17600);
    expect(t.productividadPct).toBe(Math.round(((4224 * 2 + 2640) / (5280 * 3)) * 100));
  });

  it('primero lo que hay que revisar, luego sin sueldo, al final lo que está bien', () => {
    expect(ordenaSugerencias(filas).map((f) => f.nombre)).toEqual(['Carla', 'Beto', 'Zoe']);
  });

  it('la fórmula dice el divisor y que no crea pagos', () => {
    const texto = formulaSugerencia().join(' ');
    expect(texto).toContain('sueldo semanal ÷ horas semanales');
    expect(texto).toContain('48 h');
    expect(texto).toContain('no crea ni modifica pagos');
  });
});

describe('periodos calculados con la fecha de hoy (29-10)', () => {
  const rango = (hoy: string, clave: ClavePeriodo) => {
    const p = periodoDeClave(hoy, clave);
    return [p.desde, p.hasta];
  };

  it('semana de lunes a domingo, aunque cruce el mes', () => {
    // Jueves 29-10: la semana del 26-10 (la de la corrida en paralelo con el Excel) termina el 1-11.
    expect(rango('2026-10-29', 'semana')).toEqual(['2026-10-26', '2026-11-01']);
    expect(rango('2026-10-29', 'semana_anterior')).toEqual(['2026-10-19', '2026-10-25']);
    // El lunes y el domingo son de su propia semana.
    expect(rango('2026-10-26', 'semana')).toEqual(['2026-10-26', '2026-11-01']);
    expect(rango('2026-11-01', 'semana')).toEqual(['2026-10-26', '2026-11-01']);
    expect(rango('2026-11-02', 'semana_anterior')).toEqual(['2026-10-26', '2026-11-01']);
    // Y cruzando el año.
    expect(rango('2027-01-03', 'semana')).toEqual(['2026-12-28', '2027-01-03']);
  });

  it('quincena de 15 o de 16 días y cambio de mes', () => {
    expect(rango('2026-10-29', 'quincena')).toEqual(['2026-10-16', '2026-10-31']);
    expect(rango('2026-10-29', 'quincena_anterior')).toEqual(['2026-10-01', '2026-10-15']);
    expect(rango('2026-11-03', 'quincena')).toEqual(['2026-11-01', '2026-11-15']);
    expect(rango('2026-11-03', 'quincena_anterior')).toEqual(['2026-10-16', '2026-10-31']);
    expect(rango('2026-11-20', 'quincena')).toEqual(['2026-11-16', '2026-11-30']);
    expect(rango('2027-01-10', 'quincena_anterior')).toEqual(['2026-12-16', '2026-12-31']);
  });

  it('febrero: la 2.ª quincena tiene 13 días (14 en bisiesto)', () => {
    expect(rango('2027-02-20', 'quincena')).toEqual(['2027-02-16', '2027-02-28']);
    expect(rango('2027-02-20', 'mes')).toEqual(['2027-02-01', '2027-02-28']);
    expect(rango('2028-02-29', 'quincena')).toEqual(['2028-02-16', '2028-02-29']);
    expect(rango('2027-03-05', 'mes_anterior')).toEqual(['2027-02-01', '2027-02-28']);
  });

  it('mes actual y anterior, también de diciembre a enero', () => {
    expect(rango('2026-10-29', 'mes')).toEqual(['2026-10-01', '2026-10-31']);
    expect(rango('2026-10-29', 'mes_anterior')).toEqual(['2026-09-01', '2026-09-30']);
    expect(rango('2027-01-10', 'mes_anterior')).toEqual(['2026-12-01', '2026-12-31']);
  });

  it('«hoy» es el día de Ciudad de México, no el de UTC', () => {
    // 31-10 a las 23:30 en México ya es 1-11 en UTC: sigue siendo la 2.ª quincena de octubre.
    const hoy = workDateKey(new Date('2026-11-01T05:30:00Z'), 'America/Mexico_City');
    expect(hoy).toBe('2026-10-31');
    expect(rango(hoy, 'quincena')).toEqual(['2026-10-16', '2026-10-31']);
  });

  it('la lista trae los seis periodos, en el orden del selector', () => {
    expect(periodosCalculados('2026-10-29').map((p) => [p.clave, p.origen])).toEqual(
      CLAVES_PERIODO.map((c) => [c, 'calculado']),
    );
    expect(esClavePeriodo('quincena_anterior')).toBe(true);
    expect(esClavePeriodo('vigente')).toBe(false);
  });
});

describe('regla de pago (decisión 6, 29-10)', () => {
  it('el día es la semana ÷ 7 en todo periodo: 7 días son la semana exacta', () => {
    expect(sueldoDeDias(4000, 7)).toBe(4000);
    expect(sueldoDeDias(4000, 15)).toBe(8571.43);
    expect(sueldoDeDias(4000, 16)).toBe(9142.86);
  });

  it('las dos quincenas suman el mes (al centavo)', () => {
    const octubre = sueldoDeDias(4000, 31);
    expect(Math.abs(sueldoDeDias(4000, 15) + sueldoDeDias(4000, 16) - octubre)).toBeLessThanOrEqual(0.01);
    // Febrero de 28 días: cuatro semanas exactas.
    expect(sueldoDeDias(4000, 15) + sueldoDeDias(4000, 13)).toBeCloseTo(16000, 2);
  });

  it('semana = mensual × 12 ÷ 52', () => {
    expect(semanalDeMensual(16000)).toBe(3692.31);
    expect(semanalDeMensual(5200)).toBe(1200);
  });
});

describe('dos lecturas: a la fecha y periodo completo', () => {
  const SEMANA = { desde: '2026-10-26', hasta: '2026-11-01' };
  const HOY_JUEVES = '2026-10-29';

  it('en curso: lo de a la fecha llega a ayer y el completo suma los días que faltan', () => {
    const f = filaSugerencia(
      entrada({ periodo: SEMANA, hoy: HOY_JUEVES, totales: tot({ minutosLaborados: 3 * 480, minutosProductivos: 3 * 400 }) }),
    );
    expect(f.diasALaFecha).toBe(3);
    expect(f.diasRestantes).toBe(4);
    expect(f.montoSugerido).toBe(1714.29);
    expect(f.devengadoALaFecha).toBe(1714.29);
    expect(f.proyectado).toBe(4000);
    expect(f.sueldoPeriodo).toBe(4000);
  });

  it('cerrado: las dos lecturas coinciden', () => {
    const f = filaSugerencia(entrada());
    expect(f.diasRestantes).toBe(0);
    expect(f.proyectado).toBe(f.montoSugerido);
  });

  it('el primer día del periodo: nada que juzgar todavía, el completo es el sueldo del periodo', () => {
    const f = filaSugerencia(entrada({ periodo: SEMANA, hoy: '2026-10-26', totales: tot() }));
    expect(f.diasALaFecha).toBe(0);
    expect(f.montoSugerido).toBeNull();
    expect(f.proyectado).toBe(4000);
  });

  it('los totales suman las dos lecturas', () => {
    const t = totalesSugerencia([
      filaSugerencia(entrada({ periodo: SEMANA, hoy: HOY_JUEVES, totales: tot({ minutosLaborados: 3 * 480, minutosProductivos: 1000 }) })),
      filaSugerencia(entrada({ userId: 8, periodo: SEMANA, hoy: HOY_JUEVES, sueldoSemanal: null })),
    ]);
    expect(t.devengadoALaFecha).toBe(1714.29);
    expect(t.proyectado).toBe(4000);
  });
});

describe('semana de pago (corrección de Adam, jueves 29-10: «es semanalmente los pagos»)', () => {
  it('lunes a domingo como la hoja, y se paga el lunes siguiente', () => {
    expect(periodoDeClave('2026-10-29', 'semana')).toMatchObject({ desde: '2026-10-26', hasta: '2026-11-01', pagoEl: '2026-11-02' });
    expect(periodoDeClave('2026-10-29', 'semana_anterior')).toMatchObject({ desde: '2026-10-19', hasta: '2026-10-25', pagoEl: '2026-10-26' });
    // Quincena y mes se pagan el día del corte.
    expect(periodoDeClave('2026-10-29', 'quincena').pagoEl).toBe('2026-10-31');
  });

  it('una empresa con su propio calendario semanal manda sobre lunes a domingo', () => {
    const viernes = { frecuencia: 'semanal' as const, diaSemanaCorte: 5, diaPago: 6 };
    expect(periodoDeClave('2026-10-29', 'semana', viernes)).toMatchObject({ desde: '2026-10-24', hasta: '2026-10-30', pagoEl: '2026-10-31' });
    // Un calendario quincenal no cambia la semana.
    expect(periodoDeClave('2026-10-29', 'semana', { frecuencia: 'quincenal', diaSemanaCorte: 5 })).toMatchObject({ desde: '2026-10-26' });
    expect(periodosCalculados('2026-10-29').every((p) => p.pagoEl)).toBe(true);
  });

  it('«a la fecha» incluye hoy cuando la jornada ya terminó', () => {
    const SEMANA = { desde: '2026-10-26', hasta: '2026-11-01' };
    expect(ventanaDeCalculo(SEMANA, '2026-10-29')).toMatchObject({ hasta: '2026-10-28', dias: 3, enCurso: true });
    expect(ventanaDeCalculo(SEMANA, '2026-10-29', null, true)).toMatchObject({ hasta: '2026-10-29', dias: 4, enCurso: true });
    // El domingo después de las 18:00 la semana ya no está en curso.
    expect(ventanaDeCalculo(SEMANA, '2026-11-01', null, true)).toMatchObject({ hasta: '2026-11-01', dias: 7, enCurso: false });
    const f = filaSugerencia(
      entrada({ periodo: SEMANA, hoy: '2026-10-29', incluyeHoy: true, totales: tot({ minutosLaborados: 4 * 480, minutosProductivos: 4 * 400 }) }),
    );
    expect([f.diasALaFecha, f.diasRestantes]).toEqual([4, 3]);
    expect(f.montoSugerido).toBe(2285.71);
    expect(f.proyectado).toBe(4000);
  });
});
