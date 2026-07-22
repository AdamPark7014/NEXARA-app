import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Helpers de aislamiento multi-empresa (Iter 8).
 * Soft-scope: incluye filas legacy con companyId null + la empresa activa.
 * Hard assert: bloquea IDOR cuando el registro ya está stampado a otra empresa.
 */

export type CompanyScopeMode = 'soft' | 'hard';

/** Cláusula Prisma where — Iter 10 default HARD (sin legacy null). */
export function companyWhere(
  companyId: number | null | undefined,
  mode: CompanyScopeMode = 'hard',
): Record<string, unknown> {
  if (companyId == null || !Number.isFinite(Number(companyId))) {
    return {};
  }
  const id = Number(companyId);
  if (mode === 'hard') {
    return { companyId: id };
  }
  return { OR: [{ companyId: id }, { companyId: null }] };
}

/** Exige empresa activa (API keys / rutas críticas). */
export function requireCompanyId(companyId: number | null | undefined): number {
  if (companyId == null || !Number.isFinite(Number(companyId))) {
    throw new ForbiddenException('Empresa requerida (header X-Company-Id)');
  }
  return Number(companyId);
}

/**
 * Tras un findFirst/findUnique: si el row tiene companyId distinto al activo → 404
 * (no revelar existencia cross-tenant).
 */
export function assertCompanyAccess(
  row: { companyId?: number | null } | null | undefined,
  companyId: number | null | undefined,
  label = 'Recurso',
): void {
  if (!row) throw new NotFoundException(`${label} no encontrado`);
  if (companyId == null) return;
  if (row.companyId != null && Number(row.companyId) !== Number(companyId)) {
    throw new NotFoundException(`${label} no encontrado`);
  }
}

/** Resuelve companyId requerido (header o primaria). */
export async function resolveRequiredCompanyId(
  prisma: { companyProfile: { findFirst: (args: any) => Promise<{ id: number } | null> } },
  explicit?: number | null,
): Promise<number> {
  if (explicit != null && Number.isFinite(Number(explicit))) return Number(explicit);
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
