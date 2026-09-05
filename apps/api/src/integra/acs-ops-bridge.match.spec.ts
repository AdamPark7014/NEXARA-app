import {
  activityTouchesDay,
  acsOpsDirection,
  formatAcsEntryHint,
  isAccesoGeneralDoor,
  pickTodayActivityId,
} from './acs-ops-bridge.match';

describe('acs-ops-bridge.match', () => {
  it('clasifica entrada / salida / denegado', () => {
    expect(acsOpsDirection(5, 75)).toBe('entry');
    expect(acsOpsDirection(5, 1)).toBe('entry');
    // Denegaciones DE VERDAD: sin permiso, credencial caducada, antipassback.
    // Antes se usaba el 21 como ejemplo de denegación y el 21 es la puerta
    // abriéndose — lo produce cada concesión legítima.
    expect(acsOpsDirection(5, 6)).toBe('denied');
    expect(acsOpsDirection(5, 8)).toBe('denied');
    expect(acsOpsDirection(5, 10)).toBe('denied');
    expect(acsOpsDirection(5, 99)).toBeNull();
    expect(acsOpsDirection(3, 75)).toBeNull();
  });

  it('el estado de la puerta y el botón de salida NO son denegaciones', () => {
    // Esta prueba es la que faltaba. Los cuatro sumaban 44.632 eventos —el
    // 94,3 % del tráfico ACS de la instalación— y se contaban como denegados.
    // 21 = puerta desbloqueada, 22 = bloqueada, 23/24 = pulsar y soltar el
    // botón de salida. Comprobado por la cadena de serialNo del propio equipo:
    // el 21 llega en el MISMO segundo que la concesión que lo provoca.
    for (const minor of [21, 22, 23, 24]) {
      expect(acsOpsDirection(5, minor)).toBeNull();
    }
  });

  it('este hardware no emite señal de salida por ACS', () => {
    // El 76 era la única «salida» y resultó ser fallo de reconocimiento facial:
    // 48 de 48 con FaceRect y 0 de 48 con persona. Se prefiere no cerrar
    // jornadas a cerrarlas con una cara no reconocida.
    expect(acsOpsDirection(5, 76)).toBeNull();
  });

  it('detecta Acceso General', () => {
    expect(isAccesoGeneralDoor('Acceso General')).toBe(true);
    expect(isAccesoGeneralDoor('acceso general - lobby')).toBe(true);
    expect(isAccesoGeneralDoor('Sala de Juntas')).toBe(false);
    expect(isAccesoGeneralDoor(null)).toBe(false);
  });

  it('formatea hint ES', () => {
    const at = new Date('2026-09-04T15:07:00.000Z'); // 09:07 CDMX (UTC-6)
    expect(formatAcsEntryHint(at, 'America/Mexico_City')).toMatch(/Entró por ACS a las 09:07/);
  });

  it('elige OT de hoy priorizando sin sello ACS', () => {
    const day = '2026-09-04';
    const id = pickTodayActivityId(
      [
        {
          id: 1,
          fechaEntregaEsperada: '2026-09-04T12:00:00.000Z',
          acsEnteredAt: '2026-09-04T13:00:00.000Z',
        },
        {
          id: 2,
          fechaEntregaEsperada: '2026-09-04T18:00:00.000Z',
          acsEnteredAt: null,
        },
        { id: 3, fechaAsignacion: '2026-09-03T12:00:00.000Z' },
      ],
      day,
    );
    expect(id).toBe(2);
  });

  it('activityTouchesDay', () => {
    expect(
      activityTouchesDay(
        { fechaEntregaEsperada: '2026-09-04T20:00:00.000Z' },
        '2026-09-04',
      ),
    ).toBe(true);
    expect(
      activityTouchesDay({ fechaAsignacion: '2026-09-01T12:00:00.000Z' }, '2026-09-04'),
    ).toBe(false);
  });
});
