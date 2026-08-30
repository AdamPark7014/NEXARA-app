import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IntegraMediaService } from './integra-media.service';
import { IntegraSiteService } from './integra-site.service';

describe('IntegraMediaService', () => {
  it('sin GO2RTC_URL devuelve solo RTSP', async () => {
    const sites = {
      resolveClient: jest.fn().mockResolvedValue({
        provider: 'ARTEMIS',
        hct: null,
        client: {
          previewUrls: jest.fn().mockResolvedValue({ url: 'rtsp://cam/stream' }),
        },
      }),
    };
    const config = {
      get: jest.fn((k: string) => (k === 'GO2RTC_URL' ? '' : undefined)),
    };
    const mod = await Test.createTestingModule({
      providers: [
        IntegraMediaService,
        { provide: IntegraSiteService, useValue: sites },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    const svc = mod.get(IntegraMediaService);
    const out = await svc.liveStream(1, 'cam1');
    expect(out.rtsp).toBe('rtsp://cam/stream');
    expect(out.hls).toBeNull();
  });
});
