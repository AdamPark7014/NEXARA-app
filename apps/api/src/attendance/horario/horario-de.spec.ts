import {
  avisosProgramacion,
  cruzaMedianocheHm,
  esEntradaDeNocheConHorario,
  minutosEntreHm,
  PLANTILLAS_TURNO_OMISION,
  resolverHorario,
  umbralNocheH,
} from './horario-de';

describe('horario-de', () => {
  it('default 10-18 cuando no hay fila ni WorkSchedule', () => {
    const h = resolverHorario({ fecha: '2026-11-20' });
    expect(h).toMatchObject({
      fuente: 'default',
      horaEntrada: '10:00',
      horaSalida: '18:00',
      graciaMin: 15,
      jornadaCitadaMin: 480,
      tipo: 'diurno',
    });
  });

  it('HorarioDia gana sobre WorkSchedule', () => {
    const h = resolverHorario({
      fecha: '2026-11-20',
      dia: { horaEntrada: '06:00', horaSalida: '12:00', motivo: 'IPADE manana' },
      workSchedule: { horaEntrada: '10:00', horaSalida: '18:00' },
    });
    expect(h.fuente).toBe('horario_dia');
    expect(h.horaEntrada).toBe('06:00');
    expect(h.jornadaCitadaMin).toBe(360);
    expect(h.tipo).toBe('mixto');
  });

  it('turno nocturno cruza medianoche', () => {
    expect(cruzaMedianocheHm('22:00', '06:00')).toBe(true);
    expect(minutosEntreHm('22:00', '06:00')).toBe(8 * 60);
    const h = resolverHorario({
      fecha: '2026-11-20',
      dia: { horaEntrada: '22:00', horaSalida: '06:00' },
    });
    expect(h.tipo).toBe('nocturno');
    expect(umbralNocheH(h)).toBe(22);
  });

  it('umbral de noche usa horario cuando existe; si no, 18', () => {
    expect(umbralNocheH(null)).toBe(18);
    expect(umbralNocheH({ horaEntrada: '10:00', horaSalida: '18:00' })).toBe(18);
    expect(umbralNocheH({ horaEntrada: '22:00', horaSalida: '06:00' })).toBe(22);
  });

  it('esEntradaDeNocheConHorario respeta umbral del horario', () => {
    // 21:00 MX = 03:00 UTC del dia siguiente en invierno aprox — usamos hora fija con offset
    const noche = new Date('2026-11-21T04:00:00Z'); // 22:00 MX (UTC-6)
    const dia = new Date('2026-11-20T16:00:00Z'); // 10:00 MX
    expect(esEntradaDeNocheConHorario(noche, { horaEntrada: '22:00', horaSalida: '06:00' })).toBe(true);
    expect(esEntradaDeNocheConHorario(dia, { horaEntrada: '22:00', horaSalida: '06:00' })).toBe(false);
    expect(esEntradaDeNocheConHorario(noche, null)).toBe(true); // >= 18
  });

  it('avisos: solape y descanso corto', () => {
    const solapes = avisosProgramacion({
      turnos: [
        { userId: 1, fecha: '2026-11-20', horaEntrada: '10:00', horaSalida: '18:00' },
        { userId: 1, fecha: '2026-11-20', horaEntrada: '16:00', horaSalida: '22:00' },
      ],
    });
    expect(solapes.solapes.length).toBeGreaterThan(0);

    const descanso = avisosProgramacion({
      turnos: [
        { userId: 1, fecha: '2026-11-20', horaEntrada: '22:00', horaSalida: '06:00' },
        { userId: 1, fecha: '2026-11-21', horaEntrada: '08:00', horaSalida: '14:00' },
      ],
    });
    expect(descanso.descansoCorto.length).toBeGreaterThan(0);
  });

  it('plantillas de omision', () => {
    expect(PLANTILLAS_TURNO_OMISION.map((p) => p.clave)).toEqual([
      'dia_10_18',
      'noche_22_06',
      'manana_6_12',
    ]);
  });
});
