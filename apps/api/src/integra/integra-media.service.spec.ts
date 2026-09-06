import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegraMediaService, nombreStreamMuro } from './integra-media.service';
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
        expect.stringContaining('/api/streams?name='),
        expect.objectContaining({ method: 'PUT' }),
      );
      fetchMock.mockRestore();
    });

    /* ──────────────────────────────────────────────────────────────────
     * Alta calidad en Foco, de punta a punta contra go2rtc
     * ────────────────────────────────────────────────────────────────── */
    describe('quality=main', () => {
      /** Extrae el `src` que se le registró a go2rtc en un PUT. */
      function srcRegistrado(url: string): string | null {
        const m = /[?&]src=([^&]+)/.exec(url);
        return m ? decodeURIComponent(m[1]) : null;
      }

      /**
       * go2rtc de mentira. Distingue las tres llamadas que hace el servicio:
       * PUT `?name=…&src=…` para registrar, GET `?src=…` para preguntar por los
       * consumidores y DELETE `?src=…` para apagar el ffmpeg.
       */
      function mockGo2rtc(consumidores: unknown[] | null) {
        const puts: string[] = [];
        const deletes: string[] = [];
        const fetchMock = jest
          .spyOn(global, 'fetch')
          .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = String(init?.method ?? 'GET').toUpperCase();
            if (method === 'PUT') puts.push(url);
            if (method === 'DELETE') deletes.push(String(srcRegistrado(url)));
            if (method === 'GET') {
              if (consumidores === null) {
                return { ok: false, status: 500, text: async () => '' } as unknown as Response;
              }
              return {
                ok: true,
                status: 200,
                json: async () => ({ consumers: consumidores }),
                text: async () => '',
              } as unknown as Response;
            }
            return { ok: true, status: 200, text: async () => '' } as unknown as Response;
          });
        return { puts, deletes, fetchMock };
      }

      const camaraH265 = {
        raw: {
          channelId: '301',
          codec: 'H.265',
          source: { ipAddress: '192.168.9.171', reachableDirectly: true },
        },
      };

      it('una cámara H.265 sí da 1080p: se transcodifica en el servidor', async () => {
        // El principal es 1920×1080 pero en H.265 y MSE no lo decodifica. Antes
        // se degradaba a 640×360 y por eso Foco se veía pixelado.
        const { svc } = await build(
          jest.fn().mockResolvedValue(resolved),
          camaraH265,
          'http://go2rtc.test',
        );
        const { puts, fetchMock } = mockGo2rtc([]);

        const out = await svc.liveStream(1, '192.168.9.34|301', 7, { quality: 'main' });

        // Se registra el canal 101 —el de 1080p— pasado por ffmpeg, no el 102.
        expect(srcRegistrado(puts[0])).toBe(
          'ffmpeg:rtsp://admin:secreto@192.168.9.171:554/Streaming/Channels/101#video=h264',
        );
        // Con nombre propio, para no pisar el stream que alimenta al muro.
        expect(out.streamName).toBe('cam_192_168_9_34_301_hd');
        expect(out.note).toContain('HD transcodificado');
        // Y nunca la contraseña del equipo.
        expect(out.rtsp).not.toContain('secreto');
        fetchMock.mockRestore();
      });

      it('el muro sigue en el secundario y sin arrancar ffmpeg', async () => {
        const { svc } = await build(
          jest.fn().mockResolvedValue(resolved),
          camaraH265,
          'http://go2rtc.test',
        );
        const { puts, fetchMock } = mockGo2rtc([]);

        const out = await svc.liveStream(1, '192.168.9.34|301', 7);

        expect(srcRegistrado(puts[0])).toBe(
          'rtsp://admin:secreto@192.168.9.171:554/Streaming/Channels/102',
        );
        expect(out.streamName).toBe('cam_192_168_9_34_301');
        expect(out.note).not.toContain('HD');
        fetchMock.mockRestore();
      });

      it('la SEGUNDA cámara no arranca un segundo ffmpeg: recibe el secundario y el motivo', async () => {
        // Sin este tope, trece peticiones son trece transcodificaciones de
        // 1080p sobre cuatro vCPU: se cae el servidor y con él el muro.
        const { svc, prisma } = await build(
          jest.fn().mockResolvedValue(resolved),
          camaraH265,
          'http://go2rtc.test',
        );
        prisma.integraCamera.findUnique.mockResolvedValue({
          raw: {
            channelId: '401',
            codec: 'H.265',
            source: { ipAddress: '192.168.9.172', reachableDirectly: true },
          },
        });
        const { puts, fetchMock } = mockGo2rtc([]);

        // La primera se queda la única ranura…
        prisma.integraCamera.findUnique.mockResolvedValueOnce(camaraH265);
        await svc.liveStream(1, '192.168.9.34|301', 7, { quality: 'main' });
        const putsTrasLaPrimera = puts.length;

        // …y la segunda rebota.
        const out = await svc.liveStream(1, '192.168.9.34|401', 7, { quality: 'main' });

        expect(puts).toHaveLength(putsTrasLaPrimera); // no se registró nada nuevo
        // Se le devuelve el stream que YA alimenta al muro, caliente: ni una
        // segunda sesión RTSP contra un equipo que las cuenta.
        expect(out.streamName).toBe('cam_192_168_9_34_401');
        expect(out.note).toMatch(/alta calidad no disponible:.*una a la vez/i);
        fetchMock.mockRestore();
      });

      it('cuando nadie mira la primera, se apaga su ffmpeg y la segunda ya entra', async () => {
        const { svc, prisma } = await build(
          jest.fn().mockResolvedValue(resolved),
          camaraH265,
          'http://go2rtc.test',
        );
        const { puts, deletes, fetchMock } = mockGo2rtc([]); // 0 consumidores
        const ahora = jest.spyOn(Date, 'now');

        ahora.mockReturnValue(1_700_000_000_000);
        await svc.liveStream(1, '192.168.9.34|301', 7, { quality: 'main' });

        // Pasa el margen sin que nadie abra el HLS.
        ahora.mockReturnValue(1_700_000_000_000 + 120_000);
        prisma.integraCamera.findUnique.mockResolvedValue({
          raw: {
            channelId: '401',
            codec: 'H.265',
            source: { ipAddress: '192.168.9.172', reachableDirectly: true },
          },
        });
        const out = await svc.liveStream(1, '192.168.9.34|401', 7, { quality: 'main' });

        expect(deletes).toContain('cam_192_168_9_34_301_hd');
        expect(out.streamName).toBe('cam_192_168_9_34_401_hd');
        expect(out.note).toContain('HD transcodificado');
        expect(srcRegistrado(puts[puts.length - 1])).toContain('#video=h264');
        ahora.mockRestore();
        fetchMock.mockRestore();
      });

      it('mientras alguien la mira no se le quita, por mucho que pase el tiempo', async () => {
        const { svc, prisma } = await build(
          jest.fn().mockResolvedValue(resolved),
          camaraH265,
          'http://go2rtc.test',
        );
        const { deletes, fetchMock } = mockGo2rtc([{ id: 1 }]); // alguien enganchado
        const ahora = jest.spyOn(Date, 'now');

        ahora.mockReturnValue(1_700_000_000_000);
        await svc.liveStream(1, '192.168.9.34|301', 7, { quality: 'main' });

        ahora.mockReturnValue(1_700_000_000_000 + 3_600_000); // una hora después
        prisma.integraCamera.findUnique.mockResolvedValue({
          raw: {
            channelId: '401',
            codec: 'H.265',
            source: { ipAddress: '192.168.9.172', reachableDirectly: true },
          },
        });
        const out = await svc.liveStream(1, '192.168.9.34|401', 7, { quality: 'main' });

        expect(deletes).toHaveLength(0);
        expect(out.streamName).toBe('cam_192_168_9_34_401'); // rebotada
        ahora.mockRestore();
        fetchMock.mockRestore();
      });

      it('una terminal de puerta va en H.264: se sirve tal cual, sin gastar la ranura', async () => {
        // Medido: .160 a .163 tienen el 101 en H.264 1280×720.
        const { svc } = await build(
          jest.fn().mockResolvedValue(resolved),
          {
            raw: {
              channelId: '901',
              codec: 'H.264',
              streamId: '101',
              source: { ipAddress: '192.168.9.160', reachableDirectly: true },
            },
          },
          'http://go2rtc.test',
        );
        const { puts, fetchMock } = mockGo2rtc([]);

        const out = await svc.liveStream(1, '192.168.9.34|901', 7, { quality: 'main' });

        expect(srcRegistrado(puts[0])).toBe(
          'rtsp://admin:secreto@192.168.9.160:554/Streaming/Channels/101',
        );
        expect(srcRegistrado(puts[0])).not.toContain('ffmpeg:');
        expect(out.note).toContain('HD nativo');
        fetchMock.mockRestore();
      });
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

    /* ──────────────────────────────────────────────────────────────────
     * El muro en un solo viaje
     * ────────────────────────────────────────────────────────────────── */
    describe('lote del muro', () => {
      it('devuelve todas las cámaras en una sola respuesta', async () => {
        const { svc } = await build(
          jest.fn().mockResolvedValue(resolved),
          { raw: { channelId: '301', source: { ipAddress: '192.168.9.171', reachableDirectly: true } } },
          'http://go2rtc.test',
        );
        const fetchMock = jest
          .spyOn(global, 'fetch')
          .mockResolvedValue({ ok: true, status: 200, text: async () => '' } as Response);

        const out = await svc.liveStreamsEnLote(1, ['192.168.9.34|301', '192.168.9.34|401'], 7);

        expect(out.total).toBe(2);
        expect(out.ok).toBe(2);
        expect(out.failed).toBe(0);
        expect(out.items.map((i) => i.cameraIndexCode)).toEqual([
          '192.168.9.34|301',
          '192.168.9.34|401',
        ]);
        expect(out.items[0].stream?.hls).toContain('stream.m3u8');
        fetchMock.mockRestore();
      });

      it('una cámara rota NO tumba el lote: su fallo viene dentro', async () => {
        // Devolver 500 por la séptima cámara es exactamente el «no se ven
        // todas» de antes, pero peor: sin ninguna.
        const resolveClient = jest.fn().mockResolvedValue(resolved);
        const { svc } = await build(
          resolveClient,
          { raw: { channelId: '301', source: null } },
          'http://go2rtc.test',
        );
        const fetchMock = jest
          .spyOn(global, 'fetch')
          .mockResolvedValue({ ok: true, status: 200, text: async () => '' } as Response);
        resolveClient.mockRejectedValueOnce(new Error('sitio no configurado'));

        const out = await svc.liveStreamsEnLote(1, ['rota', 'buena'], 7);

        expect(out.total).toBe(2);
        expect(out.ok).toBe(1);
        expect(out.failed).toBe(1);
        expect(out.items[0]).toMatchObject({
          cameraIndexCode: 'rota',
          ok: false,
          stream: null,
          error: 'sitio no configurado',
        });
        expect(out.items[1].ok).toBe(true);
        fetchMock.mockRestore();
      });

      it('una cámara que no está en el espejo sale con su nota, no con un 500', async () => {
        const { svc } = await build(jest.fn().mockResolvedValue(resolved), null, 'http://go2rtc.test');
        const out = await svc.liveStreamsEnLote(1, ['192.168.9.34|999'], 7);
        expect(out.ok).toBe(1);
        expect(out.items[0].stream?.hls).toBeNull();
        expect(out.items[0].stream?.note).toContain('sync');
      });

      it('el mismo id dos veces es un solo registro en go2rtc', async () => {
        const { svc } = await build(
          jest.fn().mockResolvedValue(resolved),
          { raw: { channelId: '301', source: null } },
          'http://go2rtc.test',
        );
        const fetchMock = jest
          .spyOn(global, 'fetch')
          .mockResolvedValue({ ok: true, status: 200, text: async () => '' } as Response);

        const out = await svc.liveStreamsEnLote(1, ['192.168.9.34|301', '192.168.9.34|301', '  '], 7);

        expect(out.total).toBe(1);
        fetchMock.mockRestore();
      });
    });
  });

  /**
   * El precalentado registra un nombre y el muro pide otro: si estos dos se
   * separan, precalentar deja de servir para nada y nadie se entera, porque
   * ambos «funcionan».
   */
  it('el nombre que precalienta el arranque es el que abre el muro', async () => {
    const { svc } = await build(
      jest.fn().mockResolvedValue({
        provider: 'ISAPI',
        client: null,
        hct: null,
        isapi: {
          rtspUrl: (ch: string | number) => `rtsp://admin:secreto@192.168.9.34:554/x/${ch}`,
          rtspUrlRedacted: (ch: string | number) => `rtsp://admin:***@192.168.9.34:554/x/${ch}`,
        },
        isapiForHost: null,
        siteId: 7,
        host: 'http://192.168.9.34',
      }),
      { raw: { channelId: '301', source: null } },
      'http://go2rtc.test',
    );
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200, text: async () => '' } as Response);

    const out = await svc.liveStream(1, '192.168.9.34|301', 7, { audio: false, quality: 'sub' });

    expect(out.streamName).toBe(nombreStreamMuro('192.168.9.34|301'));
    fetchMock.mockRestore();
  });

  it('el prefijo de limpieza de playback casa con el nombre que publish() genera', () => {
    // Este es el fallo que dejó nueve streams huérfanos en producción durante
    // días. `publish()` antepone `cam_` a TODO, así que un playback acaba
    // llamándose `cam_pb_<camara>_<ts>`. La limpieza buscaba `pb_<camara>_` y
    // nunca casaba, así que no borraba nada — y sus URLs con `?starttime=` son
    // las que corrompieron el YAML de go2rtc.
    const camara = '192.168.9.163|101';
    const nombreReal = nombreStreamMuro(`pb_${camara}_1788559750614`);
    const prefijoLimpieza = `${nombreStreamMuro(`pb_${camara}`)}_`;

    expect(nombreReal).toBe('cam_pb_192_168_9_163_101_1788559750614');
    expect(nombreReal.startsWith(prefijoLimpieza)).toBe(true);

    // Y el prefijo mal escrito, el de antes, NO casa. Si alguien lo vuelve a
    // poner a mano, esta afirmación se lo dice.
    expect(nombreReal.startsWith('pb_192_168_9_163_101_')).toBe(false);
  });

  it('la limpieza de una camara no toca los playback de otra', () => {
    const prefijo163 = `${nombreStreamMuro('pb_192.168.9.163|101')}_`;
    const otra = nombreStreamMuro('pb_192.168.9.171|102_1788559750614');
    expect(otra.startsWith(prefijo163)).toBe(false);
  });

  describe('streamsRegistrados', () => {
    it('devuelve los nombres que go2rtc tiene ahora mismo', async () => {
      const { svc } = await build(jest.fn(), null, 'http://go2rtc.test');
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ cam_a: {}, cam_b: {} }),
      } as unknown as Response);

      await expect(svc.streamsRegistrados()).resolves.toEqual(new Set(['cam_a', 'cam_b']));
      fetchMock.mockRestore();
    });

    it('sin GO2RTC_URL devuelve null, que NO es «no hay ninguno»', async () => {
      const { svc } = await build(jest.fn(), null, '');
      await expect(svc.streamsRegistrados()).resolves.toBeNull();
    });

    it('si go2rtc no contesta devuelve null en vez de un conjunto vacío', async () => {
      const { svc } = await build(jest.fn(), null, 'http://go2rtc.test');
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(svc.streamsRegistrados()).resolves.toBeNull();
      fetchMock.mockRestore();
    });
  });
});
