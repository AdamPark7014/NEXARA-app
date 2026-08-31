/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../integra/integra-secrets';
import type { IsapiDiscoveredDevice } from './isapi.discovery';

/**
 * Da de alta un sitio Integra con provider **ISAPI** a partir del inventario
 * que produjo `isapi-scan --json`, y registra los equipos que el grabador no
 * conoce (las terminales de control de acceso).
 *
 *   npm run integra:isapi:seed -- --json inventario.json --company 1 \
 *     --name "Oficinas Guadalajara" --head 192.168.9.34 --user admin
 *
 * Resuelve el huevo y la gallina: el sync ISAPI descubre el video desde el
 * grabador, pero las terminales de acceso están sueltas en la LAN y nadie se
 * las presenta. Este alta las presenta una vez; a partir de ahí el sync de
 * cada 15 minutos las mantiene.
 *
 * Es idempotente: correrlo dos veces no duplica nada.
 *
 * **La contraseña se guarda cifrada** (AES-256-GCM) con `INTEGRA_SECRETS_KEY`
 * —o `JWT_SECRET` como respaldo—, así que tiene que correr con el MISMO
 * entorno que la API o esta no podrá descifrarla. Por eso el script de npm lo
 * lanza con `--env-file-if-exists=.env`: leyendo el mismo `.env` que la API,
 * las claves no pueden divergir por descuido.
 */

type Inventory = { scannedAt?: string; devices: IsapiDiscoveredDevice[] };

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const jsonPath = arg('json');
  const companyId = Number(arg('company'));
  const name = arg('name');
  const head = arg('head');
  const user = arg('user') ?? process.env.ISAPI_USER ?? '';
  const password = arg('password') ?? process.env.ISAPI_PASSWORD ?? '';
  const scheme = arg('scheme') === 'https' ? 'https' : 'http';

  if (!jsonPath || !companyId || !name || !head || !user || !password) {
    throw new Error(
      'Uso: --json <inventario.json> --company <id> --name "<sitio>" --head <ip> ' +
        '[--user admin] [--password ***] [--scheme http|https]\n' +
        '(usuario y contraseña también se leen de ISAPI_USER / ISAPI_PASSWORD)',
    );
  }
  if (!process.env.INTEGRA_SECRETS_KEY && !process.env.JWT_SECRET) {
    throw new Error(
      'Sin INTEGRA_SECRETS_KEY ni JWT_SECRET: el sitio quedaría cifrado con la ' +
        'clave de desarrollo y la API no podría descifrarlo.',
    );
  }

  const inventory = JSON.parse(readFileSync(jsonPath, 'utf8')) as Inventory;
  const prisma = new PrismaClient();

  try {
    const host = `${scheme}://${head}`;
    const existing = await prisma.integraSite.findFirst({ where: { companyId, name } });

    const site = existing
      ? await prisma.integraSite.update({
          where: { id: existing.id },
          data: {
            host,
            provider: 'ISAPI',
            appKeyEnc: encryptSecret(user),
            appSecretEnc: encryptSecret(password),
            isActive: true,
          },
        })
      : await prisma.integraSite.create({
          data: {
            companyId,
            name,
            host,
            provider: 'ISAPI',
            appKeyEnc: encryptSecret(user),
            appSecretEnc: encryptSecret(password),
            isActive: true,
            isDefault: (await prisma.integraSite.count({ where: { companyId } })) === 0,
          },
        });

    console.log(`Sitio ${existing ? 'actualizado' : 'creado'}: #${site.id} "${site.name}" → ${host}`);

    // Solo lo que el grabador NO reporta. Sus cámaras las descubre el sync.
    const headIp = head;
    const standalone = inventory.devices.filter(
      (d) => d.reachable && hostOf(d.host) !== headIp && d.role === 'ACCESS_TERMINAL',
    );

    let count = 0;
    for (const d of standalone) {
      const ip = hostOf(d.host);
      const indexCode = d.identity?.serialNumber || ip;
      const label = d.identity?.deviceName || d.identity?.model || ip;
      await prisma.integraDevice.upsert({
        where: { siteId_kind_indexCode: { siteId: site.id, kind: 'ACS', indexCode } },
        create: {
          companyId,
          siteId: site.id,
          kind: 'ACS',
          indexCode,
          name: label,
          ip,
          online: true,
          deviceType: 'ISAPI',
          raw: { role: d.role, identity: d.identity, seeded: true } as never,
        },
        update: { name: label, ip, deviceType: 'ISAPI' },
      });
      count++;
      console.log(`  + ${ip.padEnd(16)} ${label}`);
    }

    console.log(
      `\n${count} terminal(es) de acceso registradas. ` +
        'Las cámaras las descubre el sync desde el grabador:\n' +
        `  POST /api/integra/sync   (o espera al cron de 15 min)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const hostOf = (u: string) => u.replace(/^https?:\/\//, '').replace(/[:/].*$/, '');

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
