import {
  alarmEscalationThreshold,
  alarmFingerprint,
  alarmSeverity,
  alarmTitle,
  authFailedMinors,
  classifyCameraForAlarm,
  classifyPushForAlarm,
  isAfterHoursEntry,
  isAuthFailureBurst,
  isSocAlarmKind,
  parseAlarmPolicy,
  parseSocAlarmKind,
  parseSocId,
  socAlarmEventType,
  DEFAULT_ALARM_POLICY,
  SPECIFIC_ALARM_MINORS,
  type SocAlarmKind,
} from './integra-acs-alarms.policy';
import { classifyAcsMinor, minorsDe } from './integra-acs-codes';

describe('integra-acs-alarms.policy', () => {
  it('clasifica la credencial caducada con su nombre, no como «denegado» a secas', () => {
    // Antes se probaba con el minor 21, que es la puerta desbloqueándose: la
    // cola SOC se llenaba de «acceso denegado» cada vez que alguien entraba
    // bien. Las 5 alarmas DENIED que existían en producción salían todas de
    // ahí, con 336 ocurrencias agregadas en siete horas. Todas falsas.
    //
    // Y esta prueba esperaba `DENIED` para el 8. Ya no: el 8 es una credencial
    // caducada, que es papeleo, no seguridad. Mezclarla con una denegación real
    // obliga al operador a abrir la alarma para saber si tiene que correr.
    expect(
      classifyPushForAlarm({
        major: 5,
        minor: 8,
        occurredAt: new Date('2026-09-04T15:00:00-06:00'),
        policy: DEFAULT_ALARM_POLICY,
      }),
    ).toBe('CREDENTIAL_EXPIRED');
  });

  it('una denegación sin nombre propio sigue siendo DENIED', () => {
    // 6 = sin permiso para esta puerta. No tiene alarma dedicada y no la
    // necesita: el cubo genérico es la respuesta correcta.
    expect(
      classifyPushForAlarm({
        major: 5,
        minor: 6,
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

/* ────────────────────────────────────────────────────────────────────────────
 * Alarmas de puerta
 * ──────────────────────────────────────────────────────────────────────── */

describe('alarmas de puerta · los eventos ya estaban en la base', () => {
  const enHorario = new Date('2026-09-03T12:00:00-06:00');
  const clasifica = (minor: number) =>
    classifyPushForAlarm({
      major: 5,
      minor,
      occurredAt: enHorario,
      policy: DEFAULT_ALARM_POLICY,
    });

  /**
   * AVISO QUE NO SE PUEDE PERDER: el 27 y el 28 tienen **cero eventos en tres
   * meses** (47.343 eventos revisados). Están marcados `evidence: 'documented'`
   * en `integra-acs-codes.ts`. Lo que se prueba aquí es que el código hace lo
   * que la documentación del fabricante dice que debe hacer — no que el equipo
   * de Oficinas los emita, porque eso no está comprobado.
   */
  it('27 · puerta forzada, la de mayor severidad, NUNCA observada en campo', () => {
    expect(classifyAcsMinor(5, 27).evidence).toBe('documented');
    expect(clasifica(27)).toBe('DOOR_FORCED');
    expect(alarmSeverity('DOOR_FORCED')).toBe('alta');
    // «La de mayor severidad» no se expresa con una severidad inventada —la
    // consola solo pinta alta/media/baja— sino con el umbral: abre ticket al
    // PRIMER evento, sin esperar a que se repita tres veces.
    expect(alarmEscalationThreshold('DOOR_FORCED', DEFAULT_ALARM_POLICY)).toBe(1);
    expect(alarmEscalationThreshold('DENIED', DEFAULT_ALARM_POLICY)).toBe(3);
  });

  it('28 · puerta mantenida abierta, tampoco observada nunca', () => {
    expect(classifyAcsMinor(5, 28).evidence).toBe('documented');
    expect(clasifica(28)).toBe('DOOR_HELD_OPEN');
    expect(alarmSeverity('DOOR_HELD_OPEN')).toBe('media');
  });

  it('10 · antipassback, 8 · caducada, 113 · lista negra', () => {
    expect(clasifica(10)).toBe('ANTIPASSBACK');
    expect(clasifica(8)).toBe('CREDENTIAL_EXPIRED');
    expect(clasifica(113)).toBe('BLOCKLIST');
    // Lista negra es una decisión ya tomada sobre esa persona: no se espera.
    expect(alarmEscalationThreshold('BLOCKLIST', DEFAULT_ALARM_POLICY)).toBe(1);
  });

  it('el título de una puerta forzada nombra el SITIO, no a una persona', () => {
    // «Persona desconocida» en una puerta forzada sugiere que se sabe algo de
    // alguien. No se sabe: no hubo credencial.
    expect(alarmTitle('DOOR_FORCED', { place: 'Acceso General' })).toBe(
      'Puerta forzada · Acceso General',
    );
    expect(alarmTitle('DENIED', { personName: 'Joan Sebastián' })).toBe(
      'Acceso denegado · Joan Sebastián',
    );
  });

  /**
   * El seguro contra la podredumbre de listas: si alguien reetiqueta un código
   * en `integra-acs-codes.ts`, esta prueba se rompe en vez de que la alarma
   * mienta en silencio. Es exactamente el fallo que costó 44.634 falsos
   * positivos.
   */
  it('cada minor con nombre propio sigue teniendo en el catálogo la categoría que se le supone', () => {
    const esperado: Record<number, string> = {
      8: 'denied',
      10: 'denied',
      113: 'denied',
      27: 'door_alarm',
      28: 'door_alarm',
    };
    expect(SPECIFIC_ALARM_MINORS).toEqual([8, 10, 27, 28, 113]);
    for (const minor of SPECIFIC_ALARM_MINORS) {
      expect(classifyAcsMinor(5, minor).kind).toBe(esperado[minor]);
    }
    // Y los dos únicos incidentes de puerta del catálogo tienen los dos su
    // alarma. Si mañana aparece un tercero, esto avisa.
    expect(minorsDe('door_alarm')).toEqual([27, 28]);
  });

  it('el ruido operativo NO entra en la cola, que era el bug de 44.634 eventos', () => {
    // 21/22 puerta, 23/24 botón de salida, 31/32 relés.
    for (const minor of [21, 22, 23, 24, 29, 31, 32]) {
      expect(clasifica(minor)).toBeNull();
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Fallo de reconocimiento: salud del lector, no intruso
 * ──────────────────────────────────────────────────────────────────────── */

describe('fallos de reconocimiento · lector sucio, no intruso', () => {
  const enHorario = new Date('2026-09-03T12:00:00-06:00');

  /**
   * Medido: 48 fallos en tres meses, en ráfagas separadas por 4, 4, 4, 5, 11 y
   * 13 segundos. **Siete de esos 48 los sigue, en menos de dos minutos y en el
   * mismo equipo, una concesión CON nombre**: la persona reintentó y entró. Un
   * fallo suelto no es un incidente; es alguien que se movió.
   */
  it('un fallo suelto no es nada', () => {
    for (const minor of authFailedMinors()) {
      expect(
        classifyPushForAlarm({
          major: 5,
          minor,
          occurredAt: enHorario,
          policy: DEFAULT_ALARM_POLICY,
        }),
      ).toBeNull();
    }
  });

  it('una ráfaga en el mismo lector sí, y siempre de severidad baja', () => {
    const alarma = classifyPushForAlarm({
      major: 5,
      minor: 76,
      occurredAt: enHorario,
      policy: DEFAULT_ALARM_POLICY,
      recentAuthFailures: DEFAULT_ALARM_POLICY.authFailBurst,
    });
    expect(alarma).toBe('AUTH_FAILURE_BURST');
    // Nunca sube: un lector sucio no despierta a nadie de madrugada.
    expect(alarmSeverity('AUTH_FAILURE_BURST')).toBe('baja');
    expect(alarmTitle('AUTH_FAILURE_BURST', { place: 'Acceso General' })).toBe(
      'Lector sin reconocer credenciales · Acceso General',
    );
  });

  it('vale lo que declara el equipo o lo que contamos nosotros', () => {
    const policy = DEFAULT_ALARM_POLICY;
    // 1) `activePostCount` del propio equipo (Apéndice A.49).
    expect(isAuthFailureBurst({ activePostCount: 5, policy })).toBe(true);
    // 2) Contado sobre lo persistido, que es el plan B y el que va a funcionar:
    //    no está confirmado que el terminal ACS mande `activePostCount`.
    expect(isAuthFailureBurst({ recentFailures: 7, policy })).toBe(true);
    // Sin ninguna de las dos señales, no se inventa nada.
    expect(isAuthFailureBurst({ policy })).toBe(false);
    expect(isAuthFailureBurst({ activePostCount: 2, recentFailures: 1, policy })).toBe(false);
  });

  it('un fallo de reconocimiento NO es una denegación, ni con ráfaga', () => {
    // Si esto se rompe, un lector con contraluz se enseña como intento de
    // intrusión y alguien va a ir a mirar quién quiso entrar. No quiso nadie.
    const kind = classifyPushForAlarm({
      major: 5,
      minor: 76,
      occurredAt: enHorario,
      policy: DEFAULT_ALARM_POLICY,
      recentAuthFailures: 99,
    });
    expect(kind).not.toBe('DENIED');
    expect(alarmSeverity(kind as SocAlarmKind)).toBe('baja');
  });

  it('el umbral no baja de 2: con 1, un fallo suelto volvería a alarmar', () => {
    expect(parseAlarmPolicy({ authFailBurst: 1 }).authFailBurst).toBe(2);
    expect(parseAlarmPolicy({ authFailBurst: 8 }).authFailBurst).toBe(8);
    expect(parseAlarmPolicy({}).authFailBurst).toBe(5);
    expect(parseAlarmPolicy({}).authFailWindowMinutes).toBe(10);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Salud de cámara
 * ──────────────────────────────────────────────────────────────────────── */

describe('salud de cámara · el sistema se vigila a sí mismo', () => {
  it('los tres avisos abren alarma, con la urgencia que le toca a cada uno', () => {
    expect(classifyCameraForAlarm('shelteralarm')).toBe('CAMERA_TAMPER');
    expect(classifyCameraForAlarm('defocus')).toBe('CAMERA_TAMPER');
    expect(classifyCameraForAlarm('scenechangedetection')).toBe('CAMERA_TAMPER');

    // Tapar una cámara es deliberado; desenfocarse suele ser la lente sucia.
    expect(alarmSeverity('CAMERA_TAMPER', { cameraEventType: 'shelteralarm' })).toBe('alta');
    expect(alarmSeverity('CAMERA_TAMPER', { cameraEventType: 'scenechangedetection' })).toBe(
      'media',
    );
    expect(alarmSeverity('CAMERA_TAMPER', { cameraEventType: 'defocus' })).toBe('baja');
  });

  /**
   * La línea que separa «vigilarse a sí mismo» de «cambiar un KPI inútil por
   * otro». `fielddetection` dispara a todas horas por diseño: si entra en la
   * cola SOC, la cola SOC deja de servir para nada.
   */
  it('ninguna detección normal entra en la cola', () => {
    for (const t of [
      'fielddetection',
      'linedetection',
      'facedetection',
      'VMD',
      'videoloss',
      'heartBeat',
      'AccessControllerEvent',
      '',
      null,
    ]) {
      expect(classifyCameraForAlarm(t)).toBeNull();
    }
  });

  it('cada avería de la misma cámara es su propia fila', () => {
    // Tapada y desenfocada son dos trabajos distintos: agruparlas como «×2»
    // esconde una de las dos.
    const tapada = alarmFingerprint({
      kind: 'CAMERA_TAMPER',
      deviceIp: '192.168.9.174',
      source: 'shelteralarm',
    });
    const desenfocada = alarmFingerprint({
      kind: 'CAMERA_TAMPER',
      deviceIp: '192.168.9.174',
      source: 'defocus',
    });
    expect(tapada).not.toBe(desenfocada);
    // Y sin `source` la huella es byte a byte la de antes: las alarmas ACS
    // abiertas en producción siguen casando y no se duplican al desplegar.
    expect(alarmFingerprint({ kind: 'DENIED', personId: '42', doorNo: 1, deviceIp: '1.2.3.4' })).toBe(
      'DENIED:42:1:1.2.3.4',
    );
  });

  it('el título dice qué le pasa a la cámara y dónde', () => {
    expect(
      alarmTitle('CAMERA_TAMPER', { place: 'Recepción 01', cameraEventType: 'shelteralarm' }),
    ).toBe('Cámara tapada · Recepción 01');
    expect(
      alarmTitle('CAMERA_TAMPER', { place: 'Azotea', cameraEventType: 'scenechangedetection' }),
    ).toBe('Cámara movida · Azotea');
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Compatibilidad con lo que ya está en la base
 * ──────────────────────────────────────────────────────────────────────── */

describe('filas que ya existen', () => {
  it('un kind viejo se lee igual que antes', () => {
    expect(parseSocAlarmKind('DENIED')).toBe('DENIED');
    expect(parseSocAlarmKind('AFTER_HOURS')).toBe('AFTER_HOURS');
    expect(parseSocAlarmKind('DOOR_FORCED')).toBe('DOOR_FORCED');
    // Basura o un kind de otro origen: se lee como DENIED, que es lo que hacía
    // el ternario anterior. No se pierde la alarma.
    expect(parseSocAlarmKind('LO_QUE_SEA')).toBe('DENIED');
    expect(parseSocAlarmKind(null)).toBe('DENIED');
    expect(isSocAlarmKind('CAMERA_TAMPER')).toBe(true);
    expect(isSocAlarmKind('DENEGADO')).toBe(false);
  });

  it('cada alarma tiene código de evento y cabe en la columna', () => {
    const kinds: SocAlarmKind[] = [
      'DENIED',
      'AFTER_HOURS',
      'DOOR_FORCED',
      'DOOR_HELD_OPEN',
      'ANTIPASSBACK',
      'CREDENTIAL_EXPIRED',
      'BLOCKLIST',
      'AUTH_FAILURE_BURST',
      'CAMERA_TAMPER',
    ];
    for (const k of kinds) {
      expect(socAlarmEventType(k)).toMatch(/^(acs|camera)\./);
      // `IntegraSocAlarm.kind` es VarChar(24): un kind más largo se truncaría
      // en la base y dejaría de casar al leerlo.
      expect(k.length).toBeLessThanOrEqual(24);
      // Severidades que la consola sabe pintar. No hay «crítica».
      expect(['alta', 'media', 'baja']).toContain(alarmSeverity(k));
      expect(alarmTitle(k, { personName: 'X', place: 'Y' })).toContain('·');
    }
  });
});
