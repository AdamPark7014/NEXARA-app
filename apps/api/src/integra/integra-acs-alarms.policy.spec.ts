import {
  classifyPushForAlarm,
  isAfterHoursEntry,
  parseAlarmPolicy,
  alarmFingerprint,
  parseSocId,
  DEFAULT_ALARM_POLICY,
} from './integra-acs-alarms.policy';

describe('integra-acs-alarms.policy', () => {
  it('clasifica denegado (minor 8 · credencial caducada)', () => {
    // Antes se probaba con el minor 21, que es la puerta desbloqueándose: la
    // cola SOC se llenaba de «acceso denegado» cada vez que alguien entraba
    // bien. Las 5 alarmas DENIED que existían en producción salían todas de
    // ahí, con 336 ocurrencias agregadas en siete horas. Todas falsas.
    expect(
      classifyPushForAlarm({
        major: 5,
        minor: 8,
        occurredAt: new Date('2026-09-04T15:00:00-06:00'),
        policy: DEFAULT_ALARM_POLICY,
      }),
    ).toBe('DENIED');
  });

  it('no alarma en entrada dentro de horario', () => {
    // Jueves 12:00 MX
    expect(
      classifyPushForAlarm({
        major: 5,
        minor: 75,
        occurredAt: new Date('2026-09-03T12:00:00-06:00'),
        policy: DEFAULT_ALARM_POLICY,
      }),
    ).toBeNull();
  });

  it('alarma AFTER_HOURS en entrada nocturna laborable', () => {
    // Jueves 22:30 MX
    expect(
      classifyPushForAlarm({
        major: 5,
        minor: 1,
        occurredAt: new Date('2026-09-03T22:30:00-06:00'),
        policy: DEFAULT_ALARM_POLICY,
      }),
    ).toBe('AFTER_HOURS');
  });

  it('fin de semana cuenta como fuera de horario', () => {
    expect(
      isAfterHoursEntry(new Date('2026-09-05T10:00:00-06:00'), DEFAULT_ALARM_POLICY),
    ).toBe(true);
  });

  it('parseAlarmPolicy respeta umbral', () => {
    expect(parseAlarmPolicy({ denialThreshold: 5 }).denialThreshold).toBe(5);
    expect(parseAlarmPolicy({}).denialThreshold).toBe(3);
  });

  it('fingerprint + soc id', () => {
    expect(
      alarmFingerprint({ kind: 'DENIED', personId: '42', doorNo: 1, deviceIp: '1.2.3.4' }),
    ).toBe('DENIED:42:1:1.2.3.4');
    expect(parseSocId('soc:99')).toBe(99);
    expect(parseSocId('artemis-1')).toBeNull();
  });
});
