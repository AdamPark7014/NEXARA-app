import { decidirAccesoGo2rtc, tokenDeStream, tokenDeStreamValido } from './go2rtc-autorizacion';

const S = 'secreto-de-prueba';

describe('go2rtc · quién entra a /go2rtc', () => {
  it('los scripts del visor son públicos', () => {
    expect(decidirAccesoGo2rtc('/go2rtc/video-stream.js', S)).toBe('permitir');
    expect(decidirAccesoGo2rtc('/go2rtc/video-rtc.js', S)).toBe('permitir');
  });

  it('nunca acepta una fuente dinámica en src (URL, exec, ffmpeg)', () => {
    for (const src of ['rtsp://10.0.0.5/live', 'exec:sh -c id', 'ffmpeg:rtsp://x#video=h264', '../config', '']) {
      expect(decidirAccesoGo2rtc(`/go2rtc/api/frame.jpeg?src=${encodeURIComponent(src)}`, S)).toBe('denegar');
    }
  });

  it('un nombre de stream sin firma pide sesión; con firma válida pasa', () => {
    expect(decidirAccesoGo2rtc('/go2rtc/api/ws?src=cam_192_168_9_171_102', S)).toBe('requiere-sesion');
    const nx = tokenDeStream('cam_x', S);
    expect(decidirAccesoGo2rtc(`/go2rtc/api/stream.m3u8?src=cam_x&nx=${nx}`, S)).toBe('permitir');
    // La firma es del stream: no sirve para otro.
    expect(decidirAccesoGo2rtc(`/go2rtc/api/stream.m3u8?src=cam_y&nx=${nx}`, S)).toBe('requiere-sesion');
  });

  it('la firma vence', () => {
    const ahora = Date.now();
    const nx = tokenDeStream('cam_x', S, ahora, 60_000);
    expect(tokenDeStreamValido('cam_x', nx, S, ahora + 30_000)).toBe(true);
    expect(tokenDeStreamValido('cam_x', nx, S, ahora + 120_000)).toBe(false);
    expect(tokenDeStreamValido('cam_x', nx, 'otro-secreto', ahora)).toBe(false);
  });

  it('los segmentos HLS pasan solo con un id de sesión de go2rtc', () => {
    expect(decidirAccesoGo2rtc('/go2rtc/api/hls/playlist.m3u8?id=AbC123xy', S)).toBe('permitir');
    expect(decidirAccesoGo2rtc('/go2rtc/api/hls/segment.ts?id=', S)).toBe('denegar');
  });

  it('fuera de /go2rtc no autoriza nada', () => {
    expect(decidirAccesoGo2rtc('/api/users', S)).toBe('denegar');
  });
});
