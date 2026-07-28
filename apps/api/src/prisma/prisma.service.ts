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

function injectTenantWhere(args: any, companyId: number | null) {
  if (!args) args = {};
  if (!args.where) args.where = {};
  const scopeId = companyId != null && companyId > 0 ? companyId : -1;
  // Do not override an explicit companyId filter already set by the caller.
  if (args.where.companyId === undefined && args.where.AND === undefined) {
    args.where = { AND: [args.where, { companyId: scopeId }] };
  } else if (args.where.companyId === undefined) {
    args.where = { AND: [args.where, { companyId: scopeId }] };
  }
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

      if (READ_ACTIONS.has(params.action) || params.action === 'update' || params.action === 'updateMany' || params.action === 'delete' || params.action === 'deleteMany') {
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
