/**
 * Quién puede pasar por `nas.nexara.com.mx` (portal del NAS de la oficina detrás de Traefik).
 *
 * La lista vive en el entorno del servidor, no en el repo:
 * - `NAS_PORTAL_USER_IDS`: ids de usuario separados por coma (p. ej. "1,3,8").
 * - `NAS_PORTAL_ROLE_KEYS`: claves de rol que entran siempre (por omisión `super_admin`).
 * Sin lista configurada no entra nadie (falla cerrado).
 */

export type DecisionNas = 'permitir' | 'denegar';

export interface ListaNas {
  userIds: ReadonlySet<number>;
  roleKeys: ReadonlySet<string>;
}

function partir(raw: string | undefined): string[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function listaNasDesdeEntorno(env: NodeJS.ProcessEnv = process.env): ListaNas {
  const userIds = new Set(
    partir(env['NAS_PORTAL_USER_IDS'])
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
  const rolesCrudos = env['NAS_PORTAL_ROLE_KEYS'];
  const roleKeys = new Set(
    (rolesCrudos === undefined ? ['super_admin'] : partir(rolesCrudos)).map((r) => r.toLowerCase()),
  );
  return { userIds, roleKeys };
}

export function decidirAccesoNas(
  usuario: { id: number; roleKey?: string | null; isActive?: boolean | null },
  lista: ListaNas,
): DecisionNas {
  if (usuario.isActive === false) return 'denegar';
  if (lista.userIds.has(usuario.id)) return 'permitir';
  const rol = (usuario.roleKey ?? '').toLowerCase();
  if (rol && lista.roleKeys.has(rol)) return 'permitir';
  return 'denegar';
}

/**
 * A dónde mandar a quien llega sin sesión: al login de la consola. El login solo acepta `next`
 * interno, así que no se manda regreso; la cookie es de `.nexara.com.mx` y al volver al NAS ya pasa.
 */
export function urlLoginNas(env: NodeJS.ProcessEnv = process.env): string {
  return (env['NAS_PORTAL_LOGIN_URL'] ?? 'https://app.nexara.com.mx/login').trim();
}
