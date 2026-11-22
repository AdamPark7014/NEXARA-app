import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DanosVehiculoService } from './danos-vehiculo.service';

/**
 * La IA propone; Liz decide. Confirmar abre una incidencia con responsable y costo; descartar pide
 * motivo. Cobrarle a una persona lo aprueba dirección.
 */

function build(over: { hallazgo?: any; claudeDisponible?: boolean; control?: any; previas?: any[] } = {}) {
  const hallazgo = {
    id: 11,
    estatus: 'PROPUESTO',
    zona: 'vuelta-3',
    descripcion: 'rayón de 20 cm en la puerta trasera derecha',
    vehicleAssetId: 3,
    fotoSalidaUrl: '/uploads/vehicles/s.jpg',
    fotoDevolucionUrl: '/uploads/vehicles/d.jpg',
    companyId: 7,
    control: { id: 1, solicitanteId: 5, encargadoId: 6, vehicleId: 3, companyId: 7 },
    ...over.hallazgo,
  };
  const prisma: any = {
    vehicleDamageFinding: {
      findFirst: jest.fn().mockResolvedValue(hallazgo),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...hallazgo, ...data })),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue(over.previas ?? []),
    },
    vehicleIncident: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 50, ...data })),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue({ id: 50, companyId: 7, cobroEstatus: 'PENDIENTE', quienPaga: 'RESPONSABLE' }),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 50, ...data })),
    },
    vehicleControl: {
      findUnique: jest.fn().mockResolvedValue({
        id: 1,
        companyId: 7,
        vehicleId: 3,
        capturaVersion: 2,
        fotosSalida: { fotos: [{ slot: 'vuelta-1', url: '/uploads/vehicles/a.jpg' }] },
        fotosDevolucion: { fotos: [{ slot: 'vuelta-1', url: '/uploads/vehicles/b.jpg' }] },
        nombreVehiculo: 'Hilux 2',
        vehiculo: { nombre: 'Hilux 2', placas: null },
        ...over.control,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 6 }), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const claude = { disponible: jest.fn().mockReturnValue(over.claudeDisponible ?? true), json: jest.fn() };
  const notifications = { createNotification: jest.fn().mockResolvedValue({}) };
  const service = new DanosVehiculoService(prisma, claude as any, notifications as any);
  return { service, prisma, claude, notifications };
}

describe('revisar un daño propuesto', () => {
  it('confirmar abre una incidencia de daño a nombre del encargado, con las dos fotos', async () => {
    const { service, prisma } = build();
    const inc = await service.revisarHallazgo(11, { id: 8 }, { accion: 'confirmar', costoEstimado: '$1,200' }, 7);
    expect(prisma.vehicleDamageFinding.update.mock.calls[0][0].data).toMatchObject({ estatus: 'CONFIRMADO', revisadoPorId: 8 });
    expect(inc).toMatchObject({
      tipo: 'DANO',
      controlId: 1,
      hallazgoId: 11,
      vehicleAssetId: 3,
      responsableId: 6,
      costoEstimado: 1200,
      quienPaga: 'EMPRESA',
      cobroEstatus: null,
      fotos: ['/uploads/vehicles/s.jpg', '/uploads/vehicles/d.jpg'],
    });
    expect(inc.descripcion).toMatch(/^Lado derecho: rayón/);
  });

  it('si paga el responsable, el cobro queda pendiente de dirección', async () => {
    const { service } = build();
    const inc = await service.revisarHallazgo(11, { id: 8 }, { accion: 'confirmar', quienPaga: 'RESPONSABLE' }, 7);
    expect(inc).toMatchObject({ quienPaga: 'RESPONSABLE', cobroEstatus: 'PENDIENTE' });
  });

  it('descartar pide un motivo de la lista y lo guarda', async () => {
    const { service, prisma } = build();
    await expect(service.revisarHallazgo(11, { id: 8 }, { accion: 'descartar' }, 7)).rejects.toBeInstanceOf(BadRequestException);
    await service.revisarHallazgo(11, { id: 8 }, { accion: 'descartar', motivo: 'REFLEJO_O_SUCIEDAD', nota: 'es lodo' }, 7);
    expect(prisma.vehicleDamageFinding.update.mock.calls[0][0].data).toMatchObject({
      estatus: 'DESCARTADO',
      motivoDescarte: 'REFLEJO_O_SUCIEDAD',
      notaRevision: 'es lodo',
    });
    expect(prisma.vehicleIncident.create).not.toHaveBeenCalled();
  });

  it('un daño ya revisado no se vuelve a revisar', async () => {
    const { service } = build({ hallazgo: { estatus: 'CONFIRMADO' } });
    await expect(service.revisarHallazgo(11, { id: 8 }, { accion: 'confirmar' }, 7)).rejects.toThrow(/ya se revisó/);
  });
});

describe('cobro al responsable', () => {
  it('solo dirección (superadmin) lo aprueba o lo rechaza', async () => {
    const { service } = build();
    await expect(service.revisarCobro(50, { id: 8, roleKey: 'coord_admin' }, 'APROBADO', 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechazarlo deja el pago a la empresa', async () => {
    const { service, prisma } = build();
    await service.revisarCobro(50, { id: 1, isSuperAdmin: true }, 'RECHAZADO', 7);
    expect(prisma.vehicleIncident.update.mock.calls[0][0].data).toMatchObject({ cobroEstatus: 'RECHAZADO', quienPaga: 'EMPRESA' });
  });
});

describe('comparación con IA', () => {
  it('sin IA configurada queda SIN_IA y no inventa nada', async () => {
    const { service, prisma, claude } = build({ claudeDisponible: false });
    expect(await service.analizar(1)).toEqual({ estatus: 'SIN_IA', hallazgos: 0 });
    expect(claude.json).not.toHaveBeenCalled();
    expect(prisma.vehicleControl.update.mock.calls[0][0].data.analisisDanosEstatus).toBe('SIN_IA');
  });

  it('sin vistas en común no gasta una llamada', async () => {
    const { service, claude } = build({ control: { fotosDevolucion: { fotos: [{ slot: 'km-gasolina', url: '/uploads/vehicles/k.jpg' }] } } });
    expect(await service.analizar(1)).toEqual({ estatus: 'LISTO', hallazgos: 0 });
    expect(claude.json).not.toHaveBeenCalled();
  });

  it('cada llamada lleva lo aprendido de las revisiones de Liz para esta unidad', async () => {
    const { service, prisma, claude } = build({
      previas: [
        {
          zona: 'vuelta-1',
          descripcion: 'faro izquierdo estrellado',
          estatus: 'DESCARTADO',
          motivoDescarte: 'YA_ESTABA',
          notaRevision: null,
          vehicleAssetId: 3,
          incidencia: null,
        },
      ],
    });
    (service as any).fotoParaIa = jest.fn().mockResolvedValue({ mediaType: 'image/jpeg', data: 'x' });
    claude.json.mockResolvedValue({ datos: { hallazgos: [] } });
    expect(await service.analizar(1)).toEqual({ estatus: 'LISTO', hallazgos: 0 });
    const consulta = prisma.vehicleDamageFinding.findMany.mock.calls[0][0];
    expect(consulta.where).toMatchObject({ companyId: 7, controlId: { not: 1 } });
    expect(claude.json.mock.calls[0][0].usuario).toMatch(/^Daños que esta unidad ya tenía[\s\S]*Frente: faro izquierdo estrellado[\s\S]*Par 1: Frente/);
  });

  it('si no se pueden leer las revisiones, compara igual sin contexto', async () => {
    const { service, prisma, claude } = build();
    prisma.vehicleDamageFinding.findMany.mockRejectedValue(new Error('db'));
    (service as any).fotoParaIa = jest.fn().mockResolvedValue({ mediaType: 'image/jpeg', data: 'x' });
    claude.json.mockResolvedValue({ datos: { hallazgos: [] } });
    await service.analizar(1);
    expect(claude.json.mock.calls[0][0].usuario).toMatch(/^Par 1: Frente/);
  });

  it('solo lee fotos de la carpeta de vehículos', () => {
    const { service } = build();
    expect(service.rutaDeFoto('/uploads/vehicles/abc-1.jpg')).toMatch(/abc-1\.jpg$/);
    expect(service.rutaDeFoto('/uploads/vehicles/../../etc/passwd')).toBeNull();
    expect(service.rutaDeFoto('/uploads/otra/a.jpg')).toBeNull();
    expect(service.rutaDeFoto('/uploads/vehicles/.env')).toBeNull();
  });
});
