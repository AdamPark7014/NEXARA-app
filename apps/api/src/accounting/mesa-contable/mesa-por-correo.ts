/**
 * Quién usa la Mesa contable aunque su rol no la traiga.
 *
 * La Contadora General tiene rol `administrativo`, como otras personas de oficina, y ese rol no abre
 * contabilidad. Pasarla al rol `contabilidad` le quitaba Asistencias y escribir cotizaciones, y le
 * abría los pagos a personal en la API. Adam (03-11-2026) aprobó darle la Mesa con saldos de banco y
 * Nómina sigue siendo de quien diga `rbac.module_roles`. Como el almacén de Iván
 * (`warehouse/almacen-access.ts`), va por correo: no se le cambia el rol ni se le abre a nadie más.
 *
 * Espejo en la web: `apps/web/lib/mesa-por-correo.ts`. Esta es la autoridad.
 */
export const MESA_CONTABLE_EMAILS = [
  'finanzas@nexara.com.mx', // Contador(a) General
] as const;

export function canUsarMesaContable(email: string | null | undefined): boolean {
  const e = String(email ?? '')
    .trim()
    .toLowerCase();
  return (MESA_CONTABLE_EMAILS as readonly string[]).includes(e);
}
