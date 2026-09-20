/** Espejo cliente de apps/api tool-requests/tools-access (API es la autoridad). */

export const TOOLS_MANAGE_EMAILS = [
  "gerencia@nexara.com.mx", // Christian
  "administracion.ventas@nexara.com.mx", // Iván Camargo
] as const;

export const TOOLS_LOAN_CREATE_EMAILS = [
  "jose.ramirez@nexara.com.mx", // José Antonio
  "operaciones@nexara.com.mx", // David
] as const;

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

export function canManageTools(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  return (TOOLS_MANAGE_EMAILS as readonly string[]).includes(e);
}

export function canCreateToolLoan(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  return (TOOLS_LOAN_CREATE_EMAILS as readonly string[]).includes(e);
}

/** Alias legacy — prefer canCreateToolLoan. */
export function canCreateToolLoanClient(email: string | null | undefined): boolean {
  return canCreateToolLoan(email);
}
