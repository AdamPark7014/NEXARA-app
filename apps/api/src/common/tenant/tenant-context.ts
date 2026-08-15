import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped tenant context (AsyncLocalStorage).
 * Used by Prisma middleware to fail-closed on cross-tenant reads/writes.
 */
export type TenantStore = {
  companyId: number | null;
  /** Super-admin / system jobs may bypass auto-scoping. */
  bypass?: boolean;
  /**
   * Autor de la petición, para que el middleware de auditoría pueda registrar
   * quién ejecutó cada cambio. Null en cron/seed y en tokens de portal
   * (cliente/sucursal), que no corresponden a un User.
   */
  userId?: number | null;
  /** Origen de la petición, para las columnas homónimas de AuditLog. */
  ipAddress?: string | null;
  userAgent?: string | null;
};

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantStore(): TenantStore | undefined {
  return tenantStorage.getStore();
}

/** Autor de la petición en curso, o null fuera de contexto HTTP. */
export function getRequestUserId(): number | null {
  const store = tenantStorage.getStore();
  const raw = store?.userId;
  return raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : null;
}

export function getRequestCompanyId(): number | null {
  const store = tenantStorage.getStore();
  if (!store || store.bypass) return null;
  return store.companyId != null && Number.isFinite(Number(store.companyId))
    ? Number(store.companyId)
    : null;
}

export function runWithTenant<T>(store: TenantStore, fn: () => T): T {
  return tenantStorage.run(store, fn);
}

export async function runWithTenantAsync<T>(store: TenantStore, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(store, fn);
}

/** Platform/cron paths that intentionally cross tenants. */
export function withTenantBypass<T>(fn: () => T): T {
  return tenantStorage.run({ companyId: null, bypass: true }, fn);
}

export async function withTenantBypassAsync<T>(fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ companyId: null, bypass: true }, fn);
}
