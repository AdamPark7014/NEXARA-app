/**
 * Cablea httpHosts + FieldDetection vehicle en NVR PoE / motion PTZ
 * sin rotar el token (no tumba el empuje vivo de AcuSense/ACS).
 *
 * Uso en prod (dentro del contenedor api, tras build):
 *   node /app/apps/api/scripts/wire-parking-nvr.cjs
 */
const { NestFactory } = require('@nestjs/core');

async function main() {
  const companyId = Number(process.env.WIRE_COMPANY_ID || 2);
  const siteId = Number(process.env.WIRE_SITE_ID || 1);
  // Rutas relativas al cwd del contenedor (/app o /app/apps/api).
  let AppModule;
  let IntegraPushService;
  try {
    ({ AppModule } = require('../dist/app.module'));
    ({ IntegraPushService } = require('../dist/integra/integra-push.service'));
  } catch {
    ({ AppModule } = require('../apps/api/dist/app.module'));
    ({ IntegraPushService } = require('../apps/api/dist/integra/integra-push.service'));
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const push = app.get(IntegraPushService);
    const result = await push.wireDevices(companyId, siteId, {
      detection: true,
      rotateToken: false,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
