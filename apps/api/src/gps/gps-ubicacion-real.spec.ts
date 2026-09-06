import { GpsService } from './gps.service.js';

/**
 * El rastreo no guarda puntos que nadie pisó, y "hoy" es hoy en México.
 *
 * Dos defectos en el mismo servicio:
 *
 * 1. `POST /gps` aceptaba `0.0, 0.0` — el valor por defecto de un teléfono sin
 *    permiso de ubicación — y lo insertaba en `LocationTracking` como una
 *    medición más. En el mapa del equipo eso pinta al técnico en el golfo de
 *    Guinea.
 * 2. `getTodayDateOnly` devolvía `workDayStart`, o sea las 06:00 UTC, y se
 *    comparaba contra `AttendanceDay.date`, que es una columna `@db.Date`.
 *    Postgres compara una fecha contra medianoche, así que la igualdad NUNCA
 *    era cierta: el mapa del equipo salía vacío y `GET /gps/me` decía que no
 *    había consentimiento aunque lo hubiera.
 *
 * Compatibilidad: el punto malo se descarta, no se rechaza la petición. La app
 * instalada no puede empezar a recibir errores por un ping que el técnico ni
 * siquiera pidió.
 */

function build() {
  const prisma: any = {
    locationTracking: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ locationConsent: true }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ locationConsent: true }),
    },
    attendanceDay: { findFirst: jest.fn().mockResolvedValue({ isOpen: true }) },
    companyProfile: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
  };
  return { service: new GpsService(prisma as any), prisma };
}

const punto = (over: Record<string, unknown> = {}) => ({
  usuarioId: 3,
  latitud: 19.0414,
  longitud: -98.2063,
  ...over,
});

describe('un ping GPS en 0,0 no se guarda', () => {
  it('se descarta sin tocar la base', async () => {
    const { service, prisma } = build();

    const res: any = await service.create(punto({ latitud: 0, longitud: 0 }) as any, 7);

    expect(prisma.locationTracking.create).not.toHaveBeenCalled();
    expect(res.skipped).toBe(true);
  });

  it('pero NO lanza excepción: la app instalada no puede romperse por esto', async () => {
    const { service } = build();

    await expect(
      service.create(punto({ latitud: 0, longitud: 0 }) as any, 7),
    ).resolves.toBeDefined();
  });

  it('un punto real sí entra', async () => {
    const { service, prisma } = build();

    await service.create(punto() as any, 7);

    expect(prisma.locationTracking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ latitud: 19.0414, longitud: -98.2063 }),
      }),
    );
  });

  it('coordenadas fuera de rango tampoco', async () => {
    const { service, prisma } = build();

    await service.create(punto({ latitud: 91, longitud: 200 }) as any, 7);

    expect(prisma.locationTracking.create).not.toHaveBeenCalled();
  });

  it('latitud 0 con longitud real es el ecuador, y es un sitio legítimo', async () => {
    const { service, prisma } = build();

    await service.create(punto({ latitud: 0, longitud: -98.2063 }) as any, 7);

    expect(prisma.locationTracking.create).toHaveBeenCalled();
  });
});

describe('"hoy" se compara contra una columna @db.Date', () => {
  afterEach(() => jest.useRealTimers());

  it('el día va a medianoche, no a las 06:00 UTC (si no, no casa nunca)', async () => {
    // 2026-09-09T01:00Z = 2026-09-08 19:00 en México.
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T01:00:00Z'));
    const { service, prisma } = build();

    await service.findMe(3);

    const fecha: Date = prisma.attendanceDay.findFirst.mock.calls[0][0].where.date;
    expect(fecha.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(fecha.getUTCHours()).toBe(0);
  });

  it('a las 19:00 de México el día sigue siendo el 8, no el 9', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T01:00:00Z'));
    const { service, prisma } = build();

    await service.findTeamLocations({ id: 3, isSuperAdmin: true }, 7);

    const filtro = prisma.user.findMany.mock.calls[0][0].where;
    const fecha: Date = filtro.attendanceDays.some.date;
    expect(fecha.toISOString().slice(0, 10)).toBe('2026-09-08');
  });
});
