/**
 * Probe profundo PTZ .179 + AcuSense: smart/traffic/ANPR/VMD/motion.
 * Rutas ya usadas en discovery/push o documentadas httpHosts — no inventa.
 */
const path = require('path');
const Module = require('module');
const roots = ['/app/node_modules', '/app/apps/api/node_modules'];
process.env.NODE_PATH = [...roots, process.env.NODE_PATH || ''].filter(Boolean).join(path.delimiter);
Module._initPaths();

const { PrismaClient } = require('@prisma/client');
const dist = '/app/apps/api/dist';
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
    const flags = [];
    for (const k of [
      'vehicle',
      'Vehicle',
      'ANPR',
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
    return {
      path: pth,
      status: statusCode,
      ok: statusCode >= 200 && statusCode < 300,
      flags,
      snippet: xml.replace(/\s+/g, ' ').slice(0, 260),
    };
  } catch (e) {
    const msg = String(e?.message || e);
    const m = /HTTP\s+(\d+)/i.exec(msg) || /\b(\d{3})\b/.exec(msg);
    return {
      path: pth,
      status: m ? Number(m[1]) : null,
      ok: false,
      error: msg.slice(0, 220),
      flags: [],
    };
  }
}

function camMeta(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    sourceIp: r.sourceIp || r.ipAddress || r.source?.ipAddress || null,
    model: r.model || r.source?.model || null,
    isPtz: r.ptz === true || r.isPtz === true || /DF8C|PTZ/i.test(String(r.model || '')),
    anprCapable: r.anprCapable === true,
  };
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
    select: { id: true, name: true, cameraIndexCode: true, raw: true },
    orderBy: { name: 'asc' },
  });

  const enriched = cameras.map((c) => ({ ...c, ...camMeta(c.raw) }));
  const ptz = enriched.find((c) => c.sourceIp === '192.168.9.179' || c.isPtz);
  console.log(
    JSON.stringify(
      {
        siteId: site.id,
        companyId: site.companyId,
        ptz: ptz
          ? {
              name: ptz.name,
              code: ptz.cameraIndexCode,
              ip: ptz.sourceIp,
              model: ptz.model,
              anprCapable: ptz.anprCapable,
            }
          : null,
        camCount: enriched.length,
      },
      null,
      2,
    ),
  );

  async function probeHost(label, host, channel) {
    const client = new HikvisionIsapiClient({
      host: `http://${host}`,
      username: user,
      password: pass,
      scope: `probe-${host}`,
    });
    const results = [];
    for (const pth of PATHS_CH(channel)) {
      results.push(await probePath(client, pth));
    }

    let fieldDetail = null;
    const fd = results.find(
      (r) => r.path === `/ISAPI/Smart/FieldDetection/${channel}` && r.ok,
    );
    if (fd) {
      try {
        const { buffer } = await client.getBinary(`/ISAPI/Smart/FieldDetection/${channel}`);
        const xml = buffer.toString('utf8');
        fieldDetail = {
          detectionTargets: [...xml.matchAll(/<detectionTarget>([^<]+)<\/detectionTarget>/g)].map(
            (m) => m[1],
          ),
          enabled: [...xml.matchAll(/<enabled>([^<]+)<\/enabled>/g)].map((m) => m[1]).slice(0, 8),
          hasVehicleOpt: /vehicle/i.test(xml),
          hasHumanOpt: /human/i.test(xml),
          snippet: xml.replace(/\s+/g, ' ').slice(0, 800),
        };
      } catch (e) {
        fieldDetail = { error: String(e?.message || e).slice(0, 200) };
      }
    }

    let httpHosts = null;
    try {
      const { buffer, status } = await client.getBinary('/ISAPI/Event/notification/httpHosts');
      httpHosts = {
        status: status || 200,
        xml: buffer.toString('utf8').replace(/\s+/g, ' ').slice(0, 1400),
      };
    } catch (e) {
      httpHosts = { error: String(e?.message || e).slice(0, 200) };
    }

    let capsHit = null;
    if (results.some((r) => r.path === '/ISAPI/System/capabilities' && r.ok)) {
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
          const re = new RegExp(`<${k}[^>]*>([^<]*)</${k}>`, 'i');
          const m = re.exec(xml);
          if (m) capsHit[k] = m[1];
          else if (xml.includes(k)) capsHit[k] = 'mentioned';
        }
      } catch (e) {
        capsHit = { error: String(e?.message || e).slice(0, 200) };
      }
    }

    let smartCaps = null;
    if (results.some((r) => r.path === '/ISAPI/Smart/capabilities' && r.ok)) {
      try {
        const { buffer } = await client.getBinary('/ISAPI/Smart/capabilities');
        smartCaps = buffer.toString('utf8').replace(/\s+/g, ' ').slice(0, 1600);
      } catch (e) {
        smartCaps = String(e?.message || e).slice(0, 200);
      }
    }

    const summary = {
      label,
      host,
      channel,
      ok: results.filter((r) => r.ok).map((r) => ({ path: r.path, flags: r.flags })),
      fail: results
        .filter((r) => !r.ok)
        .map((r) => ({ path: r.path, status: r.status, error: r.error })),
      fieldDetail,
      httpHosts,
      capsHit,
      smartCaps,
    };
    console.log(`\n==== ${label} ${host} ch${channel} ====`);
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  await probeHost('PTZ', '192.168.9.179', 1);

  let nvrChannel = 1;
  if (ptz?.cameraIndexCode) {
    const m = /\|(\d+)/.exec(ptz.cameraIndexCode);
    if (m) nvrChannel = Number(m[1]);
  }
  console.log('\nNVR PTZ channel:', nvrChannel, ptz?.cameraIndexCode);
  await probeHost('NVR-for-PTZ', '192.168.9.34', nvrChannel);

  const lanIps = [
    ...new Set(
      enriched
        .map((c) => c.sourceIp)
        .filter((ip) => ip && /^192\.168\.9\.17[1-8]$/.test(ip)),
    ),
  ].sort();

  const vehicleCandidates = [];
  for (const ip of lanIps) {
    const cam = enriched.find((c) => c.sourceIp === ip);
    const client = new HikvisionIsapiClient({
      baseUrl: `http://${ip}`,
      username: user,
      password: pass,
    });
    const entry = {
      name: cam?.name,
      ip,
      model: cam?.model,
      anprCapable: cam?.anprCapable,
    };
    for (const pth of [
      `/ISAPI/Smart/FieldDetection/1`,
      `/ISAPI/Smart/vehicleDetection/1`,
      `/ISAPI/Traffic/channels/1/licensePlateAuditData/capabilities`,
      `/ISAPI/System/Video/inputs/channels/1/motionDetection`,
    ]) {
      entry[pth] = await probePath(client, pth);
    }
    if (entry['/ISAPI/Smart/FieldDetection/1']?.ok) {
      try {
        const { buffer } = await client.getBinary('/ISAPI/Smart/FieldDetection/1');
        const xml = buffer.toString('utf8');
        entry.detectionTargets = [
          ...xml.matchAll(/<detectionTarget>([^<]+)<\/detectionTarget>/g),
        ].map((m) => m[1]);
        entry.hasVehicleString = /vehicle/i.test(xml);
        // enum options in capabilities-like attributes
        entry.optVehicle = /opt=("[^"]*vehicle[^"]*"|'[^']*vehicle[^']*')/i.test(xml);
      } catch (e) {
        entry.fdError = String(e?.message || e).slice(0, 160);
      }
    }
    vehicleCandidates.push(entry);
    console.log(
      `CAM ${ip} ${cam?.name}: FD=${
        entry['/ISAPI/Smart/FieldDetection/1']?.ok
          ? 'OK'
          : entry['/ISAPI/Smart/FieldDetection/1']?.status || 'ERR'
      } vehicleStr=${entry.hasVehicleString} targets=${JSON.stringify(entry.detectionTargets || [])}`,
    );
  }

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
    take: 300,
    select: {
      deviceIp: true,
      deviceName: true,
      eventType: true,
      targets: true,
      occurredAt: true,
    },
  });
  const withVehicle = recentVehicle.filter((r) => {
    const t = Array.isArray(r.targets) ? r.targets : [];
    return t.some((x) => String(x?.type || '').toLowerCase() === 'vehicle');
  });

  console.log('\n==== DB events .179 by type ====');
  console.log(JSON.stringify(ev179, null, 2));
  console.log('\n==== vehicle target events last 24h (sample) ====');
  console.log(
    JSON.stringify(
      withVehicle.slice(0, 40).map((e) => ({
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
        optVehicle: c.optVehicle,
        targets: c.detectionTargets,
        vdStatus: c['/ISAPI/Smart/vehicleDetection/1']?.status,
        vdErr: c['/ISAPI/Smart/vehicleDetection/1']?.error,
        anprCapStatus:
          c['/ISAPI/Traffic/channels/1/licensePlateAuditData/capabilities']?.status,
        motionStatus:
          c['/ISAPI/System/Video/inputs/channels/1/motionDetection']?.status ||
          (c['/ISAPI/System/Video/inputs/channels/1/motionDetection']?.ok ? 200 : null),
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
