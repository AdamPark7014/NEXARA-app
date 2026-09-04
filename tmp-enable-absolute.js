/**
 * Enablement absoluto con APIs ya en dist prod (sin helpers nuevos).
 * - Copia httpHosts vivo de PTZ → NVR + ACS
 * - Sube sensitivity motion PTZ
 * - Reafirma FieldDetection human,vehicle en NVR ch 1/2/9/10
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

const p = new PrismaClient();

function mk(host, user, pass) {
  return new HikvisionIsapiClient({
    host: `http://${host}`,
    username: user,
    password: pass,
    scope: `abs-${host}`,
  });
}

async function readLiveUrl(client) {
  const { buffer } = await client.getBinary('/ISAPI/Event/notification/httpHosts');
  const xml = buffer.toString('utf8');
  const m = /<url>(\/api\/integra\/hik\/[^<]+)<\/url>[\s\S]*?<hostName>([^<]+)<\/hostName>[\s\S]*?<portNo>(\d+)<\/portNo>[\s\S]*?<protocolType>([^<]+)<\/protocolType>/.exec(
    xml,
  );
  // fallback: find any integra hik url + host
  const urlPath = /<url>(\/api\/integra\/hik\/[^<]+)<\/url>/.exec(xml)?.[1];
  const hostName = /<hostName>([^<]+)<\/hostName>/.exec(xml)?.[1];
  const portNo = /<portNo>(\d+)<\/portNo>/.exec(xml)?.[1] || '443';
  const proto = /<protocolType>([^<]+)<\/protocolType>/.exec(xml)?.[1] || 'HTTPS';
  if (!urlPath || !hostName) return null;
  return `${String(proto).toLowerCase()}://${hostName}:${portNo}${urlPath}`;
}

async function bumpMotion(client, channel, sensitivity) {
  const pth = `/ISAPI/System/Video/inputs/channels/${channel}/motionDetection`;
  const { buffer } = await client.getBinary(pth);
  let xml = buffer.toString('utf8');
  xml = xml.replace(/<enabled>\s*false\s*<\/enabled>/i, '<enabled>true</enabled>');
  xml = xml.replace(
    /<sensitivityLevel>\s*\d+\s*<\/sensitivityLevel>/i,
    `<sensitivityLevel>${sensitivity}</sensitivityLevel>`,
  );
  await client.put(pth, xml);
}

async function enableFdVehicle(client, channel) {
  const pth = `/ISAPI/Smart/FieldDetection/${channel}`;
  const { buffer } = await client.getBinary(pth);
  let xml = buffer.toString('utf8');
  xml = xml.replace(/<enabled>\s*false\s*<\/enabled>/gi, '<enabled>true</enabled>');
  xml = xml.replace(
    /<detectionTarget>[^<]*<\/detectionTarget>/gi,
    '<detectionTarget>human,vehicle</detectionTarget>',
  );
  await client.put(pth, xml);
}

async function main() {
  const site = await p.integraSite.findFirst({ where: { id: 1 } });
  const user = decryptSecret(site.appKeyEnc);
  const pass = decryptSecret(site.appSecretEnc);

  const ptz = mk('192.168.9.179', user, pass);
  const live = await readLiveUrl(ptz);
  if (!live) throw new Error('PTZ sin URL httpHosts NEXARA');
  console.log('LIVE', live);

  for (const [ip, images] of [
    ['192.168.9.34', true],
    ['192.168.9.179', true],
    ['192.168.9.160', false],
    ['192.168.9.161', false],
    ['192.168.9.162', false],
    ['192.168.9.163', false],
  ]) {
    const c = mk(ip, user, pass);
    try {
      await disc.setHttpNotificationHost(c, { url: live, withImages: images });
      console.log('HOSTS_OK', ip);
    } catch (e) {
      console.log('HOSTS_FAIL', ip, String(e.message || e).slice(0, 140));
    }
    c.close();
  }

  try {
    await bumpMotion(ptz, 1, 70);
    console.log('PTZ_MOTION_OK');
  } catch (e) {
    console.log('PTZ_MOTION_FAIL', String(e.message || e).slice(0, 140));
  }

  const nvr = mk('192.168.9.34', user, pass);
  for (const ch of [1, 2, 9, 10]) {
    try {
      await enableFdVehicle(nvr, ch);
      console.log('NVR_FD_OK', ch);
    } catch (e) {
      console.log('NVR_FD_FAIL', ch, String(e.message || e).slice(0, 120));
    }
  }
  try {
    await nvr.getBinary('/ISAPI/Smart/FieldDetection/13');
    console.log('NVR_FD13 unexpected OK');
  } catch (e) {
    console.log('NVR_FD13', String(e.message || e).slice(0, 100));
  }

  // verify NVR hosts
  try {
    const url = await readLiveUrl(nvr);
    console.log('NVR_LIVE_NOW', url);
  } catch (e) {
    console.log('NVR_READ_FAIL', String(e.message || e).slice(0, 100));
  }

  ptz.close();
  nvr.close();
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
