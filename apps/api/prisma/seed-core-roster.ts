/**
 * Alta de las cuentas de la plantilla local que todavía no existan. Una cuenta existente no se toca.
 *
 *   SEED_PLANTILLA=<ruta del JSON> npm run seed:cuentas -- --simular
 *   SEED_PLANTILLA=<ruta del JSON> npm run seed:cuentas -- --solo=correo1,correo2
 *
 * La contraseña de cada cuenta nueva sale de SEED_PASSWORD_<CORREO>, p. ej. SEED_PASSWORD_PERSONA_EMPRESA_MX.
 * Si falta una o no cumple, se detiene sin crear ninguna. En una base en uso pide SEED_AUTORIZAR_CUENTAS.
 * En producción, las altas se hacen en Core → Usuarios.
 */
import { leerPlantilla } from './plantilla';
import { correr, sembrarCuentas } from './seed-seguro';

void correr('Alta de cuentas', (prisma, opciones) =>
  sembrarCuentas(prisma, leerPlantilla(process.env).cuentas, process.env, opciones),
);
