/**
 * Quién usa «Asignar con IA»: todo mando con gente a cargo (Adam, 02-11-2026), más las cuentas de
 * dirección, que alcanzan a toda la empresa.
 *
 * Sale de la jerarquía real y no de una lista de nombres: el organigrama (`managerId`) y el flujo de
 * despacho que no cuelga de él (`extrasDeAsignacion`; Luis pasa a José Antonio). Un mando nuevo entra
 * solo y quien se queda sin gente sale. A quién puede asignar cada uno ya lo decide `asignablesDe`.
 *
 * Es la única autoridad: la web pregunta a `GET ai/asistente/estado` y no repite la regla.
 */
import { isCeoEquivalentEmail, isDeveloperSuperAdminEmail } from '../../common/platform-accounts.js';
import { extrasDeAsignacion } from '../../me/equipo-alcance.js';

/** Lo único que hace falta de Prisma; así la regla se prueba sin base. */
export type ConteoDePersonas = {
  user: { count(args: { where: Record<string, unknown> }): Promise<number> };
};

export async function puedeAsignarConIa(
  prisma: ConteoDePersonas,
  actor: { id?: number | string | null; email?: string | null } | null | undefined,
): Promise<boolean> {
  if (!actor) return false;
  if (isCeoEquivalentEmail(actor.email) || isDeveloperSuperAdminEmail(actor.email)) return true;
  const id = Number(actor.id);
  if (!Number.isInteger(id) || id <= 0) return false;
  const extras = extrasDeAsignacion(actor.email);
  const aCargo = await prisma.user.count({
    where: {
      isActive: true,
      id: { not: id },
      OR: [{ managerId: id }, ...(extras.length ? [{ email: { in: extras } }] : [])],
    },
  });
  return aCargo > 0;
}
