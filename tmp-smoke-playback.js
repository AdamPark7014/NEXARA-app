/* Smoke: ContentMgmt/search + go2rtc register. Run inside nexara-api container. */
const { PrismaClient } = require('@prisma/client');
const { createHash, randomUUID } = require('crypto');

async function digestFetch(url, user, pass, method, body, contentType) {
  const first = await fetch(url, { method, headers: body ? { 'Content-Type': contentType } : {}, body });
  if (first.status !== 401) {
    const text = await first.text();
    return { status: first.status, text };
  }
  const www = first.headers.get('www-authenticate') || '';
  const realm = /realm="([^"]+)"/i.exec(www)?.[1] || '';
  const nonce = /nonce="([^"]+)"/i.exec(www)?.[1] || '';
  const qop = /qop="([^"]+)"/i.exec(www)?.[1] || '';
  const opaque = /opaque="([^"]+)"/i.exec(www)?.[1];
  const uri = new URL(url).pathname + new URL(url).search;
  const ha1 = createHash('md5').update(`${user}:${realm}:${pass}`).digest('hex');
  const ha2 = createHash('md5').update(`${method}:${uri}`).digest('hex');
  const nc = '00000001';
  const cnonce = randomUUID().replace(/-/g, '').slice(0, 16);
  const response = qop
    ? createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex')
    : createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
  let auth = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) auth += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (opaque) auth += `, opaque="${opaque}"`;
  const second = await fetch(url, {
    method,
    headers: { Authorization: auth, ...(body ? { 'Content-Type': contentType } : {}) },
    body,
  });
  return { status: second.status, text: await second.text() };
}

function toUtc(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

(async () => {
  const p = new PrismaClient();
  const site = await p.integraSite.findFirst({
    where: { provider: 'ISAPI' },
    select: { id: true, name: true, host: true, username: true, password: true },
  });
  if (!site) throw new Error('no ISAPI site');
  const cams = await p.integraCamera.findMany({
    where: { siteId: site.id },
    take: 20,
    select: { cameraIndexCode: true, name: true, raw: true },
  });
  const pick =
    cams.find((c) => String(c.name || '').toLowerCase().includes('support')) ||
    cams.find((c) => String((c.raw || {}).channelId || '').endsWith('01')) ||
    cams[0];
  if (!pick) throw new Error('no cameras');
  const channelId = String((pick.raw || {}).channelId || '');
  let trackId = Number(channelId);
  if (!Number.isFinite(trackId) || trackId <= 0) {
    const ch = Number((pick.raw || {}).channelNumber) || 1;
    trackId = ch * 100 + 1;
  }
  if (trackId % 10 === 2) trackId -= 1;

  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  const body = JSON.stringify({
    CMSearchDescription: {
      searchID: randomUUID(),
      trackIDList: [{ trackID: trackId }],
      timeSpanList: [{ timeSpan: { startTime: toUtc(start), endTime: toUtc(end) } }],
      contentTypeList: [{ contentType: 'video' }],
      maxResults: 10,
      searchResultPostion: 0,
      metadataList: [{ metadataDescriptor: 'recordType.meta.hikvision.com' }],
    },
  });

  const host = String(site.host).replace(/\/$/, '');
  const url = `${host}/ISAPI/ContentMgmt/search?format=json`;
  const res = await digestFetch(url, site.username, site.password, 'POST', body, 'application/json');
  let parsed = null;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    parsed = { rawHead: res.text.slice(0, 400) };
  }
  const result = (parsed && parsed.CMSearchResult) || parsed || {};
  const matchList = Array.isArray(result.matchList)
    ? result.matchList
    : result.matchList
      ? [result.matchList]
      : [];
  const segs = matchList
    .map((m) => {
      const item = m.searchMatchItem || m;
      const seg = item.mediaSegmentDescriptor || {};
      const span = item.timeSpan || {};
      return {
        playbackURI: seg.playbackURI ? String(seg.playbackURI).slice(0, 120) : null,
        startTime: span.startTime || null,
        endTime: span.endTime || null,
        size: seg.size || null,
      };
    })
    .filter((s) => s.playbackURI);

  const go2rtc = (process.env.GO2RTC_URL || '').replace(/\/$/, '');
  let go2 = null;
  if (go2rtc && segs[0]?.playbackURI) {
    let rtsp = segs[0].playbackURI;
    if (!/^rtsp:\/\/[^/@]+@/i.test(rtsp)) {
      const cred = `${encodeURIComponent(site.username)}:${encodeURIComponent(site.password)}`;
      rtsp = rtsp.replace(/^rtsp:\/\//i, `rtsp://${cred}@`);
    }
    const name = `smoke_pb_${Date.now()}`;
    const put = await fetch(
      `${go2rtc}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(rtsp)}`,
      { method: 'PUT' },
    );
    go2 = { status: put.status, streamName: name, ok: put.ok };
  }

  console.log(
    JSON.stringify(
      {
        site: { id: site.id, name: site.name, host: site.host },
        camera: { id: pick.cameraIndexCode, name: pick.name, channelId, trackId },
        searchStatus: res.status,
        numOfMatches: result.numOfMatches ?? null,
        responseStatusStrg: result.responseStatusStrg || result.responseStatus || null,
        segments: segs.length,
        first: segs[0] || null,
        go2,
      },
      null,
      2,
    ),
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
