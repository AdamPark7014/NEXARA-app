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
import { deviceMatchesDoorScope } from './access-schedule-defaults';

export type AcsDoorRole = 'general' | 'meeting' | 'restricted' | 'other';

export type AcsPersonKind = 'employee' | 'visitor' | 'unknown';

export type AcsBusinessRoute =
  | 'employee_entry'
  | 'employee_exit'
  | 'presence_clear'
  | 'visitor_arrived'
  | 'denied_alarm'
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

  // 4) Empleado entrada/salida (no en restringida)
  if (personKind === 'employee' && doorRole !== 'restricted') {
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
