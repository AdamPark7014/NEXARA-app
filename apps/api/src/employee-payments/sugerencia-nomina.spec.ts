import { calculaKpisPersona, horarioDePersona } from '../me/kpis-equipo.js';
import type { EntradaPreNomina } from './pre-nomina.js';
import {
  HORAS_SEMANALES_LFT,
  divisorDeHorario,
  filaSugerencia,
  formulaSugerencia,
  minutosEsperados,
  ordenaSugerencias,
  periodoManual,
  periodoSugerencia,
  totalesSugerencia,
  ventanaDeCalculo,
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
