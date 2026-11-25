/**
 * Estructura: roles y departamentos que falten. Es lo único que hace `prisma db seed`.
 * No crea ni cambia cuentas, y no modifica un rol o departamento que ya existe.
 *
 *   npx prisma db seed                  aplica
 *   npx prisma db seed -- --simular     solo enseña
 */
import { DEPARTAMENTOS_REQUERIDOS, ROLES_REQUERIDOS } from './plantilla';
import { avisarSinContrasenaPropia, correr, sembrarEstructura } from './seed-seguro';

void correr('Estructura', async (prisma, opciones) => {
  await sembrarEstructura(prisma, ROLES_REQUERIDOS, DEPARTAMENTOS_REQUERIDOS, opciones);
  await avisarSinContrasenaPropia(prisma);
});
