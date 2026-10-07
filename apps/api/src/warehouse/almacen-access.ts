/**
 * Quién controla el almacén aunque su rol no lo traiga.
 *
 * El almacén lo operan administración y dirección por su rol. Adam (07-10-2026) pidió darle el
 * control a Iván, que es ingeniero de campo («agrégale el control de almacén a Iván, no solo
 * herramientas»). Como con herramientas (`tool-requests/tools-access.ts`), va por correo: así no
 * se le cambia el rol ni se le abre el almacén a todo el personal de campo.
 *
 * Espejo en la web: `apps/web/lib/almacen-access.ts`. Esta es la autoridad.
 */
export const ALMACEN_MANAGE_EMAILS = [
  'administracion.ventas@nexara.com.mx', // Iván Camargo
] as const;

export function canManageAlmacen(email: string | null | undefined): boolean {
  const e = String(email ?? '')
    .trim()
    .toLowerCase();
  return (ALMACEN_MANAGE_EMAILS as readonly string[]).includes(e);
}
