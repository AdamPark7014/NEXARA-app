/**
 * Alcance de nómina: quién ve a quién y con qué profundidad.
 * Puro (sin Nest/Prisma) para probarlo solo.
 *
 * - RH y dirección: plantilla completa + montos.
 * - Contadora (rol contabilidad o finanzas@ como administrativo): por omisión
 *   ve a todo el personal salvo dirección/RH, en modo «totales» (neto, descuentos,
 *   viáticos por reembolsar). Dirección/RH pueden fijar una lista explícita de
 *   personas en SystemSetting `nomina.alcance`.
 * - Mónica/Daniela (administrativo sin finanzas@): sin acceso.
 */

export const SETTING_KEY_NOMINA_ALCANCE = 'nomina.alcance';

export const ROLES_EXCLUIDOS_CONTADORA_POR_OMISION = [
  'ceo',
  'rh',
  'dir_admin',
  'dir_operaciones',
  'super_admin',
] as const;

export type ConfigAlcanceNomina = {
  /** Si hay ids, solo esas personas. Si vacío/ausente, se aplican excluirRoles. */
  userIds?: number[] | null;
  excluirRoles?: string[] | null;
  /** `totales` = solo neto/descuentos/viáticos; `completo` = misma fila que RH. */
  modo?: 'completo' | 'totales' | null;
};

/** Mapa email → config, o config suelta para un viewer. */
export type MapaAlcanceNomina = Record<string, ConfigAlcanceNomina>;

export type PersonaNomina = {
  id: number;
  roleKey?: string | null;
  email?: string | null;
};

export type ViewerNomina = {
  id: number;
  roleKey?: string | null;
  email?: string | null;
  isSuperAdmin?: boolean;
};

export function esRhNomina(viewer: ViewerNomina): boolean {
  if (viewer.isSuperAdmin) return true;
  return String(viewer.roleKey ?? '').trim().toLowerCase() === 'rh';
}

export function esContadoraNomina(viewer: ViewerNomina): boolean {
  if (viewer.isSuperAdmin) return false;
  const role = String(viewer.roleKey ?? '').trim().toLowerCase();
  if (role === 'contabilidad') return true;
  if (role === 'administrativo') {
    const email = String(viewer.email ?? '').trim().toLowerCase();
    return email === 'finanzas@nexara.com.mx';
  }
  return false;
}

/** RH, CEO, dir_admin y super admin: toda la plantilla con montos. */
export function veNominaCompleta(viewer: ViewerNomina): boolean {
  if (viewer.isSuperAdmin) return true;
  if (esRhNomina(viewer)) return true;
  const role = String(viewer.roleKey ?? '').trim().toLowerCase();
  return role === 'ceo' || role === 'dir_admin';
}

export function filtrarPersonasNomina(
  personas: PersonaNomina[],
  viewer: ViewerNomina,
  config?: ConfigAlcanceNomina | null,
): PersonaNomina[] {
  if (veNominaCompleta(viewer)) return personas;
  if (!esContadoraNomina(viewer)) return [];

  const ids = (config?.userIds ?? []).filter((n) => Number.isInteger(n) && n > 0);
  if (Array.isArray(config?.userIds)) {
    const set = new Set(ids);
    return personas.filter((p) => set.has(p.id));
  }

  const excluir = new Set(
    (config?.excluirRoles?.length ? config.excluirRoles : ROLES_EXCLUIDOS_CONTADORA_POR_OMISION).map((r) =>
      String(r).trim().toLowerCase(),
    ),
  );
  return personas.filter((p) => !excluir.has(String(p.roleKey ?? '').trim().toLowerCase()));
}

/**
 * Campos de la fila que la contadora necesita para timbrar/pagar en modo totales.
 * El resto de montos sensibles (sueldo semanal crudo, extras detalle, etc.) se ocultan.
 */
export const CAMPOS_VISIBLES_CONTADORA = [
  'nombre',
  'numeroEmpleado',
  'sueldoPeriodo',
  'descuentosTotal',
  'viaticos',
  'total',
] as const;

export function modoAlcanceContadora(config?: ConfigAlcanceNomina | null): 'completo' | 'totales' {
  return config?.modo === 'completo' ? 'completo' : 'totales';
}

export function parsearMapaAlcance(raw: string | null | undefined): MapaAlcanceNomina {
  if (raw == null || !String(raw).trim()) return {};
  try {
    const data = JSON.parse(String(raw));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const out: MapaAlcanceNomina = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const email = String(k).trim().toLowerCase();
      if (!email || !v || typeof v !== 'object' || Array.isArray(v)) continue;
      const cfg = v as ConfigAlcanceNomina;
      out[email] = {
        userIds: Array.isArray(cfg.userIds) ? cfg.userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : null,
        excluirRoles: Array.isArray(cfg.excluirRoles)
          ? cfg.excluirRoles.map((r) => String(r).trim().toLowerCase()).filter(Boolean)
          : null,
        modo: cfg.modo === 'completo' || cfg.modo === 'totales' ? cfg.modo : 'totales',
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function configDeViewer(mapa: MapaAlcanceNomina, viewer: ViewerNomina): ConfigAlcanceNomina | null {
  const email = String(viewer.email ?? '').trim().toLowerCase();
  if (!email) return null;
  return mapa[email] ?? null;
}
