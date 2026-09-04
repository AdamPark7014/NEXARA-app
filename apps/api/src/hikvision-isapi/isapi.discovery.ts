import {
  HikvisionIsapiClient,
  IsapiApiError,
  IsapiAuthRejectedError,
  type IsapiClientOpts,
} from './isapi.client';
import { asList, pick } from './xml';

/**
 * Descubrimiento e identificación de equipos Hikvision por ISAPI en LAN.
 *
 * Rutas empleadas — **todas** documentadas en
 * `HIKVISION-apps/docs/API-DOCS/HIKVISION/`:
 *
 * | Ruta                                        | Uso                         |
 * |---------------------------------------------|-----------------------------|
 * | `GET  /ISAPI/System/deviceInfo`             | identidad (modelo, serie…)  |
 * | `GET  /ISAPI/Streaming/channels`            | canales de video del equipo |
 * | `GET  /ISAPI/AccessControl/capabilities`    | ¿es control de acceso?      |
 * | `GET  /ISAPI/PTZCtrl/channels/{id}/presets` | ¿el canal tiene PTZ?        |
 * | `PUT  /ISAPI/AccessControl/RemoteControl/door/{id}` | apertura remota     |
 *
 * Más `/ISAPI/ContentMgmt/InputProxy/channels[/status]`, que **no** está en el
 * doc set de SYSCOM y por eso se trata aparte (`listProxyChannels`): se usa
 * solo como enriquecimiento opcional, verificado en vivo contra
 * DS-7616NXI-I2/16P/VPro V5.05.370, y cualquier fallo se ignora en silencio.
 * Nada estructural depende de él.
 *
 * Lo que el equipo no reporte se deja en `null`: no se deduce del modelo.
 */

/** Espejo del enum Prisma `IntegraDeviceKind`. */
export type IsapiDeviceKind = 'ENCODE' | 'ACS';

export type IsapiVideoChannel = {
  /** El id que reporta el equipo: 101 = canal 1 principal, 102 = canal 1 sub. */
  id: string;
  name: string | null;
  enabled: boolean;
  codec: string | null;
  width: number | null;
  height: number | null;
  /** Canal físico (101 → 1). Varios ids comparten canal físico. */
  channelNumber: number | null;
  /** El id sin sufijo de stream — `null` si el equipo usa otra numeración. */
  streamIndex: number | null;
  ptz: boolean | null;
  /** El canal declara ANPR / Traffic plate (ITC). False en AcuSense/PTZ DarkFighter. */
  anprCapable: boolean | null;
  /**
   * El canal trae pista de audio. Las cámaras de este parque salen de fábrica
   * con `<Audio><enabled>false</enabled>` aunque el micrófono exista; los
   * terminales de acceso vienen con audio activo. `null` = el equipo no lo dice.
   */
  audio: boolean | null;
  audioCodec: string | null;
  rtsp: string;
  rtspRedacted: string;
  /**
   * Cámara física detrás del canal, cuando el equipo es un grabador.
   * `null` en cámaras sueltas: el canal ya es el propio equipo.
   */
  source: {
    ipAddress: string | null;
    model: string | null;
    serialNumber: string | null;
    connMode: string | null;
    online: boolean;
  } | null;
};

export type IsapiDeviceIdentity = {
  host: string;
  deviceName: string | null;
  deviceId: string | null;
  model: string | null;
  serialNumber: string | null;
  firmwareVersion: string | null;
  firmwareReleasedDate: string | null;
  macAddress: string | null;
  /** `deviceType` tal cual lo reporta el equipo (IPCamera, DVR, ACS…). */
  deviceType: string | null;
};

export type IsapiDiscoveredDevice = {
  host: string;
  reachable: boolean;
  /** `null` cuando no se pudo autenticar o el equipo no habla ISAPI. */
  identity: IsapiDeviceIdentity | null;
  kind: IsapiDeviceKind | null;
  /** Clasificación legible derivada de capacidades + modelo. */
  role: 'NVR' | 'CAMERA' | 'PTZ' | 'ACCESS_TERMINAL' | 'UNKNOWN';
  videoChannels: IsapiVideoChannel[];
  /** Cámaras IP enroladas, si el equipo es un grabador. Vacío si no lo es. */
  proxyChannels: IsapiProxyChannel[];
  accessControl: boolean;
  /** Motivo del fallo, apto para mostrar en UI. */
  error: string | null;
  /** True si el equipo rechazó las credenciales (no reintentar en bucle). */
  authRejected: boolean;
};

/** Extrae la identidad del equipo. Ruta documentada: `/ISAPI/System/deviceInfo`. */
export async function identifyDevice(client: HikvisionIsapiClient): Promise<IsapiDeviceIdentity> {
  const xml = await client.get('/ISAPI/System/deviceInfo');
  const root = (xml.DeviceInfo ?? xml) as Record<string, unknown>;
  return {
    host: client.host,
    deviceName: pick(root, 'deviceName'),
    deviceId: pick(root, 'deviceID'),
    model: pick(root, 'model'),
    serialNumber: pick(root, 'serialNumber'),
    firmwareVersion: pick(root, 'firmwareVersion'),
    firmwareReleasedDate: pick(root, 'firmwareReleasedDate'),
    macAddress: pick(root, 'macAddress'),
    deviceType: pick(root, 'deviceType'),
  };
}

/**
 * Canales de video del equipo. Ruta documentada: `/ISAPI/Streaming/channels`.
 *
 * En un grabador la lista ya incluye los canales IP conectados, pero el nombre
 * que devuelve es el número del canal («101»). Los nombres reales y la cámara
 * de origen los añade `listProxyChannels`.
 */
export async function listVideoChannels(
  client: HikvisionIsapiClient,
): Promise<IsapiVideoChannel[]> {
  const xml = await client.get('/ISAPI/Streaming/channels');
  const list = xml.StreamingChannelList as unknown;
  const nodes = asList(
    (list as Record<string, unknown> | undefined)?.StreamingChannel ?? xml.StreamingChannel,
  );

  return nodes
    .map((node): IsapiVideoChannel | null => {
      const id = pick(node, 'id');
      if (!id) return null;
      const numeric = /^\d+$/.test(id) ? Number(id) : null;
      const width = pick(node, 'Video.videoResolutionWidth');
      const height = pick(node, 'Video.videoResolutionHeight');
      const audioEnabled = pick(node, 'Audio.enabled');
      return {
        id,
        name: pick(node, 'channelName'),
        enabled: pick(node, 'enabled') !== 'false',
        codec: pick(node, 'Video.videoCodecType'),
        width: width ? Number(width) : null,
        height: height ? Number(height) : null,
        // 101 → canal 1, stream 1. Solo aplica a la numeración de 3+ dígitos.
        channelNumber: numeric && id.length >= 3 ? Math.floor(numeric / 100) : numeric,
        streamIndex: numeric && id.length >= 3 ? numeric % 100 : null,
        ptz: null,
        anprCapable: null,
        audio: audioEnabled === null ? null : audioEnabled === 'true',
        audioCodec: pick(node, 'Audio.audioCompressionType'),
        rtsp: client.rtspUrl(id),
        rtspRedacted: client.rtspUrlRedacted(id),
        source: null,
      };
    })
    .filter((c): c is IsapiVideoChannel => c !== null);
}

/**
 * Cámara IP conectada a un grabador, vista desde el grabador.
 *
 * Es la única forma de ver las cámaras en **plug & play**: cuelgan del switch
 * PoE interno del NVR (`192.168.254.x`) y no existen en la LAN del cliente.
 */
export type IsapiProxyChannel = {
  /** Canal físico del NVR (1..16). */
  channel: string;
  /** Nombre que el instalador puso en el NVR — «Escalera 01», «Azotea»… */
  name: string | null;
  ipAddress: string | null;
  model: string | null;
  serialNumber: string | null;
  firmwareVersion: string | null;
  /** `plugplay` = detrás del PoE del NVR; `manual` = IP propia en la LAN. */
  connMode: string | null;
  online: boolean;
  /** Ids de streaming del NVR para este canal: `['101','102']`. */
  streamIds: string[];
  /** El NVR marca `invalid` cuando la contraseña del canal es débil o caducó. */
  passwordStatus: string | null;
};

/**
 * Inventario de cámaras IP de un grabador.
 *
 * Devuelve `[]` si el equipo no expone `InputProxy` (una cámara suelta no lo
 * hace). Ver la nota de cabecera sobre la procedencia de esta ruta.
 */
export async function listProxyChannels(
  client: HikvisionIsapiClient,
): Promise<IsapiProxyChannel[]> {
  let channels: Record<string, unknown>[];
  let statuses: Record<string, unknown>[] = [];
  try {
    const xml = await client.get('/ISAPI/ContentMgmt/InputProxy/channels');
    channels = asList(
      (xml.InputProxyChannelList as Record<string, unknown> | undefined)?.InputProxyChannel,
    );
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    return [];
  }
  try {
    const xml = await client.get('/ISAPI/ContentMgmt/InputProxy/channels/status');
    statuses = asList(
      (xml.InputProxyChannelStatusList as Record<string, unknown> | undefined)
        ?.InputProxyChannelStatus,
    );
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    // El estado es opcional: sin él los canales quedan como offline.
  }

  const byId = new Map(statuses.map((s) => [pick(s, 'id'), s]));
  return channels
    .map((node): IsapiProxyChannel | null => {
      const channel = pick(node, 'id');
      if (!channel) return null;
      const status = byId.get(channel);
      const rawIds = (
        status?.streamingProxyChannelIdList as Record<string, unknown> | undefined
      )?.streamingProxyChannelId;
      return {
        channel,
        name: pick(node, 'name'),
        ipAddress: pick(node, 'sourceInputPortDescriptor.ipAddress'),
        model: pick(node, 'sourceInputPortDescriptor.model'),
        serialNumber: pick(node, 'sourceInputPortDescriptor.serialNumber'),
        firmwareVersion: pick(node, 'sourceInputPortDescriptor.firmwareVersion'),
        connMode: pick(node, 'sourceInputPortDescriptor.connMode'),
        online: status ? pick(status, 'online') === 'true' : false,
        streamIds: (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : []).filter(
          (v): v is string => typeof v === 'string',
        ),
        passwordStatus: status ? pick(status, 'SecurityStatus.PasswordStatus') : null,
      };
    })
    .filter((c): c is IsapiProxyChannel => c !== null);
}

/** `/ISAPI/AccessControl/capabilities` — 200 = el equipo es de control de acceso. */
export async function supportsAccessControl(client: HikvisionIsapiClient): Promise<boolean> {
  try {
    await client.get('/ISAPI/AccessControl/capabilities');
    return true;
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    return false;
  }
}

/** `/ISAPI/PTZCtrl/channels/{id}/presets` — 200 = el canal admite PTZ. */
export async function supportsPtz(
  client: HikvisionIsapiClient,
  channelNumber: number,
): Promise<boolean> {
  try {
    await client.get(`/ISAPI/PTZCtrl/channels/${channelNumber}/presets`);
    return true;
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    return false;
  }
}

/**
 * ANPR / detección de vehículos con placa.
 * En Oficinas NEXARA: NVR y PTZ responden 403 / notSupport — se marca false.
 */
export async function supportsAnpr(
  client: HikvisionIsapiClient,
  channelNumber: number,
): Promise<boolean> {
  try {
    await client.get(`/ISAPI/Traffic/channels/${channelNumber}/licensePlateAuditData/capabilities`);
    return true;
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
  }
  try {
    await client.get(`/ISAPI/Smart/vehicleDetection/${channelNumber}`);
    return true;
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    return false;
  }
}

/**
 * Apertura remota. Ruta documentada:
 * `PUT /ISAPI/AccessControl/RemoteControl/door/{doorId}`.
 *
 * `cmd`: `open` | `close` | `alwaysOpen` | `alwaysClose`.
 */
export async function controlDoor(
  client: HikvisionIsapiClient,
  doorId: number | string,
  cmd: 'open' | 'close' | 'alwaysOpen' | 'alwaysClose' = 'open',
): Promise<void> {
  await client.put(
    `/ISAPI/AccessControl/RemoteControl/door/${doorId}`,
    `<RemoteControlDoor><cmd>${cmd}</cmd></RemoteControlDoor>`,
  );
}

/**
 * Enciende o apaga la pista de audio de un canal de streaming.
 *
 * El firmware rechaza un PUT parcial: hay que devolverle el `StreamingChannel`
 * entero. Así que se lee el XML tal cual, se toca **solo** el `<enabled>` que
 * está dentro de `<Audio>` —el de `<Video>` es otro y apagarlo dejaría el canal
 * mudo y ciego— y se reenvía.
 *
 * Devuelve `false` si el canal no declara bloque de audio: ese equipo no tiene
 * micrófono y no hay nada que encender.
 */
export async function setChannelAudio(
  client: HikvisionIsapiClient,
  channelId: string | number,
  enabled: boolean,
): Promise<boolean> {
  const path = `/ISAPI/Streaming/channels/${channelId}`;
  const { buffer } = await client.getBinary(path);
  const xml = buffer.toString('utf8');

  // Ojo: no usar \x08 / caracteres raros en el patrón — un backspace colado
  // hacía que nunca coincidiera `<Audio>` y el micrófono quedaba apagado.
  const audioBlock = /<Audio\b[^>]*>([\s\S]*?)<\/Audio>/.exec(xml);
  if (!audioBlock) return false;

  const patched = audioBlock[0].replace(
    /<enabled>\s*(?:true|false)\s*<\/enabled>/,
    `<enabled>${enabled ? 'true' : 'false'}</enabled>`,
  );
  if (patched === audioBlock[0]) return false;

  await client.put(path, xml.replace(audioBlock[0], patched));
  return true;
}

/**
 * Deriva el papel del equipo. Manda lo que el equipo **reporta**; el modelo
 * solo desempata (un NVR y una cámara fija responden lo mismo salvo el nº de
 * canales, y el firmware no siempre rellena `deviceType`).
 */
function classify(
  identity: IsapiDeviceIdentity,
  channels: IsapiVideoChannel[],
  acs: boolean,
  anyPtz: boolean,
): { kind: IsapiDeviceKind | null; role: IsapiDiscoveredDevice['role'] } {
  const physical = new Set(channels.map((c) => c.channelNumber).filter((n) => n !== null));

  // El orden importa y no es intercambiable:
  //  · Un NVR contesta que SÍ a PTZ en cuanto una de sus cámaras IP lo es, así
  //    que el conteo de canales físicos tiene que decidir antes que `anyPtz`.
  //  · Una terminal de acceso (DS-K1T3xx) publica un canal de video para el
  //    reconocimiento facial. Tiene cámara, pero no es una cámara: manda ACS.
  if (physical.size > 1) return { kind: 'ENCODE', role: 'NVR' };
  if (acs) return { kind: 'ACS', role: 'ACCESS_TERMINAL' };
  if (anyPtz) return { kind: 'ENCODE', role: 'PTZ' };
  if (channels.length > 0) return { kind: 'ENCODE', role: 'CAMERA' };
  return { kind: null, role: 'UNKNOWN' };
}

/**
 * Identifica un equipo y enumera su video en una pasada.
 *
 * Nunca lanza por fallo del equipo: devuelve la ficha con `error` puesto, para
 * que un barrido de 20 IPs no se caiga por una que está apagada.
 */
export async function discoverDevice(
  opts: IsapiClientOpts & { ptzProbe?: boolean },
): Promise<IsapiDiscoveredDevice> {
  return describeDevice(new HikvisionIsapiClient(opts), { ptzProbe: opts.ptzProbe });
}

/**
 * Igual que `discoverDevice` pero sobre un cliente ya construido — el que
 * resuelve `IntegraSiteService` a partir del sitio, con sus credenciales
 * descifradas. Evita volver a crear un cliente (y a repetir el handshake).
 */
export async function describeDevice(
  client: HikvisionIsapiClient,
  opts?: { ptzProbe?: boolean },
): Promise<IsapiDiscoveredDevice> {
  const base: IsapiDiscoveredDevice = {
    host: client.host,
    reachable: false,
    identity: null,
    kind: null,
    role: 'UNKNOWN',
    videoChannels: [],
    proxyChannels: [],
    accessControl: false,
    error: null,
    authRejected: false,
  };

  let identity: IsapiDeviceIdentity;
  try {
    identity = await identifyDevice(client);
  } catch (e) {
    return {
      ...base,
      error: describe(e),
      authRejected: e instanceof IsapiAuthRejectedError,
    };
  }

  let channels: IsapiVideoChannel[] = [];
  let acs = false;
  const notes: string[] = [];

  try {
    channels = await listVideoChannels(client);
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) {
      return { ...base, identity, reachable: true, error: describe(e), authRejected: true };
    }
    // Una terminal de acceso no expone streaming: no es un fallo.
    notes.push(`sin canales de video (${describe(e)})`);
  }

  try {
    acs = await supportsAccessControl(client);
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) {
      return { ...base, identity, reachable: true, error: describe(e), authRejected: true };
    }
  }

  let anyPtz = false;
  if (opts?.ptzProbe !== false) {
    const physical = [
      ...new Set(channels.map((c) => c.channelNumber).filter((n): n is number => n !== null)),
    ];
    for (const n of physical) {
      let ptz = false;
      let anpr = false;
      try {
        ptz = await supportsPtz(client, n);
      } catch (e) {
        if (e instanceof IsapiAuthRejectedError) {
          return { ...base, identity, reachable: true, error: describe(e), authRejected: true };
        }
      }
      try {
        anpr = await supportsAnpr(client, n);
      } catch (e) {
        if (e instanceof IsapiAuthRejectedError) {
          return { ...base, identity, reachable: true, error: describe(e), authRejected: true };
        }
      }
      if (ptz) anyPtz = true;
      for (const c of channels) {
        if (c.channelNumber === n) {
          c.ptz = ptz;
          c.anprCapable = anpr;
        }
      }
    }
  }

  const { kind, role } = classify(identity, channels, acs, anyPtz);

  // Solo los grabadores tienen cámaras enroladas; pedírselo a una cámara suelta
  // es una petición de más por equipo en cada barrido.
  let proxyChannels: IsapiProxyChannel[] = [];
  if (role === 'NVR') {
    try {
      proxyChannels = await listProxyChannels(client);
    } catch (e) {
      if (e instanceof IsapiAuthRejectedError) {
        return { ...base, identity, reachable: true, error: describe(e), authRejected: true };
      }
    }
    const byStreamId = new Map<string, IsapiProxyChannel>();
    for (const p of proxyChannels) for (const id of p.streamIds) byStreamId.set(id, p);

    for (const c of channels) {
      const p = byStreamId.get(c.id);
      if (!p) continue;
      // El nombre del NVR («Escalera 01») gana al del canal («101»).
      if (p.name) c.name = p.name;
      c.source = {
        ipAddress: p.ipAddress,
        model: p.model,
        serialNumber: p.serialNumber,
        connMode: p.connMode,
        online: p.online,
      };
    }
    // En un grabador, `PTZCtrl` responde 200 para todos los canales aunque la
    // cámara sea fija: el dato no distingue nada y engaña. Se descarta.
    for (const c of channels) c.ptz = null;
  }

  return {
    host: client.host,
    reachable: true,
    identity,
    kind,
    role,
    videoChannels: channels,
    proxyChannels,
    accessControl: acs,
    error: notes.length ? notes.join('; ') : null,
    authRejected: false,
  };
}

function describe(e: unknown): string {
  if (e instanceof IsapiAuthRejectedError) return e.message;
  if (e instanceof IsapiApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Apunta el «host de notificación» del equipo a una URL nuestra.
 *
 * Es lo que convierte el sondeo en empuje: a partir de aquí el aparato avisa
 * él solo en cuanto pasa algo, en vez de esperar a que le preguntemos. El
 * firmware limita la URL a 128 caracteres (`urlLen max="128"`), de ahí que el
 * token sea corto.
 *
 * `uploadImagesDataType` solo lo aceptan las cámaras; los terminales no lo
 * declaran en sus capacidades y se lo tragan como campo desconocido, así que
 * se manda únicamente donde sirve.
 */
export async function setHttpNotificationHost(
  client: HikvisionIsapiClient,
  opts: {
    /** Ranura del equipo. Tienen 2 o 3; la 1 estaba vacía en todos. */
    id?: number;
    url: string;
    withImages?: boolean;
  },
): Promise<void> {
  const u = new URL(opts.url);
  const id = opts.id ?? 1;
  const https = u.protocol === 'https:';
  const port = u.port || (https ? '443' : '80');
  // El equipo quiere host y ruta por separado, no la URL entera.
  const body =
    `<HttpHostNotification>` +
    `<id>${id}</id>` +
    `<url>${u.pathname}${u.search}</url>` +
    `<protocolType>${https ? 'HTTPS' : 'HTTP'}</protocolType>` +
    `<parameterFormatType>JSON</parameterFormatType>` +
    `<addressingFormatType>hostname</addressingFormatType>` +
    `<hostName>${u.hostname}</hostName>` +
    `<portNo>${port}</portNo>` +
    `<httpAuthenticationMethod>none</httpAuthenticationMethod>` +
    (opts.withImages ? `<uploadImagesDataType>binary</uploadImagesDataType>` : '') +
    `</HttpHostNotification>`;

  await client.put(`/ISAPI/Event/notification/httpHosts/${id}`, body);
}

/** Deja la ranura vacía: el equipo deja de avisar. */
export async function clearHttpNotificationHost(
  client: HikvisionIsapiClient,
  id = 1,
): Promise<void> {
  await client.put(
    `/ISAPI/Event/notification/httpHosts/${id}`,
    `<HttpHostNotification><id>${id}</id><url></url><protocolType>HTTP</protocolType>` +
      `<addressingFormatType>ipaddress</addressingFormatType><ipAddress>0.0.0.0</ipAddress>` +
      `<portNo>0</portNo><httpAuthenticationMethod>none</httpAuthenticationMethod>` +
      `</HttpHostNotification>`,
  );
}

/**
 * Enciende la detección de intrusión sobre todo el encuadre, solo para personas.
 *
 * Las reglas vienen de fábrica presentes pero con las zonas apagadas **y sin
 * polígono**: la región 1 no trae `RegionCoordinatesList`, así que no basta con
 * poner `enabled` a true — hay que darle la zona. Se le da el cuadro entero en
 * la rejilla normalizada que el propio equipo declara (1000×1000).
 *
 * `detectionTarget` se deja en `human`: con `vehicle` una oficina dispara con
 * cualquier cosa que se mueva y el evento deja de significar nada.
 */
export async function enableHumanFieldDetection(
  client: HikvisionIsapiClient,
  channel = 1,
): Promise<boolean> {
  const path = `/ISAPI/Smart/FieldDetection/${channel}`;
  const { buffer } = await client.getBinary(path);
  const xml = buffer.toString('utf8');

  const regions = [...xml.matchAll(/<FieldDetectionRegion\b[\s\S]*?<\/FieldDetectionRegion>/g)];
  if (regions.length === 0) return false;

  const w = Number(/<normalizedScreenWidth>(\d+)</.exec(xml)?.[1]) || 1000;
  const h = Number(/<normalizedScreenHeight>(\d+)</.exec(xml)?.[1]) || 1000;
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
    .map(([x, y]) => `<RegionCoordinates><positionX>${x}</positionX><positionY>${y}</positionY></RegionCoordinates>`)
    .join('');

  // Disparar más a menudo: umbral de tiempo mínimo y sensibilidad alta
  // (valores típicos ISAPI FieldDetectionRegion; si el tag no existe, se inserta).
  const bump = (regionXml: string, tag: string, value: string) => {
    if (new RegExp(`<${tag}>`, 'i').test(regionXml)) {
      return regionXml.replace(new RegExp(`<${tag}>[^<]*</${tag}>`, 'i'), `<${tag}>${value}</${tag}>`);
    }
    return regionXml.replace(
      /<\/FieldDetectionRegion>/i,
      `<${tag}>${value}</${tag}></FieldDetectionRegion>`,
    );
  };

  let out = xml;
  // Todas las regiones del canal: una sola zona apagada deja huecos sin caja.
  for (const match of regions) {
    let patched = match[0]
      .replace(/<enabled>\s*false\s*<\/enabled>/, '<enabled>true</enabled>')
      .replace(/<detectionTarget>[^<]*<\/detectionTarget>/, '<detectionTarget>human</detectionTarget>');
    patched = bump(patched, 'sensitivity', '95');
    patched = bump(patched, 'timeThreshold', '0');
    if (!/<RegionCoordinatesList>/.test(patched)) {
      patched = patched.replace(
        /<\/FieldDetectionRegion>/,
        `<RegionCoordinatesList>${corners}</RegionCoordinatesList></FieldDetectionRegion>`,
      );
    }
    out = out.replace(match[0], patched);
  }

  await client.put(path, out);
  return true;
}

/** Apaga la región 1 y deja de disparar. */
export async function disableFieldDetection(
  client: HikvisionIsapiClient,
  channel = 1,
): Promise<boolean> {
  const path = `/ISAPI/Smart/FieldDetection/${channel}`;
  const { buffer } = await client.getBinary(path);
  const xml = buffer.toString('utf8');
  const region = /<FieldDetectionRegion\b[\s\S]*?<\/FieldDetectionRegion>/.exec(xml);
  if (!region) return false;
  const patched = region[0].replace(/<enabled>\s*true\s*<\/enabled>/, '<enabled>false</enabled>');
  await client.put(path, xml.replace(region[0], patched));
  return true;
}

/**
 * Mueve la domo en pan/tilt/zoom (-100..100).
 *
 * - `continuous: true` → modo continuo (hold-to-move): arranca y sigue hasta
 *   `ptzStop`. Una sola ida HTTP, sin esperar `durationMs`.
 * - por defecto → `momentary` con tope: si se cae la red, para sola.
 */
export async function ptzMove(
  client: HikvisionIsapiClient,
  channel: number | string,
  v: { pan?: number; tilt?: number; zoom?: number; durationMs?: number; continuous?: boolean },
): Promise<void> {
  const clamp = (n: number | undefined) =>
    Math.max(-100, Math.min(100, Math.round(Number(n) || 0)));
  const body =
    `<PTZData><pan>${clamp(v.pan)}</pan><tilt>${clamp(v.tilt)}</tilt>` +
    `<zoom>${clamp(v.zoom)}</zoom>`;
  if (v.continuous) {
    await client.put(`/ISAPI/PTZCtrl/channels/${channel}/continuous`, `${body}</PTZData>`);
    return;
  }
  const duration = Math.max(80, Math.min(5000, Math.round(v.durationMs ?? 280)));
  await client.put(
    `/ISAPI/PTZCtrl/channels/${channel}/momentary`,
    `${body}<Momentary><duration>${duration}</duration></Momentary></PTZData>`,
  );
}

/** Para en seco. Por si un `momentary` se quedó colgado. */
export async function ptzStop(
  client: HikvisionIsapiClient,
  channel: number | string,
): Promise<void> {
  await client.put(
    `/ISAPI/PTZCtrl/channels/${channel}/continuous`,
    '<PTZData><pan>0</pan><tilt>0</tilt><zoom>0</zoom></PTZData>',
  );
}

/** Va a una posición memorizada. */
export async function ptzGoToPreset(
  client: HikvisionIsapiClient,
  channel: number | string,
  preset: number,
): Promise<void> {
  await client.put(`/ISAPI/PTZCtrl/channels/${channel}/presets/${preset}/goto`, '');
}

export type PtzPreset = { id: number; name: string };

/** Posiciones memorizadas, sin las vacías que el equipo devuelve igual. */
export async function ptzPresets(
  client: HikvisionIsapiClient,
  channel: number | string,
): Promise<PtzPreset[]> {
  const xml = await client.get(`/ISAPI/PTZCtrl/channels/${channel}/presets`);
  const list = (xml.PTZPresetList ?? xml) as Record<string, unknown>;
  return asList(list.PTZPreset)
    .map((p) => ({
      id: Number(pick(p, 'id')),
      name: (pick(p, 'presetName') || '').trim(),
    }))
    .filter((p) => Number.isFinite(p.id) && p.name.length > 0);
}
