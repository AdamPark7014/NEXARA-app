/**
 * Tenant de demostración para las tiendas de aplicaciones (Google Play / App Store).
 *
 * Toda la app vive detrás de login, así que las tiendas exigen credenciales de
 * prueba. Entregar la cuenta de un empleado real expondría al revisor los datos
 * personales de clientes y colaboradores, de modo que la cuenta —y **todo** el
 * contenido que el revisor ve— vive en su propio tenant aislado (ADR-0014).
 *
 * Aquí está el guardia, y no copiado en cada seed, porque el error que hay que
 * impedir es siempre el mismo y es irreversible: sembrar contenido ficticio
 * dentro de la empresa primaria. El id del tenant demo **no** es el mismo en
 * cada base (en producción salió 2, en otra sale otro), así que se resuelve
 * siempre por `slug` y nunca se escribe a mano.
 */

/** Slug del tenant demo. Única forma admitida de resolverlo. */
export const DEMO_COMPANY_SLUG = 'nexara-demo';

/** Lo mínimo que hay que leer de `CompanyProfile` para poder decidir. */
export type DemoTenantCandidate = {
  id?: number | null;
  slug?: string | null;
  isPrimary?: boolean | null;
};

/**
 * El sembrado se negó a escribir. Es un tipo propio para que las pruebas —y
 * quien lea el log— distingan "aborté por seguridad" de "se cayó la base".
 */
export class DemoTenantGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoTenantGuardError';
  }
}

/**
 * Devuelve el `companyId` del tenant demo, o lanza `DemoTenantGuardError`.
 *
 * Aborta —en este orden— si no hay empresa, si el id no es utilizable, si la
 * empresa está marcada como primaria, o si su slug no es el esperado. Las dos
 * últimas comprobaciones son redundantes a propósito: si alguien marcara
 * `isPrimary` sobre `nexara-demo`, o renombrara el slug de la empresa real a
 * `nexara-demo`, cualquiera de las dos sola dejaría pasar la escritura.
 */
export function assertDemoTenant(
  company: DemoTenantCandidate | null | undefined,
  expectedSlug: string = DEMO_COMPANY_SLUG,
): number {
  if (!company) {
    throw new DemoTenantGuardError(
      `No existe la empresa ${expectedSlug}. Corre primero \`npm run seed:play-reviewer\`.`,
    );
  }

  const id = Number(company.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new DemoTenantGuardError(
      `La empresa ${expectedSlug} no tiene un id utilizable (${String(company.id)}). Aborto.`,
    );
  }

  if (company.isPrimary === true) {
    throw new DemoTenantGuardError(
      `La empresa resuelta (id=${id}) está marcada como primaria. Aborto: el contenido de demostración nunca se escribe en el tenant real.`,
    );
  }

  if (company.slug !== expectedSlug) {
    throw new DemoTenantGuardError(
      `La empresa resuelta (id=${id}) tiene slug "${String(company.slug)}" y se esperaba "${expectedSlug}". Aborto.`,
    );
  }

  return id;
}
