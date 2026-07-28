import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped tenant context (AsyncLocalStorage).
 * Used by Prisma middleware to fail-closed on cross-tenant reads/writes.
 */
export type TenantStore = {
  companyId: number | null;
  /** Super-admin / system jobs may bypass auto-scoping. */
  bypass?: boolean;
};

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantStore(): TenantStore | undefined {
  return tenantStorage.getStore();
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
