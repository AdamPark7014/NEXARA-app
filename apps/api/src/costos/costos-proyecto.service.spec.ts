jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./costos-tarifas.service', () => ({ CostosTarifasService: class {} }));
import { CostosProyectoService } from './costos-proyecto.service';

describe('CostosProyectoService: lectura del maestro', () => {
  function preparar() {
    const proyecto = {
      id: 7, title: 'Instalación de cámaras en oficina', clientId: 2, client: { name: 'IPADE' },
      projectType: 'INSTALACION', description: 'Cámaras', responsableId: 8, vendorId: 9,
      startDate: new Date('2026-10-01'), endDate: new Date('2026-12-01'), status: 'ACTIVE',
      activities: [{ estatus: 'Finalizada' }, { estatus: 'Pendiente' }], milestones: [],
      budgetAmount: 2000, cotizacionId: 3,
      cotizacion: { quoteNumber: 'C-3', subtotal: 2000, discountTotal: 0, marginPercent: 0,
        items: [{ grupo: 'EQUIPO', name: 'Cámara', qty: 2, unitCost: 500, unitPrice: 1000 }] },
    };
    const prisma: any = {
      operationalProject: { findFirst: jest.fn().mockResolvedValue(proyecto), findMany: jest.fn().mockResolvedValue([proyecto]) },
      costoActividadLiga: { findMany: jest.fn().mockResolvedValue([]) },
      activity: { findMany: jest.fn().mockResolvedValue([{ id: 11, projectId: 7, cotizacionId: 3 }]) },
      costoMovimiento: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      stockMovement: { findMany: jest.fn().mockResolvedValue([
        { id: 21, projectId: 7, activityId: null, type: 'DISPATCH', quantity: 2, unitCost: 200, totalCost: 400, createdAt: new Date('2026-11-01'), notes: 'Entrega' },
        { id: 22, projectId: 7, activityId: null, type: 'RETURN', quantity: 1, unitCost: 200, totalCost: 200, createdAt: new Date('2026-11-02'), notes: 'Devolución' },
      ]) },
    };
    const tarifas: any = { parametros: jest.fn().mockResolvedValue({ indirectoPct: 0.1, psValidado: true }) };
    return { servicio: new CostosProyectoService(prisma, tarifas), prisma, proyecto };
  }

  it('incluye salidas directas y devoluciones a su costo; proyecta con avance calculado', async () => {
    const { servicio, prisma } = preparar();
    const r = await servicio.proyecto(1, 7, { roleKey: 'ceo' });
    expect(r.directo.real).toBe(200);
    expect(r.costoReal).toBe(220);
    expect(r.avance).toBe(50);
    expect(r.costoAlTerminar).toBe(440);
    expect(r.rubros[0]).toMatchObject({ real: 200, cotizado: 1000, diferencia: -800, consumidoPct: 20 });
    expect(r.rubros[0].movimientos).toHaveLength(2);
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 1 }) }));
    expect(prisma.costoMovimiento.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ rubro: { not: 'MATERIAL' } }) }));
  });

  it('ficha incompleta suprime la proyección, conserva los costos reales', async () => {
    const { servicio, proyecto } = preparar();
    proyecto.responsableId = null as any;
    const r = await servicio.proyecto(1, 7, { roleKey: 'ceo' });
    expect(r.costoReal).toBe(220);
    expect(r.costoAlTerminar).toBeNull();
    expect(r.avance).toBeNull();
  });

  it('la decisión manual carga una sola vez al proyecto B aunque la actividad pertenezca a A', async () => {
    const { servicio, prisma, proyecto } = preparar();
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.costoActividadLiga.findMany.mockResolvedValue([{ activityId: 11, tipo: 'PROYECTO', proyectoId: 9, cotizacionId: null }]);
    prisma.costoMovimiento.findMany.mockResolvedValue([{ origen: 'GASTO:1', activityId: 11, rubro: 'VIATICO_GASTO', importe: 150, cantidad: 1, unidad: 'gasto', userId: null, nota: null, fecha: new Date(), detalle: null }]);
    const contexto = await servicio.contextoLectura(1);
    const a = await servicio.proyecto(1, 7, { roleKey: 'ceo' }, contexto);
    prisma.operationalProject.findFirst.mockResolvedValue({ ...proyecto, id: 9 });
    const b = await servicio.proyecto(1, 9, { roleKey: 'ceo' }, contexto);
    expect(a.directo.real).toBe(0);
    expect(b.directo.real).toBe(150);
  });

  it('la decisión interna excluye el proyecto operativo; sugerencia sin aceptar conserva el vínculo operativo', async () => {
    const { servicio, prisma } = preparar();
    prisma.costoActividadLiga.findMany.mockResolvedValue([{ activityId: 11, tipo: 'INTERNA', proyectoId: null, cotizacionId: null }]);
    const interna = await servicio.contextoLectura(1);
    expect(interna.mapa.deProyecto.has(7)).toBe(false);
    expect(interna.mapa.internas.has(11)).toBe(true);
    prisma.costoActividadLiga.findMany.mockResolvedValue([{ activityId: 11, tipo: null, proyectoId: 9, cotizacionId: null }]);
    const sugerencia = await servicio.contextoLectura(1);
    expect(sugerencia.mapa.deProyecto.get(7)?.has(11)).toBe(true);
    expect(sugerencia.mapa.deProyecto.has(9)).toBe(false);
  });

  it('deniega a quien no participa ni coordina', async () => {
    const { servicio } = preparar();
    await expect(servicio.proyecto(1, 7, { id: 99, roleKey: 'tecnico' })).rejects.toThrow('no están disponibles');
  });

  it('listado incluye margen comparable y material sin ligar visible', async () => {
    const { servicio, prisma } = preparar();
    prisma.stockMovement.findMany.mockResolvedValue([
      { id: 1, projectId: 7, activityId: null, type: 'DISPATCH', quantity: 1, unitCost: 2500, totalCost: 2500, createdAt: new Date(), notes: null },
      { id: 2, projectId: null, activityId: null, type: 'DISPATCH', quantity: 1, unitCost: 50, totalCost: 50, createdAt: new Date(), notes: null },
    ]);
    const r = await servicio.lista(1, { roleKey: 'ceo' });
    expect(r.proyectos[0]).toMatchObject({ costo: 2750, sobrecosto: true, semaforoMargen: 'rojo' });
    expect(r.conSobrecosto).toBe(1);
    expect(r.sinLigar).toMatchObject({ etiqueta: 'Sin ligar', importe: 50 });
  });

  it('reutiliza lectura por empresa sin recalcular material por cada proyecto y rechaza contexto ajeno', async () => {
    const { servicio, prisma } = preparar();
    const contexto = await servicio.contextoLectura(1);
    const a = await servicio.proyecto(1, 7, { roleKey: 'ceo' }, contexto);
    const b = await servicio.proyecto(1, 7, { roleKey: 'ceo' }, contexto);
    expect(a.costoReal).toBe(b.costoReal);
    expect(prisma.stockMovement.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.costoMovimiento.findMany).toHaveBeenCalledTimes(1);
    await expect(servicio.proyecto(2, 7, { roleKey: 'ceo' }, contexto)).rejects.toThrow('otra empresa');
  });

  it('reutiliza lectura por empresa sin recalcular material por cada proyecto y rechaza contexto ajeno', async () => {
    const { servicio, prisma } = preparar();
    const contexto = await servicio.contextoLectura(1);
    const a = await servicio.proyecto(1, 7, { roleKey: 'ceo' }, contexto);
    const b = await servicio.proyecto(1, 7, { roleKey: 'ceo' }, contexto);
    expect(a.costoReal).toBe(b.costoReal);
    expect(prisma.stockMovement.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.costoMovimiento.findMany).toHaveBeenCalledTimes(1);
    await expect(servicio.proyecto(2, 7, { roleKey: 'ceo' }, contexto)).rejects.toThrow('otra empresa');
  });

  it('resumen para responsables se limita a proyectos propios y oculta datos globales', async () => {
    const { servicio, prisma } = preparar();
    const r = await servicio.lista(1, { id: 8, roleKey: 'ing_campo' }, true);
    expect(prisma.operationalProject.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      companyId: 1, deletedAt: null, OR: [{ responsableId: 8 }, { vendorId: 8 }],
    }) }));
    expect(r.sinLigar).toMatchObject({ importe: 0, movimientos: [] });
    expect(r.cotizacionesSinProyecto).toEqual([]);
    expect(r.manoDeObra.importe).toBe(0);
    await expect(servicio.lista(1, { id: 8, roleKey: 'ing_campo' })).rejects.toThrow('Solo dirección');
  });
});
