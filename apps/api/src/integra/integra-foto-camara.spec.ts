import { IntegraMediaService } from './integra-media.service';
import { IntegraPushService, type NormalizedEvent } from './integra-push.service';

/**
 * Las fotos de las cámaras. Cada prueba fija una medición del 02-11: fotografiar
 * todo no cabe en el disco, `/picture` se atora en el túnel y la poda de un solo
 * lote se quedaba atrás de lo que entra.
 */

const SITIO = { id: 1, companyId: 2 };
const AHORA = Date.parse('2026-11-03T16:00:00Z');

const evento = (extra: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
  deviceIp: '192.168.9.172',
  deviceName: 'Almacen 01',
  eventType: 'facedetection',
  major: null,
  minor: null,
  label: 'Rostro detectado',
  occurredAt: new Date(AHORA),
  personId: null,
  personName: null,
  doorNo: null,
  verifyMode: null,
  eventState: 'active',
  activePostCount: 1,
  targets: null,
  raw: { ipAddress: extra.deviceIp ?? '192.168.9.172' },
  ...extra,
});

function montar() {
  const filaDe = (id: number) => ({
    id,
    deviceIp: '192.168.9.172',
    deviceName: null,
    eventType: 'facedetection',
    label: null,
    occurredAt: new Date(AHORA),
    personId: null,
    personName: null,
    doorNo: null,
    verifyMode: null,
    photoPath: null,
    targets: null,
  });
  const prisma = {
    integraPushEvent: {
      create: jest.fn().mockResolvedValue(filaDe(1)),
      update: jest.fn().mockImplementation(({ data }) => ({ ...filaDe(1), ...data })),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const getBinary = jest.fn().mockResolvedValue({
    buffer: Buffer.alloc(2_000),
    contentType: 'image/jpeg',
  });
  const resolveClient = jest.fn().mockResolvedValue({ isapiForHost: () => ({ getBinary }) });
  const fotoDeCamara = jest.fn().mockResolvedValue(Buffer.alloc(20_000));
  const servicio = new IntegraPushService(
    prisma as never,
    { resolveClient } as never,
    { touchMirrorName: jest.fn().mockResolvedValue(undefined) } as never,
    { onPushEvent: jest.fn().mockResolvedValue(undefined) } as never,
    { fotoDeCamara } as never,
  );
  const savePhoto = jest.fn().mockResolvedValue('/uploads/integra/1/foto.jpg');
  (servicio as unknown as { savePhoto: jest.Mock }).savePhoto = savePhoto;
  return { servicio, prisma, resolveClient, getBinary, fotoDeCamara, savePhoto };
}

/** La foto va en segundo plano: se deja correr lo que `ingest` lanzó y no esperó. */
const dejarCorrer = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};

describe('fotos de cámara', () => {
  let reloj: jest.SpyInstance<number, []>;

  beforeEach(() => {
    reloj = jest.spyOn(Date, 'now').mockReturnValue(AHORA);
  });

  afterEach(() => {
    reloj.mockRestore();
  });

  const a = (ms: number) => {
    reloj.mockReturnValue(AHORA + ms);
    return new Date(AHORA + ms);
  };

  it('toma a lo más una foto por cámara por minuto, y guarda todas las filas', async () => {
    const { servicio, prisma, fotoDeCamara } = montar();

    await servicio.ingest(SITIO, evento({ occurredAt: a(0) }));
    await servicio.ingest(SITIO, evento({ occurredAt: a(226) }));
    await servicio.ingest(SITIO, evento({ occurredAt: a(59_999) }));
    expect(fotoDeCamara).toHaveBeenCalledTimes(1);
    expect(prisma.integraPushEvent.create).toHaveBeenCalledTimes(3);

    await servicio.ingest(SITIO, evento({ occurredAt: a(60_000) }));
    expect(fotoDeCamara).toHaveBeenCalledTimes(2);
  });

  it('cada cámara lleva su propia cuenta', async () => {
    const { servicio, fotoDeCamara } = montar();
    await servicio.ingest(SITIO, evento());
    await servicio.ingest(SITIO, evento({ deviceIp: '192.168.9.173' }));
    expect(fotoDeCamara).toHaveBeenCalledTimes(2);
    expect(fotoDeCamara).toHaveBeenNthCalledWith(2, SITIO, '192.168.9.173');
  });

  it('un evento atrasado no toma foto ni gasta el turno de la cámara', async () => {
    const { servicio, fotoDeCamara } = montar();
    await servicio.ingest(SITIO, evento({ occurredAt: new Date(AHORA - 8 * 60_000) }));
    expect(fotoDeCamara).not.toHaveBeenCalled();

    await servicio.ingest(SITIO, evento());
    expect(fotoDeCamara).toHaveBeenCalledTimes(1);
  });

  it('la foto de la cámara sale del video y queda en su fila', async () => {
    const { servicio, prisma, fotoDeCamara, savePhoto, getBinary } = montar();
    await servicio.ingest(SITIO, evento());
    await dejarCorrer();

    expect(savePhoto).toHaveBeenCalledWith(SITIO, expect.anything(), await fotoDeCamara.mock.results[0].value);
    expect(prisma.integraPushEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { photoPath: '/uploads/integra/1/foto.jpg' } }),
    );
    expect(getBinary).not.toHaveBeenCalled();
  });

  it('sin foto por el video no insiste por ISAPI, porque atoraría una ranura del equipo', async () => {
    const { servicio, prisma, fotoDeCamara, getBinary } = montar();
    fotoDeCamara.mockResolvedValue(null);
    await servicio.ingest(SITIO, evento());
    await dejarCorrer();

    expect(getBinary).not.toHaveBeenCalled();
    expect(prisma.integraPushEvent.update).not.toHaveBeenCalled();
  });

  it('un acceso no espera turno y sigue tomando su foto por ISAPI', async () => {
    const { servicio, getBinary, fotoDeCamara } = montar();
    const acceso = () =>
      evento({
        deviceIp: '192.168.9.160',
        eventType: 'AccessControllerEvent',
        major: 5,
        minor: 75,
        raw: { ipAddress: '192.168.9.160' },
      });
    await servicio.ingest(SITIO, acceso());
    await servicio.ingest(SITIO, acceso());
    await dejarCorrer();

    expect(getBinary).toHaveBeenCalledTimes(2);
    expect(fotoDeCamara).not.toHaveBeenCalled();
  });
});

describe('poda de eventos', () => {
  const lote = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, photoPath: null as string | null }));

  it('sigue borrando lotes hasta alcanzar lo que entra en un día', async () => {
    const { servicio, prisma } = montar();
    prisma.integraPushEvent.findMany
      .mockResolvedValueOnce(lote(8_000))
      .mockResolvedValueOnce(lote(8_000))
      .mockResolvedValueOnce(lote(3));
    prisma.integraPushEvent.deleteMany
      .mockResolvedValueOnce({ count: 8_000 })
      .mockResolvedValueOnce({ count: 8_000 })
      .mockResolvedValueOnce({ count: 3 });

    await expect(servicio.purgeOldEvents()).resolves.toEqual({ deleted: 16_003, photos: 0 });
    expect(prisma.integraPushEvent.findMany).toHaveBeenCalledTimes(3);
  });

  it('tiene tope por corrida: lo que sobre queda para la noche siguiente', async () => {
    const { servicio, prisma } = montar();
    prisma.integraPushEvent.findMany.mockResolvedValue(lote(8_000));
    prisma.integraPushEvent.deleteMany.mockResolvedValue({ count: 8_000 });

    await expect(servicio.purgeOldEvents()).resolves.toEqual({ deleted: 320_000, photos: 0 });
    expect(prisma.integraPushEvent.findMany).toHaveBeenCalledTimes(40);
  });

  it('sin nada que borrar no hace una segunda consulta', async () => {
    const { servicio, prisma } = montar();
    prisma.integraPushEvent.findMany.mockResolvedValue([]);

    await expect(servicio.purgeOldEvents()).resolves.toEqual({ deleted: 0, photos: 0 });
    expect(prisma.integraPushEvent.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.integraPushEvent.deleteMany).not.toHaveBeenCalled();
  });
});

describe('fotoDeCamara', () => {
  const INTERNO = 'http://go2rtc:1984';
  const CAMARA = { cameraIndexCode: '192.168.9.34|401' };
  const JPEG = Buffer.alloc(20_000);
  const respuesta = (status: number, cuerpo = JPEG) =>
    new Response(status === 404 ? null : new Uint8Array(cuerpo), { status });
  const fetchOriginal = global.fetch;
  let fetchMock: jest.Mock;

  const montarMedia = (camara: unknown = CAMARA, go2rtc: string = INTERNO) => {
    const findFirst = jest.fn().mockResolvedValue(camara);
    const servicio = new IntegraMediaService(
      {} as never,
      { get: (k: string) => (k === 'GO2RTC_URL' ? go2rtc : undefined) } as never,
      { integraCamera: { findFirst } } as never,
    );
    const liveStream = jest.fn().mockResolvedValue({});
    (servicio as unknown as { liveStream: jest.Mock }).liveStream = liveStream;
    return { servicio, findFirst, liveStream };
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('pide el cuadro del stream del muro de esa cámara', async () => {
    fetchMock.mockResolvedValue(respuesta(200));
    const { servicio, findFirst, liveStream } = montarMedia();

    await expect(servicio.fotoDeCamara(SITIO, '192.168.9.172')).resolves.toHaveLength(20_000);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { siteId: 1, raw: { path: ['source', 'ipAddress'], equals: '192.168.9.172' } },
      }),
    );
    expect(fetchMock.mock.calls[0][0]).toBe(`${INTERNO}/api/frame.jpeg?src=cam_192_168_9_34_401`);
    expect(liveStream).not.toHaveBeenCalled();
  });

  it('si go2rtc no tiene el stream, como tras reiniciarlo, lo registra y reintenta', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(404)).mockResolvedValueOnce(respuesta(200));
    const { servicio, liveStream } = montarMedia();

    await expect(servicio.fotoDeCamara(SITIO, '192.168.9.172')).resolves.toHaveLength(20_000);
    expect(liveStream).toHaveBeenCalledWith(2, '192.168.9.34|401', 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no devuelve foto sin go2rtc, sin cámara en el espejo o con una respuesta vacía', async () => {
    await expect(montarMedia(CAMARA, '').servicio.fotoDeCamara(SITIO, 'x')).resolves.toBeNull();
    await expect(montarMedia(null).servicio.fotoDeCamara(SITIO, 'x')).resolves.toBeNull();
    fetchMock.mockResolvedValue(respuesta(200, Buffer.alloc(10)));
    await expect(montarMedia().servicio.fotoDeCamara(SITIO, 'x')).resolves.toBeNull();
    fetchMock.mockResolvedValue(respuesta(500));
    await expect(montarMedia().servicio.fotoDeCamara(SITIO, 'x')).resolves.toBeNull();
  });
});
