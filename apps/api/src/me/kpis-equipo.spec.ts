import { isLateVsSchedule } from '../attendance/attendance-hybrid.match';
import {
  armaJornadas,
  calculaKpisPersona,
  conReferencia,
  cumplimientoDe,
  diasDelRango,
  entregasDelRango,
  horarioDePlantilla,
  intersectaTramos,
  minutosDeTramos,
  normalizaTramos,
  PESOS_CUMPLIMIENTO,
  referenciaDeRitmo,
  restaTramos,
  resumenEntregas,
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
  it('oficina 10:00 con 15 min de gracia; los minutos tarde cuentan desde las 10:00', () => {
    expect(oficina).toMatchObject({ entrada: '10:00', salida: '18:00' });
    expect(retardoDeEntrada(M('14', '10:10'), oficina)).toEqual({ retardo: false, minutosTarde: 0 });
    expect(retardoDeEntrada(M('14', '10:15'), oficina)).toEqual({ retardo: false, minutosTarde: 0 });
    expect(retardoDeEntrada(M('14', '10:16'), oficina)).toEqual({ retardo: true, minutosTarde: 16 });
    expect(retardoDeEntrada(M('14', '11:30'), oficina)).toEqual({ retardo: true, minutosTarde: 90 });
  });

  it('contratista también entra a las 10:00 y dirección (24/7) no tiene retardos', () => {
    expect(contratista).toMatchObject({ entrada: '10:00', salida: '18:00' });
    expect(retardoDeEntrada(M('14', '10:20'), contratista)).toEqual({ retardo: true, minutosTarde: 20 });
    expect(retardoDeEntrada(M('14', '12:00'), direccion)).toEqual({ retardo: false, minutosTarde: 0 });
    expect(direccion).toMatchObject({ entrada: null, salida: null, jornadaOrdinariaMin: null });
  });

  it('dice lo mismo que la regla de avisos y RH (isLateVsSchedule)', () => {
    for (const hhmm of ['09:59', '10:00', '10:14', '10:15', '10:16', '12:00', '18:45']) {
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

  it('abierta de hoy cuenta hasta ahora; abierta de otro día se corta en su día, sin pasar de 12 h', () => {
    const [hoy, vieja, tarde] = tramosDeActividades(
      [
        actividad(1, M('18', '10:00'), null, false),
        actividad(2, M('15', '10:00'), null, false),
        actividad(3, M('15', '16:00'), null, false),
      ],
      ahora,
    );
    expect(hoy).toMatchObject({ enCurso: true, fin: ahora });
    expect(vieja.enCurso).toBe(true);
    // 10:00 + 12 h: ninguna actividad dura más de 12 horas.
    expect(vieja.fin).toEqual(M('15', '22:00'));
    // 16:00 + 12 h pasaría de medianoche: se corta al final de su día.
    expect(tarde.fin.getTime()).toBe(M('16', '00:00').getTime() - 1);
  });

  it('periodo de varios días sin sesiones: ya no cuenta de corrido, se corta a las 12 h', () => {
    const [sigue, vencio] = tramosDeActividades(
      [
        { ...actividad(1, M('15', '10:00'), null, false), periodoFin: '2026-09-25' },
        { ...actividad(2, M('14', '10:00'), null, false), periodoFin: '2026-09-16' },
      ],
      ahora,
    );
    expect(sigue.fin).toEqual(M('15', '22:00'));
    expect(vencio.fin).toEqual(M('14', '22:00'));
  });

  it('una actividad cerrada días después (dato de antes de la regla) cuenta 12 h, no los días', () => {
    const [vieja] = tramosDeActividades([actividad(1, M('14', '09:00'), M('17', '18:00'), true)], ahora);
    expect(vieja.fin).toEqual(M('14', '21:00'));
  });

  it('con sesiones, cada sesión es un tramo y el intervalo de antes deja de medir', () => {
    const tramos = tramosDeActividades(
      [
        {
          ...actividad(1, M('15', '10:00'), null, false),
          sesiones: [
            { startedAt: M('15', '10:00'), endedAt: M('15', '18:00') },
            // Quedó abierta en la base desde el 16: se corta sola a las 12 h.
            { startedAt: M('16', '09:00'), endedAt: null },
            { startedAt: M('18', '12:00'), endedAt: null },
          ],
        },
      ],
      ahora,
    );
    expect(tramos.map((x) => [x.inicio, x.fin, x.enCurso])).toEqual([
      [M('15', '10:00'), M('15', '18:00'), false],
      [M('16', '09:00'), M('16', '21:00'), false],
      [M('18', '12:00'), ahora, true],
    ]);
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

  it('una obra de varios días cuenta cada día lo que se reanudó, no la jornada entera', () => {
    const base = {
      desde: '2026-09-15',
      hasta: '2026-09-16',
      ahora: M('16', '19:00'),
      checadas: [entrada('15', '09:00'), salida('15', '18:00'), entrada('16', '09:00'), salida('16', '18:00')],
      comidas: [
        { inicio: M('15', '15:00'), fin: M('15', '16:00') },
        { inicio: M('16', '15:00'), fin: M('16', '16:00') },
      ],
    };
    const obra = { ...actividad(1, M('15', '10:00'), null, false), periodoFin: '2026-09-18' };

    // Sin sesiones (dato de antes de la regla): solo el día en que se inició.
    const sinSesiones = calcula({ ...base, actividades: [obra] }).dias;
    expect(sinSesiones.find((d) => d.fecha === '2026-09-15')!.minutosProductivos).toBe(420);
    expect(sinSesiones.find((d) => d.fecha === '2026-09-16')!.minutosProductivos).toBe(0);

    // Con sesiones: el 15 corrió de 10:00 a su salida; el 16 la reanudó a las 11:00.
    const conSesiones = calcula({
      ...base,
      actividades: [
        {
          ...obra,
          sesiones: [
            { startedAt: M('15', '10:00'), endedAt: M('15', '18:00') },
            { startedAt: M('16', '11:00'), endedAt: M('16', '18:00') },
          ],
        },
      ],
    }).dias;
    expect(conSesiones.find((d) => d.fecha === '2026-09-15')!.minutosProductivos).toBe(420);
    expect(conSesiones.find((d) => d.fecha === '2026-09-16')!.minutosProductivos).toBe(360);
  });

  it('una sesión que siguió después de la salida no suma: lo productivo va dentro de la jornada', () => {
    const { dias } = calcula({
      desde: '2026-09-15',
      hasta: '2026-09-15',
      ahora: M('16', '08:00'),
      checadas: [entrada('15', '09:00'), salida('15', '18:00')],
      actividades: [
        {
          ...actividad(1, M('15', '09:00'), null, false),
          // Nadie la cerró: se corta sola a las 21:00, pero la jornada acabó a las 18:00.
          sesiones: [{ startedAt: M('15', '09:00'), endedAt: null }],
        },
      ],
    });
    expect(dias[0].minutosLaborados).toBe(540);
    expect(dias[0].minutosProductivos).toBe(540);
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
        entrada('14', '10:20'),
        salida('14', '18:00'),
        entrada('15', '10:05'),
        salida('15', '18:00'),
        entrada('16', '11:00'),
        salida('16', '18:00'),
        entrada('17', '10:00'),
        salida('17', '18:00'),
        entrada('18', '10:00'),
        salida('18', '18:00'),
        // Sábado a las 12: no es retardo, es tiempo extra.
        entrada('19', '12:00'),
        salida('19', '16:00'),
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
    entregas: {
      medidas: 5,
      aTiempo: 5,
      tarde: 0,
      sinEntregar: 0,
      revisadas: 5,
      aprobadasALaPrimera: 5,
      devueltas: 0,
      conTiempo: 5,
      enTiempoAdecuado: 5,
      minutosCarga: 1800,
      pctATiempo: 100,
      pctALaPrimera: 100,
      pctTiempoAdecuado: 100,
    },
    asistenciaPuntual: { esperados: 5, puntuales: 5, pct: 100 },
    ritmo: { entregadas: 5, dias: 5, porDia: 1, referencia: null },
    carga: { minutos: 1800, pct: 75 },
    ocupacion: { minutos: 1700, pct: 71 },
    cumplimientoPct: 100,
    cumplimientoPartes: [],
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
        entregas: { ...base.entregas, aTiempo: 3, tarde: 1, sinEntregar: 1, pctATiempo: 60 },
        uniforme: { ...base.uniforme, pct: 90 },
      }),
    ).toEqual({
      semaforo: 'rojo',
      motivos: ['3 de 5 entregas a tiempo (1 tarde, 1 sin entregar)', '1 retardo (20 min tarde)', 'Uniforme 90 %'],
    });
    expect(semaforoKpi({ ...base, diasSinChecada: 2 }).semaforo).toBe('rojo');
  });

  it('la productividad ya no pinta: el reloj de actividad no dice si cumplió', () => {
    expect(semaforoKpi({ ...base, productividadPct: 20 }).semaforo).toBe('verde');
  });

  it('las entregas devueltas también cuentan', () => {
    expect(
      semaforoKpi({ ...base, entregas: { ...base.entregas, aprobadasALaPrimera: 4, devueltas: 1, pctALaPrimera: 80 } }),
    ).toEqual({ semaforo: 'amarillo', motivos: ['1 entrega devuelta de 5 revisadas'] });
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
        entregas: { ...base.entregas, medidas: 0, aTiempo: 0, revisadas: 0, aprobadasALaPrimera: 0, conTiempo: 0, enTiempoAdecuado: 0, pctATiempo: null, pctALaPrimera: null, pctTiempoAdecuado: null },
      }).semaforo,
    ).toBe('sin_datos');
  });
});

describe('entregas: en tiempo y forma', () => {
  const ahora = M('16', '12:00');
  const finDelDia = (dia: string) => M(dia, '23:59');

  it('mide con la hora en que ENTREGÓ, no con la aprobación del jefe', () => {
    const lista = entregasDelRango(
      [
        // Entregó a las 12:45 con límite al fin del día: a tiempo, aunque el jefe la aprobara al día siguiente.
        { activityId: 1, limite: finDelDia('14'), entregadaAt: M('14', '12:45'), primeraRevision: 'APROBADA' },
        // Entregó pasado su límite.
        { activityId: 2, limite: M('14', '13:00'), entregadaAt: M('14', '14:30'), primeraRevision: 'DEVUELTA', devoluciones: 1 },
        // Venció ayer y no la ha entregado.
        { activityId: 3, limite: finDelDia('15'), entregadaAt: null },
        // Vence mañana: todavía no se califica.
        { activityId: 4, limite: finDelDia('17'), entregadaAt: null },
        // Se entregó antes del rango: no cuenta.
        { activityId: 5, limite: finDelDia('10'), entregadaAt: M('10', '12:00') },
        // Sin límite: cuenta a tiempo.
        { activityId: 6, limite: null, entregadaAt: M('15', '11:00') },
      ],
      '2026-09-14',
      '2026-09-16',
      ahora,
    );
    expect(lista.map((e) => [e.activityId, e.estado, e.minutosTarde])).toEqual([
      [3, 'sin_entregar', 12 * 60 + 1],
      [6, 'a_tiempo', null],
      [2, 'tarde', 90],
      [1, 'a_tiempo', null],
    ]);
    expect(resumenEntregas(lista)).toMatchObject({
      medidas: 4,
      aTiempo: 2,
      tarde: 1,
      sinEntregar: 1,
      revisadas: 2,
      aprobadasALaPrimera: 1,
      devueltas: 1,
      pctATiempo: 50,
      pctALaPrimera: 50,
    });
  });

  it('tiempo adecuado: lo trabajado contra su máximo (o plan + 25 %); la carga es el plan de lo entregado', () => {
    const lista = entregasDelRango(
      [
        // Plan 60, máximo 90, trabajó 80: adecuado.
        { activityId: 1, limite: null, entregadaAt: M('15', '11:00'), minutosPlan: 60, minutosMaximo: 90, minutosReales: 80 },
        // Plan 60 sin máximo → tope 75; trabajó 100: excedido.
        { activityId: 2, limite: null, entregadaAt: M('15', '12:00'), minutosPlan: 60, minutosReales: 100 },
        // Sin plan: no se mide su tiempo; aporta su real hasta 2 h.
        { activityId: 3, limite: null, entregadaAt: M('15', '13:00'), minutosReales: 300 },
        // De tres días: el plan es por jornada (×3) y su tiempo no se compara.
        { activityId: 4, limite: null, entregadaAt: M('15', '14:00'), minutosPlan: 480, minutosReales: 2000, diasPeriodo: 3 },
      ],
      '2026-09-15',
      '2026-09-15',
      ahora,
    );
    expect(lista.map((e) => [e.activityId, e.tiempo, e.minutosMaximo, e.minutosCarga])).toEqual([
      [4, null, 600, 1440],
      [3, null, null, 120],
      [2, 'excedido', 75, 60],
      [1, 'adecuado', 90, 60],
    ]);
    expect(resumenEntregas(lista)).toMatchObject({ conTiempo: 2, enTiempoAdecuado: 1, pctTiempoAdecuado: 50, minutosCarga: 1680 });
  });

  it('el ritmo se mide contra el percentil 75 del equipo, nunca menos de 1 por día', () => {
    const r = (entregadas: number, dias: number) => ({ ritmo: { entregadas, dias, porDia: null, referencia: null } });
    expect(referenciaDeRitmo([r(18, 8), r(14, 8), r(4, 8), r(1, 8)])).toBe(1.8);
    expect(referenciaDeRitmo([r(1, 8)])).toBe(1);
    expect(referenciaDeRitmo([r(0, 8)])).toBeNull();
  });

  it('cumplimiento: ocho partes que suman 100 y lo que no tiene dato no pesa', () => {
    const base = {
      entregas: {
        medidas: 2,
        aTiempo: 1,
        tarde: 1,
        sinEntregar: 0,
        revisadas: 2,
        aprobadasALaPrimera: 2,
        devueltas: 0,
        conTiempo: 2,
        enTiempoAdecuado: 1,
        minutosCarga: 240,
        pctATiempo: 50,
        pctALaPrimera: 100,
        pctTiempoAdecuado: 50,
      },
      asistenciaPuntual: { esperados: 1, puntuales: 1, pct: 100 },
      uniforme: { revisadas: 0, ok: 0, noOk: 0, sinRevisar: 1, pct: null },
      minutosLaborados: 480,
      ritmo: { entregadas: 2, dias: 1, porDia: 2, referencia: null },
      carga: { minutos: 240, pct: 50 },
      ocupacion: { minutos: 168, pct: 35 },
    };
    expect(Object.values(PESOS_CUMPLIMIENTO).reduce((a, b) => a + b, 0)).toBe(100);
    // entregas ½·20 + forma 1·10 + tiempo ½·15 + ritmo (2 de 4)·20 + ocupación (35 % de 70)·15 +
    // asistencia 1·15 = 60 de 95 → 63 %; carga 50 % (la meta) no resta.
    const c = cumplimientoDe(base, 4);
    expect(c.pct).toBe(63);
    expect(c.partes.map((p) => [p.clave, p.pct, p.peso])).toEqual([
      ['entregas', 50, 20],
      ['forma', 100, 10],
      ['tiempo', 50, 15],
      ['ritmo', 50, 20],
      ['ocupacion', 50, 15],
      ['asistencia', 100, 15],
      ['carga', 100, 0],
    ]);
    expect(c.partes.find((p) => p.clave === 'ritmo')!.detalle).toBe('2 por día · el equipo va a 4');
    // Sin ritmo del equipo, el ritmo no se califica.
    expect(cumplimientoDe(base, null).pct).toBe(67);
    // Poca carga multiplica: 12.5 % de las horas con trabajo entregado = ¼ de la meta → ×0.25.
    expect(cumplimientoDe({ ...base, carga: { minutos: 60, pct: 13 } }, 4).pct).toBe(16);
    // Sin entregas no hay cumplimiento, aunque haya llegado temprano.
    expect(cumplimientoDe({ ...base, entregas: resumenEntregas([]) }, 4).pct).toBeNull();
  });

  it('una sola entrega en el día no pesa lo mismo que cinco (Adam: Alejandro contra Daniela)', () => {
    const dia = { desde: '2026-09-15', hasta: '2026-09-15', checadas: [entrada('15', '10:00'), salida('15', '18:00')] };
    const entrega = (id: number, hora: string) => ({
      activityId: id,
      limite: finDelDia('15'),
      entregadaAt: M('15', hora),
      minutosPlan: 60,
      minutosMaximo: 90,
      minutosReales: 60,
    });
    const daniela = calcula({
      ...dia,
      actividades: [10, 11, 12, 13, 14].map((h, i) => actividad(i + 1, M('15', `${h}:00`), M('15', `${h + 1}:00`))),
      entregas: [11, 12, 13, 14, 15].map((h, i) => entrega(i + 1, `${h}:00`)),
    }).totales;
    const alejandro = calcula({
      ...dia,
      actividades: [actividad(9, M('15', '10:00'), M('15', '11:00'))],
      entregas: [entrega(9, '11:00')],
    }).totales;
    // Los dos entregaron todo a tiempo y dentro de su tiempo…
    expect(daniela.entregas.pctATiempo).toBe(100);
    expect(alejandro.entregas.pctATiempo).toBe(100);
    // …pero el ritmo, la carga y la ocupación los separan.
    const ref = referenciaDeRitmo([daniela, alejandro]);
    expect(ref).toBe(5);
    // Daniela: 5 h de trabajo entregado en 8 h (62 %, sobre la meta). Alejandro: 1 h en 8 h
    // (12.5 % = ¼ de la meta) y su cumplimiento se multiplica por 0.25.
    expect(conReferencia(daniela, ref).cumplimientoPct).toBe(98);
    expect(conReferencia(alejandro, ref).cumplimientoPct).toBe(17);
    expect(alejandro.ritmo).toMatchObject({ entregadas: 1, dias: 1, porDia: 1 });
  });

  it('un día laborable perdido sin justificar multiplica todo; sin trabajar ninguno, 0', () => {
    const dosDias = { desde: '2026-09-14', hasta: '2026-09-15' };
    const conUnDia = calcula({
      ...dosDias,
      checadas: [entrada('14', '10:00'), salida('14', '18:00')],
      actividades: [actividad(1, M('14', '10:00'), M('14', '17:00'))],
      entregas: [{ activityId: 1, limite: finDelDia('14'), entregadaAt: M('14', '17:00'), minutosPlan: 300 }],
    }).totales;
    // El 15 no checó y no está justificado: 1 de 2 días.
    expect(conUnDia.diasDeTrabajo).toMatchObject({ esperados: 2, trabajados: 1, sinChecar: 1, sinTrabajo: 0, pct: 50 });
    // entregas 1·20 + ocupación (4 h de 8 = 50 % de 70)·15 + asistencia (1 de 2)·15 = 38.2 de 50 → 76 %, × ½ = 38 %.
    expect(conUnDia.cumplimientoPct).toBe(38);
    expect(conUnDia.cumplimientoPartes.find((p) => p.clave === 'dias')).toMatchObject({
      pct: 50,
      peso: 0,
      detalle: '1 de 2 días (1 sin checar) · multiplica el total',
    });
    // Justificado, ese día no cuenta.
    expect(calcula({ ...dosDias, checadas: [entrada('14', '10:00'), salida('14', '18:00')], actividades: [actividad(1, M('14', '10:00'), M('14', '17:00'))], justificadas: ['2026-09-15'] }).totales.diasDeTrabajo).toMatchObject({ esperados: 1, trabajados: 1 });
    // Sin trabajar ninguno de los que debía: 0, aunque no tenga entregas que medir.
    expect(calcula(dosDias).totales.cumplimientoPct).toBe(0);
  });

  it('actividad por día: cuántas tocó cada día, y los días con ninguna o con solo una', () => {
    const t = calcula({
      desde: '2026-09-14',
      hasta: '2026-09-16',
      checadas: [
        entrada('14', '10:00'), salida('14', '18:00'),
        entrada('15', '10:00'), salida('15', '18:00'),
      ],
      actividades: [
        actividad(1, M('14', '10:00'), M('14', '11:00')),
        actividad(2, M('14', '12:00'), M('14', '13:00')),
        actividad(3, M('15', '10:00'), M('15', '11:00')),
      ],
      entregas: [{ activityId: 2, limite: null, entregadaAt: M('14', '13:00') }],
    });
    const porDia = Object.fromEntries(t.dias.map((d) => [d.fecha, [d.actividadesDelDia, d.entregasDelDia]]));
    expect(porDia).toEqual({ '2026-09-14': [2, 1], '2026-09-15': [1, 0], '2026-09-16': [0, 0] });
    // El 16 no checó: cuenta como día sin actividad. El 15, solo una.
    expect(t.totales.actividadDiaria).toEqual({ esperados: 3, sinActividad: 1, conUna: 1, promedio: 1 });
  });

  it('checar y no hacer nada también es un día perdido', () => {
    const t = calcula({ desde: '2026-09-15', hasta: '2026-09-15', checadas: [entrada('15', '10:00'), salida('15', '18:00')] }).totales;
    expect(t.diasDeTrabajo).toMatchObject({ esperados: 1, trabajados: 0, sinChecar: 0, sinTrabajo: 1 });
    expect(t.cumplimientoPct).toBe(0);
  });

  it('dejar el reloj prendido no vuelve ocupado a nadie: cada actividad cuenta hasta su máximo', () => {
    const reloj = calcula({
      desde: '2026-09-15',
      hasta: '2026-09-15',
      checadas: [entrada('15', '10:00'), salida('15', '18:00')],
      actividades: [{ ...actividad(9, M('15', '10:00'), M('15', '18:00')), topeDiarioMin: 90 }],
      entregas: [{ activityId: 9, limite: M('15', '12:00'), entregadaAt: M('15', '18:00'), minutosPlan: 60, minutosMaximo: 90, minutosReales: 480 }],
    }).totales;
    expect(reloj.productividadPct).toBe(100);
    expect(reloj.ocupacion).toEqual({ minutos: 90, pct: 19 });
    expect(reloj.entregas).toMatchObject({ tarde: 1, conTiempo: 1, enTiempoAdecuado: 0 });
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
