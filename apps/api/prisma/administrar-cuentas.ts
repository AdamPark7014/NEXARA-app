/**
 * Cambios explícitos a cuentas que ya existen. Nunca lo llama `prisma db seed` ni el despliegue.
 *
 *   npm run cuentas:administrar -- alinear --simular
 *   npm run cuentas:administrar -- retirar --solo=correo
 *   npm run cuentas:administrar -- contrasena-inicial --solo=correo
 *
 * La lista de cuentas sale de SEED_PLANTILLA. Qué hace cada una y qué no: `administrarCuentas` en seed-seguro.ts. En una base en uso pide
 * SEED_AUTORIZAR_CUENTAS y la lista de cuentas con --solo.
 */
import { leerPlantilla } from './plantilla';
import { administrarCuentas, correr, type Operacion, SeedDetenido } from './seed-seguro';

const OPERACIONES: Operacion[] = ['alinear', 'retirar', 'contrasena-inicial'];
const [pedida, ...resto] = process.argv.slice(2);

void correr(
  `Administrar cuentas: ${pedida ?? '(sin operación)'}`,
  async (prisma, opciones) => {
    const operacion = OPERACIONES.find((o) => o === pedida);
    if (!operacion) throw new SeedDetenido([`Di qué hacer: ${OPERACIONES.join(', ')}`]);
    const { cuentas, retiradas } = leerPlantilla(process.env);
    await administrarCuentas(prisma, operacion, cuentas, retiradas, process.env, opciones);
  },
  resto,
);
