import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { SLOTS_CHECKLIST } from './checklist-entrega';

/**
 * El mismo check list en las CUATRO rutas que abren o cierran una asignación.
 *
 * El agujero que se cierra aquí: `vehicles/inventory/:id/checkout` y
 * `/return` aceptaban de 0 a 10 fotos sueltas, sin kilometraje ni gasolina,
 * mientras que `start-use`/`end-use` sí pedían evidencia. Quien quisiera
 * saltarse el check list solo tenía que sacar el coche por inventario.
 */

function fotos(): Record<string, string> {
  return Object.fromEntries(SLOTS_CHECKLIST.map((s) => [s, `/uploads/vehicles/${s}.jpg`]));
}

function meta() {
  return Object.fromEntries(
    SLOTS_CHECKLIST.map((s) => [s, { capturedAt: new Date().toISOString(), lat: 19.04, lng: -98.2 }]),
  );
}

function completo(extra: Record<string, unknown> = {}) {
  return { fotos: fotos(), meta: meta(), odometroKm: 45_000, combustible: '1/2', ...extra };
}

function build(over: Record<string, any> = {}) {
  const control = {
    id: 1,
    companyId: 7,
    solicitanteId: 5,
    estatusAprobacion: 'Aprobado',
    entregaEstatus: 'Pendiente',
    fotosSalida: null,
    fotosDevolucion: null,
    fotosMeta: null,
    odometroInicio: null,
    fechaInicioAprobada: null,
    ...over.control,
  };
  const asset = {
    id: 3,
    companyId: 7,
    nombre: 'Camioneta 1',
    estatus: 'Disponible',
    activo: true,
    assignedToId: null,
    assignedAt: null,
    salidaFotos: null,
    devolucionFotos: null,
    ...over.asset,
  };
  const prisma: any = {
    vehicleControl: {
      findFirst: jest.fn().mockResolvedValue(control),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...control, ...data })),
    },
    vehicleAsset: {
      findFirst: jest.fn().mockResolvedValue(asset),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...asset, ...data })),
    },
  };
  const service = new VehiclesService(prisma as any, { notifyVehicleRequested: jest.fn() } as any);
  return { service, prisma, control, asset };
}

/** Las cuatro puertas, con la firma que usa cada una. */
const RUTAS = [
  {
    nombre: 'POST vehicles/:id/start-use',
    correr: (s: VehiclesService, entrada: any) => s.startUse(1, 5, entrada, 7),
  },
  {
    nombre: 'POST vehicles/inventory/:id/checkout',
    correr: (s: VehiclesService, entrada: any) => s.checkoutAsset(3, 5, entrada, 7),
  },
  {
    nombre: 'POST vehicles/inventory/:id/return',
    correr: (s: VehiclesService, entrada: any) =>
      s.returnAsset(3, { id: 5 }, entrada, 7),
  },
] as const;

describe('ninguna ruta deja pasar una salida sin evidencia', () => {
  for (const ruta of RUTAS) {
    describe(ruta.nombre, () => {
      const enUso = {
        asset: { estatus: 'Asignado', assignedToId: 5, assignedAt: new Date(), salidaFotos: { odometroKm: 44_000 } },
      };
      const contexto = ruta.nombre.includes('return') ? enUso : {};

      it('sin fotos, 400', async () => {
        const { service } = build(contexto);
        await expect(ruta.correr(service, { fotos: {}, meta: {}, odometroKm: 45_000, combustible: 'F' })).rejects.toThrow(
          BadRequestException,
        );
      });

      it('con solo cinco fotos, 400', async () => {
        const { service } = build(contexto);
        const parcial = fotos();
        delete parcial['tablero'];
        delete parcial['interior-trasera'];
        await expect(
          ruta.correr(service, { fotos: parcial, meta: meta(), odometroKm: 45_000, combustible: 'F' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('sin kilometraje, 400', async () => {
        const { service } = build(contexto);
        await expect(ruta.correr(service, completo({ odometroKm: undefined }))).rejects.toThrow(
          BadRequestException,
        );
      });

      it('sin nivel de gasolina, 400', async () => {
        const { service } = build(contexto);
        await expect(ruta.correr(service, completo({ combustible: undefined }))).rejects.toThrow(
          BadRequestException,
        );
      });

      it('con fotos de galería (sin capturedAt), 400', async () => {
        const { service } = build(contexto);
        await expect(ruta.correr(service, completo({ meta: {} }))).rejects.toThrow(BadRequestException);
      });

      it('con el check list completo, pasa', async () => {
        const { service } = build(contexto);
        await expect(ruta.correr(service, completo())).resolves.toBeTruthy();
      });
    });
  }
});

describe('lo que queda guardado', () => {
  it('la salida de una solicitud guarda fotos, meta, tablero, km y gasolina', async () => {
    const { service, prisma } = build();
    await service.startUse(1, 5, completo(), 7);

    const data = prisma.vehicleControl.update.mock.calls[0][0].data;
    expect(data.odometroInicio).toBe(45_000);
    expect(data.combustibleInicioPct).toBe(50);
    expect(data.fotoTableroSalidaUrl).toBe('/uploads/vehicles/tablero.jpg');
    expect(data.entregaEstatus).toBe('En uso');
    expect(data.fotosMeta.salida).toHaveLength(7);
    expect(data.fotosMeta.salida[0]).toMatchObject({ slot: 'frontal', lat: 19.04, lng: -98.2 });
  });

  it('la devolución conserva la meta de la salida y añade la suya', async () => {
    const { service, prisma } = build({
      control: {
        fotosSalida: { odometroKm: 44_000 },
        odometroInicio: 44_000,
        fotosMeta: { salida: [{ slot: 'frontal', url: 'a.jpg', capturedAt: 'x', lat: null, lng: null }] },
      },
    });

    await service.endUse(1, 5, completo(), 7);

    const data = prisma.vehicleControl.update.mock.calls[0][0].data;
    expect(data.fotosMeta.salida).toHaveLength(1);
    expect(data.fotosMeta.devolucion).toHaveLength(7);
    expect(data.fotoTableroDevolucionUrl).toBe('/uploads/vehicles/tablero.jpg');
    expect(data.odometroFin).toBe(45_000);
    expect(data.entregaEstatus).toBe('Devuelto');
  });

  it('la salida por inventario guarda el mismo payload, no una lista de URLs', async () => {
    const { service, prisma } = build();
    await service.checkoutAsset(3, 5, completo(), 7);

    const data = prisma.vehicleAsset.update.mock.calls[0][0].data;
    expect(data.estatus).toBe('Asignado');
    expect(data.assignedToId).toBe(5);
    expect(data.salidaFotos.fotos).toHaveLength(7);
    expect(data.salidaFotos.odometroKm).toBe(45_000);
    expect(data.salidaFotos.combustiblePct).toBe(50);
  });
});

describe('el kilometraje no retrocede, venga por donde venga', () => {
  it('en la devolución de una solicitud', async () => {
    const { service } = build({ control: { fotosSalida: { odometroKm: 50_000 }, odometroInicio: 50_000 } });
    await expect(service.endUse(1, 5, completo({ odometroKm: 49_000 }), 7)).rejects.toThrow(/menor al inicial/);
  });

  it('y en la devolución por inventario, que antes ni lo pedía', async () => {
    const { service } = build({
      asset: { estatus: 'Asignado', assignedToId: 5, assignedAt: new Date(), salidaFotos: { odometroKm: 50_000 } },
    });
    await expect(service.returnAsset(3, { id: 5 }, completo({ odometroKm: 49_000 }), 7)).rejects.toThrow(
      /menor al inicial/,
    );
  });
});

describe('quién puede cerrar una asignación', () => {
  it('por inventario, solo el asignatario', async () => {
    const { service } = build({
      asset: { estatus: 'Asignado', assignedToId: 5, assignedAt: new Date(), salidaFotos: { odometroKm: 44_000 } },
    });
    await expect(service.returnAsset(3, { id: 99 }, completo(), 7)).rejects.toThrow(ForbiddenException);
  });

  it('o quien lleva el inventario', async () => {
    const { service } = build({
      asset: { estatus: 'Asignado', assignedToId: 5, assignedAt: new Date(), salidaFotos: { odometroKm: 44_000 } },
    });
    await expect(
      service.returnAsset(3, { id: 99, puedeInventario: true }, completo(), 7),
    ).resolves.toBeTruthy();
  });

  it('una solicitud sin aprobar no tiene salida', async () => {
    const { service } = build({ control: { estatusAprobacion: 'Pendiente' } });
    await expect(service.startUse(1, 5, completo(), 7)).rejects.toThrow(/aprobada/);
  });

  it('un vehículo ya asignado no puede volver a salir', async () => {
    const { service } = build({ asset: { estatus: 'Asignado', assignedToId: 9 } });
    await expect(service.checkoutAsset(3, 5, completo(), 7)).rejects.toThrow(/ya está asignado/);
  });
});
