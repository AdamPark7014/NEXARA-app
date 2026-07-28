import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Helpers de aislamiento multi-empresa (Enterprise hard-scope).
 * Fail-closed: sin companyId nunca se devuelve un where vacío (fuga cross-tenant).
 */

export type CompanyScopeMode = 'soft' | 'hard';

/** Sentinel that matches zero rows — used when company context is missing. */
export const TENANT_DENY_ALL: Record<string, unknown> = { companyId: -1 };

/** Cláusula Prisma where — default HARD. Sin companyId → deny-all (nunca `{}`). */
export function companyWhere(
  companyId: number | null | undefined,
  mode: CompanyScopeMode = 'hard',
): Record<string, unknown> {
  if (companyId == null || !Number.isFinite(Number(companyId)) || Number(companyId) <= 0) {
    return { ...TENANT_DENY_ALL };
  }
  const id = Number(companyId);
  if (mode === 'hard') {
    return { companyId: id };
  }
  return { OR: [{ companyId: id }, { companyId: null }] };
}

/** Exige empresa activa (API keys / rutas críticas). */
export function requireCompanyId(companyId: number | null | undefined): number {
  if (companyId == null || !Number.isFinite(Number(companyId)) || Number(companyId) <= 0) {
    throw new ForbiddenException('Empresa requerida (header X-Company-Id)');
  }
  return Number(companyId);
}

/**
 * Tras un findFirst/findUnique: si el row tiene companyId distinto al activo → 404
 * (no revelar existencia cross-tenant). Fail-closed si no hay contexto de empresa.
 */
export function assertCompanyAccess<T extends { companyId?: number | null }>(
  row: T | null | undefined,
  companyId: number | null | undefined,
  label = 'Recurso',
): asserts row is T {
  if (!row) throw new NotFoundException(`${label} no encontrado`);
  if (companyId == null || !Number.isFinite(Number(companyId)) || Number(companyId) <= 0) {
    throw new ForbiddenException('Empresa requerida (header X-Company-Id)');
  }
  if (row.companyId != null && Number(row.companyId) !== Number(companyId)) {
    throw new NotFoundException(`${label} no encontrado`);
  }
  // Legacy rows without stamp: only allowed in soft migration windows via env.
  if (row.companyId == null && process.env.TENANT_ALLOW_NULL_ROWS !== '1') {
    throw new NotFoundException(`${label} no encontrado`);
  }
}

/**
 * Resuelve companyId requerido.
 * Por defecto NO cae a empresa primaria (SaaS multi-tenant).
 * Opt-in legacy: TENANT_ALLOW_PRIMARY_FALLBACK=1
 */
export async function resolveRequiredCompanyId(
  prisma: { companyProfile: { findFirst: (args: any) => Promise<{ id: number } | null> } },
  explicit?: number | null,
): Promise<number> {
  if (explicit != null && Number.isFinite(Number(explicit)) && Number(explicit) > 0) {
    return Number(explicit);
  }

  const allowFallback =
    process.env.TENANT_ALLOW_PRIMARY_FALLBACK === '1' ||
    process.env.TENANT_ALLOW_PRIMARY_FALLBACK === 'true';

  if (!allowFallback) {
    throw new ForbiddenException('Empresa requerida (header X-Company-Id)');
  }

  const primary = await prisma.companyProfile.findFirst({
    where: { isPrimary: true, isActive: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (primary?.id) return primary.id;
  const any = await prisma.companyProfile.findFirst({
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (!any?.id) throw new ForbiddenException('No hay empresa configurada');
  return any.id;
}

/** Merge tenant filter into an existing Prisma where object. */
export function mergeCompanyWhere(
  where: Record<string, unknown> | undefined,
  companyId: number | null | undefined,
  mode: CompanyScopeMode = 'hard',
): Record<string, unknown> {
  const scope = companyWhere(companyId, mode);
  if (!where || Object.keys(where).length === 0) return scope;
  return { AND: [where, scope] };
}

/**
 * Empresa del sitio público / white-label (Studio CMS público).
 * PUBLIC_COMPANY_ID > isPrimary > first company.
 */
export async function resolvePublicCompanyId(
  prisma: { companyProfile: { findFirst: (args: any) => Promise<{ id: number } | null> } },
): Promise<number> {
  const fromEnv = Number(process.env.PUBLIC_COMPANY_ID);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  const primary = await prisma.companyProfile.findFirst({
    where: { isPrimary: true, isActive: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (primary?.id) return primary.id;
  const any = await prisma.companyProfile.findFirst({
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (!any?.id) throw new ForbiddenException('No hay empresa configurada para contenido público');
  return any.id;
}
