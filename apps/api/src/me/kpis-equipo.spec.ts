import { isLateVsSchedule } from '../attendance/attendance-hybrid.match';
import {
  armaJornadas,
  calculaKpisPersona,
  diasDelRango,
  horarioDePlantilla,
  intersectaTramos,
  minutosDeTramos,
  normalizaTramos,
  restaTramos,
  retardoDeEntrada,
  semaforoKpi,
  sumaEquipo,
  supuestosKpi,
  tramosDeActividades,
  type ActividadKpi,
  type ChecadaKpi,
  type ComidaKpi,
  type EntradaKpiPersona,
  type TotalesKpi,
} from './kpis-equipo';

/** Hora de México (UTC−6, sin horario de verano desde 2022). Semana del lunes 14-09-2026. */
const M = (dia: string, hhmm: string) => new Date(`2026-09-${dia}T${hhmm}:00-06:00`);
const min = (n: number) => n * 60_000;
const t = (inicio: number, fin: number) => ({ inicio, fin });

const oficina = horarioDePlantilla('office_hours');
const contratista = horarioDePlantilla('contractor');
const direccion = horarioDePlantilla('always_on');

const entrada = (dia: string, hhmm: string, extra: Partial<ChecadaKpi> = {}): ChecadaKpi => ({
  tipo: 'entrada',
  at: M(dia, hhmm),
  ...extra,
});
const salida = (dia: string, hhmm: string, extra: Partial<ChecadaKpi> = {}): ChecadaKpi => ({
  tipo: 'salida',
  at: M(dia, hhmm),
  ...extra,
});
const actividad = (
  id: number,
  inicio: Date | null,
  fin: Date | null,
  terminada = fin != null,
): ActividadKpi => ({ activityId: id, anNumber: `AN-${id}`, titulo: `Act ${id}`, inicio, fin, terminada });

function calcula(parcial: Partial<EntradaKpiPersona>) {
  return calculaKpisPersona({
    desde: '2026-09-14',
    hasta: '2026-09-14',
    ahora: M('18', '20:00'),
    horario: oficina,
    checadas: [],
    comidas: [],
    actividades: [],
    ...parcial,
  });
}

describe('tramos', () => {
  it('funde los que se enciman o se tocan y descarta los vacíos', () => {
    expect(normalizaTramos([t(50, 60), t(0, 10), t(5, 20), t(20, 30), t(40, 40), t(70, 65)])).toEqual([
      t(0, 30),
      t(50, 60),
    ]);
  });

  it('cruza y resta', () => {
    expect(intersectaTramos([t(0, 100)], [t(10, 20), t(50, 150)])).toEqual([t(10, 20), t(50, 100)]);
    expect(restaTramos([t(0, 100)], [t(10, 20), t(50, 150)])).toEqual([t(0, 10), t(20, 50)]);
    expect(restaTramos([t(0, 100)], [])).toEqual([t(0, 100)]);
    expect(restaTramos([t(0, 100)], [t(-10, 200)])).toEqual([]);
  });

  it('cuenta minutos sin contar dos veces lo encimado', () => {
    expect(minutosDeTramos([t(0, min(60)), t(min(30), min(90))])).toBe(90);
  });

  it('lista los días del rango, ambos incluidos', () => {
    expect(diasDelRango('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});

describe('horario y retardo', () => {
  it('oficina 09:00 con 15 min de gracia; los minutos tarde cuentan desde las 09:00', () => {
    expect(retardoDeEntrada(M('14', '09:10'), oficina)).toEqual({ retardo: false, minutosTarde: 0 });
    expect(retardoDeEntrada(M('14', '09:15'), oficina)).toEqual({ retardo: false, minutosTarde: 0 });
    expect(retardoDeEntrada(M('14', '09:16'), oficina)).toEqual({ retardo: true, minutosTarde: 16 });
    expect(retardoDeEntrada(M('14', '10:30'), oficina)).toEqual({ retardo: true, minutosTarde: 90 });
  });

  it('contratista entra a las 08:00 y dirección (24/7) no tiene retardos', () => {
    expect(retardoDeEntrada(M('14', '08:20'), contratista)).toEqual({ retardo: true, minutosTarde: 20 });
    expect(retardoDeEntrada(M('14', '12:00'), direccion)).toEqual({ retardo: false, minutosTarde: 0 });
    expect(direccion.jornadaOrdinariaMin).toBeNull();
  });

  it('dice lo mismo que la regla de avisos y RH (isLateVsSchedule)', () => {
    for (const hhmm of ['08:59', '09:00', '09:14', '09:15', '09:16', '11:00', '17:45']) {
      for (const [clave, horario] of [
        ['office_hours', oficina],
        ['contractor', contratista],
        ['always_on', direccion],
      ] as const) {
        const at = M('15', hhmm);
        expect(retardoDeEntrada(at, horario).retardo).toBe(isLateVsSchedule(at.toISOString(), clave));
      }
    }
  });
});

describe('armaJornadas', () => {
  const ahora = M('18', '13:00');

  it('empareja entrada y salida', () => {
    const [j] = armaJornadas([entrada('14', '09:00'), salida('14', '18:00')], ahora);
    expect(j).toMatchObject({ dia: '2026-09-14', abierta: false, sinSalida: false });
    expect(j.fin).toEqual(M('14', '18:00'));
  });

  it('hoy sin salida: jornada abierta que cuenta hasta ahora', () => {
    const [j] = armaJornadas([entrada('18', '09:00')], ahora);
    expect(j).toMatchObject({ dia: '2026-09-18', abierta: true, sinSalida: false, salida: null });
    expect(j.fin).toEqual(ahora);
  });

  it('día pasado sin salida: se cierra como el cierre automático (entrada + 9 h, tope 23:30)', () => {
    const [temprano] = armaJornadas([entrada('14', '09:00')], ahora);
    expect(temprano).toMatchObject({ abierta: false, sinSalida: true });
    expect(temprano.fin).toEqual(M('14', '18:00'));
    const [noche] = armaJornadas([entrada('14', '20:00')], ahora);
    expect(noche.fin).toEqual(M('14', '23:30'));
  });

  it('cruza medianoche: la jornada es del día de la entrada', () => {
    const [j] = armaJornadas([entrada('14', '22:00'), salida('15', '02:00')], ahora);
    expect(j.dia).toBe('2026-09-14');
    expect(j.fin).toEqual(M('15', '02:00'));
  });

  it('dos entradas seguidas: la primera se cierra sin pasar de la segunda', () => {
    const js = armaJornadas([entrada('14', '09:00'), entrada('14', '12:00'), salida('14', '18:00')], ahora);
    expect(js).toHaveLength(2);
    expect(js[0]).toMatchObject({ sinSalida: true });
    expect(js[0].fin).toEqual(M('14', '12:00'));
    expect(js[1].fin).toEqual(M('14', '18:00'));
  });

  it('una salida sin entrada no mide nada', () => {
    expect(armaJornadas([salida('14', '18:00')], ahora)).toEqual([]);
  });

  it('marca la salida inventada por el cierre automático', () => {
    const [j] = armaJornadas([entrada('14', '09:00'), salida('14', '18:00', { cierreAutomatico: true })], ahora);
    expect(j.cierreAutomatico).toBe(true);
  });
});

describe('tramosDeActividades', () => {
  const ahora = M('18', '13:00');

  it('abierta de hoy cuenta hasta ahora; abierta de otro día se corta al final de ese día', () => {
    const [hoy, vieja] = tramosDeActividades(
      [actividad(1, M('18', '10:00'), null, false), actividad(2, M('15', '10:00'), null, false)],
      ahora,
    );
    expect(hoy).toMatchObject({ enCurso: true, fin: ahora });
    expect(vieja.enCurso).toBe(true);
    expect(vieja.fin.getTime()).toBe(M('16', '00:00').getTime() - 1);
  });

  it('periodo de varios días abierto: cuenta hasta ahora o hasta el fin de su último día', () => {
    const [sigue, vencio] = tramosDeActividades(
      [
        { ...actividad(1, M('15', '10:00'), null, false), periodoFin: '2026-09-25' },
        { ...actividad(2, M('14', '10:00'), null, false), periodoFin: '2026-09-16' },
      ],
      ahora,
    );
    expect(sigue).toMatchObject({ enCurso: true, fin: ahora });
    expect(vencio.fin.getTime()).toBe(M('17', '00:00').getTime() - 1);
  });

  it('terminada sin fin conocido o sin inicio no suma', () => {
    expect(
      tramosDeActividades([actividad(1, M('18', '10:00'), null, true), actividad(2, null, M('18', '11:00'))], ahora),
    ).toEqual([]);
  });
});

describe('calculaKpisPersona', () => {
  const jornadaNormal = [entrada('14', '09:00'), salida('14', '18:00')];
  const comidaNormal: ComidaKpi[] = [{ inicio: M('14', '15:00'), fin: M('14', '16:00') }];

  it('laboradas = jornada menos comida; productivas sin contar doble lo encimado', () => {
    const { dias, totales } = calcula({
      checadas: jornadaNormal,
      comidas: comidaNormal,
      actividades: [
        actividad(1, M('14', '09:30'), M('14', '11:30')),
        actividad(2, M('14', '11:00'), M('14', '13:00')),
      ],
    });
    expect(dias).toHaveLength(1);
    expect(dias[0]).toMatchObject({
      conJornada: true,
      minutosComida: 60,
      minutosLaborados: 480,
      minutosProductivos: 210,
      minutosInactivos: 270,
      productividadPct: 44,
      minutosExtra: 0,
      retardo: false,
    });
    expect(totales).toMatchObject({ minutosLaborados: 480, minutosProductivos: 210, minutosInactivos: 270 });
  });

  it('la comida no es tiempo productivo aunque la actividad siga abierta', () => {
    const { dias } = calcula({
      checadas: jornadaNormal,
      comidas: comidaNormal,
      actividades: [actividad(1, M('14', '14:30'), M('14', '16:30'))],
    });
    expect(dias[0].minutosProductivos).toBe(60);
  });

  it('lo hecho fuera de la jornada no suma; lo que cruza la entrada suma solo la parte dentro', () => {
    const { dias, totales } = calcula({
      desde: '2026-09-14',
      hasta: '2026-09-19',
      checadas: jornadaNormal,
      comidas: comidaNormal,
      actividades: [
        actividad(1, M('14', '07:00'), M('14', '08:30')),
        actividad(2, M('14', '08:30'), M('14', '09:30')),
        actividad(3, M('14', '18:30'), M('14', '19:00')),
        // Sábado sin checar.
        actividad(4, M('19', '10:00'), M('19', '12:00')),
      ],
      ahora: M('20', '12:00'),
    });
    const lunes = dias.find((d) => d.fecha === '2026-09-14')!;
    expect(lunes.minutosProductivos).toBe(30);
    expect(lunes.actividadesFueraDeJornada).toBe(2);
    const sabado = dias.find((d) => d.fecha === '2026-09-19')!;
    expect(sabado).toMatchObject({ conJornada: false, sinChecada: false, actividadesFueraDeJornada: 1 });
    expect(totales.actividadesFueraDeJornada).toBe(3);
    expect(totales.minutosProductivos).toBe(30);
  });

  it('jornada abierta hoy: laboradas y productivas hasta ahora', () => {
    const ahora = M('18', '13:00');
    const { dias, totales } = calcula({
      desde: '2026-09-18',
      hasta: '2026-09-18',
      ahora,
      checadas: [entrada('18', '09:00')],
      actividades: [actividad(1, M('18', '10:00'), null, false)],
      detalle: true,
    });
    expect(dias[0]).toMatchObject({
      abierta: true,
      minutosLaborados: 240,
      minutosProductivos: 180,
      minutosInactivos: 60,
      salida: null,
    });
    expect(dias[0].actividades).toEqual([expect.objectContaining({ activityId: 1, enCurso: true, minutosEnJornada: 180 })]);
    expect(totales.jornadasAbiertas).toBe(1);
  });

  it('comida sin regreso: se descuenta una hora', () => {
    const { dias } = calcula({
      checadas: jornadaNormal,
      comidas: [{ inicio: M('14', '15:00'), fin: null }],
    });
    expect(dias[0]).toMatchObject({ minutosComida: 60, minutosLaborados: 480 });
  });

  it('una actividad olvidada de otro día no vuelve productivo el día de hoy', () => {
    const { dias } = calcula({
      desde: '2026-09-15',
      hasta: '2026-09-16',
      ahora: M('16', '19:00'),
      checadas: [entrada('15', '09:00'), salida('15', '18:00'), entrada('16', '09:00'), salida('16', '18:00')],
      actividades: [actividad(1, M('15', '10:00'), null, false)],
    });
    expect(dias.find((d) => d.fecha === '2026-09-15')!.minutosProductivos).toBe(480);
    expect(dias.find((d) => d.fecha === '2026-09-16')!.minutosProductivos).toBe(0);
  });

  it('una obra de varios días iniciada el lunes cuenta en cada jornada de su periodo', () => {
    const { dias } = calcula({
      desde: '2026-09-15',
      hasta: '2026-09-16',
      ahora: M('16', '19:00'),
      checadas: [entrada('15', '09:00'), salida('15', '18:00'), entrada('16', '09:00'), salida('16', '18:00')],
      comidas: [
        { inicio: M('15', '15:00'), fin: M('15', '16:00') },
        { inicio: M('16', '15:00'), fin: M('16', '16:00') },
      ],
      actividades: [{ ...actividad(1, M('15', '10:00'), null, false), periodoFin: '2026-09-18' }],
    });
    expect(dias.find((d) => d.fecha === '2026-09-15')!.minutosProductivos).toBe(420);
    expect(dias.find((d) => d.fecha === '2026-09-16')!.minutosProductivos).toBe(480);
  });

  it('medianoche: lo trabajado después de las 00:00 es del día de la entrada', () => {
    const { dias } = calcula({
      desde: '2026-09-14',
      hasta: '2026-09-15',
      horario: contratista,
      checadas: [entrada('14', '22:00'), salida('15', '02:00')],
      actividades: [actividad(1, M('14', '23:00'), M('15', '01:30'))],
    });
    const lunes = dias.find((d) => d.fecha === '2026-09-14')!;
    expect(lunes).toMatchObject({ minutosLaborados: 240, minutosProductivos: 150, minutosInactivos: 90 });
    expect(dias.find((d) => d.fecha === '2026-09-15')).toMatchObject({ conJornada: false, sinChecada: true });
  });

  it('día pasado sin salida: se cuenta como el cierre automático y queda marcado', () => {
    const { dias, totales } = calcula({ checadas: [entrada('14', '09:00')] });
    expect(dias[0]).toMatchObject({ sinSalida: true, minutosLaborados: 540, minutosExtra: 60 });
    expect(totales.jornadasSinSalida).toBe(1);
  });

  it('retardos y minutos tarde solo en días laborables', () => {
    const { dias, totales } = calcula({
      desde: '2026-09-14',
      hasta: '2026-09-19',
      ahora: M('20', '10:00'),
      checadas: [
        entrada('14', '09:20'),
        salida('14', '18:00'),
        entrada('15', '09:05'),
        salida('15', '18:00'),
        entrada('16', '10:00'),
        salida('16', '18:00'),
        entrada('17', '09:00'),
        salida('17', '18:00'),
        entrada('18', '09:00'),
        salida('18', '18:00'),
        // Sábado a las 11: no es retardo, es tiempo extra.
        entrada('19', '11:00'),
        salida('19', '15:00'),
      ],
    });
    expect(totales).toMatchObject({ retardos: 2, minutosTarde: 80, diasConJornada: 6 });
    expect(dias.find((d) => d.fecha === '2026-09-19')).toMatchObject({ laborable: false, retardo: false, minutosExtra: 240 });
  });

  it('tiempo extra: arriba de 8 h en día laborable; sin horario no se calcula', () => {
    const larga = [entrada('14', '08:00'), salida('14', '19:00')];
    expect(calcula({ checadas: larga, comidas: comidaNormal }).dias[0].minutosExtra).toBe(120);
    const dir = calcula({ checadas: larga, comidas: comidaNormal, horario: direccion });
    expect(dir.dias[0].minutosExtra).toBeNull();
    expect(dir.totales.minutosExtra).toBeNull();
    expect(dir.dias[0].retardo).toBe(false);
  });

  it('uniforme: % sobre lo revisado y cuenta lo que falta revisar', () => {
    const { totales, dias } = calcula({
      desde: '2026-09-14',
      hasta: '2026-09-17',
      checadas: [
        entrada('14', '09:00', { id: 11, uniformeOk: true }),
        salida('14', '18:00'),
        entrada('15', '09:00', { id: 12, uniformeOk: false }),
        salida('15', '18:00'),
        entrada('16', '09:00', { id: 13, uniformeOk: true }),
        salida('16', '18:00'),
        entrada('17', '09:00', { id: 14 }),
        salida('17', '18:00'),
      ],
    });
    expect(totales.uniforme).toEqual({ revisadas: 3, ok: 2, noOk: 1, sinRevisar: 1, pct: 67 });
    expect(dias.map((d) => [d.checadaEntradaId, d.uniformeOk])).toEqual([
      [11, true],
      [12, false],
      [13, true],
      [14, null],
    ]);
  });

  it('días sin checada: laborables ya pasados, sin contar justificadas, antes del ingreso ni hoy', () => {
    const { dias, totales } = calcula({
      desde: '2026-09-11',
      hasta: '2026-09-18',
      ahora: M('18', '08:00'),
      fechaIngreso: M('14', '00:00'),
      justificadas: ['2026-09-16'],
      checadas: [entrada('14', '09:00'), salida('14', '18:00')],
    });
    // 11 (viernes) es antes del ingreso; 12–13 fin de semana; 15 y 17 faltan; 16 justificada; 18 es hoy.
    expect(dias.filter((d) => d.sinChecada).map((d) => d.fecha)).toEqual(['2026-09-15', '2026-09-17']);
    expect(totales).toMatchObject({ diasSinChecada: 2, faltasJustificadas: 1, diasConJornada: 1 });
  });

  it('el detalle trae los tramos para la línea de tiempo', () => {
    const { dias } = calcula({
      checadas: jornadaNormal,
      comidas: comidaNormal,
      actividades: [actividad(1, M('14', '10:00'), M('14', '12:00'))],
      detalle: true,
    });
    expect(dias[0].tramos).toEqual({
      jornada: [{ inicio: M('14', '09:00').toISOString(), fin: M('14', '18:00').toISOString() }],
      comida: [{ inicio: M('14', '15:00').toISOString(), fin: M('14', '16:00').toISOString() }],
      productivo: [{ inicio: M('14', '10:00').toISOString(), fin: M('14', '12:00').toISOString() }],
      inactivo: [
        { inicio: M('14', '09:00').toISOString(), fin: M('14', '10:00').toISOString() },
        { inicio: M('14', '12:00').toISOString(), fin: M('14', '15:00').toISOString() },
        { inicio: M('14', '16:00').toISOString(), fin: M('14', '18:00').toISOString() },
      ],
    });
  });

  it('nunca da inactividad negativa ni más productivas que laboradas', () => {
    // Pseudoaleatorio con semilla fija: el mismo caso en cada corrida.
    let semilla = 42;
    const azar = () => {
      semilla = (semilla * 1103515245 + 12345) % 2 ** 31;
      return semilla / 2 ** 31;
    };
    for (let caso = 0; caso < 200; caso++) {
      const base = M('14', '06:00').getTime();
      const en = (m: number) => new Date(base + min(Math.floor(m)));
      const ini = azar() * 300;
      const checadas: ChecadaKpi[] = [
        { tipo: 'entrada', at: en(ini) },
        { tipo: 'salida', at: en(ini + 60 + azar() * 600) },
      ];
      const comidas: ComidaKpi[] = [{ inicio: en(azar() * 900), fin: azar() > 0.3 ? en(azar() * 900) : null }];
      const actividades: ActividadKpi[] = Array.from({ length: 5 }, (_, i) => {
        const a = azar() * 900;
        return actividad(i, en(a), azar() > 0.2 ? en(a + azar() * 400) : null, false);
      });
      const { dias } = calcula({ checadas, comidas, actividades });
      for (const d of dias) {
        expect(d.minutosInactivos).toBeGreaterThanOrEqual(0);
        expect(d.minutosProductivos).toBeLessThanOrEqual(d.minutosLaborados);
        expect(d.minutosProductivos + d.minutosInactivos).toBe(d.minutosLaborados);
      }
    }
  });
});

describe('semáforo', () => {
  const base: TotalesKpi = {
    diasConJornada: 5,
    diasSinChecada: 0,
    faltasJustificadas: 0,
    retardos: 0,
    minutosTarde: 0,
    uniforme: { revisadas: 5, ok: 5, noOk: 0, sinRevisar: 0, pct: 100 },
    minutosLaborados: 2400,
    minutosProductivos: 1900,
    minutosInactivos: 500,
    productividadPct: 79,
    minutosExtra: 0,
    jornadasAbiertas: 0,
    jornadasSinSalida: 0,
    cierresAutomaticos: 0,
    actividadesFueraDeJornada: 0,
  };

  it('verde cuando todo está en orden', () => {
    expect(semaforoKpi(base)).toEqual({ semaforo: 'verde', motivos: [] });
  });

  it('el peor indicador manda y los motivos van del más grave al más leve', () => {
    expect(semaforoKpi({ ...base, retardos: 1, minutosTarde: 20 })).toEqual({
      semaforo: 'amarillo',
      motivos: ['1 retardo (20 min tarde)'],
    });
    expect(
      semaforoKpi({
        ...base,
        retardos: 1,
        minutosTarde: 20,
        productividadPct: 40,
        uniforme: { ...base.uniforme, pct: 90 },
      }),
    ).toEqual({
      semaforo: 'rojo',
      motivos: ['Productividad 40 %', '1 retardo (20 min tarde)', 'Uniforme 90 %'],
    });
    expect(semaforoKpi({ ...base, diasSinChecada: 2 }).semaforo).toBe('rojo');
  });

  it('sin jornada ni faltas no hay con qué calificar', () => {
    expect(
      semaforoKpi({
        ...base,
        diasConJornada: 0,
        minutosLaborados: 0,
        minutosProductivos: 0,
        productividadPct: null,
        uniforme: { revisadas: 0, ok: 0, noOk: 0, sinRevisar: 0, pct: null },
      }).semaforo,
    ).toBe('sin_datos');
  });
});

describe('sumaEquipo', () => {
  it('los % salen de los totales, no del promedio de porcentajes', () => {
    const uno = calcula({
      checadas: [entrada('14', '09:00'), salida('14', '17:00')],
      actividades: [actividad(1, M('14', '09:00'), M('14', '17:00'))],
    }).totales;
    const otro = calcula({
      horario: direccion,
      checadas: [entrada('14', '09:00'), salida('14', '11:00')],
    }).totales;
    const equipo = sumaEquipo([uno, otro]);
    expect(equipo).toMatchObject({ minutosLaborados: 600, minutosProductivos: 480, productividadPct: 80 });
    // Uno tiene horario (extra 0) y el otro no: el equipo suma solo a quien sí.
    expect(equipo.minutosExtra).toBe(0);
    expect(sumaEquipo([otro]).minutosExtra).toBeNull();
  });

  it('las reglas se pueden leer en la web', () => {
    expect(supuestosKpi().length).toBeGreaterThan(5);
  });
});
