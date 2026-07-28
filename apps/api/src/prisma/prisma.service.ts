import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { getTenantStore } from '../common/tenant/tenant-context.js';
import { TENANT_SCOPED_MODELS } from '../common/tenant/tenant-models.js';

/** Models that support soft-delete (have deletedAt column) */
const SOFT_DELETE_MODELS = new Set<string>([
  'Activity', 'Invoice', 'PurchaseOrder',
  'MaintenanceOrder',
  'Expense', 'Viatico', 'WorkProject', 'Cotizacion', 'Asset',
]);

/** Models excluded from audit logging (high-volume or internal) */
const AUDIT_EXCLUDED = new Set<string>([
  'AuditLog', 'KpiSnapshot', 'LocationTracking', 'Notification',
  'NewsletterSubscriber', 'SystemSetting', 'UserPreference',
]);

const READ_ACTIONS = new Set([
  'findFirst', 'findMany', 'count', 'aggregate', 'groupBy',
  'findUnique', 'findUniqueOrThrow', 'findFirstOrThrow',
]);

/** True when where already constrains tenant (field or compound unique like companyId_section). */
function whereAlreadyHasCompanyScope(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const w = where as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(w, 'companyId')) return true;
  for (const [key, value] of Object.entries(w)) {
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      const parts = Array.isArray(value) ? value : [value];
      if (parts.some((part) => whereAlreadyHasCompanyScope(part))) return true;
      continue;
    }
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, 'companyId')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Inject tenant filter. Never wrap compound unique wheres in `AND` — that breaks
 * findUnique/update/delete (`Unknown argument companyId_section`).
 */
function injectTenantWhere(args: any, companyId: number | null) {
  if (!args) args = {};
  if (!args.where) args.where = {};
  const scopeId = companyId != null && companyId > 0 ? companyId : -1;
  if (whereAlreadyHasCompanyScope(args.where)) {
    return args;
  }
  const keys = Object.keys(args.where);
  // Flat merge works for findFirst/count/updateMany; findUnique is downgraded by caller.
  if (keys.length === 1 && keys[0] === 'id') {
    args.where = { ...args.where, companyId: scopeId };
    return args;
  }
  args.where = { AND: [args.where, { companyId: scopeId }] };
  return args;
}

function injectTenantData(args: any, companyId: number) {
  if (!args) args = {};
  if (args.data) {
    if (Array.isArray(args.data)) {
      args.data = args.data.map((row: any) =>
        row && row.companyId == null ? { ...row, companyId } : row,
      );
    } else if (args.data.companyId == null) {
      args.data = { ...args.data, companyId };
    }
  }
  // Prisma upsert uses create/update instead of data
  if (args.create && typeof args.create === 'object' && args.create.companyId == null) {
    args.create = { ...args.create, companyId };
  }
  return args;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly tenantLogger = new Logger('PrismaTenant');

  constructor(private readonly realtimeGateway: RealtimeGateway) {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    // ── Soft-delete middleware: convert delete → update deletedAt ──
    this.$use(async (params, next) => {
      if (params.model && SOFT_DELETE_MODELS.has(params.model)) {
        if (params.action === 'delete') {
          params.action = 'update';
          params.args['data'] = { deletedAt: new Date() };
        }
        if (params.action === 'deleteMany') {
          params.action = 'updateMany';
          if (params.args['data']) {
            params.args['data']['deletedAt'] = new Date();
          } else {
            params.args['data'] = { deletedAt: new Date() };
          }
        }
        // Auto-filter soft-deleted records on reads
        if (['findFirst', 'findMany', 'count'].includes(params.action)) {
          if (!params.args) params.args = {};
          if (!params.args['where']) params.args['where'] = {};
          if (params.args['where']['deletedAt'] === undefined) {
            params.args['where']['deletedAt'] = null;
          }
        }
        if (params.action === 'findUnique' || params.action === 'findUniqueOrThrow') {
          params.action = 'findFirst';
          if (!params.args) params.args = {};
          if (!params.args['where']) params.args['where'] = {};
          if (params.args['where']['deletedAt'] === undefined) {
            params.args['where']['deletedAt'] = null;
          }
        }
      }
      return next(params);
    });

    // ── Tenant isolation middleware (fail-closed) ──
    this.$use(async (params, next) => {
      if (!params.model || !TENANT_SCOPED_MODELS.has(params.model)) {
        return next(params);
      }

      const store = getTenantStore();
      // Outside HTTP / explicit bypass (cron, seed): do not auto-scope.
      if (!store || store.bypass) {
        return next(params);
      }

      const companyId =
        store.companyId != null && Number.isFinite(Number(store.companyId))
          ? Number(store.companyId)
          : null;

      const scopeId =
        companyId != null && companyId > 0 ? companyId : -1;
      const mutatingUnique =
        params.action === 'update' || params.action === 'delete';
      const needsWhereInject =
        READ_ACTIONS.has(params.action) ||
        mutatingUnique ||
        params.action === 'updateMany' ||
        params.action === 'deleteMany';

      if (needsWhereInject) {
        const before = params.args?.where;
        const alreadyScoped = whereAlreadyHasCompanyScope(before);

        // findUnique + AND/extra fields is invalid — downgrade when we must inject.
        if (
          !alreadyScoped &&
          (params.action === 'findUnique' || params.action === 'findUniqueOrThrow')
        ) {
          params.action =
            params.action === 'findUniqueOrThrow' ? 'findFirstOrThrow' : 'findFirst';
        }

        // update/delete require WhereUniqueInput — cannot add companyId/AND.
        // Use *Many with id+companyId, then re-fetch the row for update callers.
        if (
          !alreadyScoped &&
          mutatingUnique &&
          before &&
          typeof before === 'object' &&
          Object.keys(before).length === 1 &&
          Object.prototype.hasOwnProperty.call(before, 'id')
        ) {
          const id = (before as { id: number | string }).id;
          const data = params.args?.data;
          if (params.action === 'update') {
            const many = await next({
              ...params,
              action: 'updateMany',
              args: { where: { id, companyId: scopeId }, data },
            });
            if (!many || many.count === 0) return null;
            return next({
              ...params,
              action: 'findFirst',
              args: { where: { id, companyId: scopeId } },
            });
          }
          return next({
            ...params,
            action: 'deleteMany',
            args: { where: { id, companyId: scopeId } },
          });
        }

        params.args = injectTenantWhere(params.args, companyId);
      }

      if ((params.action === 'create' || params.action === 'createMany' || params.action === 'upsert') && companyId != null && companyId > 0) {
        params.args = injectTenantData(params.args, companyId);
      }

      if (companyId == null && process.env.NODE_ENV !== 'production') {
        this.tenantLogger.debug(
          `Tenant deny-all applied to ${params.model}.${params.action} (no company context)`,
        );
      }

      return next(params);
    });

    // ── Realtime + Audit middleware ──
    this.$use(async (params, next) => {
      const result = await next(params);

      const writeActions = new Set([
        'create', 'update', 'delete', 'upsert',
        'createMany', 'updateMany', 'deleteMany',
      ]);

      if (params.model && writeActions.has(params.action)) {
        // Realtime broadcast
        this.realtimeGateway.emit('entity:updated', {
          model: params.model,
          action: params.action,
          timestamp: new Date().toISOString(),
        });

        // Audit log (best-effort, async, non-blocking)
        if (!AUDIT_EXCLUDED.has(params.model)) {
          const entityId = result?.id ?? 0;
          const actionMap: Record<string, string> = {
            create: 'CREATE', update: 'UPDATE', delete: 'DELETE',
            upsert: 'UPSERT', createMany: 'BULK_CREATE',
            updateMany: 'BULK_UPDATE', deleteMany: 'BULK_DELETE',
          };
          const store = getTenantStore();
          this.auditLog.create({
            data: {
              entityType: params.model,
              entityId: typeof entityId === 'number' ? entityId : 0,
              action: actionMap[params.action] || params.action,
              changes: params.args?.['data'] ?? undefined,
              companyId: store?.companyId && store.companyId > 0 ? store.companyId : undefined,
            },
          }).catch(() => {/* swallow audit failures */});
        }
      }

      return result;
    });
  }

  async onModuleInit() {
    await this['$connect']();
  }

  async onModuleDestroy() {
    await this['$disconnect']();
  }
}
