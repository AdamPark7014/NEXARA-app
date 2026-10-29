import {
  admiteRegistroManual,
  cierreDeJornada,
  decidirCierrePorSalida,
  esCandidataAlCierre,
  esCausaValida,
  esNoCumplida,
  estatusAlReprogramar,
  etiquetaCausa,
  horaDeCierre,
  NO_CUMPLIDA_VIGENTE_DESDE,
  salidaCuentaDesde,
  salidaMasTarde,
} from './incumplimiento';
import {
  ACTIVITY_STATUS,
  isClosedStatus,
  isFinishedStatus,
  normalizeActivityStatus,
  statusVariants,
} from './activity-status';

// México no cambia de horario: 22-10-2026 18:00 en México = 23-10 00:00 UTC.
const MX = (iso: string) => new Date(`${iso}-06:00`);
const CIERRE_22 = MX('2026-10-22T18:00:00');

describe('cierre de jornada de una actividad', () => {
  it('la hora citada del formulario vence al terminar la jornada (18:00), no a medianoche', () => {
    const citada = MX('2026-10-22T10:00:00');
    const cierre = cierreDeJornada({ fechaInicio: citada, fechaMaxima: citada, fechaEntregaEsperada: citada });
    expect(cierre?.toISOString()).toBe(CIERRE_22.toISOString());
    expect(horaDeCierre(cierre as Date)).toBe('18:00');
  });

  it('manda la salida más tarde de quienes la ejecutan', () => {
    const citada = MX('2026-10-22T10:00:00');
    const cierre = cierreDeJornada({
      fechaInicio: citada,
      fechaMaxima: citada,
      fechaEntregaEsperada: citada,
      horasSalida: [null, '19:30', '17:00', 'basura'],
    });
    expect(cierre?.toISOString()).toBe(MX('2026-10-22T19:30:00').toISOString());
    expect(salidaMasTarde([])).toBe(18 * 60);
  });

  it('un límite explícito después de la salida se respeta; uno antes, se lleva al fin de la jornada', () => {
    const inicio = MX('2026-10-22T10:00:00');
    const tarde = cierreDeJornada({ fechaInicio: inicio, fechaMaxima: MX('2026-10-22T20:00:00') });
    expect(tarde?.toISOString()).toBe(MX('2026-10-22T20:00:00').toISOString());
    const temprano = cierreDeJornada({ fechaInicio: inicio, fechaMaxima: MX('2026-10-22T12:00:00') });
    expect(temprano?.toISOString()).toBe(CIERRE_22.toISOString());
    const otroDia = cierreDeJornada({ fechaInicio: inicio, fechaMaxima: MX('2026-10-24T12:00:00') });
    expect(otroDia?.toISOString()).toBe(MX('2026-10-24T18:00:00').toISOString());
  });

  it('citada después de la salida (fuera de horario) tiene hasta que acabe el día', () => {
    const nocturna = MX('2026-10-22T19:00:00');
    const cierre = cierreDeJornada({ fechaInicio: nocturna, fechaMaxima: nocturna, fechaEntregaEsperada: nocturna });
    expect(cierre?.toISOString()).toBe(new Date(MX('2026-10-23T00:00:00').getTime() - 1).toISOString());
  });

  it('lo asignado sobre la hora tiene al menos una hora', () => {
    const citada = MX('2026-10-22T10:00:00');
    const cierre = cierreDeJornada({
      fechaInicio: citada,
      fechaMaxima: citada,
      fechaEntregaEsperada: citada,
      fechaAsignacion: MX('2026-10-22T17:30:00'),
    });
    expect(cierre?.toISOString()).toBe(MX('2026-10-22T18:30:00').toISOString());
  });

  it('una de varios días vence al terminar la jornada de su último día', () => {
    const cierre = cierreDeJornada({
      periodoInicio: new Date('2026-10-20T00:00:00.000Z'),
      periodoFin: new Date('2026-10-23T00:00:00.000Z'),
      fechaInicio: MX('2026-10-20T10:00:00'),
    });
    expect(cierre?.toISOString()).toBe(MX('2026-10-23T18:00:00').toISOString());
  });

  it('sin fecha no hay cierre', () => {
    expect(cierreDeJornada({})).toBeNull();
    expect(cierreDeJornada({ fechaInicio: MX('2026-10-22T10:00:00') })).toBeNull();
  });
});

describe('cierre al checar la salida de jornada (regla de Adam, 28-10)', () => {
  const LIMITE = MX('2026-10-28T23:59:59');
  const DIA = '2026-10-28';
  const sinEntregar = (userId: number, salidaAt: Date | null, desde: Date | null = MX('2026-10-28T09:00:00')) => ({
    userId,
    entregadaAt: null,
    salidaAt,
    desde,
  });

  it('a las 18:00 sin checar salida no se cierra nada; al checarla, sí', () => {
    expect(
      decidirCierrePorSalida({ estatus: 'En Proceso', limite: LIMITE, dia: DIA, ejecutores: [sinEntregar(15, null)] }),
    ).toEqual({ cerrar: false, pendientes: [] });
    expect(
      decidirCierrePorSalida({
        estatus: 'En Proceso',
        limite: LIMITE,
        dia: DIA,
        ejecutores: [sinEntregar(15, MX('2026-10-28T18:02:00'))],
      }),
    ).toEqual({ cerrar: true, pendientes: [15] });
  });

  it('en equipo espera a que salgan todos los que no la entregaron', () => {
    const base = { estatus: 'En Proceso', limite: LIMITE, dia: DIA };
    const uno = decidirCierrePorSalida({
      ...base,
      ejecutores: [sinEntregar(15, MX('2026-10-28T18:02:00')), sinEntregar(58, null)],
    });
    expect(uno.cerrar).toBe(false);
    const todos = decidirCierrePorSalida({
      ...base,
      ejecutores: [
        sinEntregar(15, MX('2026-10-28T18:02:00')),
        sinEntregar(58, MX('2026-10-28T18:05:00')),
        { userId: 57, entregadaAt: MX('2026-10-28T17:30:00'), salidaAt: null, desde: null },
      ],
    });
    expect(todos).toEqual({ cerrar: true, pendientes: [15, 58] });
  });

  it('pasarse de la hora no cierra: quien entregó tarde no queda pendiente', () => {
    const d = decidirCierrePorSalida({
      estatus: 'En Proceso',
      limite: MX('2026-10-28T17:00:00'),
      dia: DIA,
      ejecutores: [{ userId: 58, entregadaAt: MX('2026-10-28T17:45:00'), salidaAt: MX('2026-10-28T18:05:00'), desde: null }],
    });
    expect(d.cerrar).toBe(false);
  });

  it('lo que vence otro día no se cierra con la salida de hoy; lo vencido de ayer, sí', () => {
    const base = { estatus: 'En Proceso', dia: DIA, ejecutores: [sinEntregar(15, MX('2026-10-28T18:02:00'))] };
    expect(decidirCierrePorSalida({ ...base, limite: MX('2026-10-29T18:00:00') }).cerrar).toBe(false);
    expect(decidirCierrePorSalida({ ...base, limite: MX('2026-10-27T18:00:00') }).cerrar).toBe(true);
  });

  it('una salida antes de empezar o recién asignada no cuenta', () => {
    const desde = salidaCuentaDesde({ fechaInicio: MX('2026-10-28T19:00:00'), asignadaAt: MX('2026-10-28T10:00:00') });
    expect(desde?.toISOString()).toBe(MX('2026-10-28T19:00:00').toISOString());
    const reciente = salidaCuentaDesde({ fechaInicio: MX('2026-10-28T09:00:00'), asignadaAt: MX('2026-10-28T17:30:00') });
    expect(reciente?.toISOString()).toBe(MX('2026-10-28T18:30:00').toISOString());
    expect(
      decidirCierrePorSalida({
        estatus: 'Asignada',
        limite: LIMITE,
        dia: DIA,
        ejecutores: [sinEntregar(15, MX('2026-10-28T18:02:00'), reciente)],
      }).cerrar,
    ).toBe(false);
  });

  it('una salida de otro día no cierra lo de hoy', () => {
    expect(
      decidirCierrePorSalida({
        estatus: 'En Proceso',
        limite: LIMITE,
        dia: DIA,
        ejecutores: [sinEntregar(15, MX('2026-10-27T18:02:00'))],
      }).cerrar,
    ).toBe(false);
  });

  it('«Por Validar», lo cerrado, lo sin fecha y lo de antes de la regla no se tocan', () => {
    const ejecutores = [sinEntregar(15, MX('2026-10-28T18:02:00'))];
    for (const estatus of ['Por Validar', 'Finalizada', 'Cancelada', 'No cumplida', null]) {
      expect(decidirCierrePorSalida({ estatus, limite: LIMITE, dia: DIA, ejecutores }).cerrar).toBe(false);
    }
    expect(decidirCierrePorSalida({ estatus: 'En Proceso', limite: null, dia: DIA, ejecutores }).cerrar).toBe(false);
    const viejo = new Date(NO_CUMPLIDA_VIGENTE_DESDE.getTime() - 6 * 3_600_000);
    expect(decidirCierrePorSalida({ estatus: 'En Proceso', limite: viejo, dia: DIA, ejecutores }).cerrar).toBe(false);
  });

  it('si todos entregaron y se la devolvieron después, no es incumplimiento', () => {
    expect(
      decidirCierrePorSalida({
        estatus: 'En Proceso',
        limite: LIMITE,
        dia: DIA,
        ejecutores: [{ userId: 7, entregadaAt: MX('2026-10-28T16:00:00'), salidaAt: MX('2026-10-28T18:00:00'), desde: null }],
      }).cerrar,
    ).toBe(false);
  });
});

describe('estatus «No cumplida»', () => {
  it('es cerrada, no finalizada, y se reconoce en sus grafías', () => {
    for (const raw of ['No cumplida', 'no cumplida', 'Incumplida', 'NO_CUMPLIDA']) {
      expect(normalizeActivityStatus(raw)).toBe(ACTIVITY_STATUS.NO_CUMPLIDA);
      expect(esNoCumplida(raw)).toBe(true);
    }
    expect(isClosedStatus('No cumplida')).toBe(true);
    expect(isFinishedStatus('No cumplida')).toBe(false);
    expect(statusVariants(ACTIVITY_STATUS.NO_CUMPLIDA)).toContain('No cumplida');
  });

  it('el cierre toca lo sin entregar; un superior puede registrarla también en revisión', () => {
    expect(esCandidataAlCierre('En Proceso')).toBe(true);
    expect(esCandidataAlCierre('Por Validar')).toBe(false);
    expect(admiteRegistroManual('Por Validar')).toBe(true);
    expect(admiteRegistroManual('Finalizada')).toBe(false);
    expect(admiteRegistroManual('No cumplida')).toBe(false);
  });

  it('al reprogramar vuelve en proceso si alguien ya la había empezado', () => {
    expect(estatusAlReprogramar('Pendiente', true)).toBe('En Proceso');
    expect(estatusAlReprogramar('Asignada', false)).toBe('Asignada');
    expect(estatusAlReprogramar('En Proceso', false)).toBe('Pendiente');
    expect(estatusAlReprogramar(null, false)).toBe('Pendiente');
  });

  it('catálogo de causas', () => {
    expect(esCausaValida('MATERIAL')).toBe(true);
    expect(esCausaValida('INVENTADA')).toBe(false);
    expect(etiquetaCausa('SIN_ENTREGA')).toBe('Sin entrega al cierre de la jornada');
    expect(etiquetaCausa('???')).toBe('Otra causa');
  });
});
