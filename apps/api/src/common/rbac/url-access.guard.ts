/**
 * NEXARA · RBAC v2 — Guard de URL Access
 * ---------------------------------------
 * Bloquea peticiones a la API si el rol del usuario no tiene la URL en su
 * whitelist (ver `url-matrix.ts`).
 *
 * Uso:
 *   @UseGuards(UrlAccessGuard)
 *   @Controller('viaticos')
 *   export class ViaticosController { ... }
 *
 * Coexiste con el `RbacGuard` legacy. La migración será progresiva:
 *   - Endpoints nuevos / refactorizados → `UrlAccessGuard`
 *   - Endpoints viejos                  → siguen con `@RBAC()` hasta migrar
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { checkUrlAccess } from './url-matrix';
import { LEGACY_TO_V2, type RoleKey, ROLES } from './roles.v2';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

@Injectable()
export class UrlAccessGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger('UrlAccessGuard');

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('No user in request');

    // Bypass total
    if (user.superadmin || user.isSuperAdmin || user.role === ROLES.SUPER_ADMIN) return true;

    const role = this.resolveRole(user);
    if (!role) {
      this.logger.warn(`User ${user.id} has no resolvable role (legacy=${user.roleKey})`);
      throw new ForbiddenException('Tu cuenta no tiene un rol válido. Contacta al administrador.');
    }

    const method = (req.method as HttpMethod) ?? 'GET';
    const url = req.originalUrl || req.url || '';

    const result = checkUrlAccess(role, url, method);
    // Whitelist: sin match (o deny) → Forbidden. No fallthrough a legacy.
    if (!result.allowed) {
      this.logger.warn(`[DENY] role=${role} ${method} ${url}`);
      throw new ForbiddenException(`Tu rol (${role}) no puede acceder a ${method} ${url}`);
    }
    (req as { rbac?: unknown }).rbac = {
      role,
      scope: result.scope,
      rule: result.matchedRule,
      source: 'v2',
    };
    return true;
  }

  /** Resuelve el rol v2 desde el user del JWT, soportando legacy. */
  private resolveRole(user: any): RoleKey | null {
    const validKeys = Object.values(ROLES) as string[];

    // 1) Nueva columna `roleKey` (preferida — única fuente de verdad)
    if (user.roleKey && validKeys.includes(user.roleKey)) {
      return user.roleKey as RoleKey;
    }

    // 2) Legacy bridge — métrica + warn (deuda de migración)
    let legacy: RoleKey | null = null;
    if (user.orgRoleKey && LEGACY_TO_V2[user.orgRoleKey]) {
      legacy = LEGACY_TO_V2[user.orgRoleKey];
    } else if (user.admin) {
      legacy = LEGACY_TO_V2.admin ?? null;
    } else if (user.ingeniero) {
      legacy = LEGACY_TO_V2.ingeniero ?? null;
    } else if (user.vendedor) {
      legacy = LEGACY_TO_V2.vendedor ?? null;
    }

    if (legacy) {
      this.logger.warn(
        `[RBAC_LEGACY] user=${user.id} resolved via legacy flags → ${legacy}. Migrate roleKey.`,
      );
    }
    return legacy;
  }
}
