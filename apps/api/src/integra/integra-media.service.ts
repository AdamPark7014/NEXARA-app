import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegraSiteService } from './integra-site.service';

/**
 * Registra el RTSP de Artemis en go2rtc y devuelve URL HLS consumible por el browser.
 * Sitios HCT: stream token cloud (EZUIKit) — ADR-0019; no go2rtc RTSP.
 */
@Injectable()
export class IntegraMediaService {
  private readonly logger = new Logger(IntegraMediaService.name);

  constructor(
    private readonly sites: IntegraSiteService,
    private readonly config: ConfigService,
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

    const internal = this.go2rtcInternal();
    if (!internal) {
      return {
        cameraIndexCode,
        provider: 'ARTEMIS' as const,
        rtsp,
        hls: null,
        note: 'GO2RTC_URL no configurado — usa VLC con RTSP',
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
        provider: 'ARTEMIS' as const,
        rtsp,
        hls,
        streamName,
        note: 'HLS vía go2rtc',
      };
    } catch (e) {
      this.logger.warn(`go2rtc falló: ${String(e)}`);
      return {
        cameraIndexCode,
        provider: 'ARTEMIS' as const,
        rtsp,
        hls: null,
        note: 'go2rtc no disponible — fallback RTSP',
      };
    }
  }
}
