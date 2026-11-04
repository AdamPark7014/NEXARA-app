import { Injectable, ExecutionContext, ForbiddenException, Logger, Optional } from '@nestjs/common';
import { PERMISSIONS } from './permissions';
import { ModuleRef, Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import {
  ALMACEN_POR_CORREO_URL_RULES,
  ASISTENTE_IA_URL_RULES,
  HERRAMIENTAS_POR_CORREO_URL_RULES,
  MESA_CONTABLE_POR_CORREO_URL_RULES,
  checkUrlAccess,
  checkUrlRules,
} from './rbac/url-matrix.js';
import { canManageAlmacen } from '../warehouse/almacen-access.js';
import { canManageTools } from '../tool-requests/tools-access.js';
import { puedeAsignarConIa } from '../ai/asistente/quien-asigna.js';
import { canUsarMesaContable } from '../accounting/mesa-contable/mesa-por-correo.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LEGACY_TO_V2, ROLES, type RoleKey } from './rbac/roles.v2.js';

export interface RbacOptions {
  permissions?: string[];
  anyPermissions?: string[];
  sameDepartment?: boolean;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * RbacGuard híbrido — combina RBAC v2 (url-matrix.ts) con el modelo legacy
 * basado en flags `acceso*` y permisos.
 *
 * Estrategia:
 *   1. Super admin → bypass total.
 *   2. Si user tiene `roleKey` v2:
 *      - url-matrix deny / sin match → Forbidden (deny-by-default)
 *      - allow → AÚN debe satisfacer `@RBAC()` (AND, no bypass)
 *   3. Si user NO tiene `roleKey` v2 → solo modelo legacy (`@RBAC`).
 */
@Injectable()
export class RbacGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger('RbacGuard');

  constructor(
    private reflector: Reflector,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {
    super();
  }

  /** Sin inyectar Prisma: este guardia vive en más de cien módulos que no lo importan. */
  private async tieneGenteACargo(user: { id?: number; email?: string | null }): Promise<boolean> {
    try {
      const prisma = this.moduleRef?.get(PrismaService, { strict: false });
      return prisma ? await puedeAsignarConIa(prisma as never, user) : false;
    } catch (error) {
      this.logger.warn(`No se pudo revisar la gente a cargo: ${String(error)}`);
      return false;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;
    const request = context.switchToHttp().getRequest();
    const rbac: RbacOptions = this.reflector.get<RbacOptions>('rbac', context.getHandler()) || {};
    const user = request.user;
    if (!user) throw new ForbiddenException('No user in request');

    // 1) Superadmin bypass
    if (user.superadmin || user.isSuperAdmin || user.role === ROLES.SUPER_ADMIN) {
      return true;
    }

    // 2) Modelo RBAC v2 — whitelist + AND con @RBAC.
    const v2Role = this.resolveV2Role(user);
    let matrixAllowed = false;
    if (v2Role) {
      const method = (request.method as HttpMethod) ?? 'GET';
      const url = request.originalUrl || request.url || '';
      let result = checkUrlAccess(v2Role, url, method);
      // «Asignar con IA» es de todo mando con gente a cargo, tenga el rol que tenga. Solo se pregunta
      // a la base por estas rutas y cuando la matriz ya dijo que no.
      if (!result.allowed) {
        const delAsistente = checkUrlRules(ASISTENTE_IA_URL_RULES, url, method);
        if (delAsistente.allowed && (await this.tieneGenteACargo(user))) result = delAsistente;
      }
      // Mesa contable concedida por persona (Contadora General): sin cambiarle el rol.
      if (!result.allowed && canUsarMesaContable(user.email)) {
        result = checkUrlRules(MESA_CONTABLE_POR_CORREO_URL_RULES, url, method);
      }
      // Almacén y herramientas concedidos por persona (Iván), sin cambiarle el rol. `UrlAccessGuard` ya
      // lo dejaba pasar, pero las rutas que escriben también pasan por aquí y le contestaban 403.
      if (!result.allowed && canManageAlmacen(user.email)) {
        result = checkUrlRules(ALMACEN_POR_CORREO_URL_RULES, url, method);
      }
      if (!result.allowed && canManageTools(user.email)) {
        result = checkUrlRules(HERRAMIENTAS_POR_CORREO_URL_RULES, url, method);
      }
      if (!result.allowed) {
        this.logger.warn(`[v2 DENY] role=${v2Role} ${method} ${url}`);
        throw new ForbiddenException(`Tu rol (${v2Role}) no puede acceder a ${method} ${url}`);
      }
      matrixAllowed = true;
      (request as { rbac?: unknown }).rbac = {
        role: v2Role,
        scope: result.scope,
        rule: result.matchedRule,
        source: 'v2',
      };
      // No early-return: keep evaluating decorator permissions below.
    }

    // Fail-closed: si el rol no se puede resolver contra la matriz v2 y el
    // endpoint tampoco declara @RBAC, no queda ninguna comprobación efectiva.
    //
    // Es el caso de un rol creado a mano cuya clave no existe en ROLES: la
    // matriz se salta entera y el usuario alcanzaba endpoints que para los
    // roles conocidos están denegados. Los 8 roles reales resuelven bien, así
    // que esto no afecta a nadie hoy; cierra el agujero para los que se creen.
    if (!v2Role && !rbac.permissions?.length && !rbac.anyPermissions?.length) {
      this.logger.warn(
        `[RBAC_DENY] usuario=${user.id} rol sin clave reconocida (roleKey=${user.roleKey ?? 'ninguna'}, ` +
          `orgRoleKey=${user.orgRoleKey ?? 'ninguna'}) en ${request.method} ${request.originalUrl || request.url}`,
      );
      throw new ForbiddenException(
        'Tu rol no tiene una plantilla de permisos válida. Pide a un administrador que lo reasigne.',
      );
    }

    // 3) Permisos del decorator @RBAC — siempre se evalúan si existen.
    const permissions: string[] = user.permissions || [];
    const isConsoleAdmin = Boolean(
      user.admin ||
      user.roleFlags?.accesoConsoleAdmin ||
      permissions.includes(PERMISSIONS.CONSOLE_ADMIN),
    );
    const isSalesUser = Boolean(
      user.vendedor ||
      user.roleFlags?.accesoPanelVentas ||
      permissions.includes(PERMISSIONS.PANEL_VENTAS),
    );
    const isConsoleUser = Boolean(
      user.ingeniero ||
      user.roleFlags?.accesoConsole ||
      permissions.includes(PERMISSIONS.CONSOLE_ACCESS),
    );

    if (rbac.permissions || rbac.anyPermissions) {
      if (rbac.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) && !isConsoleAdmin) {
        throw new ForbiddenException('Solo administradores pueden acceder');
      }
      if (rbac.permissions?.includes(PERMISSIONS.PANEL_VENTAS) && !isSalesUser) {
        throw new ForbiddenException('Solo vendedores pueden acceder');
      }
      if (rbac.permissions?.includes(PERMISSIONS.CONSOLE_ACCESS) && !isConsoleUser) {
        throw new ForbiddenException('Solo ingenieros pueden acceder');
      }
    }
    if (rbac.permissions && rbac.permissions.length > 0) {
      const hasAll = rbac.permissions.every((permission) => permissions.includes(permission));
      if (!hasAll) throw new ForbiddenException('No tienes permisos para esta acción');
    }
    if (rbac.anyPermissions && rbac.anyPermissions.length > 0) {
      const hasAny = rbac.anyPermissions.some((permission) => permissions.includes(permission));
      if (!hasAny) throw new ForbiddenException('No tienes permisos para esta acción');
    }
    if (rbac.sameDepartment && request.body && request.body.departamentoId) {
      if (user.departmentId !== request.body.departamentoId) {
        throw new ForbiddenException('Solo puedes gestionar tu propio departamento');
      }
    }
    if (!matrixAllowed) {
      (request as { rbac?: unknown }).rbac = { source: 'legacy' };
    }
    return true;
  }

  /** Resuelve el rol v2 desde el user del JWT — preferir `roleKey`, warn en legacy. */
  private resolveV2Role(user: any): RoleKey | null {
    const validKeys = Object.values(ROLES) as string[];
    if (user.roleKey && validKeys.includes(user.roleKey)) {
      return user.roleKey as RoleKey;
    }

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

// Decorator for easy usage
import { SetMetadata } from '@nestjs/common';
export const RBAC = (options: RbacOptions) => SetMetadata('rbac', options);
