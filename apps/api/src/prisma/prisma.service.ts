import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuditBuffer } from './audit-buffer.js';
import { getTenantStore } from '../common/tenant/tenant-context.js';
import { TENANT_SCOPED_MODELS } from '../common/tenant/tenant-models.js';
import { applyCap, probeTake, resolveRowCap, shouldCap } from './row-cap.js';

/** Models that support soft-delete (have deletedAt column) */
const SOFT_DELETE_MODELS = new Set<string>([
  'Activity', 'Invoice', 'PurchaseOrder',
  'MaintenanceOrder',
  'Expense', 'Viatico', 'WorkProject', 'Cotizacion', 'Asset',
  // Proyectos de campo: eliminar los oculta; sus actividades conservan el historial.
  'OperationalProject',
]);

/** Models excluded from audit logging (high-volume or internal) */
const AUDIT_EXCLUDED = new Set<string>([
  'AuditLog', 'KpiSnapshot', 'LocationTracking', 'Notification',
  'NewsletterSubscriber', 'SystemSetting', 'UserPreference',
]);

/**
 * Claves que nunca deben quedar registradas en AuditLog.changes. Sin esto, un
 * `user.update({ data: { password } })` deja el hash en una tabla que consultan
 * los visores de auditoría.
 */
const AUDIT_REDACTED_KEYS = [
  'password', 'passwordhash', 'newpassword', 'currentpassword', 'confirmpassword',
  'token', 'accesstoken', 'refreshtoken', 'resettoken', 'apikey', 'apikeyhash',
  'secret', 'clientsecret', 'privatekey', 'twofactorsecret', 'otp', 'pin',
  'authorization', 'cookie', 'sessiontoken', 'vapidprivatekey', 'webhooksecret',
];

const REDACTED_PLACEHOLDER = '[redacted]';

export function redactAuditPayload(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditPayload(item, depth + 1));
  }
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    out[key] = AUDIT_REDACTED_KEYS.includes(normalizedKey)
      ? REDACTED_PLACEHOLDER
      : redactAuditPayload(item, depth + 1);
  }
  return out;
}

/** Acciones que afectan a N filas y no devuelven un `id`. */
const BULK_ACTIONS = new Set(['createMany', 'updateMany', 'deleteMany']);

/**
 * Construye el campo `changes` de AuditLog, ya redactado.
 *
 * En operaciones masivas no hay `id` que registrar, así que se guardan también
 * el filtro aplicado y el número de filas afectadas; de otro modo la entrada
 * diría que hubo un BULK_UPDATE sin permitir saber sobre qué.
 */
export function buildAuditChanges(
  action: string,
  args: { data?: unknown; where?: unknown } | undefined,
  result: unknown,
): unknown {
  if (!BULK_ACTIONS.has(action)) {
    return redactAuditPayload(args?.data) ?? undefined;
  }

  const count = (result as { count?: unknown } | null | undefined)?.count;
  return {
    data: redactAuditPayload(args?.data) ?? null,
    where: redactAuditPayload(args?.where) ?? null,
    affected: typeof count === 'number' ? count : null,
  };
}

const READ_ACTIONS = new Set([
  'findFirst', 'findMany', 'count', 'aggregate', 'groupBy',
  'findUnique', 'findUniqueOrThrow', 'findFirstOrThrow',
]);

/**
 * True when `where` already constrains the tenant on the model being queried:
 * either a top-level `companyId`, or a compound-unique key that includes
 * `companyId` as one of its segments (`companyId_section`, `userId_companyId`…).
 *
 * Deliberately does NOT treat a nested relation filter as tenant scope: a where
 * like `{ client: { companyId: 5 } }` constrains the *relation*, not this model,
 * so accepting it would skip scoping and expose rows from other tenants.
 */
export function whereAlreadyHasCompanyScope(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const w = where as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(w, 'companyId')) return true;
  for (const [key, value] of Object.entries(w)) {
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      const parts = Array.isArray(value) ? value : [value];
      if (parts.some((part) => whereAlreadyHasCompanyScope(part))) return true;
      continue;
    }
    // Compound unique (`@@unique([companyId, section])` → `companyId_section`).
    if (
      key.split('_').includes('companyId') &&
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
 * Selector de llave única compuesta de Prisma: `activityId_userId: { activityId, userId }`.
 * Solo existe en `WhereUnique` (findUnique/update/upsert/delete). Dentro de un `AND`,
 * o en un findFirst, Prisma responde `Unknown argument`.
 */
export function readCompoundUniqueSelector(
  where: unknown,
): { key: string; value: Record<string, unknown> } | null {
  if (!where || typeof where !== 'object' || Array.isArray(where)) return null;
  const keys = Object.keys(where as object);
  if (keys.length !== 1) return null;
  const key = keys[0];
  if (!key.includes('_')) return null;
  const raw = (where as Record<string, unknown>)[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw instanceof Date) return null;
  const value = raw as Record<string, unknown>;
  const segments = key.split('_').filter((segment) => segment.length > 0);
  if (segments.length < 2 || segments.length !== Object.keys(value).length) return null;
  if (!segments.every((segment) => Object.prototype.hasOwnProperty.call(value, segment))) return null;
  if (!Object.values(value).every(isCompoundUniqueScalar)) return null;
  return { key, value };
}

function isCompoundUniqueScalar(value: unknown): boolean {
  if (value == null) return true;
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint') return true;
  if (value instanceof Date) return true;
  if (kind === 'object') {
    const name = (value as { constructor?: { name?: string } }).constructor?.name;
    // Prisma.Decimal (y objetos numéricos equivalentes) viajan en llaves compuestas de fecha/importe.
    if (name === 'Decimal' || name === 'PrismaDecimal') return true;
  }
  return false;
}

function tenantScopeId(companyId: number | null): number {
  return companyId != null && Number.isFinite(companyId) && companyId > 0 ? companyId : -1;
}

/** Quita selectores `campo_campo` que no llevan companyId: en un filtro normal no existen. */
function expandCompoundUniqueInFilter(where: unknown): unknown {
  if (!where || typeof where !== 'object') return where;
  if (Array.isArray(where)) return where.map((part) => expandCompoundUniqueInFilter(part));
  const compound = readCompoundUniqueSelector(where);
  if (compound && !Object.prototype.hasOwnProperty.call(compound.value, 'companyId')) {
    return { ...compound.value };
  }
  const record = where as Record<string, unknown>;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if ((key === 'AND' || key === 'OR' || key === 'NOT') && value && typeof value === 'object') {
      const next = expandCompoundUniqueInFilter(value);
      out[key] = next;
      changed = changed || next !== value;
    } else {
      out[key] = value;
    }
  }
  return changed ? out : where;
}

/**
 * Inject tenant filter. Never wrap compound unique wheres in `AND` — that breaks
 * findUnique/update/delete (`Unknown argument companyId_section` / `activityId_userId`).
 */
function injectTenantWhere(args: any, companyId: number | null) {
  if (!args) args = {};
  if (!args.where) args.where = {};
  args.where = expandCompoundUniqueInFilter(args.where);
  const scopeId = tenantScopeId(companyId);
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

export type TenantQueryPlan =
  | { type: 'query'; action: string; args: any }
  | { type: 'updateThenRead'; where: Record<string, unknown>; data: unknown; read: any }
  | { type: 'deleteMany'; where: Record<string, unknown> }
  | {
      type: 'upsert';
      lookup: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      select?: unknown;
      include?: unknown;
    };

function readShape(args: any): { select?: unknown; include?: unknown } {
  const shape: { select?: unknown; include?: unknown } = {};
  if (args?.select) shape.select = args.select;
  if (args?.include) shape.include = args.include;
  return shape;
}

function stampCompoundCompany(
  selector: { key: string; value: Record<string, unknown> },
  companyId: number,
) {
  return { [selector.key]: { ...selector.value, companyId } };
}

/**
 * Reescribe findUnique/update/upsert/delete de un modelo aislado para que la
 * llave única compuesta sobreviva al `companyId`.
 *
 * `activityId_userId` no admite un `AND` al lado. Si la llave no incluye
 * `companyId`, se aplana a columnas (`activityId`, `userId`) y la lectura pasa
 * a findFirst; update/delete/upsert se hacen por esas columnas más la empresa.
 * Si la llave ya trae `companyId` (`companyId_section`), se deja única y se
 * fuerza la empresa del request.
 */
export function planTenantQuery(action: string, args: any, companyId: number | null): TenantQueryPlan {
  const scopeId = tenantScopeId(companyId);
  const safeArgs = args ?? {};
  const compound = readCompoundUniqueSelector(safeArgs.where);
  const compoundHasCompany =
    !!compound && Object.prototype.hasOwnProperty.call(compound.value, 'companyId');

  if (compound && compoundHasCompany) {
    return {
      type: 'query',
      action,
      args: { ...safeArgs, where: stampCompoundCompany(compound, scopeId) },
    };
  }

  if (compound) {
    const filter = { ...compound.value, companyId: scopeId };
    if (action === 'findUnique' || action === 'findUniqueOrThrow') {
      return {
        type: 'query',
        action: action === 'findUniqueOrThrow' ? 'findFirstOrThrow' : 'findFirst',
        args: { ...safeArgs, where: filter },
      };
    }
    if (action === 'update') {
      return {
        type: 'updateThenRead',
        where: filter,
        data: safeArgs.data,
        read: { where: filter, ...readShape(safeArgs) },
      };
    }
    if (action === 'delete') {
      return { type: 'deleteMany', where: filter };
    }
    if (action === 'upsert') {
      const create = { ...(safeArgs.create ?? {}) } as Record<string, unknown>;
      // La empresa del request gana: un create con companyId ajeno no se cuela.
      create.companyId = scopeId;
      return {
        type: 'upsert',
        lookup: filter,
        create,
        update: { ...(safeArgs.update ?? {}) } as Record<string, unknown>,
        ...readShape(safeArgs),
      };
    }
    return {
      type: 'query',
      action,
      args: injectTenantWhere({ ...safeArgs, where: { ...compound.value } }, companyId),
    };
  }

  const needsWhere =
    READ_ACTIONS.has(action) ||
    action === 'update' ||
    action === 'delete' ||
    action === 'updateMany' ||
    action === 'deleteMany';
  if (!needsWhere) {
    return { type: 'query', action, args: safeArgs };
  }

  const already = whereAlreadyHasCompanyScope(safeArgs.where);
  const idOnly =
    !!safeArgs.where &&
    typeof safeArgs.where === 'object' &&
    !Array.isArray(safeArgs.where) &&
    Object.keys(safeArgs.where).length === 1 &&
    Object.prototype.hasOwnProperty.call(safeArgs.where, 'id');

  if (!already && (action === 'findUnique' || action === 'findUniqueOrThrow')) {
    return {
      type: 'query',
      action: action === 'findUniqueOrThrow' ? 'findFirstOrThrow' : 'findFirst',
      args: injectTenantWhere(safeArgs, companyId),
    };
  }

  if (!already && idOnly && (action === 'update' || action === 'delete')) {
    const scoped = { id: (safeArgs.where as { id: unknown }).id, companyId: scopeId };
    if (action === 'delete') return { type: 'deleteMany', where: scoped };
    return {
      type: 'updateThenRead',
      where: scoped,
      data: safeArgs.data,
      read: { where: scoped, ...readShape(safeArgs) },
    };
  }

  if (!already) {
    return { type: 'query', action, args: injectTenantWhere(safeArgs, companyId) };
  }

  return { type: 'query', action, args: safeArgs };
}

/**
 * Aplica el plan de aislamiento y ejecuta contra `next` (el resto de la cadena
 * de middleware). Es lo que corre el middleware de tenant: los tests lo usan
 * igual, sin levantar Prisma.
 */
export async function runWithTenantScope(
  params: { model?: string; action: string; args?: any },
  companyId: number | null,
  next: (params: { model?: string; action: string; args?: any }) => Promise<any>,
): Promise<any> {
  const plan = planTenantQuery(params.action, params.args, companyId);
  const scopeId = tenantScopeId(companyId);
  const forward = (action: string, args: any) => next({ ...params, action, args });

  if (plan.type === 'updateThenRead') {
    const many = await forward('updateMany', { where: plan.where, data: plan.data });
    if (!many || many.count === 0) return null;
    return forward('findFirst', plan.read);
  }

  if (plan.type === 'deleteMany') {
    return forward('deleteMany', { where: plan.where });
  }

  if (plan.type === 'upsert') {
    const existing = await forward('findFirst', { where: plan.lookup, select: { id: true } });
    if (existing?.id != null) {
      const data = plan.update ?? {};
      if (Object.keys(data).length > 0) {
        const many = await forward('updateMany', {
          where: { id: existing.id, companyId: plan.lookup.companyId ?? scopeId },
          data,
        });
        if (!many || many.count === 0) return null;
      }
      return forward('findFirst', {
        where: { id: existing.id, companyId: plan.lookup.companyId ?? scopeId },
        ...(plan.select ? { select: plan.select } : {}),
        ...(plan.include ? { include: plan.include } : {}),
      });
    }
    return forward('create', {
      data: plan.create,
      ...(plan.select ? { select: plan.select } : {}),
      ...(plan.include ? { include: plan.include } : {}),
    });
  }

  let args = plan.args;
  if (
    (plan.action === 'create' || plan.action === 'createMany' || plan.action === 'upsert') &&
    companyId != null &&
    companyId > 0
  ) {
    args = injectTenantData(args, companyId);
  }
  return forward(plan.action, args);
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

/** Entrada de auditoría pendiente de volcar. */
type PendingAuditEntry = {
  entityType: string;
  entityId: number;
  action: string;
  changes?: unknown;
  companyId?: number;
  userId?: number;
  ipAddress?: string;
  userAgent?: string;
};

const AUDIT_FLUSH_INTERVAL_MS = Number(process.env['AUDIT_FLUSH_INTERVAL_MS']) > 0
  ? Number(process.env['AUDIT_FLUSH_INTERVAL_MS'])
  : 1_000;

const AUDIT_FLUSH_MAX_BUFFER = Number(process.env['AUDIT_FLUSH_MAX_BUFFER']) > 0
  ? Number(process.env['AUDIT_FLUSH_MAX_BUFFER'])
  : 200;

/** Tope duro del buffer: ante una tormenta de escrituras se descartan las más
 *  antiguas antes que dejar crecer la memoria sin límite. */
const AUDIT_BUFFER_HARD_LIMIT = AUDIT_FLUSH_MAX_BUFFER * 20;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly tenantLogger = new Logger('PrismaTenant');
  private readonly auditLogger = new Logger('PrismaAudit');
  private readonly capLogger = new Logger('PrismaRowCap');
  private readonly rowCap = resolveRowCap();

  /**
   * Buffer de auditoría. Antes se emitía un INSERT por cada escritura, lo que
   * duplicaba el volumen de escritura del ERP; ahora se agrupan en `createMany`
   * por intervalo o por tamaño, y se vuelcan también al apagar.
   */
  private readonly auditBuffer = new AuditBuffer<PendingAuditEntry>({
    maxBuffer: AUDIT_FLUSH_MAX_BUFFER,
    intervalMs: AUDIT_FLUSH_INTERVAL_MS,
    hardLimit: AUDIT_BUFFER_HARD_LIMIT,
    flush: async (batch) => {
      await this.auditLog.createMany({
        data: batch.map((entry) => ({
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          changes: entry.changes as any,
          companyId: entry.companyId,
          userId: entry.userId,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        })),
      });
    },
    onDrop: (total) => {
      if (total % 500 === 1) {
        this.auditLogger.warn(`Buffer de auditoría saturado; se descartaron ${total} entradas`);
      }
    },
    onError: (error, size) => {
      // La auditoría siempre fue best-effort; un fallo aquí no debe tumbar la
      // petición que la originó, pero sí debe quedar registrado.
      this.auditLogger.warn(
        `No se pudo volcar un lote de ${size} entradas de auditoría: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  });

  constructor(private readonly realtimeGateway: RealtimeGateway) {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    // ── Tope de filas para `findMany` sin `take` ──────────────────
    // Va el primero para que el `take` viaje ya puesto por el resto de la
    // cadena. Ver `row-cap.ts` para el porqué del tope y del aviso.
    this.$use(async (params, next) => {
      if (!shouldCap(params.action, params.args)) return next(params);

      const cap = this.rowCap;
      params.args = { ...(params.args ?? {}), take: probeTake(cap) };
      const resultado = await next(params);
      if (!Array.isArray(resultado)) return resultado;

      const { rows, truncated } = applyCap(resultado, cap);
      if (truncated) {
        // Recortar en silencio daría respuestas incompletas que nadie sabría
        // interpretar. Este modelo es el que necesita paginación de verdad.
        this.capLogger.warn(
          `Consulta sin paginar recortada al tope de ${cap} filas: ` +
            `modelo=${params.model ?? 'desconocido'}. Necesita paginación.`,
        );
      }
      return rows;
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

      if (companyId == null && process.env.NODE_ENV !== 'production') {
        this.tenantLogger.debug(
          `Tenant deny-all applied to ${params.model}.${params.action} (no company context)`,
        );
      }

      return runWithTenantScope(params, companyId, (planned) =>
        next({ ...params, action: planned.action as typeof params.action, args: planned.args }),
      );
    });

    // ── Realtime + Audit middleware ──
    this.$use(async (params, next) => {
      const result = await next(params);

      const writeActions = new Set([
        'create', 'update', 'delete', 'upsert',
        'createMany', 'updateMany', 'deleteMany',
      ]);

      if (params.model && writeActions.has(params.action)) {
        const store = getTenantStore();
        const broadcastCompanyId =
          store?.companyId && store.companyId > 0 ? store.companyId : null;

        // Realtime broadcast. Acotado a la empresa cuando hay contexto de
        // tenant: un `emit` global filtraría a cada cliente conectado la
        // actividad de escritura de todas las demás empresas, y además obliga
        // a todos los paneles a refrescar ante cualquier escritura ajena.
        const payload = {
          model: params.model,
          action: params.action,
          timestamp: new Date().toISOString(),
        };
        // El volcado de auditoría es una escritura que genera este mismo
        // middleware; difundirla es ruido puro (ningún cliente la escucha) y
        // realimenta el tráfico de sockets.
        if (params.model === 'AuditLog') {
          return result;
        }
        if (broadcastCompanyId) {
          this.realtimeGateway.emitToCompany(broadcastCompanyId, 'entity:updated', payload);
        } else {
          // Sin contexto de tenant (cron, seed, arranque) no hay sala a la que
          // acotar; se mantiene la difusión global de solo metadatos.
          this.realtimeGateway.emit('entity:updated', payload);
        }

        // Audit log (best-effort, async, non-blocking)
        if (!AUDIT_EXCLUDED.has(params.model)) {
          const entityId = result?.id ?? 0;
          const actionMap: Record<string, string> = {
            create: 'CREATE', update: 'UPDATE', delete: 'DELETE',
            upsert: 'UPSERT', createMany: 'BULK_CREATE',
            updateMany: 'BULK_UPDATE', deleteMany: 'BULK_DELETE',
          };

          const changes = buildAuditChanges(params.action, params.args, result);

          this.auditBuffer.add({
            entityType: params.model,
            entityId: typeof entityId === 'number' ? entityId : 0,
            action: actionMap[params.action] || params.action,
            changes,
            companyId: broadcastCompanyId ?? undefined,
            // Sin autor, el registro de auditoría dice qué cambió pero no quién.
            userId: store?.userId != null && store.userId > 0 ? store.userId : undefined,
            ipAddress: store?.ipAddress ?? undefined,
            userAgent: store?.userAgent ?? undefined,
          });
        }
      }

      return result;
    });
  }

  async onModuleInit() {
    await this['$connect']();
  }

  async onModuleDestroy() {
    // Volcar antes de cerrar la conexión: si no, el último lote se pierde.
    await this.auditBuffer.flush();
    await this['$disconnect']();
  }
}
