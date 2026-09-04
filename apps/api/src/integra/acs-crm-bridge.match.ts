/**
 * Reglas puras ACS → CRM (ventas).
 * Matching por nombre / teléfono / host employeeNumber — sin Face ID.
 */

export const ACS_CRM_ENTRY_MINORS = [1, 75] as const;

export function isAcsCrmEntry(major: number | null, minor: number | null): boolean {
  if (major !== 5 || minor == null) return false;
  return (ACS_CRM_ENTRY_MINORS as readonly number[]).includes(minor);
}

/** Normaliza nombre para comparar (minúsculas, sin acentos, espacios colapsados). */
export function normalizePersonName(value?: string | null): string | null {
  if (value == null) return null;
  const t = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length >= 2 ? t : null;
}

/** Dígitos del teléfono; para MX usa últimos 10 si hay más. */
export function normalizePhone(value?: string | null): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D+/g, '');
  if (digits.length < 7) return null;
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function namesMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Contención solo si ambos tienen ≥2 tokens o el más corto ≥8 chars.
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length < 8 && !shorter.includes(' ')) return false;
  return longer.includes(shorter);
}

export function phonesMatch(a?: string | null, b?: string | null): boolean {
  const pa = normalizePhone(a);
  const pb = normalizePhone(b);
  if (!pa || !pb) return false;
  return pa === pb;
}

/** Extrae teléfono de raw ISAPI / Artemis si viene enterrado. */
export function phoneFromPersonRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const candidates = [
    o.phoneNo,
    o.phone,
    o.mobile,
    o.telephone,
    o.tel,
    (o.UserInfo as Record<string, unknown> | undefined)?.phoneNo,
    (o.UserInfo as Record<string, unknown> | undefined)?.phone,
    (o.PersonInfo as Record<string, unknown> | undefined)?.phoneNo,
  ];
  for (const c of candidates) {
    const n = normalizePhone(c == null ? null : String(c));
    if (n) return n;
  }
  return null;
}

export type CrmVisitCandidate = {
  id: number;
  subject: string;
  activityType: string;
  leadName?: string | null;
  leadPhone?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  ownerId?: number | null;
};

/**
 * Elige la visita/reunión PENDING del día que mejor encaje con el visitante.
 * Prioridad: teléfono > nombre lead/cliente > nombre en subject > host owner.
 */
export function pickCrmVisitMatch(
  candidates: CrmVisitCandidate[],
  opts: {
    personName?: string | null;
    phone?: string | null;
    hostUserId?: number | null;
  },
): number | null {
  if (!candidates.length) return null;
  const scored = candidates
    .map((c) => {
      let score = 0;
      if (opts.phone) {
        if (phonesMatch(opts.phone, c.leadPhone) || phonesMatch(opts.phone, c.clientPhone)) {
          score += 100;
        }
      }
      if (opts.personName) {
        if (namesMatch(opts.personName, c.leadName)) score += 50;
        if (namesMatch(opts.personName, c.clientName)) score += 45;
        if (namesMatch(opts.personName, c.subject)) score += 25;
      }
      if (opts.hostUserId && c.ownerId === opts.hostUserId) score += 10;
      if (c.activityType === 'VISIT' || c.activityType === 'MEETING') score += 5;
      return { id: c.id, score };
    })
    .filter((s) => s.score >= 25)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.id ?? null;
}

export function formatArrivedOutcome(at: Date, doorHint?: string | null, tz = 'America/Mexico_City'): string {
  const hhmm = new Intl.DateTimeFormat('es-MX', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  const door = doorHint?.trim() ? ` · ${doorHint.trim()}` : '';
  return `Llegó por ACS a las ${hhmm}${door}`;
}

export function formatMeetingNote(opts: {
  at: Date;
  personName?: string | null;
  doorName?: string | null;
  tz?: string;
}): string {
  const tz = opts.tz ?? 'America/Mexico_City';
  const hhmm = new Intl.DateTimeFormat('es-MX', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(opts.at);
  const who = opts.personName?.trim() || 'Visitante';
  const door = opts.doorName?.trim() || 'Sala de Juntas';
  return `Reunión en ${door}: ${who} · ACS ${hhmm}`;
}

/** Día civil YYYY-MM-DD en zona. */
export function dayKeyCrm(date: Date, tz = 'America/Mexico_City'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function dayBoundsCrm(day: string, tz = 'America/Mexico_City'): { start: Date; end: Date } {
  // Interpretar medianoche local ≈ UTC-6 fijo (México sin DST desde 2022).
  // Suficiente para filtrar dueDate del día en agenda comercial.
  void tz;
  const start = new Date(`${day}T00:00:00.000-06:00`);
  const end = new Date(`${day}T23:59:59.999-06:00`);
  return { start, end };
}
