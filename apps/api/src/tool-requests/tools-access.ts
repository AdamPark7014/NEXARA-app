import { ForbiddenException } from '@nestjs/common';

/**
 * Quién aprueba y administra herramientas, y quién puede pedir préstamo.
 *
 * Adam (04-11-2026): «la gente debe poder pues solamente solicitar prestamos [...] usuarios que sean de
 * todo tipo excepto CEO». Antes solo podían José Antonio y David, por correo.
 */
export const TOOLS_MANAGE_EMAILS = [
  'gerencia@nexara.com.mx', // Christian
  'administracion.ventas@nexara.com.mx', // Iván Camargo
] as const;

type Solicitante = { roleKey?: string | null; isSuperAdmin?: boolean | null };

/** Dirección administra, no pide; una cuenta de cliente no es personal. */
const ROLES_SIN_PRESTAMO: ReadonlySet<string> = new Set(['ceo', 'super_admin', 'cliente']);

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

export function canManageTools(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  return (TOOLS_MANAGE_EMAILS as readonly string[]).includes(e);
}

export function canCreateToolLoan(solicitante: Solicitante | null | undefined): boolean {
  if (!solicitante || solicitante.isSuperAdmin) return false;
  const rol = String(solicitante.roleKey ?? '').trim().toLowerCase();
  return rol !== '' && !ROLES_SIN_PRESTAMO.has(rol);
}

export function assertCanCreateToolLoan(solicitante: Solicitante | null | undefined): void {
  if (!canCreateToolLoan(solicitante)) {
    throw new ForbiddenException('Dirección no pide herramientas prestadas: las administra.');
  }
}

export function assertCanManageTools(email: string | null | undefined): void {
  if (!canManageTools(email)) {
    throw new ForbiddenException('Solo Christian e Iván pueden aprobar o administrar herramientas.');
  }
}

export function hasToolsManageAccess(email: string | null | undefined, permissions?: string[]): boolean {
  return canManageTools(email) || (permissions ?? []).includes('tools.manage');
}