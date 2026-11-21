import { dentroDeHorario, destinatariosAviso, horaMexico, motivoRetraso, textoAviso, tocaAviso, type UsoParaAviso } from './avisos-retraso';

// 21-11-2026 18:00 UTC = 12:00 en la Ciudad de México.
const MEDIODIA = new Date('2026-11-21T18:00:00.000Z');

function uso(extra: Partial<UsoParaAviso> = {}): UsoParaAviso {
  return {
    solicitanteId: 5,
    encargadoId: null,
    fechaFinAprobada: new Date('2026-11-21T16:30:00.000Z'), // 10:30 en México
    fechaFinSolicitada: null,
    actividadCerrada: false,
    avisosRetraso: 0,
    ultimoAvisoRetrasoEn: null,
    ...extra,
  };
}

describe('horario', () => {
  it('avisa de 8:00 a 20:59 hora de México; de noche no', () => {
    expect(horaMexico(MEDIODIA)).toBe(12);
    expect(dentroDeHorario(MEDIODIA)).toBe(true);
    expect(dentroDeHorario(new Date('2026-11-21T13:59:00.000Z'))).toBe(false); // 7:59
    expect(dentroDeHorario(new Date('2026-11-21T14:00:00.000Z'))).toBe(true); // 8:00
    expect(dentroDeHorario(new Date('2026-11-22T03:00:00.000Z'))).toBe(false); // 21:00
  });
});

describe('motivoRetraso', () => {
  it('vencido: ya pasó la hora de regreso', () => {
    expect(motivoRetraso(uso(), MEDIODIA)).toEqual({ motivo: 'VENCIDO', desde: uso().fechaFinAprobada, minutos: 90 });
  });

  it('sin vencer pero con la actividad cerrada: también hay que devolverla', () => {
    const r = motivoRetraso(uso({ fechaFinAprobada: new Date('2026-11-21T23:00:00Z'), actividadCerrada: true }), MEDIODIA);
    expect(r?.motivo).toBe('ACTIVIDAD_CERRADA');
  });

  it('a tiempo y con la actividad abierta, nada', () => {
    expect(motivoRetraso(uso({ fechaFinAprobada: new Date('2026-11-21T23:00:00Z') }), MEDIODIA)).toBeNull();
  });

  it('usa la fecha pedida si no hay aprobada', () => {
    const r = motivoRetraso(uso({ fechaFinAprobada: null, fechaFinSolicitada: new Date('2026-11-21T17:00:00Z') }), MEDIODIA);
    expect(r?.minutos).toBe(60);
  });
});

describe('tocaAviso', () => {
  it('el primero de inmediato; el siguiente después de 55 minutos', () => {
    expect(tocaAviso(uso(), MEDIODIA)).toBe(true);
    expect(tocaAviso(uso({ ultimoAvisoRetrasoEn: new Date(MEDIODIA.getTime() - 30 * 60_000) }), MEDIODIA)).toBe(false);
    expect(tocaAviso(uso({ ultimoAvisoRetrasoEn: new Date(MEDIODIA.getTime() - 56 * 60_000) }), MEDIODIA)).toBe(true);
  });

  it('fuera de horario, nunca', () => {
    expect(tocaAviso(uso(), new Date('2026-11-22T04:00:00.000Z'))).toBe(false);
  });
});

describe('destinatariosAviso', () => {
  it('la persona siempre; Liz en el 2, 5, 8…; el jefe en el 4, 8, 12…', () => {
    const serie = Array.from({ length: 12 }, (_, i) => destinatariosAviso(uso({ avisosRetraso: i })));
    expect(serie.map((d) => d.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(serie.filter((d) => d.liz).map((d) => d.numero)).toEqual([2, 5, 8, 11]);
    expect(serie.filter((d) => d.jefe).map((d) => d.numero)).toEqual([4, 8, 12]);
    expect(serie.every((d) => d.personaId === 5)).toBe(true);
  });

  it('el aviso va al encargado si hay uno', () => {
    expect(destinatariosAviso(uso({ encargadoId: 9 })).personaId).toBe(9);
  });
});

describe('textoAviso', () => {
  it('vencido: hora de regreso y cuánto lleva tarde', () => {
    const t = textoAviso('Hilux 2', { motivo: 'VENCIDO', desde: new Date('2026-11-21T16:30:00Z'), minutos: 135 }, 'Oscar');
    expect(t.titulo).toBe('Unidad sin devolver');
    expect(t.paraPersona).toMatch(/Hilux 2 debía volver a las 10:30/);
    expect(t.paraPersona).toMatch(/2 h 15 min tarde/);
    expect(t.paraSupervision).toMatch(/^Oscar no ha devuelto Hilux 2/);
  });

  it('actividad cerrada: pide registrar la devolución', () => {
    const t = textoAviso('Hilux 2', { motivo: 'ACTIVIDAD_CERRADA', desde: null, minutos: 0 }, 'Oscar');
    expect(t.titulo).toBe('Devuelve la unidad');
    expect(t.paraPersona).toMatch(/actividad ya cerró/);
  });
});
