import { NotFoundException } from '@nestjs/common';
import { IntegraArtemisService } from './integra-artemis.service';
import type { HikvisionIsapiClient } from '../hikvision-isapi/index';

/**
 * Dos cosas que solo se ven con el servicio montado:
 *
 * 1. Los nombres de puerta se resuelven por el sitio de CADA persona. Antes se
 *    resolvía el listado entero contra el sitio de la primera fila, así que en
 *    una empresa con dos sitios el segundo salía sin puertas.
 * 2. La foto que no existe no se vuelve a pedir al terminal cada dos minutos.
 *
 * `companyId` es un número que no existe en `uploads`, así que los helpers de
 * disco (`hasLocalPersonFace`, `readLocalPersonFace`) devuelven vacío sin
 * necesidad de tocar el sistema de archivos.
 */
const COMPANY = 987654;

type PersonRow = {
  id: number;
  companyId: number;
  siteId: number;
  personId: string;
  personName: string;
  personCode: string | null;
  orgIndexCode: string | null;
  orgName: string | null;
  userType: string | null;
  sourceIp: string | null;
  faceUrl: string | null;
  raw: unknown;
};

type DeviceRow = { siteId: number; ip: string; name: string };
type DoorRow = { siteId: number; doorIndexCode: string; name: string };
type CardRow = { companyId: number; personId: string; cardNo: string };

type FindManyArgs = { where?: Record<string, unknown> };

/** El mismo `192.168.9.163` en dos instalaciones distintas: el caso del bug. */
function scenario() {
  const people: PersonRow[] = [
    {
      id: 1,
      companyId: COMPANY,
      siteId: 1,
      personId: '100',
      personName: 'Ana',
      personCode: '100',
      orgIndexCode: null,
      orgName: null,
      userType: 'normal',
      sourceIp: '192.168.9.163',
      faceUrl: null,
      raw: { RightPlan: [{ doorNo: 1 }] },
    },
    {
      id: 2,
      companyId: COMPANY,
      siteId: 2,
      personId: '200',
      personName: 'Beto',
      personCode: '200',
      orgIndexCode: null,
      orgName: null,
      userType: 'normal',
      sourceIp: '192.168.9.163',
      faceUrl: null,
      raw: { RightPlan: [{ doorNo: 1 }] },
    },
  ];
  const devices: DeviceRow[] = [
    { siteId: 1, ip: '192.168.9.163', name: 'Acceso General' },
    { siteId: 2, ip: '192.168.9.163', name: 'Recepción Planta' },
  ];
  const doors: DoorRow[] = [
    { siteId: 1, doorIndexCode: '192.168.9.163|1', name: 'Puerta Oficinas' },
    { siteId: 2, doorIndexCode: '192.168.9.163|1', name: 'Puerta Planta' },
  ];
  const cards: CardRow[] = [{ companyId: COMPANY, personId: '100', cardNo: '5550001' }];

  const inList = (v: unknown, value: unknown): boolean =>
    Array.isArray((v as { in?: unknown[] })?.in)
      ? ((v as { in: unknown[] }).in as unknown[]).includes(value)
      : v === value;

  const prisma = {
    integraPerson: {
      findMany: jest.fn(async ({ where = {} }: FindManyArgs = {}) =>
        people.filter(
          (p) =>
            (where.companyId == null || p.companyId === where.companyId) &&
            (where.siteId == null || inList(where.siteId, p.siteId)),
        ),
      ),
      findFirst: jest.fn(async ({ where = {} }: FindManyArgs = {}) =>
        people.find((p) => p.personId === where.personId) ?? null,
      ),
    },
    integraPersonCard: {
      findMany: jest.fn(async ({ where = {} }: FindManyArgs = {}) =>
        cards.filter((c) => where.companyId == null || c.companyId === where.companyId),
      ),
    },
    integraDevice: {
      findMany: jest.fn(async ({ where = {} }: FindManyArgs = {}) =>
        devices.filter((d) => inList(where.siteId, d.siteId)),
      ),
    },
    integraDoor: {
      findMany: jest.fn(async ({ where = {} }: FindManyArgs = {}) =>
        doors.filter((d) => inList(where.siteId, d.siteId)),
      ),
    },
  };

  const identity = {
    attachErpUsers: jest.fn(async <T,>(_companyId: number | null, rows: T[]) => rows),
  };

  return { prisma, identity, people };
}

type ServiceDeps = ConstructorParameters<typeof IntegraArtemisService>;

function buildService(overrides: {
  prisma: unknown;
  identity: unknown;
  sites?: unknown;
}): IntegraArtemisService {
  const sites = overrides.sites ?? {
    resolveClient: jest.fn(async () => ({
      provider: 'ISAPI',
      client: null,
      hct: null,
      isapi: null,
      isapiForHost: null,
      siteId: null,
      companyId: COMPANY,
    })),
  };
  const noop = {};
  const deps = [
    sites,
    overrides.prisma,
    noop,
    noop,
    noop,
    noop,
    noop,
    overrides.identity,
  ] as unknown as ServiceDeps;
  return new IntegraArtemisService(...deps);
}

describe('listPeople: puertas resueltas por sitio', () => {
  it('cada persona recibe las puertas de SU sitio, no las del primero', async () => {
    const { prisma, identity } = scenario();
    const svc = buildService({ prisma, identity });

    const res = await svc.listPeople(COMPANY, false, null);
    const ana = res.items.find((p) => p.id === '100');
    const beto = res.items.find((p) => p.id === '200');

    expect(ana?.doorNames).toEqual(['Puerta Oficinas']);
    expect(ana?.sourceName).toBe('Acceso General');
    // Este era el fallo: con dos sitios, el segundo salía vacío.
    expect(beto?.doorNames).toEqual(['Puerta Planta']);
    expect(beto?.sourceName).toBe('Recepción Planta');
  });

  it('pregunta por los dos sitios en una sola consulta, no por el primero', async () => {
    const { prisma, identity } = scenario();
    const svc = buildService({ prisma, identity });
    await svc.listPeople(COMPANY, false, null);

    expect(prisma.integraDoor.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.integraDoor.findMany.mock.calls[0][0].where as {
      siteId: { in: number[] };
    };
    expect([...where.siteId.in].sort()).toEqual([1, 2]);
  });

  it('el número de tarjeta llega al DTO', async () => {
    const { prisma, identity } = scenario();
    const svc = buildService({ prisma, identity });
    const res = await svc.listPeople(COMPANY, false, null);

    expect(res.items.find((p) => p.id === '100')?.cardNos).toEqual(['5550001']);
    expect(res.items.find((p) => p.id === '200')?.cardNos).toBeUndefined();
  });

  it('userType sigue viajando con el mismo nombre y orgName queda libre', async () => {
    const { prisma, identity } = scenario();
    const svc = buildService({ prisma, identity });
    const res = await svc.listPeople(COMPANY, false, null);

    const ana = res.items.find((p) => p.id === '100');
    expect(ana?.userType).toBe('normal');
    expect(ana?.orgName).toBeUndefined();
  });
});

describe('getPersonFace: caché de fallos', () => {
  function faceScenario(faceUrl: string | null) {
    const { prisma, identity } = scenario();
    const getBinary = jest.fn(async () => {
      throw new Error('404 Not Found');
    });
    const person = {
      id: 3,
      companyId: COMPANY,
      siteId: 1,
      personId: '300',
      personName: 'Caro',
      personCode: '300',
      orgIndexCode: null,
      orgName: null,
      userType: 'normal',
      sourceIp: '192.168.9.163',
      faceUrl,
      raw: {},
    };
    prisma.integraPerson.findFirst = jest.fn(async () => person);
    const sites = {
      resolveClient: jest.fn(async () => ({
        provider: 'ISAPI',
        client: null,
        hct: null,
        isapi: null,
        isapiForHost: () => ({ getBinary }) as unknown as HikvisionIsapiClient,
        siteId: 1,
        companyId: COMPANY,
      })),
    };
    return { svc: buildService({ prisma, identity, sites }), getBinary, prisma };
  }

  it('no repregunta al terminal por una faceURL que ya dio 404', async () => {
    const { svc, getBinary } = faceScenario('http://192.168.9.163/pic?id=300');

    await expect(svc.getPersonFace(COMPANY, '300', 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(getBinary).toHaveBeenCalledTimes(1);

    // Las 20 vueltas siguientes del listado: cero viajes nuevos al equipo.
    for (let i = 0; i < 20; i++) {
      await expect(svc.getPersonFace(COMPANY, '300', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
    expect(getBinary).toHaveBeenCalledTimes(1);
  });

  it('el motivo cacheado es el mismo que el del primer fallo', async () => {
    const { svc } = faceScenario('http://192.168.9.163/pic?id=300');
    const first = await svc.getPersonFace(COMPANY, '300', 1).catch((e: Error) => e.message);
    const second = await svc.getPersonFace(COMPANY, '300', 1).catch((e: Error) => e.message);
    expect(second).toBe(first);
  });

  it('sin faceURL tampoco vuelve a consultar el espejo en cada llamada', async () => {
    const { svc, prisma } = faceScenario(null);

    await expect(svc.getPersonFace(COMPANY, '300', 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.getPersonFace(COMPANY, '300', 1)).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.integraPerson.findFirst).toHaveBeenCalledTimes(1);
  });

  it('personas distintas no comparten entrada', async () => {
    const { svc, getBinary } = faceScenario('http://192.168.9.163/pic?id=300');
    await expect(svc.getPersonFace(COMPANY, '300', 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.getPersonFace(COMPANY, '301', 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(getBinary).toHaveBeenCalledTimes(2);
  });
});
