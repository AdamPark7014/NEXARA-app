/**
 * Reglas puras: qué evento merece entrar en la cola SOC, con qué nombre y con
 * qué severidad. Sin base de datos y sin red: todo lo de aquí se prueba solo.
 *
 * ORIGEN DE LOS CÓDIGOS. Ni una lista de `minor` se escribe aquí a mano. La
 * fuente es `integra-acs-codes.ts`, contrastada contra 47.343 eventos reales.
 * Este módulo solo decide **qué hacer** con cada categoría; nunca **cuál es**.
 * La lección del turno anterior fue exactamente esa: las mismas listas copiadas
 * en tres archivos se pudrieron en los tres a la vez.
 *
 * QUÉ SE HA VISTO EN CAMPO Y QUÉ NO — está en `evidence` de cada código, y se
 * repite aquí porque decide cuánto fiarse de cada alarma:
 *
 * | Alarma              | minor | Evidencia    | En tres meses |
 * |---------------------|-------|--------------|---------------|
 * | DENIED (genérica)   | 6·7·9·148·152·155 | documentada | 1 evento real |
 * | CREDENTIAL_EXPIRED  | 8     | documentada  | 0 |
 * | ANTIPASSBACK        | 10    | documentada  | 0 |
 * | BLOCKLIST           | 113   | documentada  | 0 |
 * | DOOR_FORCED         | 27    | **documentada** | **0** |
 * | DOOR_HELD_OPEN      | 28    | **documentada** | **0** |
 * | AUTH_FAILURE_BURST  | 76·80·104 | observada (76 y 104) | 48 sueltos, ninguna ráfaga clasificada |
 * | AFTER_HOURS         | 1·75  | observada    | sí |
 * | CAMERA_TAMPER       | —     | **documentada** | **0**: el tipo de evento no estaba cableado |
 *
 * El 27 y el 28 son la alarma de seguridad más valiosa del catálogo y **no se
 * han observado ni una sola vez**. Se implementan porque el equipo los
 * documenta y porque el coste de tenerlos listos es cero, pero hasta que
 * aparezca el primero en campo, su comportamiento es fe en el fabricante.
 */

import {
  classifyAcsMinor,
  isAcsDoorAlarm,
  minorsDe,
} from './integra-acs-codes';
import {
  CAMERA_HEALTH_EVENT_TYPES,
  type CameraHealthEventType,
} from '../hikvision-isapi/isapi.detection';
import { ACS_ENTRY_MINORS } from './acs-ops-bridge.match';
import { WORKDAY_TIMEZONE } from '../common/time/workday';

/**
 * Cada valor es **una cosa que le pasa al operador**, no un código de equipo.
 * Antes eran dos —denegado y fuera de horario— y todo lo demás se perdía:
 * puerta forzada, antipassback y lista negra entraban como «Acceso denegado ·
 * Persona desconocida», que no dice ni qué pasó ni qué hacer.
 */
export type SocAlarmKind =
  /** Denegación de acceso sin más detalle (sin permiso, horario, tarjeta…). */
  | 'DENIED'
  /** Entrada concedida fuera de la ventana de oficina del sitio. */
  | 'AFTER_HOURS'
  /** La puerta se abrió sin que nadie la abriera. Lo más grave del catálogo. */
  | 'DOOR_FORCED'
  /** La puerta lleva demasiado tiempo abierta. */
  | 'DOOR_HELD_OPEN'
  /** Alguien entra sin haber registrado su salida (o al revés). */
  | 'ANTIPASSBACK'
  /** La credencial existe pero ya no vale. Administrativo, no seguridad. */
  | 'CREDENTIAL_EXPIRED'
  /** Persona en lista negra intentando pasar. */
  | 'BLOCKLIST'
  /** Ráfaga de fallos de reconocimiento en el mismo lector: salud del equipo. */
  | 'AUTH_FAILURE_BURST'
  /** Cámara tapada, desenfocada o movida. El sistema se vigila a sí mismo. */
  | 'CAMERA_TAMPER';

/** Severidades que pinta la consola. No hay «crítica»: la máxima es `alta`. */
export type SocSeverity = 'alta' | 'media' | 'baja';

/**
 * Especialización `minor` → alarma. **No declara qué minor es qué**: eso ya lo
 * dice `integra-acs-codes.ts`. Solo dice cuáles de ellos merecen nombre propio
 * en la cola en vez de caer en el cubo genérico de su categoría.
 *
 * La prueba `integra-acs-alarms.policy.spec.ts` comprueba que cada clave sigue
 * teniendo en el catálogo la categoría que aquí se supone. Si alguien reetiqueta
 * un código, la prueba se rompe en vez de que la alarma mienta en silencio.
 */
const ALARM_BY_MINOR: Readonly<Record<number, SocAlarmKind>> = Object.freeze({
  8: 'CREDENTIAL_EXPIRED',
  10: 'ANTIPASSBACK',
  27: 'DOOR_FORCED',
  28: 'DOOR_HELD_OPEN',
  113: 'BLOCKLIST',
});

/** Los `minor` que este módulo trata con nombre propio (para pruebas y doc). */
export const SPECIFIC_ALARM_MINORS: readonly number[] = Object.freeze(
  Object.keys(ALARM_BY_MINOR).map(Number).sort((a, b) => a - b),
);

/**
 * Severidad por alarma.
 *
 * `alta` es el techo de la escala que pinta la consola (`_soc.ts`), así que
 * «la más grave» no se expresa con una severidad inventada sino con el umbral
 * de escalado: ver `alarmEscalationThreshold`, donde puerta forzada y lista
 * negra abren ticket **al primer evento** en vez de esperar a la tercera
 * repetición.
 */
const ALARM_SEVERITY: Readonly<Record<SocAlarmKind, SocSeverity>> = Object.freeze({
  // Seguridad de primer orden: alguien abrió una puerta sin credencial.
  DOOR_FORCED: 'alta',
  // Alguien vetado intentando pasar: decisión ya tomada, hay que atenderla.
  BLOCKLIST: 'alta',
  // Denegación real. En tres meses hubo UNA; cuando llega, importa.
  DENIED: 'alta',
  // Puerta abierta de más: puede ser una mudanza o puede ser una cuña.
  DOOR_HELD_OPEN: 'media',
  // Antipassback huele a que pasaron dos con una credencial.
  ANTIPASSBACK: 'media',
  AFTER_HOURS: 'media',
  // Salud de cámara: la severidad real la afina `alarmSeverity` por tipo.
  CAMERA_TAMPER: 'media',
  // Administrativo: hay que renovarle la credencial a alguien, no correr.
  CREDENTIAL_EXPIRED: 'baja',
  // Un lector sucio no es un intruso. Nunca sube de baja.
  AUTH_FAILURE_BURST: 'baja',
});

/** Nombre de la alarma para descripciones de ticket y auditoría. */
const ALARM_LABEL: Readonly<Record<SocAlarmKind, string>> = Object.freeze({
  DENIED: 'Acceso denegado',
  AFTER_HOURS: 'Entrada fuera de horario',
  DOOR_FORCED: 'Puerta forzada',
  DOOR_HELD_OPEN: 'Puerta abierta demasiado tiempo',
  ANTIPASSBACK: 'Antipassback',
  CREDENTIAL_EXPIRED: 'Credencial caducada',
  BLOCKLIST: 'Persona en lista negra',
  AUTH_FAILURE_BURST: 'Lector con fallos de reconocimiento',
  CAMERA_TAMPER: 'Cámara manipulada',
});

/** Código de evento para la cola (la consola lo enseña como «Tipo (código)»). */
const ALARM_EVENT_TYPE: Readonly<Record<SocAlarmKind, string>> = Object.freeze({
  DENIED: 'acs.denied',
  AFTER_HOURS: 'acs.after_hours',
  DOOR_FORCED: 'acs.door_forced',
  DOOR_HELD_OPEN: 'acs.door_held_open',
  ANTIPASSBACK: 'acs.antipassback',
  CREDENTIAL_EXPIRED: 'acs.credential_expired',
  BLOCKLIST: 'acs.blocklist',
  AUTH_FAILURE_BURST: 'acs.auth_failure_burst',
  CAMERA_TAMPER: 'camera.tamper',
});

const ALL_ALARM_KINDS = Object.keys(ALARM_SEVERITY) as SocAlarmKind[];

/** ¿Es un `kind` que este sistema conoce? (filas viejas o de otro origen). */
export function isSocAlarmKind(v: unknown): v is SocAlarmKind {
  return typeof v === 'string' && (ALL_ALARM_KINDS as string[]).includes(v);
}

/**
 * Lee el `kind` de una fila. Las filas anteriores a este cambio solo pueden
 * traer `DENIED` o `AFTER_HOURS`; cualquier cosa que no reconozcamos se lee
 * como `DENIED` para no perder la alarma, que es lo que hacía antes.
 */
export function parseSocAlarmKind(raw: unknown): SocAlarmKind {
  return isSocAlarmKind(raw) ? raw : 'DENIED';
}

export function alarmKindLabel(kind: SocAlarmKind): string {
  return ALARM_LABEL[kind];
}

export function socAlarmEventType(kind: SocAlarmKind): string {
  return ALARM_EVENT_TYPE[kind];
}

export type AlarmPolicy = {
  denialThreshold: number;
  windowMinutes: number;
  afterHoursEnabled: boolean;
  officeWeekdays: number[]; // 1=lun … 7=dom (ISO)
  officeStart: string; // HH:MM
  officeEnd: string;
  tz: string;
  /** Fallos de reconocimiento seguidos que hacen falta para alarmar. */
  authFailBurst: number;
  /** Ventana en la que se cuentan esos fallos, en minutos. */
  authFailWindowMinutes: number;
};

export const DEFAULT_ALARM_POLICY: AlarmPolicy = {
  denialThreshold: 3,
  windowMinutes: 60,
  afterHoursEnabled: true,
  officeWeekdays: [1, 2, 3, 4, 5],
  officeStart: '08:00',
  officeEnd: '19:00',
  tz: WORKDAY_TIMEZONE,
  /**
   * Cinco fallos en el mismo lector.
   *
   * No es un número redondo elegido a ojo: en tres meses hubo **48 fallos de
   * reconocimiento** en total y venían en ráfagas de reintento separadas por
   * 4, 4, 4, 5, 11 y 13 segundos. Siete de esos 48 los siguió, en menos de dos
   * minutos y en el mismo equipo, una concesión CON nombre: la persona
   * reintentó y entró. O sea que **el caso normal es que se arregle solo**, y
   * alarmar por uno suelto sería fabricar ruido igual que hacía el KPI viejo.
   *
   * Cinco seguidos en diez minutos ya no es alguien reintentando: es el lector
   * sucio, mal apuntado o con contraluz. Eso es mantenimiento, y por eso la
   * severidad es `baja` y nunca sube.
   */
  authFailBurst: 5,
  authFailWindowMinutes: 10,
};

export function parseAlarmPolicy(raw: unknown): AlarmPolicy {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const hhmm = (v: unknown, fallback: string) => {
    const s = String(v ?? '').trim();
    return /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, '0') : fallback;
  };
  const weekdays = Array.isArray(o.officeWeekdays)
    ? o.officeWeekdays.map(Number).filter((n) => n >= 1 && n <= 7)
    : DEFAULT_ALARM_POLICY.officeWeekdays;
  return {
    denialThreshold: Math.min(
      20,
      Math.max(
        1,
        num(
          o.denialThreshold ?? process.env.INTEGRA_ALARM_DENIAL_THRESHOLD,
          DEFAULT_ALARM_POLICY.denialThreshold,
        ),
      ),
    ),
    windowMinutes: Math.min(
      24 * 60,
      Math.max(5, num(o.windowMinutes, DEFAULT_ALARM_POLICY.windowMinutes)),
    ),
    afterHoursEnabled:
      o.afterHoursEnabled === false || o.afterHoursEnabled === 'false'
        ? false
        : true,
    officeWeekdays: weekdays.length ? weekdays : DEFAULT_ALARM_POLICY.officeWeekdays,
    officeStart: hhmm(o.officeStart, DEFAULT_ALARM_POLICY.officeStart),
    officeEnd: hhmm(o.officeEnd, DEFAULT_ALARM_POLICY.officeEnd),
    tz: String(o.tz || DEFAULT_ALARM_POLICY.tz).trim() || WORKDAY_TIMEZONE,
    // Suelo de 2: con 1, un fallo suelto volvería a ser una alarma, que es
    // justo lo que este cambio evita.
    authFailBurst: Math.min(
      50,
      Math.max(2, num(o.authFailBurst, DEFAULT_ALARM_POLICY.authFailBurst)),
    ),
    authFailWindowMinutes: Math.min(
      24 * 60,
      Math.max(
        1,
        num(o.authFailWindowMinutes, DEFAULT_ALARM_POLICY.authFailWindowMinutes),
      ),
    ),
  };
}

function wallParts(instant: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p = fmt.formatToParts(instant);
  const val = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const hour = Number(val('hour')) % 24;
  const minute = Number(val('minute'));
  const wd = val('weekday').toLowerCase();
  const iso =
    wd.startsWith('mon')
      ? 1
      : wd.startsWith('tue')
        ? 2
        : wd.startsWith('wed')
          ? 3
          : wd.startsWith('thu')
            ? 4
            : wd.startsWith('fri')
              ? 5
              : wd.startsWith('sat')
                ? 6
                : 7;
  return { isoWeekday: iso, minutes: hour * 60 + minute };
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Entrada concedida fuera de la ventana de oficina del sitio. */
export function isAfterHoursEntry(
  occurredAt: Date,
  policy: AlarmPolicy,
): boolean {
  if (!policy.afterHoursEnabled) return false;
  const { isoWeekday, minutes } = wallParts(occurredAt, policy.tz);
  if (!policy.officeWeekdays.includes(isoWeekday)) return true;
  const start = parseHm(policy.officeStart);
  const end = parseHm(policy.officeEnd);
  if (end <= start) {
    // ventana nocturna: dentro = >= start || < end
    return !(minutes >= start || minutes < end);
  }
  return minutes < start || minutes >= end;
}

/**
 * ¿Esta ráfaga de fallos de reconocimiento merece alarma?
 *
 * Dos señales, y basta con una:
 *
 * 1. `activePostCount` — **lo dice el propio equipo** («number of times that
 *    the same alarm has been triggered», Apéndice A.49). Cuando viene, es la
 *    mejor fuente que hay: no hay que deducir nada.
 * 2. `recentFailures` — cuántos fallos lleva ese mismo lector en la ventana,
 *    contados sobre eventos ya persistidos. Es el plan B, y es el que va a
 *    funcionar de verdad: **no está confirmado que el terminal ACS mande
 *    `activePostCount`** (el campo está documentado para el aviso de cámara).
 *
 * Si no llega ninguna de las dos, no hay alarma. Preferimos callar a inventar.
 */
export function isAuthFailureBurst(input: {
  activePostCount?: number | null;
  recentFailures?: number | null;
  policy: AlarmPolicy;
}): boolean {
  const min = input.policy.authFailBurst;
  const declared = Number(input.activePostCount);
  if (Number.isFinite(declared) && declared >= min) return true;
  const counted = Number(input.recentFailures);
  return Number.isFinite(counted) && counted >= min;
}

/**
 * De un evento push ACS a una alarma de la cola — o a nada, que es la
 * respuesta correcta el 94,3 % de las veces.
 *
 * El orden importa y es deliberado:
 *
 * 1. **Incidente de puerta** (`door_alarm`). No hay credencial que juzgar ni
 *    persona a la que culpar: la puerta se abrió sola o lleva demasiado
 *    tiempo abierta.
 * 2. **Denegación real** (`denied`), con nombre propio si lo tiene.
 * 3. **Fallo de reconocimiento** (`auth_failed`), y solo en ráfaga. Un fallo
 *    suelto NO es nada: está medido que la gente reintenta y entra.
 * 4. **Concesión fuera de horario**.
 *
 * Lo que NO entra nunca: `door_state` (21/22), `exit_button` (23/24) y
 * `device_state` (29/31/32). Son el ruido de funcionamiento normal, el mismo
 * que llegó a ser el 94,3 % del tráfico y llenaba la cola de «acceso denegado»
 * cada vez que alguien entraba bien.
 */
export function classifyPushForAlarm(input: {
  major: number | null;
  minor: number | null;
  occurredAt: Date;
  policy: AlarmPolicy;
  /** Repeticiones que declara el equipo, si las declara. */
  activePostCount?: number | null;
  /** Fallos de reconocimiento ya contados en ese lector (lo aporta el servicio). */
  recentAuthFailures?: number | null;
}): SocAlarmKind | null {
  const { major, minor, occurredAt, policy } = input;
  if (major !== 5 || minor == null) return null;

  const { kind } = classifyAcsMinor(major, minor);
  const specific = ALARM_BY_MINOR[minor];

  // 1) Puerta forzada / mantenida abierta.
  if (isAcsDoorAlarm(major, minor)) {
    // El catálogo solo tiene 27 y 28; si algún día trae un tercero sin nombre
    // propio, entra como puerta forzada, que es el lado seguro del error.
    return specific ?? 'DOOR_FORCED';
  }

  // 2) Denegación de verdad (no incluye los fallos de reconocimiento).
  if (kind === 'denied') return specific ?? 'DENIED';

  // 3) Salud del lector, nunca alarma de intruso.
  if (kind === 'auth_failed') {
    return isAuthFailureBurst({
      activePostCount: input.activePostCount,
      recentFailures: input.recentAuthFailures,
      policy,
    })
      ? 'AUTH_FAILURE_BURST'
      : null;
  }

  // 4) Entrada concedida fuera de la ventana de oficina.
  if (
    (ACS_ENTRY_MINORS as readonly number[]).includes(minor) &&
    isAfterHoursEntry(occurredAt, policy)
  ) {
    return 'AFTER_HOURS';
  }
  return null;
}

/**
 * Salud de cámara → alarma. Los tres tipos comparten `kind` porque para el
 * operador son el mismo trabajo: **ir a mirar esa cámara**. Lo que cambia es
 * la urgencia, y eso lo resuelve `alarmSeverity`.
 *
 * Aquí NO entra ninguna detección normal. `fielddetection` dispara a todas
 * horas por diseño: meterla en la cola SOC sería cambiar un KPI inútil por
 * otro, que es exactamente el error que este trabajo viene a deshacer.
 */
export function classifyCameraForAlarm(
  eventType: string | null | undefined,
): SocAlarmKind | null {
  const t = String(eventType ?? '').trim().toLowerCase();
  return CAMERA_HEALTH_EVENT_TYPES.some((k) => k.toLowerCase() === t)
    ? 'CAMERA_TAMPER'
    : null;
}

/**
 * Severidad final.
 *
 * Los tres avisos de cámara son el mismo `kind` pero no la misma urgencia:
 * tapar una cámara es un acto deliberado y casi siempre el paso previo a algo;
 * que se vaya de foco suele ser una lente sucia o un enfoque perdido.
 */
export function alarmSeverity(
  kind: SocAlarmKind,
  ctx?: { cameraEventType?: string | null },
): SocSeverity {
  if (kind === 'CAMERA_TAMPER') {
    const t = String(ctx?.cameraEventType ?? '').trim().toLowerCase();
    if (t === 'shelteralarm') return 'alta'; // tapada: alguien la tapó
    if (t === 'defocus') return 'baja'; // desenfocada: mantenimiento
    return 'media'; // movida (scenechangedetection) o sin detalle
  }
  return ALARM_SEVERITY[kind];
}

/**
 * A partir de cuántas repeticiones se abre ticket.
 *
 * Puerta forzada y lista negra **no esperan**: son las dos únicas donde el
 * primer evento ya vale un ticket. Para el resto manda el umbral del sitio
 * (`denialThreshold`, 3 por defecto), que es lo que evita que una credencial
 * caducada genere papeleo cada vez que alguien la pasa.
 */
export function alarmEscalationThreshold(
  kind: SocAlarmKind,
  policy: AlarmPolicy,
): number {
  if (kind === 'DOOR_FORCED' || kind === 'BLOCKLIST') return 1;
  return policy.denialThreshold;
}

/**
 * Huella con la que se agrupan los duplicados dentro de la ventana.
 *
 * `source` es opcional y solo lo usan las alarmas que no van de una persona:
 * dos avisos distintos de la MISMA cámara —tapada y desenfocada— no deben
 * fundirse en una fila que diga «×2», porque son dos averías. Sin `source` la
 * huella es byte a byte la de antes: las alarmas ACS abiertas siguen casando.
 */
export function alarmFingerprint(input: {
  kind: SocAlarmKind;
  personId?: string | null;
  doorNo?: number | null;
  deviceIp?: string | null;
  source?: string | null;
}): string {
  const person = (input.personId || 'anon').trim().slice(0, 64) || 'anon';
  const door = input.doorNo != null ? String(input.doorNo) : 'x';
  const ip = (input.deviceIp || 'ip').trim().slice(0, 64) || 'ip';
  const src = (input.source || '').trim().slice(0, 40);
  const base = `${input.kind}:${person}:${door}:${ip}`;
  return (src ? `${base}:${src}` : base).slice(0, 180);
}

export function socExternalId(id: number): string {
  return `soc:${id}`;
}

export function parseSocId(externalId: string): number | null {
  const m = /^soc:(\d+)$/i.exec(String(externalId || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Título de la alarma: lo primero —y muchas veces lo único— que lee el
 * operador.
 *
 * La regla es qué se pone después del `·`: en las alarmas de credencial, la
 * persona; en las de puerta y cámara, **el sitio**, porque no hay persona a la
 * que nombrar. Poner «Persona desconocida» en una puerta forzada es peor que
 * no poner nada: sugiere que se sabe algo de alguien cuando no se sabe.
 */
export function alarmTitle(
  kind: SocAlarmKind,
  ctx?: {
    personName?: string | null;
    /** Puerta, cámara o equipo: lo que ubica el incidente. */
    place?: string | null;
    /** `shelteralarm` | `defocus` | `scenechangedetection`. */
    cameraEventType?: string | null;
  },
): string {
  const who = (ctx?.personName || '').trim() || 'Persona desconocida';
  const where = (ctx?.place || '').trim() || 'ubicación desconocida';
  switch (kind) {
    case 'DENIED':
      return `Acceso denegado · ${who}`;
    case 'AFTER_HOURS':
      return `Entrada fuera de horario · ${who}`;
    case 'DOOR_FORCED':
      return `Puerta forzada · ${where}`;
    case 'DOOR_HELD_OPEN':
      return `Puerta abierta demasiado tiempo · ${where}`;
    case 'ANTIPASSBACK':
      return `Antipassback: no registró su entrada · ${who}`;
    case 'CREDENTIAL_EXPIRED':
      return `Credencial caducada · ${who}`;
    case 'BLOCKLIST':
      return `Persona en lista negra · ${who}`;
    case 'AUTH_FAILURE_BURST':
      // Aquí el sujeto es el lector, no la persona: nadie fue rechazado, el
      // equipo no supo quién era.
      return `Lector sin reconocer credenciales · ${where}`;
    case 'CAMERA_TAMPER':
      return `${cameraFaultLabel(ctx?.cameraEventType)} · ${where}`;
  }
}

/** Qué le pasa a la cámara, dicho como lo diría un operador. */
export function cameraFaultLabel(eventType?: string | null): string {
  switch (String(eventType ?? '').trim().toLowerCase()) {
    case 'shelteralarm':
      return 'Cámara tapada';
    case 'defocus':
      return 'Cámara desenfocada';
    case 'scenechangedetection':
      return 'Cámara movida';
    default:
      return 'Cámara manipulada';
  }
}

/**
 * Todos los `minor` que hoy pueden abrir una alarma ACS. No es una lista
 * escrita a mano: sale del catálogo. Sirve para contar fallos recientes y para
 * que las pruebas comprueben que no se ha colado ruido operativo.
 */
export function alarmableAcsMinors(): number[] {
  return [...minorsDe('denied'), ...minorsDe('door_alarm'), ...minorsDe('auth_failed')].sort(
    (a, b) => a - b,
  );
}

/** Los `minor` de fallo de reconocimiento, para contar la ráfaga. */
export function authFailedMinors(): number[] {
  return minorsDe('auth_failed');
}

/** Los tres tipos de evento de cámara que hoy generan alarma. */
export const CAMERA_ALARM_EVENT_TYPES: readonly CameraHealthEventType[] =
  CAMERA_HEALTH_EVENT_TYPES;
