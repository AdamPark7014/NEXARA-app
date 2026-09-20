/** Quién aprueba/administra herramientas vs quién puede pedir préstamo. */
export const TOOLS_MANAGE_EMAILS = [
  'gerencia@nexara.com.mx', // Christian
  'administracion.ventas@nexara.com.mx', // Iván Camargo
] as const;

export const TOOLS_LOAN_CREATE_EMAILS = [
  'jose.ramirez@nexara.com.mx', // José Antonio
  'operaciones@nexara.com.mx', // David
] as const;

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? '')
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

export function assertCanCreateToolLoan(email: string | null | undefined): void {
  if (!canCreateToolLoan(email)) {
    throw new Error(
      'Solo José Antonio y David (quien va a sitio) pueden solicitar herramientas.',
    );
  }
}
