import { decideAcsRoutes, classifyDoorRole } from './integra-event-router';

describe('decideAcsRoutes', () => {
  it('denegado → denied_alarm + ops_activity', () => {
    const d = decideAcsRoutes({
      eventType: 'AccessControllerEvent',
      major: 5,
      // Antes 21 —la puerta abriéndose—, que no es una denegación. 10 es
      // antipassback: entrar sin haber registrado la salida. Esa sí.
      minor: 10,
      deviceName: 'Acceso General',
      hasErpLink: true,
    });
    expect(d.direction).toBe('denied');
    expect(d.routes).toEqual(expect.arrayContaining(['denied_alarm', 'ops_activity']));
  });

  it('entrada empleado Acceso General → employee_entry + ops_activity', () => {
    const d = decideAcsRoutes({
      eventType: 'AccessControllerEvent',
      major: 5,
      minor: 75,
      deviceName: 'Acceso General',
      hasErpLink: true,
      hadPriorGrantToday: true,
    });
    expect(d.direction).toBe('entry');
    expect(d.personKind).toBe('employee');
    expect(d.routes).toEqual(expect.arrayContaining(['ops_activity', 'employee_entry']));
    expect(d.routes).not.toContain('denied_alarm');
  });

  it('gerencia restringida → restricted_audit sin employee_entry', () => {
    expect(classifyDoorRole({ name: 'Gerencia' })).toBe('restricted');
    const d = decideAcsRoutes({
      eventType: 'AccessControllerEvent',
      major: 5,
      minor: 1,
      deviceName: 'Gerencia',
      hasErpLink: true,
      hadPriorGrantToday: true,
    });
    expect(d.routes).toContain('restricted_audit');
    expect(d.routes).toContain('ops_activity');
    expect(d.routes).not.toContain('employee_entry');
  });

  it('ignora no-ACS', () => {
    const d = decideAcsRoutes({
      eventType: 'VMD',
      major: 5,
      minor: 75,
    });
    expect(d.routes).toEqual([]);
    expect(d.reasons).toContain('not_acs');
  });

  /**
   * Puerta forzada y mantenida abierta no tienen credencial ni persona, así
   * que `acsOpsDirection` devuelve `null` y antes caían en `unknown_minor` con
   * cero rutas: llegaban a la cola solo de rebote, por el repesque de
   * AFTER_HOURS del servicio. Ahora es explícito y se ve en `listRecent`.
   *
   * Ojo: **cero eventos de estos en tres meses**. Se prueba el camino, no que
   * el equipo de Oficinas los emita.
   */
  it('incidente de puerta → cola SOC, sin tocar asistencia ni presencia', () => {
    for (const minor of [27, 28]) {
      const d = decideAcsRoutes({
        eventType: 'AccessControllerEvent',
        major: 5,
        minor,
        deviceName: 'Acceso General',
        hasErpLink: true,
      });
      expect(d.routes).toEqual(['denied_alarm']);
      expect(d.reasons).toContain('door_alarm');
      // Una puerta forzada no abre jornada de nadie.
      expect(d.routes).not.toContain('employee_entry');
      expect(d.routes).not.toContain('ops_activity');
      expect(d.direction).toBeNull();
    }
  });

  it('fallo de reconocimiento va a la cola, pero NO como denegación', () => {
    const d = decideAcsRoutes({
      eventType: 'AccessControllerEvent',
      major: 5,
      minor: 76,
      deviceName: 'Acceso General',
      hasErpLink: true,
    });
    // La ruta se llama `denied_alarm` por historia; quien decide si hay alarma
    // —y solo la hay en ráfaga— es `classifyPushForAlarm`.
    expect(d.routes).toEqual(['denied_alarm']);
    expect(d.reasons).toContain('auth_failed');
    // Lo importante: el 76 NO cierra jornada. Cuando se trataba como salida
    // concedida, cada cara no reconocida cerraba un día de asistencia.
    expect(d.routes).not.toContain('employee_exit');
    expect(d.routes).not.toContain('presence_clear');
    expect(d.direction).toBeNull();
  });
});

describe('decideAcsRoutes · salud de cámara', () => {
  /**
   * El muro donde moría todo lo óptico: cualquier `eventType` que no fuera
   * `AccessControllerEvent` salía con `not_acs` y no alimentaba ninguna regla.
   * Se abre para tres tipos, y solo tres.
   */
  it('los tres avisos de salud abren el camino a la cola SOC', () => {
    for (const eventType of ['shelteralarm', 'defocus', 'scenechangedetection']) {
      const d = decideAcsRoutes({ eventType, major: null, minor: null });
      expect(d.routes).toEqual(['camera_alarm']);
      expect(d.reasons).toContain('camera_health');
    }
  });

  it('las detecciones normales siguen fuera, que es el punto', () => {
    // `fielddetection` dispara a todas horas por diseño. Meterla en la cola
    // SOC sería cambiar un KPI inútil por otro.
    for (const eventType of ['fielddetection', 'linedetection', 'facedetection', 'videoloss']) {
      const d = decideAcsRoutes({ eventType, major: null, minor: null });
      expect(d.routes).toEqual([]);
      expect(d.reasons).toContain('not_acs');
    }
  });
});
