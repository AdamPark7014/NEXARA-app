/**
 * Carga una hoja de credenciales a UNA empresa: pone en cada cuenta la contraseña de la hoja y la guarda
 * CIFRADA en la bóveda del dueño (la que ve «Acceso a cuentas»).
 *
 * POR OMISIÓN NO ESCRIBE NADA (simulación). Con `--apply` sí. NUNCA imprime contraseñas.
 *
 * Por cuenta:
 *   · dueño y cuenta de desarrollo → se OMITEN siempre (su contraseña no se pisa ni se guarda);
 *   · no existe en la empresa       → se reporta;
 *   · la contraseña de la hoja YA es la vigente → no se cambia (no cierra sesiones), solo se guarda en la bóveda;
 *   · es distinta → se cambia (hash bcrypt), se cierran sus sesiones y se guarda en la bóveda.
 *
 * La hoja es un JSON `[{ "email": "...", "password": "..." }, …]` fuera del repo. `--file=-` la lee de la entrada estándar.
 * Necesita `VAULT_ENCRYPTION_KEY` (con `--apply`).
 *
 * En el contenedor de producción (solo hay `dist/`):
 *   docker exec -i nexara-api sh -c 'cd /app/apps/api && npx ts-node --transpile-only -P ./prisma/tsconfig.seed.json \
 *     ./prisma/cargar-credenciales-boveda.ts --company-id=1 --file=- [--apply]' < hoja.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { FilaHoja } from '../src/credential-vault/carga-credenciales';

type Modulos = {
  leerHoja: (json: unknown) => FilaHoja[];
  esCuentaProtegida: (email: string) => boolean;
  leerLlaveBoveda: (raw: string | undefined | null) => Buffer | null;
  aadDe: (companyId: number, userId: number) => Buffer;
  cifrarContrasena: (plano: string, llave: Buffer, aad: Buffer) => string;
};

/** En desarrollo salen de `src/` (con el preload del repo); en la imagen de producción, de `dist/`. */
function cargarModulos(): Modulos {
  const raiz = path.resolve(__dirname, '..');
  const dirSrc = path.join(raiz, 'src', 'credential-vault');
  if (fs.existsSync(path.join(dirSrc, 'carga-credenciales.ts'))) {
    const preload = path.join(raiz, 'scripts', 'ts-node-js-ext.js');
    if (fs.existsSync(preload)) require(preload);
    return { ...require(path.join(dirSrc, 'carga-credenciales')), ...require(path.join(dirSrc, 'credential-vault-crypto')) };
  }
  const dirDist = path.join(raiz, 'dist', 'credential-vault');
  return {
    ...require(path.join(dirDist, 'carga-credenciales.js')),
    ...require(path.join(dirDist, 'credential-vault-crypto.js')),
  };
}

function uso(msg: string): never {
  console.error(msg);
  console.error('Uso: --company-id=<n> --file=<hoja.json|-> [--apply]');
  process.exit(2);
}

async function main() {
  let companyId = 0;
  let archivo = '';
  let aplicar = false;
  for (const a of process.argv.slice(2)) {
    if (a === '--apply') aplicar = true;
    else if (a.startsWith('--company-id=')) companyId = Number(a.slice('--company-id='.length));
    else if (a.startsWith('--file=')) archivo = a.slice('--file='.length);
    else uso(`Argumento desconocido: ${a}`);
  }
  if (!Number.isInteger(companyId) || companyId <= 0) uso('Falta --company-id=<n> (no se adivina).');
  if (!archivo) uso('Falta --file=<hoja.json> (o --file=- para la entrada estándar).');

  const m = cargarModulos();
  const filas = m.leerHoja(JSON.parse(fs.readFileSync(archivo === '-' ? 0 : archivo, 'utf8')));
  const llave = m.leerLlaveBoveda(process.env['VAULT_ENCRYPTION_KEY']);
  if (aplicar && !llave) {
    console.error('VAULT_ENCRYPTION_KEY no está configurada (o no es válida): no se escribe nada.');
    process.exit(3);
  }

  const prisma = new PrismaClient();
  const cuenta = { coinciden: 0, cambiadas: 0, noExisten: 0, omitidas: 0, guardadas: 0 };
  try {
    const empresa = await prisma.companyProfile.findUnique({ where: { id: companyId }, select: { id: true, tradeName: true, legalName: true } });
    if (!empresa) uso(`La empresa ${companyId} no existe.`);
    console.log(`Empresa #${empresa.id} · ${empresa.tradeName ?? empresa.legalName}`);
    console.log(`Modo: ${aplicar ? 'APLICAR (escribe en la base de datos)' : 'SIMULACIÓN (no escribe nada)'}\n`);

    for (const fila of filas) {
      if (m.esCuentaProtegida(fila.email)) {
        cuenta.omitidas += 1;
        console.log(`  [OMITIDA   ] ${fila.email}  (dueño / desarrollo: no se toca)`);
        continue;
      }
      const usuario = await prisma.user.findFirst({
        where: { email: { equals: fila.email, mode: 'insensitive' }, companyMemberships: { some: { companyId } } },
        select: { id: true, passwordHash: true },
      });
      if (!usuario) {
        cuenta.noExisten += 1;
        console.log(`  [NO EXISTE ] ${fila.email}  (no hay cuenta con ese correo en la empresa)`);
        continue;
      }
      const coincide = await bcrypt.compare(fila.password, usuario.passwordHash);
      if (coincide) cuenta.coinciden += 1;
      else cuenta.cambiadas += 1;
      console.log(`  [${coincide ? 'YA COINCIDE' : 'SE CAMBIA   '}] ${fila.email}`);
      if (!aplicar) continue;

      if (!coincide) {
        await prisma.user.update({
          where: { id: usuario.id },
          data: { passwordHash: await bcrypt.hash(fila.password, 10), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
        });
        await prisma.userSession.updateMany({
          where: { userId: usuario.id, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: 'carga_hoja_credenciales' },
        });
        await prisma.auditLog.create({
          data: {
            entityType: 'User',
            entityId: usuario.id,
            action: 'ACCOUNT_PASSWORD_LOADED',
            // Sin la contraseña, jamás.
            changes: { origen: 'hoja de credenciales' },
            companyId,
            source: 'script',
          },
        });
      }
      const ciphertext = m.cifrarContrasena(fila.password, llave as Buffer, m.aadDe(companyId, usuario.id));
      await prisma.credentialVaultEntry.upsert({
        where: { userId: usuario.id },
        create: { userId: usuario.id, companyId, ciphertext },
        update: { companyId, ciphertext },
      });
      cuenta.guardadas += 1;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `\nResumen: ya coincidían ${cuenta.coinciden} · a cambiar ${cuenta.cambiadas} · no existen ${cuenta.noExisten} · omitidas ${cuenta.omitidas}` +
      (aplicar ? ` · guardadas en la bóveda ${cuenta.guardadas}` : '  (simulación: no se escribió nada)'),
  );
}

main().catch((e) => {
  // El mensaje puede venir de una hoja inválida: nunca trae contraseñas.
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
