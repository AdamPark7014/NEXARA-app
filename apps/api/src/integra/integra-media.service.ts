import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegraSiteService } from './integra-site.service';

/**
 * En Hikvision el id de stream es `<canal><perfil>`: 301 es el principal del
 * canal 3 y 302 su secundario. Una cámara suelta numera desde 1, así que su
 * secundario es siempre 102.
 */
const SUB_STREAM_ID = 102;

function subStreamOf(channelId: string): string {
  return /^\d{3,}$/.test(channelId) ? `${channelId.slice(0, -1)}2` : channelId;
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
    opts?: { audio?: boolean },
  ) {
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
      const source = await this.isapiRtsp(resolved, cameraIndexCode);
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
  ): Promise<{ rtsp: string; redacted: string; note: string; hasAudio: boolean } | null> {
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
      source?: { ipAddress?: string | null; reachableDirectly?: boolean } | null;
    };
    const channelId = raw.channelId;
    if (!channelId) return null;
    const hasAudio = raw.hasAudio === true;

    const directIp = raw.source?.reachableDirectly ? raw.source.ipAddress : null;
    if (directIp && resolved.isapiForHost) {
      const direct = resolved.isapiForHost(directIp);
      // Una terminal de acceso publica un único stream: pedirle el «sub» da 404.
      // El resto son cámaras sueltas, que numeran desde 101 aunque en el NVR
      // sean el canal 7.
      const streamId = raw.streamId ?? SUB_STREAM_ID;
      return {
        rtsp: direct.rtspUrl(streamId),
        redacted: direct.rtspUrlRedacted(streamId),
        note: raw.streamId
          ? `RTSP directo a la terminal (${directIp}), canal ${streamId}`
          : `RTSP directo a la cámara (${directIp}), sin cargar el grabador`,
        hasAudio,
      };
    }

    const sub = subStreamOf(channelId);
    return {
      rtsp: resolved.isapi.rtspUrl(sub),
      redacted: resolved.isapi.rtspUrlRedacted(sub),
      note: `RTSP vía grabador ${resolved.host}, canal ${channelId}`,
      hasAudio,
    };
  }

  /**
   * Registra el RTSP en go2rtc y devuelve la URL HLS.
   *
   * `rtspForResponse` es lo que ve el cliente: en ISAPI lleva la contraseña
   * tachada, porque la URL real es una credencial en texto plano.
   */
  private async publish(
    provider: 'ARTEMIS' | 'ISAPI',
    cameraIndexCode: string,
    rtsp: string,
    rtspForResponse: string,
    sourceNote?: string,
    audio?: { hasAudio: boolean; withAudio: boolean },
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

    const base = `cam_${cameraIndexCode.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    // Stream aparte para el audio: el mudo lo comparten todos los mosaicos del
    // muro y no debe cargar con el transcodificado.
    const streamName = withAudio ? `${base}_a` : base;
    const src = withAudio ? audioSourceFor(rtsp) : rtsp;
    try {
      const url = `${internal}/api/streams?name=${encodeURIComponent(streamName)}&src=${encodeURIComponent(src)}`;
      await fetch(url, { method: 'PUT' });
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
        note: [sourceNote, withAudio ? 'HLS vía go2rtc, audio AAC' : 'HLS vía go2rtc']
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
