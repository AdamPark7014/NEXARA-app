import {
  HikvisionIsapiClient,
  IsapiApiError,
  IsapiAuthRejectedError,
  type IsapiClientOpts,
} from './isapi.client';
import { asList, pick } from './xml';
import {
  SMART_EVENT_TYPES,
  parseSmartCapabilities,
  patchFieldDetectionXml,
  patchLineDetectionXml,
  resolveTriggerEventTypes,
  type DetectionTuning,
  type SmartCapabilities,
} from './isapi.detection';

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
 * Preferimos GET de la ranura y parchear campos: el NVR Oficinas exige
 * `parameterFormatType=XML` + Extensions y rechaza JSON/`uploadImagesDataType`
 * con `badXmlContent`. AcuSense sigue con JSON + binary images.
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
  const pathAndQuery = `${u.pathname}${u.search}`;

  const setTag = (src: string, tag: string, value: string): string => {
    if (new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'i').test(src)) {
      return src.replace(
        new RegExp(`(<${tag}>)[\\s\\S]*?(</${tag}>)`, 'i'),
        `$1${value}$2`,
      );
    }
    return src.replace(
      /<\/HttpHostNotification>/i,
      `<${tag}>${value}</${tag}></HttpHostNotification>`,
    );
  };

  let existing: string | null = null;
  try {
    const { buffer } = await client.getBinary(
      `/ISAPI/Event/notification/httpHosts/${id}`,
    );
    const xml = buffer.toString('utf8');
    if (/<HttpHostNotification\b/i.test(xml)) existing = xml;
  } catch {
    existing = null;
  }

  if (existing) {
    let body = existing;
    body = setTag(body, 'id', String(id));
    body = setTag(body, 'url', pathAndQuery);
    body = setTag(body, 'addressingFormatType', 'hostname');
    body = setTag(body, 'hostName', u.hostname);
    body = setTag(body, 'httpAuthenticationMethod', 'none');
    const isXmlFormat =
      /<parameterFormatType>\s*XML\s*<\/parameterFormatType>/i.test(body);
    // NVR Oficinas: HTTPS en httpHosts → badXmlContent. Solo HTTP:80.
    // AcuSense JSON sigue con HTTPS.
    if (isXmlFormat) {
      body = setTag(body, 'protocolType', 'HTTP');
      body = setTag(body, 'portNo', '80');
    } else {
      body = setTag(body, 'protocolType', https ? 'HTTPS' : 'HTTP');
      body = setTag(body, 'portNo', port);
      if (opts.withImages) {
        body = setTag(body, 'uploadImagesDataType', 'binary');
      }
    }
    await client.put(`/ISAPI/Event/notification/httpHosts/${id}`, body);
    return;
  }

  // Fallback: plantilla AcuSense (JSON + imágenes opcionales).
  const body =
    `<HttpHostNotification>` +
    `<id>${id}</id>` +
    `<url>${pathAndQuery}</url>` +
    `<protocolType>${https ? 'HTTPS' : 'HTTP'}</protocolType>` +
    `<parameterFormatType>JSON</parameterFormatType>` +
    `<addressingFormatType>hostname</addressingFormatType>` +
    `<hostName>${u.hostname}</hostName>` +
    `<portNo>${port}</portNo>` +
    `<httpAuthenticationMethod>none</httpAuthenticationMethod>` +
    (opts.withImages ? `<uploadImagesDataType>binary</uploadImagesDataType>` : '') +
    `<httpBroken>false</httpBroken>` +
    `</HttpHostNotification>`;

  await client.put(`/ISAPI/Event/notification/httpHosts/${id}`, body);
}

/**
 * Asegura que los tipos de evento de `SMART_EVENT_TYPES` notifiquen al
 * «center» (httpHosts). Sin eso el smart dispara local pero no empuja.
 * Ruta verificada: GET/PUT `/ISAPI/Event/triggers` en DS-2CD2123G2.
 *
 * La lista blanca ya no vive escondida aquí dentro: está en
 * `isapi.detection.ts` (`SMART_EVENT_TYPES`), documentada y con el catálogo
 * del Apéndice B al lado. `extraEventTypes` la amplía por cámara desde el
 * perfil de detección, y solo admite valores de ese catálogo.
 */
export async function ensureSmartEventTriggersCenter(
  client: HikvisionIsapiClient,
  extraEventTypes?: readonly string[] | null,
): Promise<boolean> {
  const path = '/ISAPI/Event/triggers';
  try {
    const { buffer } = await client.getBinary(path);
    let xml = buffer.toString('utf8');
    if (!/<EventTriggerList\b/i.test(xml)) return false;

    const want = resolveTriggerEventTypes(extraEventTypes, SMART_EVENT_TYPES);
    let changed = false;
    const centerBlock =
      `<EventTriggerNotification>` +
      `<id>center</id>` +
      `<notificationMethod>center</notificationMethod>` +
      `<notificationRecurrence>beginning</notificationRecurrence>` +
      `</EventTriggerNotification>`;

    const triggers = [...xml.matchAll(/<EventTrigger\b[\s\S]*?<\/EventTrigger>/g)];
    for (const match of triggers) {
      const block = match[0];
      const et = /<eventType>([^<]*)<\/eventType>/i.exec(block)?.[1] || '';
      if (!want.some((w) => et.toLowerCase().includes(w.toLowerCase()))) continue;
      if (/<notificationMethod>\s*center\s*<\/notificationMethod>/i.test(block)) continue;
      // Insertar center dentro de la lista de notificaciones, o crear la lista.
      let patched: string;
      if (/<EventTriggerNotificationList>/i.test(block)) {
        patched = block.replace(
          /<\/EventTriggerNotificationList>/i,
          `${centerBlock}</EventTriggerNotificationList>`,
        );
      } else {
        patched = block.replace(
          /<\/EventTrigger>/i,
          `<EventTriggerNotificationList>${centerBlock}</EventTriggerNotificationList></EventTrigger>`,
        );
      }
      xml = xml.replace(block, patched);
      changed = true;
    }
    if (changed) await client.put(path, xml);
    return true;
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    return false;
  }
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

/** Lee las ranuras httpHosts (URL viva si ya están cableadas). */
export async function readHttpNotificationHosts(
  client: HikvisionIsapiClient,
): Promise<Array<{ id: number; url: string; host: string; protocol: string }>> {
  try {
    const xml = await client.get('/ISAPI/Event/notification/httpHosts');
    const list = (xml.HttpHostNotificationList ?? xml) as Record<string, unknown>;
    return asList(list.HttpHostNotification)
      .map((n) => {
        const idRaw = n.id;
        const id = Number(
          typeof idRaw === 'string' || typeof idRaw === 'number' ? idRaw : pick(n, 'id'),
        );
        const path = pick(n, 'url') || '';
        const host = pick(n, 'hostName') || pick(n, 'ipAddress') || '';
        const protocol = (pick(n, 'protocolType') || 'HTTP').toLowerCase();
        const port = pick(n, 'portNo') || (protocol === 'https' ? '443' : '80');
        if (!path || path === '/' || !host || host === '0.0.0.0') {
          return null;
        }
        return {
          id: Number.isFinite(id) ? id : 0,
          url: `${protocol}://${host}:${port}${path}`,
          host,
          protocol,
        };
      })
      .filter((x): x is { id: number; url: string; host: string; protocol: string } => x !== null);
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    return [];
  }
}

/**
 * Enciende motion detection (VMD clásico). La PTZ DarkFighter no tiene
 * FieldDetection; sí responde 200 a motionDetection. Sube sensibilidad si
 * viene en 0 (medido en .179: enabled=true pero sensitivityLevel=0 → sin push).
 */
export async function enableMotionDetection(
  client: HikvisionIsapiClient,
  channel = 1,
  sensitivity = 60,
): Promise<boolean> {
  const path = `/ISAPI/System/Video/inputs/channels/${channel}/motionDetection`;
  try {
    const { buffer } = await client.getBinary(path);
    let xml = buffer.toString('utf8');
    if (!/<MotionDetection\b/i.test(xml)) return false;
    xml = xml.replace(/<enabled>\s*false\s*<\/enabled>/i, '<enabled>true</enabled>');
    if (/<sensitivityLevel>\s*\d+\s*<\/sensitivityLevel>/i.test(xml)) {
      xml = xml.replace(
        /<sensitivityLevel>\s*\d+\s*<\/sensitivityLevel>/i,
        `<sensitivityLevel>${Math.max(1, Math.min(100, Math.round(sensitivity)))}</sensitivityLevel>`,
      );
    }
    await client.put(path, xml);
    return true;
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    return false;
  }
}

/**
 * Enciende FieldDetection (intrusión AcuSense) con los parámetros del perfil.
 *
 * Verificado en DS-2CD2123G2-LIS2U V5.7.19 (Oficinas .171–.178):
 * - Tag real = `sensitivityLevel` (0–100), **no** `sensitivity`.
 * - `alarmConfidence` opt=`low,mediumLow,mediumHigh,high` (**empírico**: el
 *   equipo lo devuelve, pero no está en la documentación del fabricante).
 * - Hasta 4 regiones; sin polígono la región no dispara.
 * - IntrusionDetection separado → 404 (FieldDetection es la intrusión).
 *
 * `tuning` sale del perfil de la cámara (`IntegraDetectionProfile`). Sin perfil
 * se reproduce **casi** el comportamiento anterior —fotograma completo en la
 * ranura 1, `detectionTarget=human`, `alarmConfidence=low`— con una diferencia
 * deliberada: la sensibilidad baja de 100 (el techo del rango) a
 * `DEFAULT_SENSITIVITY`. El máximo sobre el encuadre entero es la causa directa
 * de los falsos positivos; el porqué del número está en `isapi.detection.ts`.
 *
 * Acepta también la forma vieja (`enableFieldDetection(client, 1, 'human')`)
 * para no tocar a quien solo quería fijar el objetivo.
 */
export async function enableFieldDetection(
  client: HikvisionIsapiClient,
  channel = 1,
  tuning: DetectionTuning | 'human' | 'human,vehicle' | 'vehicle' = 'human',
): Promise<boolean> {
  const t: DetectionTuning = typeof tuning === 'string' ? { target: tuning } : tuning;
  const path = `/ISAPI/Smart/FieldDetection/${channel}`;
  const { buffer } = await client.getBinary(path);
  const patch = patchFieldDetectionXml(buffer.toString('utf8'), t);
  if (!patch) return false;
  await client.put(path, patch.xml);
  return true;
}

/** Atajo: FieldDetection solo personas (oficinas AcuSense). */
export async function enableHumanFieldDetection(
  client: HikvisionIsapiClient,
  channel = 1,
): Promise<boolean> {
  return enableFieldDetection(client, channel, 'human');
}

/**
 * Cruce de línea. Verificado: `/ISAPI/Smart/LineDetection/1` en DS-2CD2123G2
 * (SmartCap true). Sirve para TargetRect al cruzar; sentados quietos siguen
 * siendo FieldDetection.
 *
 * Sin perfil: línea horizontal a media altura, dirección `any` — igual que
 * antes, salvo la sensibilidad (100 → `DEFAULT_SENSITIVITY`). Con perfil, cada
 * polígono aporta sus dos extremos como segmento.
 */
export async function enableLineDetection(
  client: HikvisionIsapiClient,
  channel = 1,
  tuning: DetectionTuning | 'human' | 'human,vehicle' = 'human',
): Promise<boolean> {
  const t: DetectionTuning = typeof tuning === 'string' ? { target: tuning } : tuning;
  const path = `/ISAPI/Smart/LineDetection/${channel}`;
  try {
    const { buffer } = await client.getBinary(path);
    const xml = buffer.toString('utf8');
    if (!/<LineDetection\b/i.test(xml) && !/<LineItem\b/i.test(xml)) return false;
    const patch = patchLineDetectionXml(xml, t);
    if (!patch) return false;
    await client.put(path, patch.xml);
    return true;
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    return false;
  }
}

/**
 * FaceDetect AcuSense = cajas de rostro, **no** Face ID / nombres.
 * SmartCap `isSupportFaceDetect=true` en DS-2CD2123G2; Face ID óptico no existe.
 */
export async function enableFaceDetect(
  client: HikvisionIsapiClient,
  channel = 1,
): Promise<boolean> {
  const path = `/ISAPI/Smart/FaceDetect/${channel}`;
  try {
    const { buffer } = await client.getBinary(path);
    let xml = buffer.toString('utf8');
    if (!/<FaceDetect\b/i.test(xml)) return false;
    xml = xml
      .replace(/<enabled>\s*false\s*<\/enabled>/i, '<enabled>true</enabled>')
      .replace(
        /<sensitivityLevel>\s*\d+\s*<\/sensitivityLevel>/i,
        '<sensitivityLevel>5</sensitivityLevel>',
      )
      .replace(
        /<highlightsenabled>\s*false\s*<\/highlightsenabled>/i,
        '<highlightsenabled>true</highlightsenabled>',
      );
    await client.put(path, xml);
    return true;
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    return false;
  }
}

/**
 * Asegura substream H.264 (go2rtc MSE). No toca main H.265.
 * Verificado: canal `…02` = sub en DS-2CD2123G2 (ya H.264 640×360 en Oficinas).
 */
export async function ensureSubstreamH264(
  client: HikvisionIsapiClient,
  channel = 1,
): Promise<'ok' | 'already' | 'no-channel' | 'fail'> {
  const subId = `${channel}02`;
  const path = `/ISAPI/Streaming/channels/${subId}`;
  try {
    const { buffer } = await client.getBinary(path);
    const xml = buffer.toString('utf8');
    if (!/<StreamingChannel\b/i.test(xml)) return 'no-channel';
    const codec = /<videoCodecType>([^<]*)<\/videoCodecType>/i.exec(xml)?.[1]?.trim();
    if (!codec) return 'no-channel';
    if (/^H\.?264$/i.test(codec)) return 'already';
    const patched = xml.replace(
      /<videoCodecType>[^<]*<\/videoCodecType>/i,
      '<videoCodecType>H.264</videoCodecType>',
    );
    await client.put(path, patched);
    return 'ok';
  } catch (e) {
    if (e instanceof IsapiAuthRejectedError) throw e;
    return 'fail';
  }
}

export type MaxSmartDetectionReport = {
  field: boolean;
  line: boolean;
  motion: boolean;
  face: boolean;
  audio: boolean;
  triggers: boolean;
  substream: 'ok' | 'already' | 'no-channel' | 'fail';
};

/**
 * Deja una AcuSense lista para dar cajas y empujar eventos, **con los
 * parámetros del perfil de esa cámara**.
 *
 * No inventa Face ID: FaceDetect solo aporta FaceRect / highlighted.
 *
 * Sin `tuning` el resultado es el de siempre salvo la sensibilidad, que ya no
 * es el techo del rango. `extraEventTypes` amplía la lista blanca de
 * `/ISAPI/Event/triggers` con tipos del Apéndice B para esta cámara.
 */
export async function enableMaxSmartDetection(
  client: HikvisionIsapiClient,
  opts: {
    channel?: number;
    /** Oficinas indoor: `human`. Entrada/azotea/almacén: `human,vehicle`. */
    fieldTarget?: 'human' | 'human,vehicle';
    /** Perfil de la cámara: región, sensibilidad, confianza, permanencia. */
    tuning?: DetectionTuning | null;
    /** Tipos del Apéndice B a añadir a la lista blanca de esta cámara. */
    extraEventTypes?: readonly string[] | null;
    line?: boolean;
    face?: boolean;
    motion?: boolean;
    audio?: boolean;
    substreamH264?: boolean;
  } = {},
): Promise<MaxSmartDetectionReport> {
  const channel = opts.channel ?? 1;
  const fieldTarget = opts.fieldTarget ?? 'human';
  // El `target` explícito del perfil manda sobre el que deduce el llamante por
  // el nombre de la cámara; si el perfil no lo trae, se respeta el de siempre.
  const tuning: DetectionTuning = {
    target: fieldTarget,
    ...(opts.tuning ?? {}),
  };
  const report: MaxSmartDetectionReport = {
    field: false,
    line: false,
    motion: false,
    face: false,
    audio: false,
    triggers: false,
    substream: 'no-channel',
  };

  report.field = await enableFieldDetection(client, channel, tuning);

  if (opts.line !== false) {
    report.line = await enableLineDetection(client, channel, tuning);
  }
  if (opts.face !== false) {
    report.face = await enableFaceDetect(client, channel);
  }
  if (opts.motion !== false) {
    report.motion = await enableMotionDetection(client, channel, 80);
  }
  report.triggers = await ensureSmartEventTriggersCenter(client, opts.extraEventTypes);
  if (opts.audio !== false) {
    // Sub + main: si hay bloque Audio, encenderlo (mic en AcuSense Oficinas = true).
    const a1 = await setChannelAudio(client, `${channel}01`, true);
    const a2 = await setChannelAudio(client, `${channel}02`, true);
    report.audio = a1 || a2;
  }
  if (opts.substreamH264 !== false) {
    report.substream = await ensureSubstreamH264(client, channel);
  }
  return report;
}

/**
 * `GET /ISAPI/Smart/capabilities` — **hasta hoy no se llamaba desde ningún
 * punto del código.**
 *
 * Sin esto se planifica a ciegas: merodeo, zona restringida, objeto abandonado
 * y desenfoque estaban en «no verificado», que no es lo mismo que «no
 * soportado». La ruta es **empírica** (no está en el corpus del fabricante),
 * pero se midió: la PTZ DarkFighter responde
 * `SmartCap.isSupportFieldDetection=false` y las AcuSense `true`.
 *
 * Devuelve `null` si el equipo no contesta o no habla de capacidades smart —
 * que también es un dato: es lo que hace la PTZ.
 */
export async function probeSmartCapabilities(
  client: HikvisionIsapiClient,
  channel?: number,
): Promise<{ caps: SmartCapabilities; xml: string } | null> {
  // El canal no siempre existe en la ruta; el equipo suele responder a la raíz.
  const paths =
    channel != null
      ? [`/ISAPI/Smart/capabilities?channel=${channel}`, '/ISAPI/Smart/capabilities']
      : ['/ISAPI/Smart/capabilities'];
  for (const path of paths) {
    try {
      const { buffer } = await client.getBinary(path);
      const xml = buffer.toString('utf8');
      // Un 200 con HTML o con un error genérico no es una respuesta de caps.
      if (!/isSupport[A-Za-z0-9_]*>/.test(xml)) continue;
      return { caps: parseSmartCapabilities(xml), xml };
    } catch (e) {
      if (e instanceof IsapiAuthRejectedError) throw e;
      // 403 notSupport / 404: seguir con la siguiente ruta.
    }
  }
  return null;
}

/**
 * Canales PoE del NVR Oficinas con FieldDetection `human,vehicle` verificado
 * (Escalera/Entrance/Escaleras/Azotea). El canal 13 (PTZ) responde 403.
 */
export async function enableNvrParkingVehicleDetection(
  client: HikvisionIsapiClient,
  channels: number[] = [1, 2, 9, 10],
  /** Perfil por canal del NVR: `{ 9: { sensitivity: 35, regions: [...] } }`. */
  tuningByChannel?: Record<number, DetectionTuning | null | undefined> | null,
): Promise<Array<{ channel: number; ok: boolean; error?: string }>> {
  const out: Array<{ channel: number; ok: boolean; error?: string }> = [];
  for (const channel of channels) {
    try {
      const ok = await enableFieldDetection(client, channel, {
        target: 'human,vehicle',
        ...(tuningByChannel?.[channel] ?? {}),
      });
      out.push({ channel, ok });
    } catch (e) {
      out.push({
        channel,
        ok: false,
        error: e instanceof Error ? e.message.slice(0, 160) : String(e),
      });
    }
  }
  return out;
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
