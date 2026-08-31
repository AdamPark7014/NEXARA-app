/* eslint-disable no-console */
import { writeFileSync } from 'node:fs';
import { discoverDevice, type IsapiDiscoveredDevice } from './isapi.discovery';
import { probeRtsp } from './rtsp-probe';

/**
 * Barrido ISAPI de una LAN: identifica equipos, enumera su video y —si se le
 * pasa `--go2rtc`— publica cada canal como stream para que el navegador lo vea
 * en HLS sin plugin de Hikvision.
 *
 *   npm run integra:isapi:scan -- --hosts 192.168.9.34,192.168.9.171-179 \
 *     --user admin --password '...' --json inventario.json
 *
 * Las credenciales se pueden pasar por entorno (`ISAPI_USER`, `ISAPI_PASSWORD`)
 * para no dejarlas en el historial del shell.
 *
 * **Bloqueo de cuenta:** los equipos Hikvision bloquean al usuario tras varios
 * intentos fallidos. El barrido prueba UNA IP primero y aborta entero si las
 * credenciales son rechazadas, en vez de repetir el fallo contra las 20.
 */

type Args = {
  hosts: string[];
  user: string;
  password: string;
  scheme: 'http' | 'https';
  concurrency: number;
  timeoutMs: number;
  json: string | null;
  go2rtc: string | null;
  ptzProbe: boolean;
  probeRtsp: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
  };
  const has = (name: string) => argv.includes(`--${name}`);

  const raw = get('hosts') ?? get('host');
  if (!raw) throw new Error('Falta --hosts (p. ej. --hosts 192.168.9.34,192.168.9.171-179)');

  const user = get('user') ?? process.env.ISAPI_USER ?? '';
  const password = get('password') ?? process.env.ISAPI_PASSWORD ?? '';
  if (!user || !password) {
    throw new Error('Falta usuario/contraseña: usa --user/--password o ISAPI_USER/ISAPI_PASSWORD');
  }

  const scheme = (get('scheme') ?? 'http') === 'https' ? 'https' : 'http';
  return {
    hosts: expandHosts(raw),
    user,
    password,
    scheme,
    concurrency: Number(get('concurrency') ?? 4),
    timeoutMs: Number(get('timeout') ?? 8000),
    json: get('json'),
    go2rtc: (get('go2rtc') ?? process.env.GO2RTC_URL ?? null)?.replace(/\/$/, '') ?? null,
    ptzProbe: !has('no-ptz-probe'),
    probeRtsp: has('probe-rtsp'),
  };
}

/** Acepta `10.0.0.5`, `10.0.0.5-9` y `10.0.0.5,10.0.0.8-10`. */
export function expandHosts(spec: string): string[] {
  const out: string[] = [];
  for (const chunk of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const range = /^(\d+\.\d+\.\d+\.)(\d+)-(\d+)$/.exec(chunk);
    if (range) {
      const [, prefix, fromStr, toStr] = range;
      const from = Number(fromStr);
      const to = Number(toStr);
      if (from > to) throw new Error(`Rango invertido: ${chunk}`);
      for (let i = from; i <= to; i++) out.push(`${prefix}${i}`);
      continue;
    }
    out.push(chunk);
  }
  return [...new Set(out)];
}

/** Nombre de stream estable y válido para go2rtc. */
export function streamName(host: string, channelId: string): string {
  return `nx_${host.replace(/[^\w]/g, '_')}_${channelId}`;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function registerInGo2rtc(
  base: string,
  name: string,
  rtsp: string,
): Promise<{ ok: boolean; detail: string }> {
  const url = `${base}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(rtsp)}`;
  try {
    const res = await fetch(url, { method: 'PUT', signal: AbortSignal.timeout(10_000) });
    return { ok: res.ok, detail: res.ok ? 'registrado' : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function summarize(d: IsapiDiscoveredDevice): string {
  if (!d.reachable) return `${pad(host(d.host), 16)} ✗  ${d.error ?? 'sin respuesta'}`;
  const id = d.identity;
  const main = d.videoChannels.filter((c) => c.streamIndex === 1 || c.streamIndex === null);
  const res = main.find((c) => c.width && c.height);
  return [
    pad(host(d.host), 16),
    pad(d.role, 16),
    pad(id?.model ?? '—', 24),
    pad(`${d.videoChannels.length} ch (${main.length} main)`, 18),
    pad(res ? `${res.width}x${res.height} ${res.codec ?? ''}`.trim() : '—', 18),
    d.accessControl ? 'ACS' : '',
  ]
    .join(' ')
    .trimEnd();
}

const host = (u: string) => u.replace(/^https?:\/\//, '');
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `Barrido ISAPI · ${args.hosts.length} IPs · ${args.scheme} · usuario "${args.user}"\n`,
  );

  const probe = (h: string) =>
    discoverDevice({
      host: `${args.scheme}://${h}`,
      username: args.user,
      password: args.password,
      timeoutMs: args.timeoutMs,
      ptzProbe: args.ptzProbe,
      scope: `scan-${h}`,
    });

  // Cortafuegos anti-bloqueo: si el primero rechaza credenciales, no se sigue.
  const first = await probe(args.hosts[0]);
  if (first.authRejected) {
    console.error(
      `\n✗ ${args.hosts[0]} rechazó las credenciales. Barrido abortado para no ` +
        'bloquear la cuenta en los demás equipos.\n' +
        '  Verifica usuario y contraseña en la consola web de un equipo antes de reintentar.',
    );
    process.exitCode = 2;
    return;
  }

  const rest = await mapLimit(args.hosts.slice(1), args.concurrency, probe);
  const devices = [first, ...rest];

  console.log(
    pad('IP', 16) +
      ' ' +
      pad('ROL', 16) +
      ' ' +
      pad('MODELO', 24) +
      ' ' +
      pad('CANALES', 18) +
      ' ' +
      pad('PRINCIPAL', 18),
  );
  console.log('-'.repeat(100));
  for (const d of devices) console.log(summarize(d));

  // Detalle de cada grabador: es donde vive el nombre real de cada cámara y la
  // única vista de las que están en plug & play.
  for (const d of devices.filter((x) => x.role === 'NVR' && x.proxyChannels.length)) {
    console.log(`\n${host(d.host)} · ${d.identity?.model ?? ''} · cámaras enroladas`);
    console.log(
      '  ' +
        pad('CH', 4) +
        pad('NOMBRE', 24) +
        pad('IP ORIGEN', 17) +
        pad('MODO', 10) +
        pad('ESTADO', 9) +
        'STREAMS',
    );
    for (const p of d.proxyChannels) {
      console.log(
        '  ' +
          pad(p.channel, 4) +
          pad(p.name ?? '—', 24) +
          pad(p.ipAddress ?? '—', 17) +
          pad(p.connMode ?? '—', 10) +
          pad(p.online ? 'online' : 'vacío', 9) +
          p.streamIds.join(', '),
      );
    }
    const weak = d.proxyChannels.filter((p) => p.online && p.passwordStatus === 'invalid');
    if (weak.length) {
      console.log(
        `  ⚠ el NVR marca contraseña "invalid" en ${weak.length} canal(es): ` +
          weak.map((p) => p.channel).join(', '),
      );
    }
  }

  const reachable = devices.filter((d) => d.reachable);
  const channels = reachable.flatMap((d) =>
    d.videoChannels.map((c) => ({ device: d, channel: c })),
  );
  console.log(
    `\n${reachable.length}/${devices.length} equipos identificados · ` +
      `${channels.length} canales de video · ` +
      `${reachable.filter((d) => d.accessControl).length} de control de acceso`,
  );

  const rejected = devices.filter((d) => d.authRejected);
  if (rejected.length) {
    console.error(
      `\n⚠ ${rejected.length} equipo(s) rechazaron las credenciales: ` +
        rejected.map((d) => host(d.host)).join(', ') +
        '\n  Suelen tener una contraseña distinta a la del resto. Revísalos a mano.',
    );
  }

  if (args.probeRtsp) {
    const mains = channels.filter(({ channel }) => channel.streamIndex === 1 && channel.enabled);
    console.log(`\nProbando RTSP (DESCRIBE) en ${mains.length} canales principales…`);
    let ok = 0;
    for (const { device, channel } of mains) {
      const r = await probeRtsp(channel.rtsp, args.timeoutMs);
      if (r.ok) ok++;
      console.log(
        `  ${r.ok ? '✓' : '✗'} ${pad(`${host(device.host)}/${channel.id}`, 22)}` +
          `${pad(channel.name ?? '—', 24)}` +
          (r.ok
            ? `${pad(r.codecs.join('+'), 16)}${pad(r.resolution ?? '—', 12)}${r.elapsedMs} ms`
            : (r.error ?? 'sin detalle')),
      );
    }
    console.log(`  → ${ok}/${mains.length} canales entregan video.`);
  }

  if (args.go2rtc) {
    // Solo el stream principal: publicar también los sub duplica conexiones al
    // equipo, y el firmware corta a partir de ~6 clientes simultáneos.
    const mains = channels.filter(({ channel }) => channel.streamIndex === 1);
    console.log(`\nRegistrando ${mains.length} streams en go2rtc (${args.go2rtc})…`);
    for (const { device, channel } of mains) {
      const name = streamName(host(device.host), channel.id);
      const r = await registerInGo2rtc(args.go2rtc, name, channel.rtsp);
      console.log(`  ${r.ok ? '✓' : '✗'} ${pad(name, 34)} ${r.detail}`);
    }
  }

  if (args.json) {
    // El RTSP con contraseña NO se escribe a disco: solo la versión redactada.
    const safe = devices.map((d) => ({
      ...d,
      videoChannels: d.videoChannels.map(({ rtsp: _omit, ...rest }) => rest),
    }));
    writeFileSync(args.json, JSON.stringify({ scannedAt: new Date().toISOString(), devices: safe }, null, 2));
    console.log(`\nInventario escrito en ${args.json} (sin contraseñas).`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
