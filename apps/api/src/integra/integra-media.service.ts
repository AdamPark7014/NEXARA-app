import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegraSiteService } from './integra-site.service';

/**
 * Registra el RTSP de Artemis en go2rtc y devuelve URL HLS consumible por el browser.
 * Si GO2RTC_URL no está definido, devuelve solo el RTSP (compat P0).
 */
@Injectable()
export class IntegraMediaService {
  private readonly logger = new Logger(IntegraMediaService.name);

  constructor(
    private readonly sites: IntegraSiteService,
    private readonly config: ConfigService,
  ) {}

  /** Base interna (API → go2rtc). */
  private go2rtcInternal(): string | null {
    const u = this.config.get<string>('GO2RTC_URL') || '';
    return u ? u.replace(/\/$/, '') : null;
  }

  /** Base pública para el browser (Traefik /go2rtc). */
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
    const { client } = await this.sites.resolveClient({ companyId, siteId });
    const preview = await client.previewUrls(cameraIndexCode);
    const rtsp = preview?.url ?? null;
    if (!rtsp) {
      return { cameraIndexCode, rtsp: null, hls: null, note: 'Artemis no devolvió RTSP' };
    }

    const internal = this.go2rtcInternal();
    if (!internal) {
      return {
        cameraIndexCode,
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
      return { cameraIndexCode, rtsp, hls, streamName, note: 'HLS vía go2rtc' };
    } catch (e) {
      this.logger.warn(`go2rtc falló: ${String(e)}`);
      return {
        cameraIndexCode,
        rtsp,
        hls: null,
        note: 'go2rtc no disponible — fallback RTSP',
      };
    }
  }
}
