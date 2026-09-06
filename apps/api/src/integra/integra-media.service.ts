import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  asList,
  pick,
  ptzGoToPreset,
  ptzMove,
  ptzPresets,
  ptzStop,
  setChannelAudio,
} from '../hikvision-isapi';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegraSiteService } from './integra-site.service';
import {
  decidirLiberacionHd,
  dentroDelMargenHd,
  elegirModoHd,
  hdTranscodeSource,
  mainStreamPlayable,
  notaHd,
  requiereTranscodificacion,
  reservarRanuraHd,
  type RanuraHd,
  type StreamQuality,
} from './integra-media.hd';

/**
 * La decisión de calidad vive en `integra-media.hd.ts`, que es lógica pura y se
 * prueba sin levantar Nest. Se reexporta desde aquí porque este es el módulo
 * por el que entra el resto del código.
 */
export { mainStreamPlayable };
export type { StreamQuality };

/**
 * En Hikvision el id de stream es `<canal><perfil>`: 301 es el principal del
 * canal 3 y 302 su secundario. Una cámara suelta numera desde 1, así que su
 * secundario es siempre 102.
 */
const SUB_STREAM_ID = 102;
const MAIN_STREAM_ID = 101;

/**
 * `192.168.9.34|301` → `192_168_9_34_301`.
 *
 * go2rtc guarda los streams por nombre y ese nombre acaba en una URL y en su
 * YAML: solo se dejan pasar caracteres que sobreviven a los dos.
 */
function slugDeCamara(cameraIndexCode: string): string {
  return cameraIndexCode.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Nombre con el que vive en go2rtc el stream que abre el muro.
 *
 * Es el secundario y mudo —`quality: 'sub'`, sin audio—, que es exactamente lo
 * que pide un mosaico. Vive fuera de `publish()` porque el precalentado
 * necesita saber, ANTES de registrar nada, si esa cámara ya está caliente; si
 * los dos nombres se calcularan por separado acabarían divergiendo y el
 * precalentado registraría streams que nadie consume.
 */
export function nombreStreamMuro(cameraIndexCode: string): string {
  return `cam_${slugDeCamara(cameraIndexCode)}`;
}

function subStreamOf(channelId: string): string {
  return /^\d{3,}$/.test(channelId) ? `${channelId.slice(0, -1)}2` : channelId;
}

function mainStreamOf(channelId: string): string {
  return /^\d{3,}$/.test(channelId) ? `${channelId.slice(0, -1)}1` : channelId;
}

/**
 * Fuente go2rtc con audio audible en el navegador.
 *
 * Los equipos entregan el audio en G.711 (`pcm_mulaw`, 8 kHz) y MSE no
 * reproduce G.711: sin esto el navegador recibe el MP4 **sin pista de audio**
 * —comprobado con ffprobe contra `/api/stream.mp4`—. Se transcodifica solo el
 * audio a AAC y el video se copia tal cual, así que el coste es el de 8 kHz
 * mono y no el de reencodear 720p. go2rtc trae ffmpeg en la propia imagen.
 */
function audioSourceFor(rtsp: string): string {
  return `ffmpeg:${rtsp}#video=copy#audio=aac`;
}

/**
 * Registra el RTSP de Artemis en go2rtc y devuelve URL HLS consumible por el browser.
 * Sitios HCT: stream token cloud (EZUIKit) — ADR-0019; no go2rtc RTSP.
 * Sitios ISAPI: RTSP directo del equipo en LAN → go2rtc (ADR-0019 §5).
 */
@Injectable()
export class IntegraMediaService {
  private readonly logger = new Logger(IntegraMediaService.name);

  /**
   * La única ranura de transcodificación HD del servidor.
   *
   * Vive en el proceso, no en Redis, porque lo que protege es la CPU **de esta
   * máquina**: si algún día hay una segunda réplica de la API, cada una tendrá
   * su propia ranura y su propio ffmpeg, que es exactamente lo correcto.
   */
  private ranuraHd: RanuraHd | null = null;

  constructor(
    private readonly sites: IntegraSiteService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private go2rtcInternal(): string | null {
    const u = this.config.get<string>('GO2RTC_URL') || '';
    return u ? u.replace(/\/$/, '') : null;
  }

  private go2rtcPublic(): string | null {
    const pub = this.config.get<string>('GO2RTC_PUBLIC_URL') || '';
    if (pub) return pub.replace(/\/$/, '');
    return this.go2rtcInternal();
  }

  async liveStream(
    companyId: number | null,
    cameraIndexCode: string,
    siteId?: number | null,
    opts?: { audio?: boolean; quality?: StreamQuality },
  ) {
    const quality: StreamQuality = opts?.quality === 'main' ? 'main' : 'sub';
    // Cada petición de vivo —también las 13 del muro, que son las que llegan
    // seguro— aprovecha para comprobar si la transcodificación sigue haciendo
    // falta. Así la ranura se libera aunque nadie vuelva a pedir alta calidad,
    // sin montar un temporizador con su propio ciclo de vida.
    await this.liberarRanuraHdSiNadieMira(Date.now());
    const resolved = await this.sites.resolveClient({ companyId, siteId });

    if (resolved.provider === 'HCT' && resolved.hct) {
      const stream = await resolved.hct.streamToken();
      return {
        cameraIndexCode,
        provider: 'HCT' as const,
        rtsp: null,
        hls: null,
        stream,
        note:
          'HCT: usar EZUIKit/HLS cloud con appToken + streamAreaDomain (no go2rtc). Ver ADR-0019.',
      };
    }

    if (resolved.provider === 'ISAPI' && resolved.isapi) {
      const source = await this.isapiRtsp(resolved, cameraIndexCode, quality);
      if (!source) {
        return {
          cameraIndexCode,
          provider: 'ISAPI' as const,
          rtsp: null,
          hls: null,
          hasAudio: false,
          note: `Cámara ${cameraIndexCode} no está en el espejo del sitio. Corre el sync.`,
        };
      }
      return this.publish('ISAPI', cameraIndexCode, source.rtsp, source.redacted, source.note, {
        hasAudio: source.hasAudio,
        withAudio: Boolean(opts?.audio) && source.hasAudio,
        quality,
        principal: source.principal,
        codec: source.codec,
      });
    }

    if (!resolved.client) {
      return {
        cameraIndexCode,
        provider: resolved.provider,
        rtsp: null,
        hls: null,
        note: 'Sin cliente de media',
      };
    }

    const preview = await resolved.client.previewUrls(cameraIndexCode);
    const rtsp = preview?.url ?? null;
    if (!rtsp) {
      return {
        cameraIndexCode,
        provider: 'ARTEMIS' as const,
        rtsp: null,
        hls: null,
        note: 'Artemis no devolvió RTSP',
      };
    }

    return this.publish('ARTEMIS', cameraIndexCode, rtsp, rtsp);
  }

  /**
   * Abre VARIAS cámaras en un solo viaje, y los fallos vienen dentro.
   *
   * El muro hacía N `POST /cameras/:id/stream`: trece peticiones, trece
   * autenticaciones y trece resoluciones del sitio para pintar una rejilla.
   * Aquí se resuelve el sitio las mismas veces —`liveStream` es quien sabe
   * hacerlo bien— pero el navegador paga UN viaje.
   *
   * Regla que no se negocia: **una cámara rota no tumba el lote**. Si la 7 no
   * está en el espejo o su equipo no contesta, las otras doce siguen saliendo y
   * la 7 vuelve con `ok: false` y su motivo. Un 500 entero por una cámara mala
   * es exactamente el «no se ven todas» de siempre.
   *
   * En serie a propósito: cada `liveStream` puede acabar en un PUT a go2rtc, y
   * go2rtc reescribe su YAML en cada registro. Trece escrituras simultáneas
   * sobre el mismo fichero es como se corrompió antes.
   */
  async liveStreamsEnLote(
    companyId: number | null,
    cameraIndexCodes: string[],
    siteId?: number | null,
    opts?: { audio?: boolean; quality?: StreamQuality },
  ) {
    // Sin duplicados y sin vacíos: dos mosaicos de la misma cámara son un solo
    // registro en go2rtc, no dos.
    const unicas = [
      ...new Set(cameraIndexCodes.map((c) => String(c ?? '').trim()).filter(Boolean)),
    ];

    const items: Array<{
      cameraIndexCode: string;
      ok: boolean;
      stream: Awaited<ReturnType<IntegraMediaService['liveStream']>> | null;
      error: string | null;
    }> = [];

    for (const cameraIndexCode of unicas) {
      try {
        const stream = await this.liveStream(companyId, cameraIndexCode, siteId, opts);
        items.push({ cameraIndexCode, ok: true, stream, error: null });
      } catch (e) {
        const error = e instanceof Error ? e.message.slice(0, 280) : String(e).slice(0, 280);
        this.logger.warn(`Lote: ${cameraIndexCode} no abrió — ${error}`);
        items.push({ cameraIndexCode, ok: false, stream: null, error });
      }
    }

    const ok = items.filter((i) => i.ok).length;
    return { total: items.length, ok, failed: items.length - ok, items };
  }

  /**
   * Qué streams tiene go2rtc registrados AHORA MISMO. `null` = no se pudo saber.
   *
   * Es la lista contra la que el precalentado decide qué falta. La diferencia
   * entre «no hay ninguno» y «no pude preguntar» es la que evita que, con
   * go2rtc caído, se dispare un registro por cámara contra nada.
   */
  async streamsRegistrados(): Promise<Set<string> | null> {
    const internal = this.go2rtcInternal();
    if (!internal) return null;
    try {
      const res = await fetch(`${internal}/api/streams`);
      if (!res.ok) return null;
      const all = (await res.json()) as Record<string, unknown>;
      return new Set(Object.keys(all ?? {}));
    } catch {
      return null;
    }
  }

  /**
   * Resuelve el RTSP de una cámara de un sitio ISAPI a partir del espejo.
   *
   * `cameraIndexCode` es `<ip-cabecera>|<canal>` — p. ej. `192.168.9.34|301`.
   * Cuando la cámara tiene IP propia en la LAN se tira **directo a la cámara**
   * en vez de pasar por el grabador: el firmware del NVR corta a partir de unas
   * pocas sesiones RTSP simultáneas, y con 13 canales se agota enseguida. Las
   * que están en plug & play no tienen alternativa: van por el grabador.
   *
   * Por defecto se sirve el **stream secundario**: va en H.264 a 640×360, que
   * es exactamente lo que necesita un muro de 13 cámaras y no cuesta un ciclo
   * de CPU. El principal de estas cámaras va en H.265, que el navegador no
   * decodifica.
   *
   * Esta función ya NO degrada por su cuenta. Devuelve la fuente por defecto
   * **y aparte** el principal en crudo con su códec, para que `publish()` —que
   * es quien conoce el estado de la ranura de transcodificación— decida entre
   * servirlo tal cual, pasarlo por ffmpeg, o quedarse en el secundario.
   */
  private async isapiRtsp(
    resolved: Awaited<ReturnType<IntegraSiteService['resolveClient']>>,
    cameraIndexCode: string,
    quality: StreamQuality = 'sub',
  ): Promise<{
    rtsp: string;
    redacted: string;
    /** Principal en crudo, cuando existe uno distinto del que va en `rtsp`. */
    principal: { rtsp: string; redacted: string } | null;
    /** Códec del principal, tal como lo guardó el sync. */
    codec: string | null;
    note: string;
    hasAudio: boolean;
  } | null> {
    if (!resolved.isapi || !resolved.siteId) return null;

    const camera = await this.prisma.integraCamera.findUnique({
      where: { siteId_cameraIndexCode: { siteId: resolved.siteId, cameraIndexCode } },
      select: { raw: true },
    });
    if (!camera) return null;

    const raw = (camera.raw ?? {}) as {
      channelId?: string;
      /** Perfil a pedir para el muro. Lo ponen los equipos ACS. */
      streamId?: string;
      /** Principal del mismo canal, cuando `streamId` ya es el secundario. */
      mainStreamId?: string;
      hasAudio?: boolean;
      /** Códec del canal PRINCIPAL, tal como lo guardó el sync. */
      codec?: string | null;
      source?: { ipAddress?: string | null; reachableDirectly?: boolean } | null;
    };
    const channelId = raw.channelId;
    if (!channelId) return null;
    const hasAudio = raw.hasAudio === true;

    /**
     * El principal se pasa tal cual solo si el navegador puede decodificarlo.
     *
     * Medido en Oficinas: las 13 cámaras de vigilancia tienen el canal
     * principal a 1920×1080 pero en **H.265**, que MSE no reproduce. Cuando el
     * códec no da, la fuente por defecto sigue siendo el secundario —nunca peor
     * que antes— y el principal viaja aparte, en `principal`, por si se le
     * puede poner un ffmpeg delante.
     *
     * Cuando alguien ponga el principal en H.264 (o habilite un tercer stream),
     * esta comprobación lo deja pasar sola, sin tocar código y sin gastar CPU.
     */
    const efectiva: StreamQuality =
      quality === 'main' && mainStreamPlayable(raw.codec) ? 'main' : 'sub';
    const codec = raw.codec ?? null;

    const directIp = raw.source?.reachableDirectly ? raw.source.ipAddress : null;
    if (directIp && resolved.isapiForHost) {
      const direct = resolved.isapiForHost(directIp);
      // Una terminal de acceso publica un único stream: pedirle el «sub» da 404.
      // El resto son cámaras sueltas, que numeran desde 101 aunque en el NVR
      // sean el canal 7.
      // `streamId` explícito es el perfil que el sync eligió para el muro en un
      // equipo ACS. Antes mandaba siempre, porque se creía que esas terminales
      // publicaban un único stream; medido, publican dos. Así que ahora, si se
      // pide alta calidad y el sync guardó cuál es el principal, se respeta.
      const streamId =
        efectiva === 'main'
          ? raw.mainStreamId ?? raw.streamId ?? MAIN_STREAM_ID
          : raw.streamId ?? SUB_STREAM_ID;
      return {
        rtsp: direct.rtspUrl(streamId),
        redacted: direct.rtspUrlRedacted(streamId),
        // Solo hay algo que transcodificar si existe un principal DISTINTO del
        // que ya se está sirviendo.
        principal:
          raw.streamId && !raw.mainStreamId
            ? null
            : {
              rtsp: direct.rtspUrl(MAIN_STREAM_ID),
              redacted: direct.rtspUrlRedacted(MAIN_STREAM_ID),
            },
        codec,
        note: raw.streamId
          ? `RTSP directo a la terminal (${directIp}), canal ${streamId}`
          : `RTSP directo a la cámara (${directIp}), sin cargar el grabador`,
        hasAudio,
      };
    }

    const chSub = subStreamOf(channelId);
    const chMain = mainStreamOf(channelId);
    const ch = efectiva === 'main' ? chMain : chSub;
    return {
      rtsp: resolved.isapi.rtspUrl(ch),
      redacted: resolved.isapi.rtspUrlRedacted(ch),
      // Un canal que no numera `<canal><perfil>` solo tiene un perfil: ahí
      // `mainStreamOf` y `subStreamOf` devuelven lo mismo y no hay principal.
      principal:
        chMain === chSub
          ? null
          : { rtsp: resolved.isapi.rtspUrl(chMain), redacted: resolved.isapi.rtspUrlRedacted(chMain) },
      codec,
      note: `RTSP vía grabador ${resolved.host}, canal ${channelId}`,
      hasAudio,
    };
  }

  /**
   * Enciende o apaga el micrófono de una cámara en el propio equipo.
   *
   * El parque salió de fábrica con `<Audio><enabled>false</enabled>`, así que
   * sin esto no hay sonido que servir por mucho que el hardware lo tenga. Es
   * una escritura en el equipo del cliente y se queda puesta: por eso vive tras
   * el permiso de control y pasa por auditoría, no es un ajuste de la consola.
   */
  async setCameraAudio(
    companyId: number | null,
    cameraIndexCode: string,
    enabled: boolean,
    siteId?: number | null,
  ): Promise<{ cameraIndexCode: string; enabled: boolean; changed: boolean; note: string }> {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider !== 'ISAPI' || !resolved.siteId) {
      throw new BadRequestException('El audio del equipo solo se ajusta en sitios ISAPI');
    }

    const camera = await this.prisma.integraCamera.findUnique({
      where: { siteId_cameraIndexCode: { siteId: resolved.siteId, cameraIndexCode } },
      select: { raw: true },
    });
    if (!camera) throw new NotFoundException(`Cámara ${cameraIndexCode} no está en el espejo`);

    const raw = (camera.raw ?? {}) as {
      channelId?: string;
      streamId?: string;
      source?: { ipAddress?: string | null; reachableDirectly?: boolean } | null;
    };
    if (!raw.channelId) throw new BadRequestException('La cámara no tiene canal conocido');

    // Misma regla que PTZ: hablar a la IP LAN de la cámara, no al NVR, aunque
    // `reachableDirectly` venga mal marcado en el espejo.
    const directIp =
      raw.source?.ipAddress &&
      (raw.source.reachableDirectly || !String(raw.source.ipAddress).startsWith('192.168.254.'))
        ? raw.source.ipAddress
        : null;
    const client = directIp && resolved.isapiForHost ? resolved.isapiForHost(directIp) : resolved.isapi;
    if (!client) throw new BadRequestException('Cliente ISAPI no disponible');

    // Sub-stream (el que sirve go2rtc) + principal: si solo se enciende 101,
    // el muro sigue mudo.
    const channels = directIp
      ? Array.from(
          new Set(
            [raw.streamId, String(SUB_STREAM_ID), '101', '102']
              .filter(Boolean)
              .map(String),
          ),
        )
      : [subStreamOf(raw.channelId)];

    let changed = false;
    for (const channel of channels) {
      try {
        if (await setChannelAudio(client, channel, enabled)) changed = true;
      } catch {
        // Canal inexistente en ese equipo: seguir con el resto.
      }
    }
    if (!changed) {
      return {
        cameraIndexCode,
        enabled: false,
        changed: false,
        note: 'El canal no declara audio: ese equipo no tiene micrófono.',
      };
    }

    await this.prisma.integraCamera.update({
      where: { siteId_cameraIndexCode: { siteId: resolved.siteId, cameraIndexCode } },
      data: { raw: { ...(camera.raw as object), hasAudio: enabled } as never },
    });

    return {
      cameraIndexCode,
      enabled,
      changed: true,
      note: enabled
        ? 'Micrófono encendido en el equipo. El stream se abre con audio.'
        : 'Micrófono apagado en el equipo.',
    };
  }

  /**
   * Resuelve contra qué equipo y qué canal se manda una orden PTZ.
   *
   * Si la cámara tiene IP propia se le habla directo y su canal es el 1: el
   * número que lleva en el grabador —13 para la del estacionamiento— solo vale
   * dentro del grabador.
   */
  private async ptzTarget(companyId: number | null, cameraIndexCode: string, siteId?: number | null) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider !== 'ISAPI' || !resolved.siteId) {
      throw new BadRequestException('El control PTZ solo aplica a sitios ISAPI');
    }
    const camera = await this.prisma.integraCamera.findUnique({
      where: { siteId_cameraIndexCode: { siteId: resolved.siteId, cameraIndexCode } },
      select: { raw: true },
    });
    if (!camera) throw new NotFoundException(`Cámara ${cameraIndexCode} no está en el espejo`);
    const raw = (camera.raw ?? {}) as {
      channelId?: string;
      channelNumber?: number;
      source?: { ipAddress?: string | null; reachableDirectly?: boolean } | null;
    };

    const directIp =
      raw.source?.ipAddress &&
      (raw.source.reachableDirectly || !String(raw.source.ipAddress).startsWith('192.168.254.'))
        ? raw.source.ipAddress
        : null;
    if (directIp && resolved.isapiForHost) {
      const client = resolved.isapiForHost(directIp);
      if (client) return { client, channel: 1 };
    }
    if (!resolved.isapi) throw new BadRequestException('Cliente ISAPI no disponible');
    return { client: resolved.isapi, channel: raw.channelNumber ?? 1 };
  }

  async ptzMove(
    companyId: number | null,
    cameraIndexCode: string,
    v: {
      pan?: number;
      tilt?: number;
      zoom?: number;
      durationMs?: number;
      continuous?: boolean;
    },
    siteId?: number | null,
  ) {
    const { client, channel } = await this.ptzTarget(companyId, cameraIndexCode, siteId);
    await ptzMove(client, channel, v);
    return { ok: true };
  }

  async ptzStop(companyId: number | null, cameraIndexCode: string, siteId?: number | null) {
    const { client, channel } = await this.ptzTarget(companyId, cameraIndexCode, siteId);
    await ptzStop(client, channel);
    return { ok: true };
  }

  async ptzPresets(companyId: number | null, cameraIndexCode: string, siteId?: number | null) {
    const { client, channel } = await this.ptzTarget(companyId, cameraIndexCode, siteId);
    return { items: await ptzPresets(client, channel) };
  }

  async ptzGoTo(
    companyId: number | null,
    cameraIndexCode: string,
    preset: number,
    siteId?: number | null,
  ) {
    const { client, channel } = await this.ptzTarget(companyId, cameraIndexCode, siteId);
    await ptzGoToPreset(client, channel, preset);
    return { ok: true, preset };
  }

  /**
   * Playback ISAPI vía NVR: `POST /ISAPI/ContentMgmt/search` (XML — el NVR
   * DS-7616 rechaza JSON con badXmlFormat) → `playbackURI` RTSP → go2rtc MSE.
   *
   * Las grabaciones viven en el grabador (host del sitio), no en la cámara LAN.
   * `trackID` = canal principal del espejo (`101`, `501`…); el vivo usa sub.
   */
  async playbackIsapi(
    companyId: number | null,
    cameraIndexCode: string,
    beginTime: string,
    endTime: string,
    siteId?: number | null,
    segmentIndex = 0,
  ) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider !== 'ISAPI' || !resolved.isapi || !resolved.siteId) {
      throw new BadRequestException('Playback ISAPI solo en sitios ISAPI');
    }

    const camera = await this.prisma.integraCamera.findUnique({
      where: { siteId_cameraIndexCode: { siteId: resolved.siteId, cameraIndexCode } },
      select: { raw: true, name: true },
    });
    if (!camera) throw new NotFoundException(`Cámara ${cameraIndexCode} no está en el espejo`);

    const raw = (camera.raw ?? {}) as { channelId?: string; channelNumber?: number };
    let trackId = Number(raw.channelId);
    if (!Number.isFinite(trackId) || trackId <= 0) {
      const ch = Number(raw.channelNumber) || 1;
      trackId = ch * 100 + 1; // canal N → track main N01
    }
    // Preferir principal (…01) para revisión.
    if (trackId % 10 === 2) trackId -= 1;

    const start = toUtcIsapi(beginTime);
    const end = toUtcIsapi(endTime);
    if (!start || !end) throw new BadRequestException('Rango begin/end inválido');

    // Cuerpo XML: verificado en vivo contra DS-7616NXI-I2/16P/VPro (Oficinas).
    const searchID = randomUUID();
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<CMSearchDescription>` +
      `<searchID>${searchID}</searchID>` +
      `<trackIDList><trackID>${trackId}</trackID></trackIDList>` +
      `<timeSpanList><timeSpan><startTime>${start}</startTime><endTime>${end}</endTime></timeSpan></timeSpanList>` +
      `<contentTypeList><contentType>video</contentType></contentTypeList>` +
      `<maxResults>40</maxResults>` +
      `<searchResultPostion>0</searchResultPostion>` +
      `<metadataList><metadataDescriptor>recordType.meta.hikvision.com</metadataDescriptor></metadataList>` +
      `</CMSearchDescription>`;

    let rawResp: Record<string, unknown>;
    try {
      rawResp = (await resolved.isapi.post(
        '/ISAPI/ContentMgmt/search',
        xml,
      )) as Record<string, unknown>;
    } catch (e) {
      throw new BadRequestException(
        `ContentMgmt/search falló: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const result = (rawResp.CMSearchResult ?? rawResp) as Record<string, unknown>;
    const statusStr = pick(result, 'responseStatusStrg') || pick(result, 'responseStatus') || '';
    const matchListNode = result.matchList as Record<string, unknown> | undefined;
    const items = asList(matchListNode?.searchMatchItem ?? result.matchList);
    const matches = items.flatMap((item) => {
      const uri = (pick(item, 'mediaSegmentDescriptor.playbackURI') || '').trim();
      if (!uri) return [];
      const sizeRaw = pick(item, 'mediaSegmentDescriptor.size');
      return [
        {
          playbackURI: uri,
          startTime: pick(item, 'timeSpan.startTime'),
          endTime: pick(item, 'timeSpan.endTime'),
          name: pick(item, 'mediaSegmentDescriptor.name'),
          size: sizeRaw != null && sizeRaw !== '' ? Number(sizeRaw) : null,
        },
      ];
    });

    if (matches.length === 0) {
      const hint =
        /no\s*match/i.test(statusStr) || statusStr === 'OK'
          ? 'Sin grabaciones en ese rango. Prueba 24 h o más (el NVR a veces no indexa la última hora).'
          : `Sin grabaciones en ese rango${statusStr ? ` (${statusStr})` : ''}.`;
      return {
        cameraIndexCode,
        provider: 'ISAPI' as const,
        url: null,
        hls: null,
        beginTime,
        endTime,
        trackId,
        segmentIndex: 0,
        segments: [],
        note: hint,
      };
    }

    const idx = Math.max(0, Math.min(Math.floor(segmentIndex) || 0, matches.length - 1));
    const chosen = matches[idx];
    const rtsp = resolved.isapi.authorizeRtsp(chosen.playbackURI);
    const redacted = resolved.isapi.authorizeRtspRedacted(chosen.playbackURI);
    await this.dropStalePlaybackStreams(cameraIndexCode);
    const published = await this.publish(
      'ISAPI',
      `pb_${cameraIndexCode}_${Date.now()}`,
      rtsp,
      redacted,
      `Playback NVR track ${trackId} · seg ${idx + 1}/${matches.length}`,
    );

    return {
      cameraIndexCode,
      provider: 'ISAPI' as const,
      url: published.hls || redacted,
      hls: published.hls,
      rtsp: redacted,
      beginTime,
      endTime,
      trackId,
      segmentIndex: idx,
      segments: matches.map((m) => ({
        startTime: m.startTime,
        endTime: m.endTime,
        name: m.name,
        size: Number.isFinite(m.size as number) ? m.size : null,
      })),
      note: published.note,
    };
  }

  /**
   * Registra el RTSP en go2rtc y devuelve la URL HLS.
   *
   * `rtspForResponse` es lo que ve el cliente: en ISAPI lleva la contraseña
   * tachada, porque la URL real es una credencial en texto plano.
   */
  /**
   * Borra los streams de playback viejos de esta cámara antes de crear el nuevo.
   *
   * Cada playback registraba `pb_<cam>_<timestamp>` y no lo borraba nadie, así
   * que se acumulaban sin techo. Y como go2rtc reescribe su YAML en cada PUT y
   * esas URLs llevan `?starttime=`, el fichero acaba mal formado: en producción
   * arrancaba con `yaml: did not find expected key` doce veces y CERO streams
   * de disco. Ahí es donde se pierden cámaras tras cada reinicio.
   */
  private async dropStalePlaybackStreams(cameraIndexCode: string): Promise<void> {
    const internal = this.go2rtcInternal();
    if (!internal) return;
    // OJO: el nombre real lo construye `publish()`, que antepone `cam_`. Los
    // playback acaban llamándose `cam_pb_<camara>_<ts>`, no `pb_<camara>_<ts>`.
    // Este prefijo estaba escrito a mano sin el `cam_` y por eso la limpieza
    // NUNCA borró nada: en producción quedaron nueve streams huérfanos, y sus
    // URLs con `?starttime=` son justo las que corrompieron el YAML de go2rtc.
    // Se deriva del mismo constructor de nombres para que no vuelvan a divergir.
    const prefix = `${nombreStreamMuro(`pb_${cameraIndexCode}`)}_`;
    try {
      const res = await fetch(`${internal}/api/streams`);
      if (!res.ok) return;
      const all = (await res.json()) as Record<string, unknown>;
      const stale = Object.keys(all).filter((n) => n.startsWith(prefix));
      for (const name of stale) await this.borrarStreamGo2rtc(name);
      if (stale.length) {
        this.logger.log(`go2rtc: ${stale.length} playback(s) viejos de ${cameraIndexCode} borrados`);
      }
    } catch (e) {
      // Limpiar es mejora, no requisito: si falla, el playback sigue su curso.
      this.logger.warn(`go2rtc limpieza playback: ${String(e)}`);
    }
  }

  /** Borra un stream de go2rtc. Con ffmpeg detrás, esto mata el proceso. */
  private async borrarStreamGo2rtc(name: string): Promise<void> {
    const internal = this.go2rtcInternal();
    if (!internal) return;
    await fetch(`${internal}/api/streams?src=${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }).catch(() => undefined);
  }

  /**
   * Cuántos consumidores tiene un stream en go2rtc. `null` = no se pudo saber.
   *
   * Es la única señal fiable de «esto ya no lo mira nadie». El reloj no vale:
   * el front pide la URL una vez y luego se queda con el HLS abierto minutos,
   * así que un simple TTL mataría justo el stream que alguien está mirando.
   */
  private async consumidoresGo2rtc(name: string): Promise<number | null> {
    const internal = this.go2rtcInternal();
    if (!internal) return null;
    try {
      const res = await fetch(`${internal}/api/streams?src=${encodeURIComponent(name)}`);
      // 404: el stream ya no existe (reinicio de go2rtc). Nadie lo consume.
      if (res.status === 404) return 0;
      if (!res.ok) return null;
      const info = (await res.json()) as { consumers?: unknown };
      return Array.isArray(info.consumers) ? info.consumers.length : 0;
    } catch {
      return null;
    }
  }

  /**
   * Suelta la ranura de transcodificación cuando ya nadie mira ese stream.
   *
   * Sin esto, la primera cámara que pidiera alta calidad se quedaría el único
   * cupo del servidor para siempre y ninguna otra volvería a tener HD hasta el
   * siguiente despliegue.
   */
  private async liberarRanuraHdSiNadieMira(ahora: number): Promise<void> {
    const ranura = this.ranuraHd;
    if (!ranura) return;
    // Dentro del margen ni se pregunta: es el caso normal —cambiar de cámara y
    // volver— y preguntar en cada una de las 13 peticiones del muro sería una
    // llamada de más por nada.
    if (dentroDelMargenHd(ranura, ahora)) return;

    const consumidores = await this.consumidoresGo2rtc(ranura.streamName);
    switch (decidirLiberacionHd(ranura, ahora, consumidores)) {
      case 'renovar':
        // Alguien la está mirando: se refresca el reloj para que un turno largo
        // de vigilancia no acabe cortándose solo.
        this.ranuraHd = { ...ranura, pedidoEn: ahora };
        break;
      case 'liberar':
        await this.borrarStreamGo2rtc(ranura.streamName);
        this.ranuraHd = null;
        this.logger.log(
          `go2rtc: transcodificación HD de ${ranura.cameraIndexCode} liberada, no la miraba nadie`,
        );
        break;
      default:
        break;
    }
  }

  private async publish(
    provider: 'ARTEMIS' | 'ISAPI',
    cameraIndexCode: string,
    rtsp: string,
    rtspForResponse: string,
    sourceNote?: string,
    opts?: {
      hasAudio: boolean;
      withAudio: boolean;
      quality?: StreamQuality;
      /** Principal en crudo, cuando existe uno distinto del que va en `rtsp`. */
      principal?: { rtsp: string; redacted: string } | null;
      /** Códec del principal, tal como lo guardó el sync. */
      codec?: string | null;
    },
  ) {
    const hasAudio = Boolean(opts?.hasAudio);
    const withAudio = Boolean(opts?.withAudio);
    const quality: StreamQuality = opts?.quality === 'main' ? 'main' : 'sub';
    const internal = this.go2rtcInternal();
    if (!internal) {
      return {
        cameraIndexCode,
        provider,
        rtsp: rtspForResponse,
        hls: null,
        hasAudio,
        audio: false,
        note: [sourceNote, 'GO2RTC_URL no configurado — usa VLC con RTSP'].filter(Boolean).join(' · '),
      };
    }

    // El principal va con su propio nombre: si compartiera el del secundario,
    // pedir alta calidad reescribiria el stream que esta alimentando al muro
    // entero y todos los mosaicos saltarian de golpe.
    const slug = slugDeCamara(cameraIndexCode);
    const hd = quality === 'main' ? '_hd' : '';
    const base = `cam_${slug}${hd}`;
    // Stream aparte para el audio: el mudo lo comparten todos los mosaicos del
    // muro y no debe cargar con el transcodificado.
    const streamName = withAudio ? `${base}_a` : base;

    /* ── Alta calidad: nativo, transcodificado o secundario ───────────────
     *
     * Aquí es donde se reparte la única ranura de transcodificación. Se pide
     * SOLO cuando hace falta de verdad —principal existente y en un códec que
     * el navegador no decodifica—; una terminal en H.264 no gasta cupo.
     */
    const principal = opts?.principal ?? null;
    let cupo = false;
    if (requiereTranscodificacion({ quality, codec: opts?.codec, hayPrincipal: Boolean(principal) })) {
      const ahora = Date.now();
      const reserva = reservarRanuraHd(this.ranuraHd, { cameraIndexCode, streamName }, ahora);
      cupo = reserva.concedida;
      if (reserva.concedida) {
        this.ranuraHd = reserva.ranura;
        // La misma cámara volviendo con otro nombre (le encendieron el micro):
        // se mata el ffmpeg anterior o quedaría uno huérfano comiendo CPU.
        if (reserva.liberar) await this.borrarStreamGo2rtc(reserva.liberar);
      }
    }
    const { modo, razon } = elegirModoHd({
      quality,
      codec: opts?.codec,
      hayPrincipal: Boolean(principal),
      cupo,
    });

    let src = withAudio ? audioSourceFor(rtsp) : rtsp;
    let rtspDevuelto = rtspForResponse;
    if (modo === 'transcodificado' && principal) {
      src = hdTranscodeSource(principal.rtsp, withAudio);
      rtspDevuelto = principal.redacted;
    } else if (modo === 'secundario' && quality === 'main') {
      /*
       * Pidió alta calidad y no la hay. No se registra un stream nuevo: se le
       * devuelve el que YA está alimentando al muro, caliente, sin abrir una
       * segunda sesión RTSP contra un equipo que las cuenta. El front compara
       * el nombre con el suyo, ve que es el mismo y se queda donde estaba.
       */
      const publicBase = this.go2rtcPublic() || internal;
      const nombreSub = withAudio ? `cam_${slug}_a` : `cam_${slug}`;
      return {
        cameraIndexCode,
        provider,
        rtsp: rtspForResponse,
        hls: `${publicBase}/api/stream.m3u8?src=${encodeURIComponent(nombreSub)}`,
        streamName: nombreSub,
        hasAudio,
        audio: withAudio,
        note: [sourceNote, notaHd(modo, razon)].filter(Boolean).join(' · '),
      };
    }

    try {
      // Query PUT: registra en memoria aunque go2rtc responda 400 al persistir
      // YAML (URLs con `?starttime=` o claves con caracteres raros). El PUT JSON
      // de /api/streams NO añade el stream en go2rtc 1.9.7.
      const url = `${internal}/api/streams?name=${encodeURIComponent(streamName)}&src=${encodeURIComponent(src)}`;
      const res = await fetch(url, { method: 'PUT' });
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 160);
        // yaml persist error is noisy but the stream is usually live anyway
        this.logger.warn(`go2rtc PUT ${res.status}: ${detail}`);
      }
      const publicBase = this.go2rtcPublic() || internal;
      const hls = `${publicBase}/api/stream.m3u8?src=${encodeURIComponent(streamName)}`;
      return {
        cameraIndexCode,
        provider,
        rtsp: rtspDevuelto,
        hls,
        streamName,
        hasAudio,
        audio: withAudio,
        note: [
          sourceNote,
          withAudio ? 'go2rtc MSE, audio AAC' : 'go2rtc MSE',
          // Solo cuando alguien pidió alta calidad: al muro no le interesa.
          quality === 'main' ? notaHd(modo, razon) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    } catch (e) {
      this.logger.warn(`go2rtc falló: ${String(e)}`);
      // Si go2rtc no llegó a registrar nada, la ranura reservada no está
      // sujetando ningún ffmpeg: soltarla ya, o la siguiente cámara se comería
      // un «no» por un cupo que en realidad está libre.
      if (modo === 'transcodificado' && this.ranuraHd?.streamName === streamName) {
        this.ranuraHd = null;
      }
      return {
        cameraIndexCode,
        provider,
        rtsp: rtspForResponse,
        hls: null,
        hasAudio,
        audio: false,
        note: [sourceNote, 'go2rtc no disponible — fallback RTSP'].filter(Boolean).join(' · '),
      };
    }
  }
}

function toUtcIsapi(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
