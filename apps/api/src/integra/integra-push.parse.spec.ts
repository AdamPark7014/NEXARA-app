import {
  normalizeAlert,
  parseActivePostCount,
  parseEventState,
} from './integra-push.parse';

/**
 * `eventState` y `activePostCount`: dos campos que el equipo manda en CADA
 * aviso y que el parser tiraba a la basura.
 *
 * Ambos están **documentados** por el fabricante en el Apéndice A.49 del
 * `API_Developer Guide_V1.8.0_20250109` (`JSON_EventNotificationAlert_
 * fielddetection`), los dos como campos requeridos:
 *
 * - `eventState` — «Durative alarm/event status: "active"-valid, "inactive"-
 *   invalid, e.g., when a moving target is detected, the alarm/event
 *   information will be uploaded continuously until the status is set to
 *   "inactive"».
 * - `activePostCount` — «Number of times that the same alarm has been
 *   triggered».
 *
 * El payload de abajo es el **mensaje de ejemplo del propio manual**, recortado
 * a lo que toca este parseo. No es un payload inventado.
 */
const MUESTRA_FABRICANTE = {
  EventNotificationAlert: {
    channelID: '1',
    dateTime: '2026-09-05T12:50:39-06:00',
    activePostCount: 1,
    eventType: 'fielddetection',
    eventState: 'active',
    eventDescription: '',
    channelName: 'Ipdome',
    ipAddress: '192.168.9.171',
    normalizedScreenSize: { normalizedScreenWidth: 1000, normalizedScreenHeight: 1000 },
    DetectionRegionList: {
      DetectionRegionEntry: {
        regionID: '1',
        sensitivityLevel: 50,
        detectionTarget: 'human',
        TargetRect: { X: 0.2, Y: 0.3, width: 0.1, height: 0.25 },
      },
    },
  },
};

describe('parseEventState', () => {
  it('acepta los dos valores documentados, en cualquier caja', () => {
    expect(parseEventState('active')).toBe('active');
    expect(parseEventState('inactive')).toBe('inactive');
    expect(parseEventState('ACTIVE')).toBe('active');
    expect(parseEventState(' Inactive ')).toBe('inactive');
  });

  it('descarta lo que no está en el enum: mejor null que inventar', () => {
    expect(parseEventState('activo')).toBeNull();
    expect(parseEventState('')).toBeNull();
    expect(parseEventState(undefined)).toBeNull();
    expect(parseEventState(null)).toBeNull();
    expect(parseEventState(1)).toBeNull();
  });
});

describe('parseActivePostCount', () => {
  it('lee el entero que manda el equipo, venga número o cadena', () => {
    expect(parseActivePostCount(1)).toBe(1);
    expect(parseActivePostCount('7')).toBe(7);
    expect(parseActivePostCount(0)).toBe(0);
  });

  it('no revienta el INSERT con basura ni con desbordes', () => {
    expect(parseActivePostCount(undefined)).toBeNull();
    expect(parseActivePostCount('')).toBeNull();
    expect(parseActivePostCount('nueve')).toBeNull();
    expect(parseActivePostCount(-3)).toBeNull();
    expect(parseActivePostCount(9_999_999_999)).toBe(2_147_483_647);
    expect(parseActivePostCount(2.9)).toBe(2);
  });
});

describe('normalizeAlert · estado durativo', () => {
  it('lee eventState y activePostCount del ejemplo del fabricante', () => {
    const ev = normalizeAlert(MUESTRA_FABRICANTE, '10.0.0.1');
    expect(ev).not.toBeNull();
    expect(ev?.eventType).toBe('fielddetection');
    expect(ev?.eventState).toBe('active');
    expect(ev?.activePostCount).toBe(1);
    // Y no se rompió nada de lo que ya funcionaba.
    expect(ev?.deviceIp).toBe('192.168.9.171');
    expect(ev?.label).toBe('Intrusión en zona');
    expect(ev?.targets).toEqual([{ type: 'human', x: 0.2, y: 0.3, w: 0.1, h: 0.25 }]);
  });

  it('el aviso de cierre llega con inactive: el objetivo se fue', () => {
    const ev = normalizeAlert(
      {
        EventNotificationAlert: {
          eventType: 'fielddetection',
          dateTime: '2026-09-05T12:51:10-06:00',
          ipAddress: '192.168.9.171',
          activePostCount: 12,
          eventState: 'inactive',
        },
      },
      '10.0.0.1',
    );
    expect(ev?.eventState).toBe('inactive');
    expect(ev?.activePostCount).toBe(12);
    // Sin cajas: el equipo ya no está viendo nada.
    expect(ev?.targets).toBeNull();
  });

  it('un firmware que no los manda deja null, no rompe el evento', () => {
    const ev = normalizeAlert(
      {
        EventNotificationAlert: {
          eventType: 'linedetection',
          dateTime: '2026-09-05T12:52:00-06:00',
          ipAddress: '192.168.9.172',
        },
      },
      '10.0.0.1',
    );
    expect(ev).not.toBeNull();
    expect(ev?.eventState).toBeNull();
    expect(ev?.activePostCount).toBeNull();
  });

  it('la envoltura también los trae en los avisos de control de acceso', () => {
    const ev = normalizeAlert(
      {
        EventNotificationAlert: {
          eventType: 'AccessControllerEvent',
          dateTime: '2026-09-05T08:02:11-06:00',
          ipAddress: '192.168.9.160',
          activePostCount: 1,
          eventState: 'active',
          AccessControllerEvent: {
            majorEventType: 5,
            subEventType: 1,
            employeeNoString: '1042',
            name: 'Adam',
            doorNo: 1,
          },
        },
      },
      '10.0.0.1',
    );
    expect(ev?.eventState).toBe('active');
    expect(ev?.activePostCount).toBe(1);
    expect(ev?.personId).toBe('1042');
    expect(ev?.major).toBe(5);
  });
});
