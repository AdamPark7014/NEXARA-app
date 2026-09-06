import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { IntegraDetectionService } from './integra-detection.service';
import type { IntegraMediaService } from './integra-media.service';
import { IntegraWarmupService } from './integra-warmup.service';

/**
 * Lo que se prueba aquí es lo que puede hacer daño.
 *
 * Precalentar es escribir en go2rtc en nombre de las cámaras de un cliente, y
 * sondear capacidades es leer de cada equipo. Las tres barandillas —escalonado,
 * guardia de no solapamiento y apagado por entorno— son las que separan «la
 * consola abre al instante» de «la API aporrea el NVR del cliente cada diez
 * minutos». Sin base, sin red y sin relojes de verdad.
 */

const SITIO = { id: 7, companyId: 4242 };

type Entorno = Record<string, string | undefined>;

/** La pausa del escalonado, observada: cada llamada deja su marca en el log. */
type ConDormir = { dormir: (ms: number) => Promise<void> };

function escenario(opts?: {
  entorno?: Entorno;
  camaras?: string[];
  registradosEnGo2rtc?: string[] | null;
  capacidadesYaSondeadas?: string[];
  sitios?: Array<{ id: number; companyId: number }>;
}) {
  const entorno: Entorno = opts?.entorno ?? {};
  const camaras = opts?.camaras ?? ['192.168.9.34|301', '192.168.9.34|401'];
  const registrados =
    opts?.registradosEnGo2rtc === null ? null : new Set(opts?.registradosEnGo2rtc ?? []);

  /** Orden real de lo que hizo el servicio: registros y pausas, intercalados. */
  const log: string[] = [];

  const prisma = {
    integraSite: {
      findMany: jest.fn(async () => opts?.sitios ?? [SITIO]),
    },
    integraCamera: {
      findMany: jest.fn(async () =>
        camaras.map((cameraIndexCode) => ({ cameraIndexCode, name: cameraIndexCode })),
      ),
    },
    integraCameraCapability: {
      findMany: jest.fn(async () =>
        (opts?.capacidadesYaSondeadas ?? []).map((cameraId) => ({ cameraId })),
      ),
    },
  } as unknown as PrismaService;

  const media = {
    streamsRegistrados: jest.fn(async () => registrados),
    liveStream: jest.fn(async (_c: number | null, cameraIndexCode: string) => {
      log.push(`registra:${cameraIndexCode}`);
      return { cameraIndexCode, hls: `http://go2rtc/${cameraIndexCode}`, note: 'go2rtc MSE' };
    }),
  };

  const detection = {
    probeCapabilities: jest.fn(async (_c: number | null, cameraId: string) => {
      log.push(`sondea:${cameraId}`);
      return { probeOk: true, probeNote: null };
    }),
  };

  const config = {
    get: jest.fn((clave: string) => entorno[clave]),
  } as unknown as ConfigService;

  const svc = new IntegraWarmupService(
    prisma,
    media as unknown as IntegraMediaService,
    detection as unknown as IntegraDetectionService,
    config,
  );

  // La pausa no se espera de verdad —las pruebas no duran segundos— pero SÍ se
  // anota, que es lo que permite comprobar que los registros van escalonados y
  // en serie y no en un abanico de N a la vez.
  const dormir = jest
    .spyOn(svc as unknown as ConDormir, 'dormir')
    .mockImplementation(async (ms: number) => {
      log.push(`espera:${ms}`);
    });

  return { svc, prisma, media, detection, log, dormir };
}

describe('IntegraWarmupService · precalentado de streams', () => {
  it('registra solo lo que go2rtc no tiene: lo caliente ni se toca', async () => {
    // La deriva base ↔ go2rtc que un día dejó el muro con 16 de 17.
    const { svc, media } = escenario({
      camaras: ['192.168.9.34|301', '192.168.9.174|601'],
      registradosEnGo2rtc: ['cam_192_168_9_34_301'],
    });

    const out = await svc.precalentar();

    expect(out.ejecutado).toBe(true);
    expect(out.yaCalientes).toBe(1);
    expect(out.registradas).toBe(1);
    expect(media.liveStream).toHaveBeenCalledTimes(1);
    expect(media.liveStream).toHaveBeenCalledWith(4242, '192.168.9.174|601', 7, {
      audio: false,
      quality: 'sub',
    });
  });

  it('precalienta el secundario y mudo: el mismo stream que pedirá el muro', async () => {
    // Con audio la fuente sería `ffmpeg:…`, o sea un proceso por cámara; y en
    // `main` sería un segundo canal contra un NVR con sesiones contadas.
    const { svc, media } = escenario({ camaras: ['192.168.9.34|301'] });
    await svc.precalentar();
    expect(media.liveStream).toHaveBeenCalledWith(4242, '192.168.9.34|301', 7, {
      audio: false,
      quality: 'sub',
    });
  });

  it('escalona: un registro, su pausa, el siguiente registro', async () => {
    // Diecisiete PUT a la vez contra go2rtc, que reescribe su YAML en cada uno,
    // es como se corrompió el fichero y se perdieron cámaras al reiniciar.
    const { svc, log, dormir } = escenario({
      camaras: ['cam-a', 'cam-b', 'cam-c'],
    });

    await svc.precalentar();

    expect(log).toEqual([
      'registra:cam-a',
      'espera:400',
      'registra:cam-b',
      'espera:400',
      'registra:cam-c',
      'espera:400',
    ]);
    expect(dormir).toHaveBeenCalledTimes(3);
  });

  it('una cámara ya caliente no gasta pausa: la vuelta en régimen es instantánea', async () => {
    const { svc, log, dormir } = escenario({
      camaras: ['cam-a', 'cam-b'],
      registradosEnGo2rtc: ['cam_cam-a', 'cam_cam-b'],
    });

    const out = await svc.precalentar();

    expect(out.yaCalientes).toBe(2);
    expect(out.registradas).toBe(0);
    expect(dormir).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it('el escalonado se afina por entorno, con techo', async () => {
    const { svc, log } = escenario({
      camaras: ['cam-a'],
      entorno: { INTEGRA_WARMUP_STAGGER_MS: '1200' },
    });
    await svc.precalentar();
    expect(log).toContain('espera:1200');
  });

  it('guardia: si la vuelta anterior sigue en curso, la nueva se salta', async () => {
    // Sin esto, un cron cada diez minutos sobre una vuelta que tarda quince
    // acaba con dos series de registros pisándose.
    const { svc, media } = escenario({ camaras: ['cam-a', 'cam-b'] });

    let soltar: (() => void) | null = null;
    media.streamsRegistrados.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          soltar = () => resolve(new Set<string>());
        }),
    );

    const primera = svc.precalentar();
    // La segunda entra con la primera todavía colgada del GET a go2rtc.
    const segunda = await svc.precalentar();

    expect(segunda.ejecutado).toBe(false);
    expect(segunda.razon).toBe('ya-en-curso');
    expect(media.liveStream).not.toHaveBeenCalled();

    (soltar as unknown as () => void)();
    const resultado = await primera;
    expect(resultado.ejecutado).toBe(true);
    expect(resultado.registradas).toBe(2);
  });

  it('tras terminar, el guardia se suelta: la siguiente vuelta sí corre', async () => {
    const { svc } = escenario({ camaras: ['cam-a'] });
    await svc.precalentar();
    const segunda = await svc.precalentar();
    expect(segunda.ejecutado).toBe(true);
  });

  it('apagado por entorno: ni una petición', async () => {
    const { svc, media, prisma, dormir } = escenario({
      entorno: { INTEGRA_WARMUP_ENABLED: '0' },
    });

    const out = await svc.precalentar();

    expect(out).toMatchObject({ ejecutado: false, razon: 'apagado', registradas: 0 });
    expect(media.streamsRegistrados).not.toHaveBeenCalled();
    expect(media.liveStream).not.toHaveBeenCalled();
    expect(prisma.integraSite.findMany).not.toHaveBeenCalled();
    expect(dormir).not.toHaveBeenCalled();
  });

  it('con go2rtc caído no registra a ciegas', async () => {
    // Si no se sabe qué hay registrado, N escrituras contra nada y N pausas
    // para nada. Mejor esperar a la siguiente vuelta.
    const { svc, media } = escenario({ registradosEnGo2rtc: null });

    const out = await svc.precalentar();

    expect(out).toMatchObject({ ejecutado: false, razon: 'go2rtc-no-disponible' });
    expect(media.liveStream).not.toHaveBeenCalled();
  });

  it('una cámara que revienta no corta la vuelta', async () => {
    const { svc, media } = escenario({ camaras: ['cam-a', 'cam-b', 'cam-c'] });
    media.liveStream.mockImplementationOnce(async () => {
      throw new Error('el equipo no contesta');
    });

    const out = await svc.precalentar();

    expect(out.fallos).toBe(1);
    expect(out.registradas).toBe(2);
    expect(media.liveStream).toHaveBeenCalledTimes(3);
  });

  it('una cámara sin HLS cuenta como fallo, no como registrada', async () => {
    const { svc, media } = escenario({ camaras: ['cam-a'] });
    media.liveStream.mockResolvedValueOnce({
      cameraIndexCode: 'cam-a',
      hls: null,
      note: 'no está en el espejo',
    });

    const out = await svc.precalentar();

    expect(out.registradas).toBe(0);
    expect(out.fallos).toBe(1);
  });

  it('el tope por vuelta corta y deja el resto para la siguiente', async () => {
    const { svc, media } = escenario({
      camaras: ['cam-a', 'cam-b', 'cam-c', 'cam-d'],
      entorno: { INTEGRA_WARMUP_MAX_POR_VUELTA: '2' },
    });

    const out = await svc.precalentar();

    expect(out.registradas).toBe(2);
    expect(out.truncado).toBe(true);
    expect(media.liveStream).toHaveBeenCalledTimes(2);
  });

  it('solo mira sitios ISAPI activos: HCT va por token de nube, no por go2rtc', async () => {
    const { svc, prisma } = escenario();
    await svc.precalentar();
    expect(prisma.integraSite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, provider: 'ISAPI' } }),
    );
  });
});

describe('IntegraWarmupService · arranque', () => {
  it('apagado, no programa el disparo de arranque', () => {
    const { svc, media } = escenario({ entorno: { INTEGRA_WARMUP_ENABLED: '0' } });
    jest.useFakeTimers();
    try {
      svc.onApplicationBootstrap();
      jest.advanceTimersByTime(120_000);
      expect(media.streamsRegistrados).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('encendido, precalienta tras la espera de arranque y no antes', async () => {
    const { svc, media } = escenario({
      camaras: ['cam-a'],
      entorno: { INTEGRA_WARMUP_BOOT_DELAY_MS: '5000' },
    });
    jest.useFakeTimers();
    try {
      svc.onApplicationBootstrap();
      jest.advanceTimersByTime(4_000);
      expect(media.streamsRegistrados).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1_500);
      expect(media.streamsRegistrados).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
    // Que las promesas pendientes del disparo terminen antes de salir.
    await Promise.resolve();
  });

  it('al destruirse el módulo cancela el disparo pendiente', () => {
    const { svc, media } = escenario();
    jest.useFakeTimers();
    try {
      svc.onApplicationBootstrap();
      svc.onModuleDestroy();
      jest.advanceTimersByTime(120_000);
      expect(media.streamsRegistrados).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('IntegraWarmupService · sondeo automático de capacidades', () => {
  it('sondea solo las cámaras que nunca se sondearon', async () => {
    // La fila se guarda incluso cuando el equipo contesta 403: reintentar cada
    // día lo que ya se sabe que no contesta es aporrear el parque para nada.
    const { svc, detection } = escenario({
      camaras: ['cam-a', 'cam-b', 'cam-c'],
      capacidadesYaSondeadas: ['cam-b'],
    });

    const out = await svc.sondearCapacidadesPendientes();

    expect(out.sondeadas).toBe(2);
    expect(out.ok).toBe(2);
    expect(detection.probeCapabilities).toHaveBeenCalledTimes(2);
    expect(detection.probeCapabilities).not.toHaveBeenCalledWith(4242, 'cam-b', 7);
  });

  it('escalona los sondeos: es una lectura por equipo, no un abanico', async () => {
    const { svc, log } = escenario({ camaras: ['cam-a', 'cam-b'] });
    await svc.sondearCapacidadesPendientes();
    expect(log).toEqual(['sondea:cam-a', 'espera:1500', 'sondea:cam-b', 'espera:1500']);
  });

  it('apagado por entorno: ni una lectura', async () => {
    const { svc, detection, prisma } = escenario({
      entorno: { INTEGRA_CAPABILITIES_PROBE_ENABLED: '0' },
    });

    const out = await svc.sondearCapacidadesPendientes();

    expect(out).toMatchObject({ ejecutado: false, razon: 'apagado' });
    expect(detection.probeCapabilities).not.toHaveBeenCalled();
    expect(prisma.integraSite.findMany).not.toHaveBeenCalled();
  });

  it('guardia: dos vueltas no se solapan sobre el mismo equipo', async () => {
    const { svc, detection, prisma } = escenario({ camaras: ['cam-a'] });

    let soltar: (() => void) | null = null;
    (prisma.integraSite.findMany as unknown as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          soltar = () => resolve([SITIO]);
        }),
    );

    const primera = svc.sondearCapacidadesPendientes();
    const segunda = await svc.sondearCapacidadesPendientes();

    expect(segunda).toMatchObject({ ejecutado: false, razon: 'ya-en-curso' });
    expect(detection.probeCapabilities).not.toHaveBeenCalled();

    (soltar as unknown as () => void)();
    await primera;
    expect(detection.probeCapabilities).toHaveBeenCalledTimes(1);
  });

  it('un equipo que no contesta no corta la vuelta', async () => {
    const { svc, detection } = escenario({ camaras: ['cam-a', 'cam-b'] });
    detection.probeCapabilities.mockImplementationOnce(async () => {
      throw new Error('403 notSupport');
    });

    const out = await svc.sondearCapacidadesPendientes();

    expect(out.sondeadas).toBe(2);
    expect(out.ok).toBe(1);
  });

  it('el tope por vuelta corta el sondeo', async () => {
    const { svc, detection } = escenario({
      camaras: ['cam-a', 'cam-b', 'cam-c'],
      entorno: { INTEGRA_CAPABILITIES_MAX_POR_VUELTA: '1' },
    });

    const out = await svc.sondearCapacidadesPendientes();

    expect(out.sondeadas).toBe(1);
    expect(out.truncado).toBe(true);
    expect(detection.probeCapabilities).toHaveBeenCalledTimes(1);
  });
});
