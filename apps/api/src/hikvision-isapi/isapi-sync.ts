/* eslint-disable no-console */
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { IntegraSiteService } from '../integra/integra-site.service';
import { IntegraSyncService } from '../integra/integra-sync.service';

/**
 * Fuerza el sync de un sitio ISAPI **desde dentro de la LAN**.
 *
 *   npm run integra:isapi:sync -- --company 1 --site 1
 *
 * No es un atajo del endpoint: es la única vía para un sitio LAN. El cron de
 * 15 minutos corre en el droplet, y el droplet **no tiene ruta** a la red del
 * cliente, así que para `provider=ISAPI` ese cron falla siempre. El sync tiene
 * que dispararlo un proceso que sí vea los equipos.
 *
 * Mientras no exista agente on-site ni VPN, esto se corre a mano desde una
 * máquina del sitio, apuntando `DATABASE_URL` a la base que corresponda.
 */

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const companyId = Number(arg('company'));
  const siteId = Number(arg('site'));
  if (!companyId || !siteId) {
    throw new Error('Uso: --company <id> --site <id>');
  }

  const prisma = new PrismaClient();
  try {
    const site = await prisma.integraSite.findFirst({
      where: { id: siteId, companyId },
      select: { name: true, host: true, provider: true, isActive: true },
    });
    if (!site) throw new Error(`No existe el sitio #${siteId} de la empresa #${companyId}`);
    if (site.provider !== 'ISAPI') {
      throw new Error(
        `El sitio #${siteId} es ${site.provider}, no ISAPI. Ese sí lo sincroniza el cron.`,
      );
    }
    if (!site.isActive) throw new Error(`El sitio #${siteId} está inactivo`);

    console.log(`Sync ISAPI · "${site.name}" · ${site.host}`);
    const sites = new IntegraSiteService(prisma as never, new ConfigService(process.env));
    const sync = new IntegraSyncService(prisma as never, sites);

    const started = Date.now();
    const out = await sync.syncSite(companyId, siteId);
    console.log(
      `  ${out.cameras} cámaras · ${out.doors} puertas · ${out.devices} equipos ` +
        `· ${Date.now() - started} ms`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
