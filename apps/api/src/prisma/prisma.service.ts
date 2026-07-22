import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RealtimeGateway } from '../realtime/realtime.gateway';

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

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
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
          this.auditLog.create({
            data: {
              entityType: params.model,
              entityId: typeof entityId === 'number' ? entityId : 0,
              action: actionMap[params.action] || params.action,
              changes: params.args?.['data'] ?? undefined,
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
