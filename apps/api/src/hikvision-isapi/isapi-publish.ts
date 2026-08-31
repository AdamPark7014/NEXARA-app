/* eslint-disable no-console */
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { IntegraMediaService } from '../integra/integra-media.service';
import { IntegraSiteService } from '../integra/integra-site.service';

/**
 * Publica en go2rtc todas las cámaras de un sitio, de una vez.
 *
 *   npm run integra:isapi:publish -- --company 1 --site 1
 *
 * No arma las URL por su cuenta: llama a `IntegraMediaService.liveStream`, el
 * mismo método que atiende `POST /api/integra/cameras/:id/stream`. Así el muro
 * de cámaras y el panel publican exactamente igual, y la lógica de elegir
 * fuente (IP propia vs. grabador) vive en un solo sitio.
 *
 * Por eso mismo **no se escribe ningún YAML con contraseñas**: las credenciales
 * salen cifradas de `IntegraSite`, viajan a go2rtc por su API y no tocan disco.
 *
 * `GO2RTC_URL` decide a qué go2rtc se publica. En un sitio LAN apunta al que
 * corre dentro de la red, no al del servidor: el servidor no ve las cámaras.
 */

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

async function main() {
  const companyId = Number(arg('company'));
  const siteId = Number(arg('site'));
  if (!companyId || !siteId) throw new Error('Uso: --company <id> --site <id>');

  const go2rtc = (arg('go2rtc') ?? process.env.GO2RTC_URL ?? '').replace(/\/$/, '');
  if (!go2rtc) {
    throw new Error(
      'Sin GO2RTC_URL (ni --go2rtc): no hay a dónde publicar. En un sitio LAN ' +
        'tiene que apuntar al go2rtc que corre dentro de la red.',
    );
  }
  if (arg('go2rtc')) process.env.GO2RTC_URL = go2rtc;

  const prisma = new PrismaClient();
  try {
    const cameras = await prisma.integraCamera.findMany({
      where: { siteId, companyId },
      select: { cameraIndexCode: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (!cameras.length) {
      throw new Error(`El sitio #${siteId} no tiene cámaras en el espejo. Corre el sync primero.`);
    }

    const config = new ConfigService(process.env);
    const sites = new IntegraSiteService(prisma as never, config);
    const media = new IntegraMediaService(sites, config, prisma as never);

    console.log(`Publicando ${cameras.length} cámaras en ${go2rtc}\n`);
    let ok = 0;
    for (const cam of cameras) {
      const out = await media.liveStream(companyId, cam.cameraIndexCode, siteId);
      const published = Boolean(out.hls);
      if (published) ok++;
      // Un sitio HCT no pasa por go2rtc y su respuesta no trae `streamName`.
      const streamName = 'streamName' in out ? (out.streamName ?? null) : null;
      console.log(
        `  ${published ? '✓' : '✗'} ${pad(cam.name, 24)}${pad(streamName ?? '—', 26)}` +
          (published ? '' : out.note),
      );
    }

    console.log(`\n${ok}/${cameras.length} publicadas.`);
    if (ok) {
      console.log(
        `Muro de cámaras: ${go2rtc.replace(/\/$/, '')}  ·  ` +
          'cada stream también en /api/stream.m3u8?src=<nombre>',
      );
    }
    if (ok < cameras.length) process.exitCode = 1;
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
