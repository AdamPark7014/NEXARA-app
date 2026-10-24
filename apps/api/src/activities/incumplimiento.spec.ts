import {
  admiteRegistroManual,
  AVISO_PREVIO_MIN,
  cierreDeJornada,
  decidirCierreDeJornada,
  esCandidataAlCierre,
  esCausaValida,
  esNoCumplida,
  estatusAlReprogramar,
  etiquetaCausa,
  horaDeCierre,
  NO_CUMPLIDA_VIGENTE_DESDE,
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

describe('decisión al cierre de jornada', () => {
  const FOTO = MX('2026-10-22T18:05:00');
  const RESPALDO = MX('2026-10-22T23:30:00');
  const foto = (userId: number, at = FOTO) => ({ userId, at, conFoto: true, cierreAutomatico: false });
  const base = {
    avisoEn: CIERRE_22,
    ahora: FOTO,
    respaldoAt: RESPALDO,
    ejecutores: [{ userId: 7, entregadaAt: null as Date | null }],
    salidas: [foto(7)],
  };

  it('la foto de salida cierra lo que nadie entregó', () => {
    for (const estatus of ['Pendiente', 'Asignada', 'En Proceso', 'Rechazada']) {
      expect(decidirCierreDeJornada({ ...base, estatus })).toEqual({ accion: 'cerrar', pendientes: [7] });
    }
  });

  it('a las 18:05 sin foto no cierra: solo avisa, y una sola vez', () => {
    const sinFoto = { ...base, salidas: [] as typeof base.salidas };
    expect(decidirCierreDeJornada({ ...sinFoto, estatus: 'Pendiente' }).accion).toBe('avisar');
    expect(decidirCierreDeJornada({ ...sinFoto, estatus: 'Pendiente', avisadoAt: FOTO }).accion).toBeNull();
    const salidaSinFoto = { userId: 7, at: FOTO, conFoto: false, cierreAutomatico: false };
    expect(decidirCierreDeJornada({ ...base, estatus: 'En Proceso', salidas: [salidaSinFoto] }).accion).toBe('avisar');
  });

  it('el cierre automático de las 23:30 cierra aunque no haya foto', () => {
    const sinFoto = { ...base, salidas: [] as typeof base.salidas, ahora: RESPALDO };
    expect(decidirCierreDeJornada({ ...sinFoto, estatus: 'En Proceso' })).toEqual({ accion: 'cerrar', pendientes: [7] });
    const auto = { userId: 7, at: RESPALDO, conFoto: false, cierreAutomatico: true };
    expect(
      decidirCierreDeJornada({ ...base, estatus: 'En Proceso', ahora: MX('2026-10-22T23:31:00'), salidas: [auto] }).accion,
    ).toBe('cerrar');
  });

  it('«Por Validar» ya se entregó: no se toca; lo cerrado tampoco', () => {
    for (const estatus of ['Por Validar', 'Finalizada', 'Cancelada', 'No cumplida', null]) {
      expect(decidirCierreDeJornada({ ...base, estatus }).accion).toBeNull();
    }
  });

  it('entregar antes de la foto es a tiempo; entregar después queda pendiente', () => {
    const aTiempo = decidirCierreDeJornada({
      ...base,
      estatus: 'En Proceso',
      ejecutores: [{ userId: 7, entregadaAt: MX('2026-10-22T18:01:00') }],
    });
    expect(aTiempo.accion).toBeNull();
    const tarde = decidirCierreDeJornada({
      ...base,
      estatus: 'En Proceso',
      ejecutores: [{ userId: 7, entregadaAt: MX('2026-10-22T18:06:00') }],
    });
    expect(tarde).toEqual({ accion: 'cerrar', pendientes: [7] });
  });

  it('en equipo se espera a que todos hayan disparado su salida', () => {
    const d = decidirCierreDeJornada({
      ...base,
      estatus: 'En Proceso',
      avisadoAt: CIERRE_22,
      salidas: [foto(8)],
      ejecutores: [
        { userId: 7, entregadaAt: null },
        { userId: 8, entregadaAt: null },
      ],
    });
    expect(d.accion).toBeNull();
    expect(d.pendientes).toEqual([7, 8]);
  });

  it('en equipo solo quedan pendientes quienes no entregaron antes de su foto', () => {
    const d = decidirCierreDeJornada({
      ...base,
      estatus: 'En Proceso',
      salidas: [foto(8), foto(9)],
      ejecutores: [
        { userId: 7, entregadaAt: MX('2026-10-22T16:00:00') },
        { userId: 8, entregadaAt: null },
        { userId: 9, entregadaAt: MX('2026-10-22T18:06:00') },
      ],
    });
    expect(d).toEqual({ accion: 'cerrar', pendientes: [8, 9] });
  });

  it('un plazo posterior al horario no deja que la foto de las 18:05 cierre', () => {
    const noAntesDe = MX('2026-10-22T20:00:00');
    expect(decidirCierreDeJornada({ ...base, estatus: 'En Proceso', noAntesDe, avisadoAt: CIERRE_22 }).accion).toBeNull();
    expect(
      decidirCierreDeJornada({ ...base, estatus: 'En Proceso', noAntesDe, ahora: noAntesDe }).accion,
    ).toBe('cerrar');
  });

  it('avisa una sola vez dentro de la hora previa al horario, sin cerrar', () => {
    const antes = new Date(CIERRE_22.getTime() - (AVISO_PREVIO_MIN - 10) * 60_000);
    expect(decidirCierreDeJornada({ ...base, estatus: 'Pendiente', ahora: antes, salidas: [] }).accion).toBe('avisar');
    expect(
      decidirCierreDeJornada({ ...base, estatus: 'Pendiente', ahora: antes, salidas: [], avisadoAt: antes }).accion,
    ).toBeNull();
    const lejos = new Date(CIERRE_22.getTime() - (AVISO_PREVIO_MIN + 10) * 60_000);
    expect(decidirCierreDeJornada({ ...base, estatus: 'Pendiente', ahora: lejos, salidas: [] }).accion).toBeNull();
  });

  it('un horario de las 19:30 avisa a las 18:30 y no cierra a las 19:40 sin foto', () => {
    const avisoEn = MX('2026-10-22T19:30:00');
    expect(
      decidirCierreDeJornada({ ...base, estatus: 'Pendiente', avisoEn, ahora: MX('2026-10-22T18:30:00'), salidas: [] }).accion,
    ).toBe('avisar');
    expect(
      decidirCierreDeJornada({
        ...base,
        estatus: 'En Proceso',
        avisoEn,
        ahora: MX('2026-10-22T19:40:00'),
        salidas: [],
        avisadoAt: avisoEn,
      }).accion,
    ).toBeNull();
    expect(
      decidirCierreDeJornada({
        ...base,
        estatus: 'En Proceso',
        avisoEn,
        ahora: MX('2026-10-22T19:40:00'),
        salidas: [foto(7, MX('2026-10-22T19:40:00'))],
      }).accion,
    ).toBe('cerrar');
  });

  it('lo que venció antes de que entrara la regla se queda como estaba', () => {
    const viejo = new Date(NO_CUMPLIDA_VIGENTE_DESDE.getTime() - 6 * 3_600_000);
    expect(
      decidirCierreDeJornada({ ...base, estatus: 'En Proceso', avisoEn: viejo, ahora: CIERRE_22 }).accion,
    ).toBeNull();
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
