import type { PanelId } from '@/lib/access-matrix';

/** Paths under /erp that belong to Contabilidad shell */
const FINANCE_RE = /^\/erp\/(accounting|invoicing|banking|finance|exports)(\/|$)/;

/** Paths under /erp/hr that belong to RRHH shell (not attendance/lunch) */
const HR_RE = /^\/erp\/hr(\/(fines|orgchart|kpis)|\/?$|\/\d+)(\/|$)?/;

/** Asistencia laboral shown in OPS shell */
const OPS_ATTENDANCE_RE = /^\/erp\/hr\/(attendance|lunch-breaks)(\/|$)/;

export function resolveShellPanel(pathname: string | null | undefined, fallback: PanelId = 'erp'): PanelId {
  if (!pathname) return fallback;
  if (OPS_ATTENDANCE_RE.test(pathname)) return 'ops';
  if (FINANCE_RE.test(pathname)) return 'finance';
  if (HR_RE.test(pathname) || pathname === '/erp/hr') return 'hr';
  // facilities legacy → still erp unless integra
  return fallback;
}