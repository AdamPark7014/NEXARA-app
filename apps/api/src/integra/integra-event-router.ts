/**
 * Tabla de enrutado ACS ↔ negocio (clasificación pura).
 * Ver docs/INTEGRA-ACS-BUSINESS-MATRIX.md
 */

import {
  ACS_DENIED_MINORS,
  ACS_ENTRY_MINORS,
  ACS_EXIT_MINORS,
  acsOpsDirection,
} from './acs-ops-bridge.match';
import { classifyAcsMinor, isAcsDoorAlarm } from './integra-acs-codes';
import { classifyCameraForAlarm } from './integra-acs-alarms.policy';
import { deviceMatchesDoorScope } from './access-schedule-defaults';

export type AcsDoorRole = 'general' | 'meeting' | 'restricted' | 'other';

export type AcsPersonKind = 'employee' | 'visitor' | 'unknown';

export type AcsBusinessRoute =
  | 'employee_entry'
  | 'employee_exit'
  | 'presence_clear'
  | 'visitor_arrived'
  /**
   * Cola SOC de control de acceso. Se llama `denied_alarm` por historia: hoy
   * lleva además puerta forzada, puerta mantenida abierta y las ráfagas de
   * fallo de reconocimiento. Quién decide si hay alarma es
   * `classifyPushForAlarm`; esta ruta solo dice «esto va a la cola».
   */
  | 'denied_alarm'
  /** Salud de cámara: tapada, desenfocada o movida. No es control de acceso. */
  | 'camera_alarm'
  | 'meeting_usage'
  | 'restricted_audit'
  | 'first_access_host'
  | 'ops_activity';

export type AcsRouteEvent = {
  eventType?: string | null;
  major: number | null;
  minor: number | null;
  deviceName?: string | null;
  deviceIp?: string | null;
  personId?: string | null;
  /** userType ACS (visitor|normal) si se conoce. */
  userType?: string | null;
  /** Hay vínculo ERP employeeNumber ↔ personId. */
  hasErpLink?: boolean;
  /** Ya había concesión hoy para esta persona (antes de este evento). */
  hadPriorGrantToday?: boolean;
  /** Ocupación: persona marcada en sitio antes de este evento. */
  wasOnSite?: boolean;
};

export type AcsRouteDecision = {
  doorRole: AcsDoorRole;
  personKind: AcsPersonKind;
  direction: 'entry' | 'exit' | 'denied' | null;
  routes: AcsBusinessRoute[];
  reasons: string[];
};

export const ACS_BUSINESS_MATRIX = [
  {
    id: 'employee_entry' as const,
    caso: 'Entrada empleado',
    condicion: 'Concedido + puerta no restringida + vínculo ERP',
    destino: 'Asistencia ERP (entrada) + presencia Ops realtime',
  },
  {
    id: 'employee_exit' as const,
    caso: 'Salida',
    condicion: 'Minor 76 o ya en sitio + concesión',
    destino: 'Asistencia ERP (salida) + presence clear',
  },
  {
    id: 'visitor_arrived' as const,
    caso: 'Visita',
    condicion: 'userType visitor o sin ERP en Sala Juntas',
    destino: 'CRM/audit arrived + aviso host reserva',
  },
  {
    id: 'denied_alarm' as const,
    caso: 'Denegado',
    condicion: 'Minor denegado (major 5)',
    destino: 'Cola SOC alarmas (sibling) + audit',
  },
  {
    id: 'meeting_usage' as const,
    caso: 'Sala juntas',
    condicion: 'Concedido en puerta meeting',
    destino: 'Audit uso + nota en reserva activa',
  },
  {
    id: 'restricted_audit' as const,
    caso: 'Gerencia / privados',
    condicion: 'Concedido en puerta restringida',
    destino: 'Solo AuditLog (sin asistencia/CRM)',
  },
  {
    id: 'first_access_host' as const,
    caso: 'Primer acceso del día',
    condicion: 'Primera concesión del día (flag INTEGRA_HOST_NOTIFY)',
    destino: 'Notificación opcional al host',
  },
  {
    id: 'ops_activity' as const,
    caso: 'Ops actividad (sibling)',
    condicion: 'Acceso General → OT del día',
    destino: 'AcsOpsBridgeService (no duplicar aquí)',
  },
  {
    id: 'camera_alarm' as const,
    caso: 'Salud de cámara',
    condicion: 'shelteralarm / defocus / scenechangedetection',
    destino: 'Cola SOC (tapada · desenfocada · movida)',
  },
] as const;

export function classifyDoorRole(device: {
  name?: string | null;
  ip?: string | null;
}): AcsDoorRole {
  if (deviceMatchesDoorScope('meeting_room', device)) return 'meeting';
  const name = String(device.name || '').toLowerCase();
  if (/gerencia|privado|privados|vip/.test(name)) return 'restricted';
  if (/acceso\s*general|general|recepci|lobby|entrada/.test(name)) return 'general';
  return 'other';
}

export function classifyPersonKind(opts: {
  userType?: string | null;
  hasErpLink?: boolean;
  doorRole?: AcsDoorRole;
}): AcsPersonKind {
  const ut = String(opts.userType || '').toLowerCase();
  if (ut === 'visitor' || ut === 'visita') return 'visitor';
  if (opts.hasErpLink) return 'employee';
  if (opts.doorRole === 'meeting' && !opts.hasErpLink) return 'visitor';
  return 'unknown';
}

/**
 * Decide qué rutas disparar. Orden documentado en la matriz.
 * `ops_activity` siempre se sugiere en ACS major=5 para que el sibling decida.
 */
export function decideAcsRoutes(ev: AcsRouteEvent): AcsRouteDecision {
  const reasons: string[] = [];
  const routes: AcsBusinessRoute[] = [];

  if (ev.eventType && ev.eventType !== 'AccessControllerEvent') {
    // Aquí moría todo lo óptico. Un `shelteralarm` —la cámara tapada— salía por
    // esta puerta con `not_acs` y no llegaba a ninguna regla de negocio.
    //
    // Se abre SOLO para los tres avisos de salud de cámara. Las detecciones
    // normales (`fielddetection` a todas horas, `VMD`, `linedetection`) siguen
    // saliendo por aquí a propósito: meterlas en la cola SOC sería sustituir un
    // KPI inútil por otro.
    if (classifyCameraForAlarm(ev.eventType)) {
      return {
        doorRole: 'other',
        personKind: 'unknown',
        direction: null,
        routes: ['camera_alarm'],
        reasons: ['camera_health'],
      };
    }
    return {
      doorRole: 'other',
      personKind: 'unknown',
      direction: null,
      routes: [],
      reasons: ['not_acs'],
    };
  }

  const doorRole = classifyDoorRole({ name: ev.deviceName, ip: ev.deviceIp });
  const direction = acsOpsDirection(ev.major, ev.minor);
  const personKind = classifyPersonKind({
    userType: ev.userType,
    hasErpLink: ev.hasErpLink,
    doorRole,
  });

  // Incidente de puerta: no hay credencial ni persona a la que atribuirlo, así
  // que no toca ni asistencia ni presencia. Va derecho a la cola SOC.
  // `acsOpsDirection` devuelve `null` para estos minor, y antes eso los dejaba
  // en `unknown_minor`: llegaban a la cola solo de rebote, por el repesque de
  // AFTER_HOURS del servicio. Ahora es explícito y se ve en `listRecent`.
  if (isAcsDoorAlarm(ev.major, ev.minor)) {
    return {
      doorRole,
      personKind,
      direction: null,
      routes: ['denied_alarm'],
      reasons: ['door_alarm'],
    };
  }

  // Fallo de reconocimiento: NO es una denegación. Se manda a la cola para que
  // la política mire si es una ráfaga; un fallo suelto no abre nada.
  if (classifyAcsMinor(ev.major, ev.minor).kind === 'auth_failed') {
    return {
      doorRole,
      personKind,
      direction: null,
      routes: ['denied_alarm'],
      reasons: ['auth_failed'],
    };
  }

  if (!direction) {
    return { doorRole, personKind, direction: null, routes: [], reasons: ['unknown_minor'] };
  }

  // 1) Denegado
  if (direction === 'denied') {
    routes.push('denied_alarm', 'ops_activity');
    reasons.push('denied');
    return { doorRole, personKind, direction, routes, reasons };
  }

  // Concedido: ops sibling siempre puede mirar
  routes.push('ops_activity');

  // 2) Restringida → solo audit
  if (doorRole === 'restricted') {
    routes.push('restricted_audit');
    reasons.push('restricted_door');
    if (!ev.hadPriorGrantToday) {
      routes.push('first_access_host');
      reasons.push('first_access');
    }
    return { doorRole, personKind, direction, routes, reasons };
  }

  // 3) Meeting
  if (doorRole === 'meeting') {
    routes.push('meeting_usage');
    reasons.push('meeting_door');
    if (personKind === 'visitor') {
      routes.push('visitor_arrived');
      reasons.push('visitor');
    }
  }

  // 4) Empleado entrada/salida (restricted ya retornó arriba)
  if (personKind === 'employee') {
    const isExit =
      direction === 'exit' ||
      (ev.wasOnSite === true && (ACS_ENTRY_MINORS as readonly number[]).includes(ev.minor ?? -1));
    if (isExit) {
      routes.push('employee_exit', 'presence_clear');
      reasons.push(direction === 'exit' ? 'minor_exit' : 'toggle_exit');
    } else if (doorRole === 'general' || doorRole === 'other' || doorRole === 'meeting') {
      // Reloj: preferir general; meeting también puede abrir jornada si es primer acceso
      if (doorRole === 'general' || doorRole === 'other' || !ev.hadPriorGrantToday) {
        routes.push('employee_entry');
        reasons.push('employee_entry');
      }
    }
  }

  // Visita en general (sin ERP)
  if (personKind === 'visitor' && doorRole !== 'meeting') {
    routes.push('visitor_arrived');
    reasons.push('visitor_non_meeting');
  }

  // 5) Primer acceso
  if (!ev.hadPriorGrantToday && direction === 'entry') {
    if (!routes.includes('first_access_host')) routes.push('first_access_host');
    reasons.push('first_access');
  }

  return { doorRole, personKind, direction, routes, reasons };
}

export function isDeniedMinor(minor: number | null): boolean {
  return minor != null && (ACS_DENIED_MINORS as readonly number[]).includes(minor);
}

export function isExitMinor(minor: number | null): boolean {
  return minor != null && (ACS_EXIT_MINORS as readonly number[]).includes(minor);
}
