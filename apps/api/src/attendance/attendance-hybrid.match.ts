/**
 * Empareja identidad ERP ↔ ACS Integra sin inventar biometría.
 *
 * Claves candidatas ERP: User.employeeNumber y UserCompany.employeeNumber.
 * Claves ACS: personId (employeeNoString del terminal) y personCode del espejo.
 * La nómina sigue saliendo del checador ERP; el ACS solo enriquece / contrasta.
 */

export type HybridLinkStatus = 'linked' | 'erp_only' | 'acs_only';

export type HybridFlag =
  | 'sin_numero_empleado'
  | 'acs_sin_checador'
  | 'checador_sin_acs'
  | 'acs_sin_salida'
  | 'erp_sin_salida'
  | 'desfase_entrada'
  | 'desfase_salida';

export function normalizeIdentityKey(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

/** Todas las claves normalizadas con las que un empleado ERP puede vincularse al ACS. */
export function erpIdentityKeys(opts: {
  employeeNumber?: string | null;
  companyEmployeeNumber?: string | null;
}): string[] {
  const keys = new Set<string>();
  for (const raw of [opts.employeeNumber, opts.companyEmployeeNumber]) {
    const k = normalizeIdentityKey(raw);
    if (k) keys.add(k);
  }
  return [...keys];
}

/** Claves normalizadas de una jornada ACS. */
export function acsIdentityKeys(opts: {
  personId?: string | null;
  personCode?: string | null;
}): string[] {
  const keys = new Set<string>();
  for (const raw of [opts.personId, opts.personCode]) {
    const k = normalizeIdentityKey(raw);
    if (k) keys.add(k);
  }
  return [...keys];
}

export function findAcsMatchKey(
  erpKeys: string[],
  acsByKey: Map<string, unknown>,
): string | null {
  for (const k of erpKeys) {
    if (acsByKey.has(k)) return k;
  }
  return null;
}

/** Desfase > 30 min entre checador y primer/último acceso ACS. */
export const HYBRID_SKEW_MS = 30 * 60_000;

export function hybridTimeFlags(opts: {
  erpCheckIn?: string | null;
  erpCheckOut?: string | null;
  erpOpen?: boolean;
  acsFirstAt?: string | null;
  acsLastAt?: string | null;
  acsMinutes?: number | null;
  acsPasses?: number;
}): HybridFlag[] {
  const flags: HybridFlag[] = [];
  const hasErp = Boolean(opts.erpCheckIn);
  const hasAcs = Boolean(opts.acsFirstAt);

  if (hasAcs && !hasErp) flags.push('acs_sin_checador');
  if (hasErp && !hasAcs) flags.push('checador_sin_acs');
  if (hasAcs && (opts.acsMinutes == null || (opts.acsPasses ?? 0) <= 1)) {
    flags.push('acs_sin_salida');
  }
  if (hasErp && !opts.erpCheckOut && !opts.erpOpen) {
    flags.push('erp_sin_salida');
  }
  if (opts.erpCheckIn && opts.acsFirstAt) {
    const delta = Math.abs(
      new Date(opts.erpCheckIn).getTime() - new Date(opts.acsFirstAt).getTime(),
    );
    if (delta > HYBRID_SKEW_MS) flags.push('desfase_entrada');
  }
  if (opts.erpCheckOut && opts.acsLastAt && (opts.acsPasses ?? 0) > 1) {
    const delta = Math.abs(
      new Date(opts.erpCheckOut).getTime() - new Date(opts.acsLastAt).getTime(),
    );
    if (delta > HYBRID_SKEW_MS) flags.push('desfase_salida');
  }
  return flags;
}
