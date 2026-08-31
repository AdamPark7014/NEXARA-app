import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegraSiteService } from './integra-site.service';

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
          note: `Cámara ${cameraIndexCode} no está en el espejo del sitio. Corre el sync.`,
        };
      }
      return this.publish('ISAPI', cameraIndexCode, source.rtsp, source.redacted, source.note);
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
   */
  private async isapiRtsp(
    resolved: Awaited<ReturnType<IntegraSiteService['resolveClient']>>,
    cameraIndexCode: string,
  ): Promise<{ rtsp: string; redacted: string; note: string } | null> {
    if (!resolved.isapi || !resolved.siteId) return null;

    const camera = await this.prisma.integraCamera.findUnique({
      where: { siteId_cameraIndexCode: { siteId: resolved.siteId, cameraIndexCode } },
      select: { raw: true },
    });
    if (!camera) return null;

    const raw = (camera.raw ?? {}) as {
      channelId?: string;
      source?: { ipAddress?: string | null; reachableDirectly?: boolean } | null;
    };
    const channelId = raw.channelId;
    if (!channelId) return null;

    const directIp = raw.source?.reachableDirectly ? raw.source.ipAddress : null;
    if (directIp && resolved.isapiForHost) {
      const direct = resolved.isapiForHost(directIp);
      // La cámara suelta numera desde 101 aunque en el NVR sea el canal 7.
      return {
        rtsp: direct.rtspUrl(101),
        redacted: direct.rtspUrlRedacted(101),
        note: `RTSP directo a la cámara (${directIp}), sin cargar el grabador`,
      };
    }

    return {
      rtsp: resolved.isapi.rtspUrl(channelId),
      redacted: resolved.isapi.rtspUrlRedacted(channelId),
      note: `RTSP vía grabador ${resolved.host}, canal ${channelId}`,
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
  ) {
    const internal = this.go2rtcInternal();
    if (!internal) {
      return {
        cameraIndexCode,
        provider,
        rtsp: rtspForResponse,
        hls: null,
        note: [sourceNote, 'GO2RTC_URL no configurado — usa VLC con RTSP'].filter(Boolean).join(' · '),
      };
    }

    const streamName = `cam_${cameraIndexCode.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    try {
      const url = `${internal}/api/streams?name=${encodeURIComponent(streamName)}&src=${encodeURIComponent(rtsp)}`;
      await fetch(url, { method: 'PUT' });
      const publicBase = this.go2rtcPublic() || internal;
      const hls = `${publicBase}/api/stream.m3u8?src=${encodeURIComponent(streamName)}`;
      return {
        cameraIndexCode,
        provider,
        rtsp: rtspForResponse,
        hls,
        streamName,
        note: [sourceNote, 'HLS vía go2rtc'].filter(Boolean).join(' · '),
      };
    } catch (e) {
      this.logger.warn(`go2rtc falló: ${String(e)}`);
      return {
        cameraIndexCode,
        provider,
        rtsp: rtspForResponse,
        hls: null,
        note: [sourceNote, 'go2rtc no disponible — fallback RTSP'].filter(Boolean).join(' · '),
      };
    }
  }
}
