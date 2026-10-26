import { AttendanceService } from './attendance.service.js';

/**
 * Entrada sin ubicación + primer punto del GPS de jornada (Adam, 23-10-2026).
 *
 * Iván checó a las 07:58 con la ubicación apagada; a las 08:01 el GPS de jornada ya mandaba puntos.
 * La entrada debe tomar ese punto, marcado como tomado después, y no quedarse «Sin ubicación».
 */

const at = (hhmm: string) => new Date(`2026-10-23T${hhmm}:00-06:00`);

function build(entrada: Record<string, unknown> | null) {
  const prisma: any = {
    attendance: {
      findFirst: jest.fn().mockResolvedValue(entrada),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // Sin actividades del día: el único sitio es la oficina.
    activity: { findMany: jest.fn().mockResolvedValue([]) },
    serviceClientBranch: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new AttendanceService(prisma, {} as any, {} as any), prisma };
}

const entradaSinUbicacion = {
  id: 77,
  timestamp: at('07:58'),
  validacion: 'REVISAR',
  motivoValidacion: 'Sin ubicación: ubicación del teléfono apagada',
  accuracyM: null,
};

describe('asignarUbicacionPosterior', () => {
  it('la entrada sin ubicación toma el primer punto, marcado como posterior', async () => {
    const { service, prisma } = build(entradaSinUbicacion);
    const ok = await service.asignarUbicacionPosterior({
      userId: 10,
      companyId: 1,
      latitude: 19.07402,
      longitude: -98.27774,
      at: at('08:01'),
    });
    expect(ok).toBe(true);
    const { where, data } = prisma.attendance.updateMany.mock.calls[0][0];
    // Solo si sigue vacía: dos puntos a la vez no la llenan dos veces.
    expect(where).toEqual({ id: 77, entryLatitude: null, ubicacionPosteriorAt: null });
    expect(data).toEqual(
      expect.objectContaining({
        entryLatitude: 19.07402,
        entryLongitude: -98.27774,
        ubicacionPosteriorAt: at('08:01'),
        validacion: 'REVISAR',
        motivoValidacion: 'Ubicación tomada 3 min después de checar (al checar: ubicación del teléfono apagada)',
      }),
    );
    // Se midió contra el sitio (la oficina NEXARA está a unos metros de ese punto).
    expect(data.fueraDeSitio).toBe(false);
    expect(typeof data.distanciaSitioM).toBe('number');
  });

  it('un punto de más de 30 min después ya no es la ubicación de la entrada', async () => {
    const { service, prisma } = build(entradaSinUbicacion);
    const ok = await service.asignarUbicacionPosterior({
      userId: 10,
      companyId: 1,
      latitude: 19.07402,
      longitude: -98.27774,
      at: at('08:40'),
    });
    expect(ok).toBe(false);
    expect(prisma.attendance.updateMany).not.toHaveBeenCalled();
  });

  it('sin entrada pendiente no hace nada (el caso de casi todos los puntos)', async () => {
    const { service, prisma } = build(null);
    expect(
      await service.asignarUbicacionPosterior({ userId: 10, companyId: 1, latitude: 19.07, longitude: -98.27, at: at('08:01') }),
    ).toBe(false);
    expect(prisma.attendance.updateMany).not.toHaveBeenCalled();
  });

  it('busca solo entradas de ese día, sin coordenadas y sin ubicación posterior', async () => {
    const { service, prisma } = build(null);
    await service.asignarUbicacionPosterior({ userId: 10, companyId: 1, latitude: 19.07, longitude: -98.27, at: at('08:01') });
    expect(prisma.attendance.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ userId: 10, type: 'entrada', entryLatitude: null, ubicacionPosteriorAt: null }),
    );
  });

  it('un error de base no tumba el envío del punto', async () => {
    const { service, prisma } = build(entradaSinUbicacion);
    prisma.attendance.findFirst.mockRejectedValue(new Error('base caída'));
    await expect(
      service.asignarUbicacionPosterior({ userId: 10, companyId: 1, latitude: 19.07, longitude: -98.27, at: at('08:01') }),
    ).resolves.toBe(false);
  });
});
