/** Espejo cliente de apps/api tool-requests/tools-access (API es la autoridad). */

export const TOOLS_MANAGE_EMAILS = [
  "gerencia@nexara.com.mx", // Christian
  "administracion.ventas@nexara.com.mx", // Iván Camargo
] as const;

type Solicitante = { roleKey?: string | null; isSuperAdmin?: boolean | null };

/** Todo el personal pide préstamo (Adam, 04-11-2026). Dirección administra; una cuenta de cliente no es personal. */
const ROLES_SIN_PRESTAMO: ReadonlySet<string> = new Set(["ceo", "super_admin", "cliente"]);

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

export function canManageTools(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  return (TOOLS_MANAGE_EMAILS as readonly string[]).includes(e);
}

export function canCreateToolLoan(solicitante: Solicitante | null | undefined): boolean {
  if (!solicitante || solicitante.isSuperAdmin) return false;
  const rol = String(solicitante.roleKey ?? "").trim().toLowerCase();
  return rol !== "" && !ROLES_SIN_PRESTAMO.has(rol);
}
