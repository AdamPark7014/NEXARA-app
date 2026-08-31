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
    };
    const isapiForHost = (host: string) => ({
      rtspUrl: (ch: string | number) => `rtsp://admin:secreto@${host}:554/Streaming/Channels/${ch}`,
      rtspUrlRedacted: (ch: string | number) => `rtsp://admin:***@${host}:554/Streaming/Channels/${ch}`,
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

    it('una cámara con IP propia se tira directo, no por el grabador', async () => {
      const { svc } = await build(jest.fn().mockResolvedValue(resolved), {
        raw: {
          channelId: '301',
          source: { ipAddress: '192.168.9.171', reachableDirectly: true },
        },
      });
      const out = await svc.liveStream(1, '192.168.9.34|301');
      expect(out.rtsp).toBe('rtsp://admin:***@192.168.9.171:554/Streaming/Channels/101');
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
      expect(out.rtsp).toBe('rtsp://admin:***@192.168.9.34:554/Streaming/Channels/101');
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
  });
});
