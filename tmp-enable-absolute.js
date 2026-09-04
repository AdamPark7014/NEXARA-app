/**
 * Enablement absoluto Oficinas: NVR httpHosts + vehicle FD PoE, PTZ motion,
 * ACS httpHosts + sonda FDLib/FP. Reusa URL viva (no rota token).
 */
const path = require('path');
const Module = require('module');
process.env.NODE_PATH = '/app/node_modules';
Module._initPaths();

const { PrismaClient } = require('@prisma/client');
const dist = '/app/apps/api/dist';
const { decryptSecret } = require(path.join(dist, 'integra/integra-secrets.js'));
const { HikvisionIsapiClient } = require(path.join(dist, 'hikvision-isapi/isapi.client.js'));
const disc = require(path.join(dist, 'hikvision-isapi/isapi.discovery.js'));
const acs = require(path.join(dist, 'hikvision-isapi/isapi-acs.js'));

const p = new PrismaClient();

async function main() {
  // Si el dist aún no tiene helpers nuevos, fallar claro.
  const need = [
    'readHttpNotificationHosts',
    'enableMotionDetection',
    'enableNvrParkingVehicleDetection',
    'setHttpNotificationHost',
  ];
  for (const k of need) {
    if (typeof disc[k] !== 'function') {
      throw new Error(`Falta ${k} en dist — redeploy API primero`);
    }
  }

  const site = await p.integraSite.findFirst({ where: { id: 1 } });
  const user = decryptSecret(site.appKeyEnc);
  const pass = decryptSecret(site.appSecretEnc);
  const mk = (host) =>
    new HikvisionIsapiClient({
      host: `http://${host}`,
      username: user,
      password: pass,
      scope: `abs-${host}`,
    });

  // 1) URL viva desde PTZ
  const ptz = mk('192.168.9.179');
  const hosts = await disc.readHttpNotificationHosts(ptz);
  const live = hosts.find((h) => /\/api\/integra\/hik\//.test(h.url));
  if (!live) throw new Error('PTZ sin httpHosts NEXARA — no se puede reusar token');
  console.log('LIVE_URL', live.url);

  // 2) Cablear NVR + ACS + reafirmar PTZ (sin rotar)
  const targets = [
    { ip: '192.168.9.34', kind: 'NVR', images: true },
    { ip: '192.168.9.179', kind: 'PTZ', images: true },
    { ip: '192.168.9.160', kind: 'ACS', images: false },
    { ip: '192.168.9.161', kind: 'ACS', images: false },
    { ip: '192.168.9.162', kind: 'ACS', images: false },
    { ip: '192.168.9.163', kind: 'ACS', images: false },
  ];
  for (const t of targets) {
    const c = mk(t.ip);
    try {
      await disc.setHttpNotificationHost(c, { url: live.url, withImages: t.images });
      console.log('HOSTS_OK', t.ip, t.kind);
    } catch (e) {
      console.log('HOSTS_FAIL', t.ip, String(e.message || e).slice(0, 160));
    }
    c.close();
  }

  // 3) NVR vehicle FD canales PoE
  const nvr = mk('192.168.9.34');
  const nvrFd = await disc.enableNvrParkingVehicleDetection(nvr);
  console.log('NVR_FD', JSON.stringify(nvrFd));

  // NVR ch13 PTZ — confirmar 403
  try {
    await nvr.getBinary('/ISAPI/Smart/FieldDetection/13');
    console.log('NVR_FD13', 'OK-unexpected');
  } catch (e) {
    console.log('NVR_FD13', String(e.message || e).slice(0, 120));
  }

  // 4) PTZ motion sensibilidad
  const motionOk = await disc.enableMotionDetection(ptz, 1, 70);
  console.log('PTZ_MOTION', motionOk);
  const { buffer: mot } = await ptz.getBinary(
    '/ISAPI/System/Video/inputs/channels/1/motionDetection',
  );
  const sens = /<sensitivityLevel>(\d+)</.exec(mot.toString('utf8'));
  console.log('PTZ_SENS', sens && sens[1]);

  // 5) ACS identity caps
  for (const ip of ['192.168.9.160', '192.168.9.161', '192.168.9.162', '192.168.9.163']) {
    const c = mk(ip);
    if (typeof acs.probeAcsIdentityCaps === 'function') {
      const caps = await acs.probeAcsIdentityCaps(c);
      console.log('ACS_CAPS', ip, JSON.stringify(caps));
    } else {
      // fallback mínimo
      try {
        await c.get('/ISAPI/Event/notification/httpHosts');
        console.log('ACS_HOSTS', ip, 'ok');
      } catch (e) {
        console.log('ACS_HOSTS', ip, String(e.message).slice(0, 80));
      }
    }
    c.close();
  }

  // 6) Verificar NVR httpHosts
  const nvrHosts = await disc.readHttpNotificationHosts(nvr);
  console.log('NVR_HOSTS_NOW', JSON.stringify(nvrHosts));

  ptz.close();
  nvr.close();
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
