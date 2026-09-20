/** Espejo cliente de quién puede crear préstamos (API es la autoridad). */
export const TOOLS_LOAN_CREATE_EMAILS = [
  "jose.ramirez@nexara.com.mx",
  "operaciones@nexara.com.mx",
] as const;

export function canCreateToolLoanClient(email: string | null | undefined): boolean {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  return (TOOLS_LOAN_CREATE_EMAILS as readonly string[]).includes(e);
}
