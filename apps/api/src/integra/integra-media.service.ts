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

/**
 * En Hikvision el id de stream es `<canal><perfil>`: 301 es el principal del
 * canal 3 y 302 su secundario. Una cámara suelta numera desde 1, así que su
 * secundario es siempre 102.
 */
const SUB_STREAM_ID = 102;
const MAIN_STREAM_ID = 101;

function subStreamOf(channelId: string): string {
  return /^\d{3,}$/.test(channelId) ? `${channelId.slice(0, -1)}2` : channelId;
}

function mainStreamOf(channelId: string): string {
  return /^\d{3,}$/.test(channelId) ? `${channelId.slice(0, -1)}1` : channelId;
}

/**
 * Calidad pedida para un stream.
 *
 * `sub` es el secundario (medido en Oficinas: **640×360**) y `main` el
 * principal (1920×1080 en las DS-2CD2123G2 del parque, nueve veces más píxeles).
 *
 * Hasta ahora TODO —muro y Foco— consumía el secundario, y por eso al abrir una
 * cámara a pantalla completa se veía pixelada: se ampliaban 640 px a 1920.
 *
 * La regla es asimétrica a propósito. En un mosaico de 3×3 sobre una pantalla
 * de 1920 cada celda mide unos 600 px, así que el secundario ya la llena: subir
 * ahí a principal no añadiría un solo píxel visible y multiplicaría por nueve el
 * ancho de banda, la CPU de decodificación y —lo que de verdad escuece— las
 * sesiones RTSP contra un NVR que corta a las pocas simultáneas. Solo sube de
 * calidad lo que se está mirando grande, que es como máximo una.
 */
export type StreamQuality = 'sub' | 'main';

/**
 * ¿Puede el navegador reproducir el canal principal de esta cámara?
 *
 * Medido en Oficinas: las 13 cámaras de vigilancia tienen el principal a
 * 1920×1080 pero en **H.265**, que MSE no decodifica. Pedirlo daría un cuadro
 * negro girando para siempre, que es peor que el secundario pixelado.
 *
 * Ante un códec desconocido se responde que SÍ, a propósito: el espejo puede no
 * haberlo guardado todavía, y en ese caso vale más intentarlo y que el
 * reproductor caiga a respaldo que negar alta calidad a un equipo que sí puede.
 * Lo único que se bloquea es lo que sabemos con certeza que no funciona.
 */
export function mainStreamPlayable(codec?: string | null): boolean {
  const c = String(codec ?? '')
    .toUpperCase()
    .replace(/[.\s_-]/g, '');
  if (!c) return true;
  return !(c === 'H265' || c === 'HEVC' || c === 'MPEGH' || c.startsWith('H265'));
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
   * Resuelve el RTSP de una cámara de un sitio ISAPI a partir del espejo.
   *
   * `cameraIndexCode` es `<ip-cabecera>|<canal>` — p. ej. `192.168.9.34|301`.
   * Cuando la cámara tiene IP propia en la LAN se tira **directo a la cámara**
   * en vez de pasar por el grabador: el firmware del NVR corta a partir de unas
   * pocas sesiones RTSP simultáneas, y con 13 canales se agota enseguida. Las
   * que están en plug & play no tienen alternativa: van por el grabador.
   *
   * Se sirve el **stream secundario**, no el principal. El principal de estos
   * equipos va en H.265, que el navegador no decodifica: el reproductor se
   * queda girando para siempre aunque go2rtc esté entregando imagen. El
   * secundario va en H.264 y a 640×360, que es exactamente lo que necesita un
   * muro de 13 cámaras — y así no hay que transcodificar, que en un servidor
   * compartido no es opción.
   */
  private async isapiRtsp(
    resolved: Awaited<ReturnType<IntegraSiteService['resolveClient']>>,
    cameraIndexCode: string,
    quality: StreamQuality = 'sub',
  ): Promise<{
    rtsp: string;
    redacted: string;
    note: string;
    hasAudio: boolean;
    quality: StreamQuality;
    degradada: boolean;
  } | null> {
    if (!resolved.isapi || !resolved.siteId) return null;

    const camera = await this.prisma.integraCamera.findUnique({
      where: { siteId_cameraIndexCode: { siteId: resolved.siteId, cameraIndexCode } },
      select: { raw: true },
    });
    if (!camera) return null;

    const raw = (camera.raw ?? {}) as {
      channelId?: string;
      /** Id exacto a pedir. Lo ponen los equipos con un solo stream. */
      streamId?: string;
      hasAudio?: boolean;
      /** Códec del canal PRINCIPAL, tal como lo guardó el sync. */
      codec?: string | null;
      source?: { ipAddress?: string | null; reachableDirectly?: boolean } | null;
    };
    const channelId = raw.channelId;
    if (!channelId) return null;
    const hasAudio = raw.hasAudio === true;

    /**
     * El principal solo sirve si el navegador puede decodificarlo.
     *
     * Medido en Oficinas: las 13 cámaras de vigilancia tienen el canal
     * principal a 1920×1080 pero en **H.265**, que MSE no reproduce. Pedirlo
     * daría un cuadro negro girando para siempre —que es peor que el
     * secundario pixelado— así que aquí se degrada a `sub` en silencio y se
     * dice por qué en la nota, en vez de fallar en el navegador.
     *
     * Cuando alguien ponga el principal en H.264 (o habilite un tercer stream),
     * esta comprobación lo deja pasar sola, sin tocar código.
     */
    const mainIsPlayable = mainStreamPlayable(raw.codec);
    const efectiva: StreamQuality = quality === 'main' && mainIsPlayable ? 'main' : 'sub';
    const degradada = quality === 'main' && !mainIsPlayable;

    const directIp = raw.source?.reachableDirectly ? raw.source.ipAddress : null;
    if (directIp && resolved.isapiForHost) {
      const direct = resolved.isapiForHost(directIp);
      // Una terminal de acceso publica un único stream: pedirle el «sub» da 404.
      // El resto son cámaras sueltas, que numeran desde 101 aunque en el NVR
      // sean el canal 7.
      // La terminal de acceso publica un solo perfil: pedirle otro da 404, así
      // que su `streamId` explícito manda por encima de la calidad pedida.
      const streamId =
        raw.streamId ?? (efectiva === 'main' ? MAIN_STREAM_ID : SUB_STREAM_ID);
      return {
        rtsp: direct.rtspUrl(streamId),
        redacted: direct.rtspUrlRedacted(streamId),
        note: [
          raw.streamId
            ? `RTSP directo a la terminal (${directIp}), canal ${streamId}`
            : `RTSP directo a la cámara (${directIp}), sin cargar el grabador`,
          degradada ? `alta calidad no disponible: el principal va en ${raw.codec}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        hasAudio,
        quality: efectiva,
        degradada,
      };
    }

    const ch = efectiva === 'main' ? mainStreamOf(channelId) : subStreamOf(channelId);
    return {
      rtsp: resolved.isapi.rtspUrl(ch),
      redacted: resolved.isapi.rtspUrlRedacted(ch),
      note: [
        `RTSP vía grabador ${resolved.host}, canal ${channelId}`,
        degradada ? `alta calidad no disponible: el principal va en ${raw.codec}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      hasAudio,
      quality: efectiva,
      degradada,
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
    const prefix = `pb_${cameraIndexCode.replace(/[^a-zA-Z0-9_-]/g, '_')}_`;
    try {
      const res = await fetch(`${internal}/api/streams`);
      if (!res.ok) return;
      const all = (await res.json()) as Record<string, unknown>;
      const stale = Object.keys(all).filter((n) => n.startsWith(prefix));
      for (const name of stale) {
        await fetch(`${internal}/api/streams?src=${encodeURIComponent(name)}`, {
          method: 'DELETE',
        }).catch(() => undefined);
      }
      if (stale.length) {
        this.logger.log(`go2rtc: ${stale.length} playback(s) viejos de ${cameraIndexCode} borrados`);
      }
    } catch (e) {
      // Limpiar es mejora, no requisito: si falla, el playback sigue su curso.
      this.logger.warn(`go2rtc limpieza playback: ${String(e)}`);
    }
  }

  private async publish(
    provider: 'ARTEMIS' | 'ISAPI',
    cameraIndexCode: string,
    rtsp: string,
    rtspForResponse: string,
    sourceNote?: string,
    audio?: { hasAudio: boolean; withAudio: boolean; quality?: StreamQuality },
  ) {
    const hasAudio = Boolean(audio?.hasAudio);
    const withAudio = Boolean(audio?.withAudio);
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
    const hd = audio?.quality === 'main' ? '_hd' : '';
    const base = `cam_${cameraIndexCode.replace(/[^a-zA-Z0-9_-]/g, '_')}${hd}`;
    // Stream aparte para el audio: el mudo lo comparten todos los mosaicos del
    // muro y no debe cargar con el transcodificado.
    const streamName = withAudio ? `${base}_a` : base;
    const src = withAudio ? audioSourceFor(rtsp) : rtsp;
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
        rtsp: rtspForResponse,
        hls,
        streamName,
        hasAudio,
        audio: withAudio,
        note: [sourceNote, withAudio ? 'go2rtc MSE, audio AAC' : 'go2rtc MSE']
          .filter(Boolean)
          .join(' · '),
      };
    } catch (e) {
      this.logger.warn(`go2rtc falló: ${String(e)}`);
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
