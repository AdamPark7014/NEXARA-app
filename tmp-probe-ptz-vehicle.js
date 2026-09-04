/**
 * Probe profundo PTZ .179 + AcuSense parking: smart/traffic/ANPR/VMD/motion.
 * Solo rutas ISAPI ya usadas o documentadas en discovery/push — no inventa.
 */
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const dist = '/app';
const { decryptSecret } = require(path.join(dist, 'integra/integra-secrets.js'));
const { HikvisionIsapiClient } = require(path.join(dist, 'hikvision-isapi/isapi.client.js'));

const p = new PrismaClient();

const PATHS_CH = (ch) => [
  `/ISAPI/System/deviceInfo`,
  `/ISAPI/System/capabilities`,
  `/ISAPI/Smart/capabilities`,
  `/ISAPI/Smart/FieldDetection/${ch}`,
  `/ISAPI/Smart/FieldDetection/${ch}/capabilities`,
  `/ISAPI/Smart/LineDetection/${ch}`,
  `/ISAPI/Smart/LineDetection/${ch}/capabilities`,
  `/ISAPI/Smart/vehicleDetection/${ch}`,
  `/ISAPI/Smart/vehicleDetection/${ch}/capabilities`,
  `/ISAPI/Smart/VMD/${ch}`,
  `/ISAPI/Smart/VMD/${ch}/capabilities`,
  `/ISAPI/System/Video/inputs/channels/${ch}/motionDetection`,
  `/ISAPI/System/Video/inputs/channels/${ch}/motionDetection/capabilities`,
  `/ISAPI/Event/triggers`,
  `/ISAPI/Event/notification/httpHosts`,
  `/ISAPI/Event/notification/httpHosts/1`,
  `/ISAPI/Event/notification/alertStream/capabilities`,
  `/ISAPI/Traffic/channels/${ch}/licensePlateAuditData/capabilities`,
  `/ISAPI/Traffic/channels/${ch}/vehicleDetect`,
  `/ISAPI/ITC/entrance/capabilities`,
  `/ISAPI/Streaming/channels`,
  `/ISAPI/PTZCtrl/channels/${ch}/presets`,
  `/ISAPI/Intelligent/channels/${ch}/capabilities`,
  `/ISAPI/Intelligent/channels/${ch}/vehicles`,
];

async function probePath(client, pth) {
  try {
    const { buffer, status } = await client.getBinary(pth);
    const xml = buffer.toString('utf8');
    const statusCode = status || 200;
    const snippet = xml
      .replace(/\s+/g, ' ')
      .slice(0, 280);
    const flags = [];
    for (const k of [
      'vehicle',
      'Vehicle',
      'ANPR',
      'anpr',
      'plate',
      'Plate',
      'ITC',
      'FieldDetection',
      'LineDetection',
      'VMD',
      'motionDetection',
      'detectionTarget',
      'isSupport',
      'notSupport',
      'TargetRect',
    ]) {
      if (xml.includes(k)) flags.push(k);
    }
    return { path: pth, status: statusCode, ok: statusCode >= 200 && statusCode < 300, flags, snippet };
  } catch (e) {
    const msg = String(e?.message || e);
    const m = /HTTP\s+(\d+)/i.exec(msg) || /status[=:\s]+(\d+)/i.exec(msg);
    return {
      path: pth,
      status: m ? Number(m[1]) : null,
      ok: false,
      error: msg.slice(0, 220),
      flags: [],
    };
  }
}

async function main() {
  const site = await p.integraSite.findFirst({
    where: { provider: 'ISAPI' },
    orderBy: { id: 'asc' },
  });
  if (!site) throw new Error('No ISAPI site');
  const user = decryptSecret(site.appKeyEnc);
  const pass = decryptSecret(site.appSecretEnc);

  const cameras = await p.integraCamera.findMany({
    where: { siteId: site.id },
    select: {
      id: true,
      name: true,
      sourceIp: true,
      cameraIndexCode: true,
      model: true,
      isPtz: true,
      anprCapable: true,
    },
    orderBy: { name: 'asc' },
  });

  const ptz = cameras.find((c) => c.sourceIp === '192.168.9.179' || c.isPtz);
  const outdoorish = cameras.filter(
    (c) =>
      c.sourceIp &&
      c.sourceIp !== '192.168.9.179' &&
      /outdoor|parking|estacion|azotea|entrada|acceso|support|lobby|coffee|escalera/i.test(
        `${c.name || ''} ${c.model || ''}`,
      ),
  );
  // También todas las LAN directas (.171-.178) + NVR channel de PTZ
  const lanCams = cameras.filter(
    (c) => c.sourceIp && /^192\.168\.9\.(17[1-9]|34)$/.test(c.sourceIp),
  );

  console.log(JSON.stringify({ siteId: site.id, siteName: site.name, ptz, outdoorishCount: outdoorish.length }, null, 2));

  async function probeHost(label, host, channel) {
    const client = new HikvisionIsapiClient({
      baseUrl: `http://${host}`,
      username: user,
      password: pass,
    });
    const results = [];
    for (const pth of PATHS_CH(channel)) {
      results.push(await probePath(client, pth));
    }
    // FieldDetection XML detail if 200
    const fd = results.find((r) => r.path.includes(`/FieldDetection/${channel}`) && !r.path.includes('capabilities'));
    let fieldDetail = null;
    if (fd?.ok) {
      try {
        const { buffer } = await client.getBinary(`/ISAPI/Smart/FieldDetection/${channel}`);
        const xml = buffer.toString('utf8');
        fieldDetail = {
          detectionTargets: [...xml.matchAll(/<detectionTarget>([^<]+)<\/detectionTarget>/g)].map((m) => m[1]),
          enabled: [...xml.matchAll(/<enabled>([^<]+)<\/enabled>/g)].map((m) => m[1]).slice(0, 8),
          hasVehicleOpt: /vehicle/i.test(xml),
          hasHumanOpt: /human/i.test(xml),
        };
      } catch (e) {
        fieldDetail = { error: String(e?.message || e).slice(0, 200) };
      }
    }

    // httpHosts detail
    let httpHosts = null;
    try {
      const { buffer, status } = await client.getBinary('/ISAPI/Event/notification/httpHosts');
      httpHosts = { status: status || 200, xml: buffer.toString('utf8').replace(/\s+/g, ' ').slice(0, 1200) };
    } catch (e) {
      httpHosts = { error: String(e?.message || e).slice(0, 200) };
    }

    // capabilities vehicle/ANPR flags from System/capabilities if present
    let capsHit = null;
    const cap = results.find((r) => r.path === '/ISAPI/System/capabilities' && r.ok);
    if (cap) {
      try {
        const { buffer } = await client.getBinary('/ISAPI/System/capabilities');
        const xml = buffer.toString('utf8');
        const interesting = [
          'isSupportANPR',
          'isSupportVehicleDetection',
          'isSupportFieldDetection',
          'isSupportLineDetection',
          'isSupportVMD',
          'isSupportMotionDetection',
          'isSupportITC',
          'isSupportTraffic',
          'isSupportPeopleDetection',
          'isSupportSmart',
        ];
        capsHit = {};
        for (const k of interesting) {
          const re = new RegExp(`<${k}[^>]*>([^<]*)</${k}>|<${k}\\s[^/]*/>`, 'i');
          const m = re.exec(xml);
          if (m) capsHit[k] = m[1] ?? 'present';
          else if (xml.includes(k)) capsHit[k] = 'mentioned';
        }
      } catch (e) {
        capsHit = { error: String(e?.message || e).slice(0, 200) };
      }
    }

    const summary = {
      label,
      host,
      channel,
      ok: results.filter((r) => r.ok).map((r) => r.path),
      fail: results
        .filter((r) => !r.ok)
        .map((r) => ({ path: r.path, status: r.status, error: r.error })),
      fieldDetail,
      httpHosts,
      capsHit,
    };
    console.log('\n==== ' + label + ' ' + host + ' ch' + channel + ' ====');
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  // PTZ directo
  await probeHost('PTZ', '192.168.9.179', 1);

  // NVR: localizar canal de la PTZ
  const nvrPtz = cameras.find(
    (c) =>
      (c.sourceIp === '192.168.9.179' || /ptz|domo|df8c/i.test(`${c.name} ${c.model}`)) &&
      String(c.cameraIndexCode || '').includes('192.168.9.34'),
  );
  let nvrChannel = 1;
  if (nvrPtz?.cameraIndexCode) {
    const m = /\|(\d+)/.exec(nvrPtz.cameraIndexCode);
    if (m) nvrChannel = Number(m[1]);
  } else {
    // buscar en proxy / cameraIndexCode containing 179
    const viaNvr = cameras.find((c) => c.sourceIp === '192.168.9.179');
    if (viaNvr?.cameraIndexCode) {
      const m = /\|(\d+)/.exec(viaNvr.cameraIndexCode);
      if (m) nvrChannel = Number(m[1]);
    }
  }
  console.log('\nNVR PTZ channel guess:', nvrChannel, nvrPtz || ptz);
  await probeHost('NVR-for-PTZ', '192.168.9.34', nvrChannel);

  // Probe FieldDetection only on outdoor/LAN cams for vehicle option
  const vehicleCandidates = [];
  for (const cam of lanCams) {
    if (cam.sourceIp === '192.168.9.179' || cam.sourceIp === '192.168.9.34') continue;
    const client = new HikvisionIsapiClient({
      baseUrl: `http://${cam.sourceIp}`,
      username: user,
      password: pass,
    });
    const entry = {
      name: cam.name,
      ip: cam.sourceIp,
      model: cam.model,
      anprCapable: cam.anprCapable,
    };
    for (const pth of [
      `/ISAPI/Smart/FieldDetection/1`,
      `/ISAPI/Smart/vehicleDetection/1`,
      `/ISAPI/Traffic/channels/1/licensePlateAuditData/capabilities`,
    ]) {
      entry[pth] = await probePath(client, pth);
    }
    if (entry['/ISAPI/Smart/FieldDetection/1']?.ok) {
      try {
        const { buffer } = await client.getBinary('/ISAPI/Smart/FieldDetection/1');
        const xml = buffer.toString('utf8');
        entry.detectionTargets = [...xml.matchAll(/<detectionTarget>([^<]+)<\/detectionTarget>/g)].map(
          (m) => m[1],
        );
        entry.hasVehicleString = /vehicle/i.test(xml);
      } catch (e) {
        entry.fdError = String(e?.message || e).slice(0, 160);
      }
    }
    vehicleCandidates.push(entry);
    console.log(
      `CAM ${cam.sourceIp} ${cam.name}: FD=${entry['/ISAPI/Smart/FieldDetection/1']?.ok ? 'OK' : entry['/ISAPI/Smart/FieldDetection/1']?.status || 'ERR'} vehicleStr=${entry.hasVehicleString} targets=${JSON.stringify(entry.detectionTargets || [])}`,
    );
  }

  // Push events from .179 historically
  const ev179 = await p.integraPushEvent.groupBy({
    by: ['eventType'],
    where: { deviceIp: '192.168.9.179' },
    _count: { _all: true },
  });
  const recentVehicle = await p.integraPushEvent.findMany({
    where: {
      companyId: site.companyId,
      occurredAt: { gte: new Date(Date.now() - 24 * 3600_000) },
    },
    orderBy: { id: 'desc' },
    take: 200,
    select: { deviceIp: true, deviceName: true, eventType: true, targets: true, occurredAt: true },
  });
  const withVehicle = recentVehicle.filter((r) => {
    const t = Array.isArray(r.targets) ? r.targets : [];
    return t.some((x) => String(x?.type || '').toLowerCase() === 'vehicle');
  });

  console.log('\n==== DB events .179 by type ====');
  console.log(JSON.stringify(ev179, null, 2));
  console.log('\n==== vehicle target events last 24h ====');
  console.log(
    JSON.stringify(
      withVehicle.slice(0, 30).map((e) => ({
        ip: e.deviceIp,
        name: e.deviceName,
        type: e.eventType,
        at: e.occurredAt,
        targets: e.targets,
      })),
      null,
      2,
    ),
  );
  console.log('\n==== vehicle-capable cam summary ====');
  console.log(
    JSON.stringify(
      vehicleCandidates.map((c) => ({
        ip: c.ip,
        name: c.name,
        model: c.model,
        fdOk: c['/ISAPI/Smart/FieldDetection/1']?.ok,
        fdStatus: c['/ISAPI/Smart/FieldDetection/1']?.status,
        hasVehicleString: c.hasVehicleString,
        targets: c.detectionTargets,
        vd: c['/ISAPI/Smart/vehicleDetection/1']?.status || c['/ISAPI/Smart/vehicleDetection/1']?.error,
        anprCapPath:
          c['/ISAPI/Traffic/channels/1/licensePlateAuditData/capabilities']?.status ||
          c['/ISAPI/Traffic/channels/1/licensePlateAuditData/capabilities']?.error,
      })),
      null,
      2,
    ),
  );

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
