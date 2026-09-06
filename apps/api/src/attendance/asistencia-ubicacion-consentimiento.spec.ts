import { AttendanceService } from './attendance.service.js';

/**
 * Ni coordenadas inventadas ni consentimientos que nadie dio.
 *
 * Tres defectos distintos con la misma raíz — la base afirmando cosas que no
 * pasaron — y de estas tablas sale la nómina:
 *
 * 1. Al negar el permiso de ubicación, la app publicaba `0.0, 0.0`. El guard
 *    del servidor usaba `Number.isFinite`, que acepta el cero, así que el punto
 *    se guardaba como si fuera una medición: el golfo de Guinea, a 9.000 km de
 *    Puebla, en la misma columna que las lecturas buenas.
 * 2. `locationConsent = true` se escribía por el mero hecho de que la petición
 *    trajera coordenadas. Fichar no es consentir el rastreo.
 * 3. OkHttp no fija `User-Agent`, así que los fichajes del teléfono quedaban
 *    registrados como «Escritorio · PC» y no había forma de auditarlos.
 *
 * Compatibilidad: NADA de esto rechaza la petición. La versión de la app que la
 * gente ya tiene instalada sigue mandando el cero, y un 400 dejaría a media
 * plantilla sin poder fichar. Se acepta el registro y se guarda la ubicación
 * como ausente, que es lo que de verdad hubo.
 */

const FOTO = 'data:image/jpeg;base64,AAAA';

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    attendance: {
      create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
      findFirst: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
    },
    attendanceDay: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 1, isOpen: true }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { update: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn().mockResolvedValue({}) },
    locationTracking: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
    ...over,
  };

  const service = new AttendanceService(
    prisma as any,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    { notifyAttendanceChange: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return { service, prisma };
}

const entrada = (extra: Record<string, unknown> = {}) => ({
  type: 'entrada' as const,
  photoBase64: FOTO,
  ...extra,
});

/** Lo que quedó escrito en la fila de asistencia. */
const filaCreada = (prisma: any) => prisma.attendance.create.mock.calls[0][0].data;

describe('coordenadas 0,0: no son un sitio, son la ausencia de GPS', () => {
  it('no se guardan como si fueran una medición', async () => {
    const { service, prisma } = build();

    await service.register(entrada({ latitude: 0, longitude: 0 }) as any, 3, undefined, 7);

    const fila = filaCreada(prisma);
    expect(fila.entryLatitude).toBeNull();
    expect(fila.entryLongitude).toBeNull();
  });

  it('pero el fichaje SÍ se registra: la app instalada no puede quedarse fuera', async () => {
    const { service, prisma } = build();

    await expect(
      service.register(entrada({ latitude: 0, longitude: 0 }) as any, 3, undefined, 7),
    ).resolves.toMatchObject({ message: expect.stringContaining('Entrada') });
    expect(prisma.attendance.create).toHaveBeenCalled();
  });

  it('tampoco generan un punto en el mapa de rastreo', async () => {
    const { service, prisma } = build();

    await service.register(entrada({ latitude: 0, longitude: 0 }) as any, 3, undefined, 7);

    expect(prisma.locationTracking.create).not.toHaveBeenCalled();
  });

  it('una ubicación real sí se guarda entera', async () => {
    const { service, prisma } = build();
    // Puebla.
    await service.register(
      entrada({ latitude: 19.0414, longitude: -98.2063 }) as any,
      3,
      undefined,
      7,
    );

    const fila = filaCreada(prisma);
    expect(fila.entryLatitude).toBe(19.0414);
    expect(fila.entryLongitude).toBe(-98.2063);
    expect(prisma.locationTracking.create).toHaveBeenCalled();
  });

  it('el cero de una sola de las dos coordenadas no descarta el punto', async () => {
    // Latitud 0 con longitud real es el ecuador, un sitio legítimo. Sólo el par
    // (0,0) exacto es el valor por defecto de un teléfono sin permiso.
    const { service, prisma } = build();

    await service.register(entrada({ latitude: 0, longitude: -98.2 }) as any, 3, undefined, 7);

    expect(filaCreada(prisma).entryLongitude).toBe(-98.2);
  });

  it('NaN y coordenadas fuera de rango tampoco pasan', async () => {
    const { service, prisma } = build();

    await service.register(entrada({ latitude: 999, longitude: 12 }) as any, 3, undefined, 7);

    expect(filaCreada(prisma).entryLatitude).toBeNull();
  });

  it('la salida aplica el mismo criterio que la entrada', async () => {
    const { service, prisma } = build({
      attendanceDay: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          isOpen: true,
          lastEntryAt: new Date(Date.now() - 3600_000),
        }),
        upsert: jest.fn().mockResolvedValue({ id: 1, isOpen: true }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
    });

    await service.register(
      { type: 'salida', photoBase64: FOTO, latitude: 0, longitude: 0 } as any,
      3,
      undefined,
      7,
    );

    const fila = filaCreada(prisma);
    expect(fila.exitLatitude).toBeNull();
    expect(fila.exitLongitude).toBeNull();
  });
});

describe('el consentimiento de ubicación sólo lo otorga el usuario', () => {
  it('fichar con GPS NO enciende locationConsent', async () => {
    const { service, prisma } = build();

    await service.register(
      entrada({ latitude: 19.0414, longitude: -98.2063 }) as any,
      3,
      undefined,
      7,
    );

    const consentimientos = prisma.user.update.mock.calls.filter(
      (c: any[]) => c[0]?.data?.locationConsent === true,
    );
    expect(consentimientos).toHaveLength(0);
  });

  it('fichar sin GPS tampoco lo enciende', async () => {
    const { service, prisma } = build();

    await service.register(entrada({ latitude: 0, longitude: 0 }) as any, 3, undefined, 7);

    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { locationConsent: true } }),
    );
  });

  it('pero el punto de la entrada sí se guarda: para eso pidió el permiso', async () => {
    const { service, prisma } = build();

    await service.register(
      entrada({ latitude: 19.0414, longitude: -98.2063 }) as any,
      3,
      undefined,
      7,
    );

    expect(prisma.locationTracking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ latitud: 19.0414, longitud: -98.2063 }),
      }),
    );
  });

  it('al cerrar la jornada sí se revoca: apagar no es fabricar', async () => {
    const { service, prisma } = build({
      attendanceDay: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          isOpen: true,
          lastEntryAt: new Date(Date.now() - 3600_000),
        }),
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
    });

    await service.register({ type: 'salida', photoBase64: FOTO } as any, 3, undefined, 7);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { locationConsent: false } }),
    );
  });
});

describe('el fichaje dice de qué aparato salió', () => {
  /** El User-Agent que fija `ApiClient.kt` en la app nativa. */
  const UA_APP = 'NexaraApp/1.4.0 (Android 14; samsung SM-A536B) OkHttp';

  const req = (userAgent: string, headers: Record<string, string> = {}) => ({
    headers: { 'user-agent': userAgent, ...headers },
  });

  it('el User-Agent de la app se registra como móvil Android, no como PC', async () => {
    const { service, prisma } = build();

    await service.register(entrada() as any, 3, req(UA_APP), 7);

    const info = filaCreada(prisma).deviceInfo;
    expect(info).toMatch(/Móvil/);
    expect(info).toMatch(/Android/);
    expect(info).not.toMatch(/Escritorio/);
    expect(info).not.toMatch(/\bPC\b/);
  });

  it('con la cabecera X-Device-Browser se distingue la app del navegador', async () => {
    // La app manda `X-Device-Browser: NEXARA App`, que es lo que separa un
    // fichaje hecho desde la app de uno hecho con Chrome en el mismo teléfono.
    const { service, prisma } = build();

    await service.register(
      entrada() as any,
      3,
      req(UA_APP, { 'x-device-browser': 'NEXARA App' }),
      7,
    );

    expect(filaCreada(prisma).deviceInfo).toMatch(/NEXARA App/);
  });

  it('sin User-Agent seguía saliendo «Escritorio» — el defecto que había', async () => {
    const { service, prisma } = build();

    await service.register(entrada() as any, 3, { headers: {} }, 7);

    expect(filaCreada(prisma).deviceInfo).toMatch(/Escritorio/);
  });
});
