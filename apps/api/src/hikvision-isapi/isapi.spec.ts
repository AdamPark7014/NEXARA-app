import { createHash } from 'node:crypto';
import { buildAuthorization, parseChallenge } from './digest';
import { asList, parseXml, pick } from './xml';
import { describeDevice, listProxyChannels, listVideoChannels } from './isapi.discovery';
import { expandHosts, streamName } from './isapi-scan';
import type { HikvisionIsapiClient } from './isapi.client';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

/**
 * Los retos y los cuerpos de este archivo están **copiados de equipos reales**
 * del sitio (NVR DS-7616NXI, cámara DS-2CD2123G2, terminal DS-K1T343MWX).
 * Cada familia formatea distinto, y ahí es donde se rompen los parsers.
 */
describe('digest ISAPI', () => {
  it('lee el reto de un NVR (realm hexadecimal, con qop y opaque)', () => {
    const c = parseChallenge(
      'Digest realm="f26a9b0c5c8deb25a046e444", domain="/", qop="auth", ' +
        'nonce="2f71074c46e7d10e:f26a9b0c5c8deb25a046e444:1a0583dfc7b:0", ' +
        'opaque="799d5", algorithm="MD5", stale="FALSE"',
    );
    expect(c?.realm).toBe('f26a9b0c5c8deb25a046e444');
    expect(c?.qop).toBe('auth');
    expect(c?.opaque).toBe('799d5');
  });

  it('no se parte con el realm de una cámara, que trae paréntesis', () => {
    const c = parseChallenge(
      'Digest qop="auth", realm="IP Camera(GK713)", nonce="3638343a3538", stale="FALSE"',
    );
    // Partir por comas se comería el "(GK713)" y dejaría un realm inválido.
    expect(c?.realm).toBe('IP Camera(GK713)');
  });

  it('lee el reto de una terminal de acceso (nonce en base64, sin algorithm)', () => {
    const c = parseChallenge(
      'Digest qop="auth", realm="DS-0753f32c", ' +
        'nonce="ZmVkYzNiNzZlYzUyZTk4MGVmM2U1YTg0ZGZjYmJlMDE=", ' +
        'stale="false", opaque="", domain="::"',
    );
    expect(c?.nonce).toBe('ZmVkYzNiNzZlYzUyZTk4MGVmM2U1YTg0ZGZjYmJlMDE=');
    expect(c?.algorithm).toBeUndefined();
  });

  it('descarta lo que no es Digest', () => {
    expect(parseChallenge('Basic realm="algo"')).toBeNull();
  });

  it('firma con qop según RFC 2617', () => {
    const header = buildAuthorization({
      username: 'admin',
      password: 'clave',
      method: 'GET',
      uri: '/ISAPI/System/deviceInfo',
      challenge: { realm: 'R', nonce: 'N', qop: 'auth' },
      nc: 1,
    });
    const cnonce = /cnonce="([^"]+)"/.exec(header)?.[1] ?? '';
    const ha1 = md5('admin:R:clave');
    const ha2 = md5('GET:/ISAPI/System/deviceInfo');
    expect(header).toContain(`response="${md5(`${ha1}:N:00000001:${cnonce}:auth:${ha2}`)}"`);
    expect(header).toContain('nc=00000001');
  });

  it('firma sin qop cuando el equipo no lo ofrece — el caso de RTSP', () => {
    const header = buildAuthorization({
      username: 'admin',
      password: 'clave',
      method: 'DESCRIBE',
      uri: 'rtsp://192.168.9.34:554/Streaming/Channels/101',
      challenge: { realm: 'R', nonce: 'N', algorithm: 'MD5' },
      nc: 1,
    });
    const ha1 = md5('admin:R:clave');
    const ha2 = md5('DESCRIBE:rtsp://192.168.9.34:554/Streaming/Channels/101');
    expect(header).toContain(`response="${md5(`${ha1}:N:${ha2}`)}"`);
    expect(header).not.toContain('nc=');
    expect(header).not.toContain('cnonce=');
  });

  it('firma sobre la URI con query — omitirla da un 401 sin explicación', () => {
    const conQuery = buildAuthorization({
      username: 'a',
      password: 'b',
      method: 'GET',
      uri: '/ISAPI/Streaming/channels?format=json',
      challenge: { realm: 'R', nonce: 'N', qop: 'auth' },
      nc: 1,
    });
    expect(conQuery).toContain('uri="/ISAPI/Streaming/channels?format=json"');
  });
});

describe('parser XML de ISAPI', () => {
  const deviceInfo = `<?xml version="1.0" encoding="UTF-8"?>
<DeviceInfo version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<deviceName>Escalera 01</deviceName>
<deviceID>abc-123</deviceID>
<model>DS-2CD2123G2-LIS2U</model>
<serialNumber>DS-2CD2123G2-LIS2U20251115AAWRGK7135195</serialNumber>
<macAddress>b4:a3:82:00:00:01</macAddress>
<firmwareVersion>V5.7.19</firmwareVersion>
<deviceType>IPCamera</deviceType>
</DeviceInfo>`;

  it('extrae escalares de un deviceInfo real', () => {
    const root = parseXml(deviceInfo).DeviceInfo;
    expect(pick(root, 'model')).toBe('DS-2CD2123G2-LIS2U');
    expect(pick(root, 'deviceName')).toBe('Escalera 01');
    expect(pick(root, 'deviceType')).toBe('IPCamera');
  });

  it('colapsa hermanos repetidos en un array', () => {
    const x = parseXml(
      '<L><StreamingChannel><id>101</id></StreamingChannel>' +
        '<StreamingChannel><id>102</id></StreamingChannel></L>',
    );
    const list = asList((x.L as Record<string, unknown>).StreamingChannel);
    expect(list.map((n) => pick(n, 'id'))).toEqual(['101', '102']);
  });

  it('un nodo único también sale como lista con asList', () => {
    const x = parseXml('<L><StreamingChannel><id>101</id></StreamingChannel></L>');
    expect(asList((x.L as Record<string, unknown>).StreamingChannel)).toHaveLength(1);
  });

  it('navega rutas anidadas y devuelve null si no existen', () => {
    const x = parseXml('<A><B><C>valor</C></B></A>');
    expect(pick(x.A, 'B.C')).toBe('valor');
    expect(pick(x.A, 'B.Z')).toBeNull();
    expect(pick(x.A, 'no.hay.nada')).toBeNull();
  });

  it('decodifica entidades y quita el prefijo de namespace', () => {
    const x = parseXml('<hik:A><hik:n>Caf&amp; &lt;1&gt;</hik:n></hik:A>');
    expect(pick(x.A, 'n')).toBe('Caf& <1>');
  });

  it('trata las etiquetas vacías como cadena vacía, no como error', () => {
    const x = parseXml('<A><deviceID/></A>');
    expect(pick(x.A, 'deviceID')).toBe('');
  });
});

/** Cliente falso: devuelve el cuerpo registrado para cada ruta, o lanza 404. */
function fakeClient(routes: Record<string, string>, host = 'http://192.168.9.34') {
  const client = {
    host,
    configured: true,
    rejected: false,
    get: async (path: string) => {
      const body = routes[path];
      if (body === undefined) throw new Error(`404 ${path}`);
      return parseXml(body);
    },
    rtspUrl: (ch: string | number) => `rtsp://admin:x@h:554/Streaming/Channels/${ch}`,
    rtspUrlRedacted: (ch: string | number) => `rtsp://admin:***@h:554/Streaming/Channels/${ch}`,
  };
  return client as unknown as HikvisionIsapiClient;
}

const camDeviceInfo = `<DeviceInfo><deviceName>Cam</deviceName><model>DS-2CD2123G2-LIS2U</model>
<serialNumber>S1</serialNumber><deviceType>IPCamera</deviceType></DeviceInfo>`;

const nvrChannels = `<StreamingChannelList>
${[1, 2, 3]
  .map(
    (n) => `<StreamingChannel><id>${n}01</id><channelName>${n}01</channelName><enabled>true</enabled>
<Video><videoCodecType>H.265</videoCodecType><videoResolutionWidth>1920</videoResolutionWidth>
<videoResolutionHeight>1080</videoResolutionHeight></Video></StreamingChannel>`,
  )
  .join('\n')}
</StreamingChannelList>`;

const oneChannel = `<StreamingChannelList>
<StreamingChannel><id>101</id><channelName>101</channelName><enabled>true</enabled>
<Video><videoCodecType>H.265</videoCodecType><videoResolutionWidth>1920</videoResolutionWidth>
<videoResolutionHeight>1080</videoResolutionHeight></Video></StreamingChannel>
</StreamingChannelList>`;

describe('canales de video', () => {
  it('descompone el id 101 en canal físico 1 y stream 1', async () => {
    const [ch] = await listVideoChannels(fakeClient({ '/ISAPI/Streaming/channels': oneChannel }));
    expect(ch.channelNumber).toBe(1);
    expect(ch.streamIndex).toBe(1);
    expect(ch.codec).toBe('H.265');
    expect(ch.width).toBe(1920);
  });

  it('el RTSP de respuesta no lleva la contraseña', async () => {
    const [ch] = await listVideoChannels(fakeClient({ '/ISAPI/Streaming/channels': oneChannel }));
    expect(ch.rtspRedacted).toContain('***');
    expect(ch.rtspRedacted).not.toContain('admin:x');
  });
});

describe('cámaras enroladas en un grabador', () => {
  const proxy = `<InputProxyChannelList>
<InputProxyChannel><id>1</id><name>Escalera 01</name>
<sourceInputPortDescriptor><ipAddress>192.168.254.2</ipAddress><connMode>plugplay</connMode>
<model>DS-2CD2123G2-LIS2U</model><serialNumber>S-PNP</serialNumber></sourceInputPortDescriptor>
</InputProxyChannel>
<InputProxyChannel><id>3</id><name>Planning &amp; Design</name>
<sourceInputPortDescriptor><ipAddress>192.168.9.171</ipAddress><connMode>manual</connMode>
<model>DS-2CD2123G2-LIS2U</model><serialNumber>S-LAN</serialNumber></sourceInputPortDescriptor>
</InputProxyChannel>
</InputProxyChannelList>`;

  const proxyStatus = `<InputProxyChannelStatusList>
<InputProxyChannelStatus><id>1</id><online>true</online>
<streamingProxyChannelIdList><streamingProxyChannelId>101</streamingProxyChannelId>
<streamingProxyChannelId>102</streamingProxyChannelId></streamingProxyChannelIdList>
<SecurityStatus><PasswordStatus>invalid</PasswordStatus></SecurityStatus>
</InputProxyChannelStatus>
<InputProxyChannelStatus><id>3</id><online>true</online>
<streamingProxyChannelIdList><streamingProxyChannelId>301</streamingProxyChannelId>
<streamingProxyChannelId>302</streamingProxyChannelId></streamingProxyChannelIdList>
</InputProxyChannelStatus>
</InputProxyChannelStatusList>`;

  const routes = {
    '/ISAPI/ContentMgmt/InputProxy/channels': proxy,
    '/ISAPI/ContentMgmt/InputProxy/channels/status': proxyStatus,
  };

  it('cruza inventario y estado por id de canal', async () => {
    const list = await listProxyChannels(fakeClient(routes));
    expect(list.map((p) => p.name)).toEqual(['Escalera 01', 'Planning & Design']);
    expect(list[0].streamIds).toEqual(['101', '102']);
    expect(list[0].passwordStatus).toBe('invalid');
  });

  it('distingue plug & play de IP propia — decide si el video es alcanzable', async () => {
    const list = await listProxyChannels(fakeClient(routes));
    expect(list[0].connMode).toBe('plugplay');
    expect(list[1].connMode).toBe('manual');
  });

  it('un equipo sin InputProxy devuelve lista vacía, no error', async () => {
    await expect(listProxyChannels(fakeClient({}))).resolves.toEqual([]);
  });
});

describe('clasificación de equipos', () => {
  it('un grabador es NVR aunque conteste que sí a PTZ en todos sus canales', async () => {
    const routes: Record<string, string> = {
      '/ISAPI/System/deviceInfo': '<DeviceInfo><model>DS-7616NXI-I2/16P/VPro</model></DeviceInfo>',
      '/ISAPI/Streaming/channels': nvrChannels,
      '/ISAPI/ContentMgmt/InputProxy/channels': '<InputProxyChannelList></InputProxyChannelList>',
    };
    // Un NVR responde 200 en PTZCtrl para cada canal, sea o no motorizada.
    for (const n of [1, 2, 3]) routes[`/ISAPI/PTZCtrl/channels/${n}/presets`] = '<PTZPresetList/>';
    const d = await describeDevice(fakeClient(routes));
    expect(d.role).toBe('NVR');
    expect(d.kind).toBe('ENCODE');
    // Y el flag PTZ por canal se descarta porque no distingue nada.
    expect(d.videoChannels.every((c) => c.ptz === null)).toBe(true);
  });

  it('una terminal de acceso es ACS aunque publique la cámara de rostro', async () => {
    const d = await describeDevice(
      fakeClient({
        '/ISAPI/System/deviceInfo': '<DeviceInfo><model>DS-K1T343MWX</model></DeviceInfo>',
        '/ISAPI/Streaming/channels': oneChannel,
        '/ISAPI/AccessControl/capabilities': '<AccessControlCap/>',
      }),
    );
    expect(d.role).toBe('ACCESS_TERMINAL');
    expect(d.kind).toBe('ACS');
    expect(d.accessControl).toBe(true);
  });

  it('un domo motorizado es PTZ', async () => {
    const d = await describeDevice(
      fakeClient({
        '/ISAPI/System/deviceInfo': '<DeviceInfo><model>DS-2DF8C442IXG-ELW</model></DeviceInfo>',
        '/ISAPI/Streaming/channels': oneChannel,
        '/ISAPI/PTZCtrl/channels/1/presets': '<PTZPresetList/>',
      }),
    );
    expect(d.role).toBe('PTZ');
  });

  it('una cámara fija es CAMERA', async () => {
    const d = await describeDevice(
      fakeClient({
        '/ISAPI/System/deviceInfo': camDeviceInfo,
        '/ISAPI/Streaming/channels': oneChannel,
      }),
    );
    expect(d.role).toBe('CAMERA');
    expect(d.identity?.serialNumber).toBe('S1');
  });

  it('un equipo que no contesta deviceInfo se reporta caído, no lanza', async () => {
    const d = await describeDevice(fakeClient({}));
    expect(d.reachable).toBe(false);
    expect(d.error).toBeTruthy();
  });

  it('sin canales de video sigue devolviendo la ficha del equipo', async () => {
    const d = await describeDevice(fakeClient({ '/ISAPI/System/deviceInfo': camDeviceInfo }));
    expect(d.reachable).toBe(true);
    expect(d.role).toBe('UNKNOWN');
    expect(d.error).toContain('sin canales de video');
  });
});

describe('barrido', () => {
  it('expande rangos y quita duplicados', () => {
    expect(expandHosts('192.168.9.34,192.168.9.171-173,192.168.9.34')).toEqual([
      '192.168.9.34',
      '192.168.9.171',
      '192.168.9.172',
      '192.168.9.173',
    ]);
  });

  it('rechaza un rango invertido en vez de devolver lista vacía', () => {
    expect(() => expandHosts('10.0.0.9-5')).toThrow(/invertido/i);
  });

  it('el nombre de stream de go2rtc no lleva puntos ni dos puntos', () => {
    expect(streamName('192.168.9.34', '101')).toBe('nx_192_168_9_34_101');
  });
});
