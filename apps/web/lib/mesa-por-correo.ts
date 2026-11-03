/**
 * Espejo cliente de `apps/api/src/accounting/mesa-contable/mesa-por-correo.ts` (la API es la autoridad).
 *
 * Mesa contable por persona, sin cambiarle el rol (Adam, 03-11-2026: acceso de la Contadora General,
 * con saldos de banco). Nómina no entra.
 */
export const MESA_CONTABLE_EMAILS = [
  "finanzas@nexara.com.mx", // Contador(a) General
] as const;

export function canUsarMesaContable(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  return (MESA_CONTABLE_EMAILS as readonly string[]).includes(e);
}

/** Lo que abre: la Mesa, sus pólizas y los bancos. El pago al personal y la auditoría, no. */
export function esRutaDeMesaPorCorreo(pathname: string): boolean {
  const limpio = String(pathname ?? "").split(/[?#]/)[0].replace(/\/+$/, "");
  if (/^\/erp\/contabilidad\/(pre-nomina|auditoria)(\/|$)/.test(limpio)) return false;
  return /^\/erp\/(contabilidad|accounting|banking)(\/|$)/.test(limpio);
}
