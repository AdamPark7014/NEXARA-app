/* Smoke go2rtc registration for NVR playback URI. No secrets in stdout. */
const { PrismaClient } = require('@prisma/client');
const { createHash, randomUUID } = require('crypto');
const { decryptSecret } = require('/app/apps/api/dist/integra/integra-secrets.js');

function redact(s) {
  return String(s).replace(/\/\/([^:/@]+):([^@]+)@/gi, '//$1:***@');
}

async function digestFetch(url, user, pass, method, body, contentType) {
  const first = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': contentType } : {},
    body,
  });
  if (first.status !== 401) return { status: first.status, text: await first.text() };
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
    select: { host: true, appKeyEnc: true, appSecretEnc: true },
  });
  const user = decryptSecret(site.appKeyEnc);
  const pass = decryptSecret(site.appSecretEnc);
  const host = String(site.host).replace(/\/$/, '');
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 3600e3);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><CMSearchDescription><searchID>${randomUUID()}</searchID><trackIDList><trackID>501</trackID></trackIDList><timeSpanList><timeSpan><startTime>${toUtc(start)}</startTime><endTime>${toUtc(end)}</endTime></timeSpan></timeSpanList><maxResults>1</maxResults><searchResultPostion>0</searchResultPostion><contentTypeList><contentType>video</contentType></contentTypeList><metadataList><metadataDescriptor>recordType.meta.hikvision.com</metadataDescriptor></metadataList></CMSearchDescription>`;
  const r = await digestFetch(`${host}/ISAPI/ContentMgmt/search`, user, pass, 'POST', xml, 'application/xml');
  const rawUri = (/<playbackURI>([^<]+)<\/playbackURI>/.exec(r.text) || [])[1];
  if (!rawUri) throw new Error('no playbackURI');
  const uri = rawUri.replace(/&amp;/g, '&');
  const cred = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`;
  const rtsp = uri.replace(/^rtsp:\/\//i, `rtsp://${cred}@`);
  const go2 = (process.env.GO2RTC_URL || '').replace(/\/$/, '');
  const name = `smoke_pb_${Date.now()}`;

  const attempts = [
    {
      label: 'put-query',
      run: () =>
        fetch(`${go2}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(rtsp)}`, {
          method: 'PUT',
        }),
    },
    {
      label: 'put-json-map',
      run: () =>
        fetch(`${go2}/api/streams`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [name]: [rtsp] }),
        }),
    },
    {
      label: 'put-query-ffmpeg',
      run: () =>
        fetch(
          `${go2}/api/streams?name=${encodeURIComponent(`${name}_ff`)}&src=${encodeURIComponent(`ffmpeg:${rtsp}#video=copy`)}`,
          { method: 'PUT' },
        ),
    },
  ];

  const out = [];
  for (const a of attempts) {
    const res = await a.run();
    const t = await res.text();
    out.push({ label: a.label, status: res.status, body: redact(t).slice(0, 160) });
  }

  const info = await fetch(`${go2}/api/streams?src=${encodeURIComponent(name)}`);
  const infoText = await info.text();
  console.log(
    JSON.stringify(
      {
        uri: redact(uri),
        hasQuery: uri.includes('?'),
        attempts: out,
        infoStatus: info.status,
        infoHasProducers: /producers/i.test(infoText),
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
