export type AccessMode = 'off' | 'on' | 'supervise' | 'deliver' | 'both';

/** Pares team/self alineados con access-matrix ModuleId. */
export const PAIR_DEFS: Array<{ key: string; team: string; self: string }> = [
  { key: 'ops-activities', team: 'ops-activities', self: 'ops-my-activities' },
  { key: 'ops-viatics', team: 'ops-viatics', self: 'ops-my-viatics' },
  { key: 'ops-vehicles', team: 'ops-vehicles', self: 'ops-my-vehicles' },
];

const MODES = new Set<AccessMode>(['off', 'on', 'supervise', 'deliver', 'both']);

export function parseModuleAccess(raw: unknown): Record<string, AccessMode> | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, AccessMode> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && MODES.has(v as AccessMode)) out[k] = v as AccessMode;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Aplica overrides sin ampliar el techo del rol:
 * solo quita o elige variante (team/self) dentro de los ids que ya venían del rol.
 */
export function applyModuleAccessOverrides(
  webModuleIds: string[],
  moduleAccess: Record<string, string> | null | undefined,
): string[] {
  const original = new Set(webModuleIds);
  const result = new Set(webModuleIds);
  if (!moduleAccess) return [...result].sort();

  const pairByKey = new Map(PAIR_DEFS.map((p) => [p.key, p]));

  for (const [key, modeRaw] of Object.entries(moduleAccess)) {
    const mode = modeRaw as AccessMode;
    const pair = pairByKey.get(key);
    if (pair) {
      const hadTeam = original.has(pair.team);
      const hadSelf = original.has(pair.self);
      result.delete(pair.team);
      result.delete(pair.self);
      if (mode === 'off') continue;
      if (mode === 'supervise' && hadTeam) result.add(pair.team);
      else if (mode === 'deliver' && hadSelf) result.add(pair.self);
      else if (mode === 'both') {
        if (hadTeam) result.add(pair.team);
        if (hadSelf) result.add(pair.self);
      }
      continue;
    }
    // toggle: key === moduleId
    if (mode === 'off') result.delete(key);
    // 'on' no añade si no estaba en el rol
  }

  return [...result].sort();
}
