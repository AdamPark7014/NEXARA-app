import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegraMediaService } from './integra-media.service';
import { IntegraSiteService } from './integra-site.service';

type Camera = { raw: unknown } | null;

async function build(resolveClient: unknown, camera: Camera = null, go2rtc = '') {
  const config = { get: jest.fn((k: string) => (k === 'GO2RTC_URL' ? go2rtc : undefined)) };
  const prisma = {
    integraCamera: { findUnique: jest.fn().mockResolvedValue(camera) },
  };
  const mod = await Test.createTestingModule({
    providers: [
      IntegraMediaService,
      { provide: IntegraSiteService, useValue: { resolveClient } },
      { provide: ConfigService, useValue: config },
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return { svc: mod.get(IntegraMediaService), prisma };
}

describe('IntegraMediaService', () => {
  it('sin GO2RTC_URL devuelve solo RTSP', async () => {
    const { svc } = await build(
      jest.fn().mockResolvedValue({
        provider: 'ARTEMIS',
        hct: null,
        isapi: null,
        client: { previewUrls: jest.fn().mockResolvedValue({ url: 'rtsp://cam/stream' }) },
      }),
    );
    const out = await svc.liveStream(1, 'cam1');
    expect(out.rtsp).toBe('rtsp://cam/stream');
    expect(out.hls).toBeNull();
  });

  describe('provider ISAPI', () => {
    const isapi = {
      rtspUrl: (ch: string | number) => `rtsp://admin:secreto@192.168.9.34:554/Streaming/Channels/${ch}`,
      rtspUrlRedacted: (ch: string | number) =>
        `rtsp://admin:***@192.168.9.34:554/Streaming/Channels/${ch}`,
      authorizeRtsp: (uri: string) => uri.replace(/^rtsp:\/\//i, 'rtsp://admin:secreto@'),
      authorizeRtspRedacted: (uri: string) => uri.replace(/^rtsp:\/\//i, 'rtsp://admin:***@'),
      post: jest.fn(),
      postJson: jest.fn(),
    };
    const isapiForHost = (host: string) => ({
      rtspUrl: (ch: string | number) => `rtsp://admin:secreto@${host}:554/Streaming/Channels/${ch}`,
      rtspUrlRedacted: (ch: string | number) =>
        `rtsp://admin:***@${host}:554/Streaming/Channels/${ch}`,
    });
    const resolved = {
      provider: 'ISAPI',
      client: null,
      hct: null,
      isapi,
      isapiForHost,
      siteId: 7,
      host: 'http://192.168.9.34',
    };

    beforeEach(() => {
      isapi.post.mockReset();
      isapi.postJson.mockReset();
    });

    it('una cámara con IP propia se tira directo, no por el grabador', async () => {
      const { svc } = await build(jest.fn().mockResolvedValue(resolved), {
        raw: {
          channelId: '301',
          source: { ipAddress: '192.168.9.171', reachableDirectly: true },
        },
      });
      const out = await svc.liveStream(1, '192.168.9.34|301');
      expect(out.rtsp).toBe('rtsp://admin:***@192.168.9.171:554/Streaming/Channels/102');
      expect(out.note).toContain('directo');
    });

    it('una cámara plug & play solo existe a través del grabador', async () => {
      const { svc } = await build(jest.fn().mockResolvedValue(resolved), {
        raw: {
          channelId: '101',
          source: { ipAddress: '192.168.254.2', reachableDirectly: false },
        },
      });
      const out = await svc.liveStream(1, '192.168.9.34|101');
      expect(out.rtsp).toBe('rtsp://admin:***@192.168.9.34:554/Streaming/Channels/102');
      expect(out.note).toContain('grabador');
    });

    it('nunca devuelve la contraseña del equipo al cliente', async () => {
      const { svc } = await build(jest.fn().mockResolvedValue(resolved), {
        raw: { channelId: '401', source: null },
      });
      const out = await svc.liveStream(1, '192.168.9.34|401');
      expect(out.rtsp).not.toContain('secreto');
    });

    it('una cámara que no está en el espejo pide sync en vez de reventar', async () => {
      const { svc } = await build(jest.fn().mockResolvedValue(resolved), null);
      const out = await svc.liveStream(1, '192.168.9.34|999');
      expect(out.rtsp).toBeNull();
      expect(out.note).toContain('sync');
    });

    it('playback usa XML ContentMgmt/search y elige segmento', async () => {
      isapi.post.mockResolvedValueOnce({
        CMSearchResult: {
          responseStatusStrg: 'MORE',
          matchList: {
            searchMatchItem: [
              {
                timeSpan: { startTime: '2026-09-03T16:00:00Z', endTime: '2026-09-03T17:00:00Z' },
                mediaSegmentDescriptor: {
                  playbackURI:
                    'rtsp://192.168.9.34:554/Streaming/tracks/501/?starttime=20260903T160000Z',
                  name: 'seg-a',
                },
              },
              {
                timeSpan: { startTime: '2026-09-03T17:00:00Z', endTime: '2026-09-03T18:00:00Z' },
                mediaSegmentDescriptor: {
                  playbackURI:
                    'rtsp://192.168.9.34:554/Streaming/tracks/501/?starttime=20260903T170000Z',
                  name: 'seg-b',
                },
              },
            ],
          },
        },
      });
      const { svc } = await build(
        jest.fn().mockResolvedValue(resolved),
        { raw: { channelId: '501' } },
        'http://go2rtc.test',
      );
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => '',
      } as Response);

      const out = await svc.playbackIsapi(
        1,
        '192.168.9.34|501',
        '2026-09-03T15:00:00.000Z',
        '2026-09-04T15:00:00.000Z',
        7,
        1,
      );

      expect(isapi.post).toHaveBeenCalledWith(
        '/ISAPI/ContentMgmt/search',
        expect.stringContaining('<trackID>501</trackID>'),
      );
      expect(out.segmentIndex).toBe(1);
      expect(out.segments).toHaveLength(2);
      expect(out.hls).toContain('stream.m3u8');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://go2rtc.test/api/streams',
        expect.objectContaining({ method: 'PUT' }),
      );
      fetchMock.mockRestore();
    });

    it('playback sin matches devuelve nota clara', async () => {
      isapi.post.mockResolvedValueOnce({
        CMSearchResult: { responseStatusStrg: 'NO MATCHES', numOfMatches: '0' },
      });
      const { svc } = await build(jest.fn().mockResolvedValue(resolved), {
        raw: { channelId: '501' },
      });
      const out = await svc.playbackIsapi(
        1,
        '192.168.9.34|501',
        '2026-09-04T10:00:00.000Z',
        '2026-09-04T11:00:00.000Z',
        7,
      );
      expect(out.url).toBeNull();
      expect(out.segments).toEqual([]);
      expect(out.note).toMatch(/Sin grabaciones/i);
    });
  });
});
