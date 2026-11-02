import { VehiclesService } from './vehicles.service';

/** «Mis vehículos»: la asignación viva dice a qué trabajo se carga el viaje. */
function build(controles: any[], assets: any[] = []) {
  const prisma: any = {
    vehicleControl: { findMany: jest.fn().mockResolvedValue(controles) },
    vehicleAsset: { findMany: jest.fn().mockResolvedValue(assets) },
  };
  const service = new VehiclesService(prisma as any, { notifyVehicleRequested: jest.fn() } as any);
  jest.spyOn(service as any, 'incluirParaFlotilla').mockReturnValue({});
  jest.spyOn(service as any, 'filaFlotilla').mockImplementation((a: any) => ({ id: a.id, disponible: false }));
  return { service, prisma };
}

const control = (over: Record<string, unknown> = {}) => ({
  id: 61,
  estatusAprobacion: 'Aprobado',
  entregaEstatus: 'Pendiente',
  fotosSalida: { tablero: '/uploads/vehicles/t.jpg' },
  fotosDevolucion: null,
  odometroInicio: 12324,
  combustibleInicioPct: 75,
  vehiculo: { id: 11, nombre: 'Nissan Frontier', placas: 'TXA-12-34' },
  actividad: { id: 7, anNumber: 'AN-2026-0107', titulo: 'Instalación de cámaras', project: { title: 'CCTV Bodega Norte' } },
  ...over,
});

describe('misVehiculos · actividad del viaje en curso', () => {
  it('manda el título de la actividad y el nombre del proyecto', async () => {
    const { service } = build([control()]);
    const { activa } = await service.misVehiculos(5, 1);
    expect(activa).toMatchObject({
      id: 61,
      origen: 'solicitud',
      odometroInicio: 12324,
      requiereDevolucion: true,
      actividad: { id: 7, folio: 'AN-2026-0107', titulo: 'Instalación de cámaras', proyecto: 'CCTV Bodega Norte' },
    });
  });

  it('pide a la base solo esos campos de la actividad', async () => {
    const { service, prisma } = build([control()]);
    await service.misVehiculos(5, 1);
    expect(prisma.vehicleControl.findMany.mock.calls[0][0].include.actividad).toEqual({
      select: { id: true, anNumber: true, titulo: true, project: { select: { title: true } } },
    });
  });

  it('una actividad sin proyecto no inventa uno', async () => {
    const { service } = build([control({ actividad: { id: 8, anNumber: 'AN-1', titulo: 'Compra de material', project: null } })]);
    const { activa } = await service.misVehiculos(5, 1);
    expect((activa as any).actividad).toEqual({ id: 8, folio: 'AN-1', titulo: 'Compra de material', proyecto: null });
  });

  it('la salida directa de inventario no trae actividad', async () => {
    const asset = { id: 3, nombre: 'Camioneta 1', placas: null, assignedToId: 5, estatus: 'Asignado', assignedAt: null, salidaFotos: null };
    const { service } = build([], [asset]);
    const { activa } = await service.misVehiculos(5, 1);
    expect(activa).toMatchObject({ origen: 'inventario', actividad: null });
  });
});
