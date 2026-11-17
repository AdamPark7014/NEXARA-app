import { umbralesCostos, type ResumenAvisosCostos } from './proyecto-costos-avisos.js';
import { ProyectoCostosAvisosService } from './proyecto-costos-avisos.service.js';

const base = (cambios: Partial<ResumenAvisosCostos> = {}): ResumenAvisosCostos => ({
  avance: 50, rubros: [{ rubro: 'MATERIAL', etiqueta: 'Material', cotizado: 100, real: 91 }],
  directo: { cotizado: 100, real: 91 }, indirecto: { cotizado: null, real: null }, ...cambios,
});

describe('umbrales de costos', () => {
  it('avisa al superar 90 % antes de 70 % de avance', () => {
    expect(umbralesCostos(base())).toEqual([expect.objectContaining({ clave: 'rubro:MATERIAL:90', sobrecosto: false })]);
  });
  it.each([70, 100, null, NaN])('no proyecta alerta de rubro con avance %s', avance => {
    expect(umbralesCostos(base({ avance }))).toEqual([]);
  });
  it('90 % exacto no cruza el umbral', () => {
    expect(umbralesCostos(base({ rubros: [{ rubro: 'MATERIAL', etiqueta: 'Material', cotizado: 100, real: 90 }] }))).toEqual([]);
  });
  it('compara centavos sin falso aviso por redondeo binario al 90 %', () => {
    const rubro = { rubro: 'MATERIAL', etiqueta: 'Material', cotizado: 100.1, real: 90.09 };
    expect(umbralesCostos(base({ rubros: [rubro] }))).toEqual([]);
    expect(umbralesCostos(base({ rubros: [{ ...rubro, real: 90.1 }] }))).toHaveLength(1);
  });
  it('considera indirectos y sobrecosto aun sin avance', () => {
    expect(umbralesCostos(base({ avance: null, directo: { cotizado: 100, real: 110 }, indirecto: { cotizado: 20, real: 15 } })))
      .toEqual([expect.objectContaining({ clave: 'total:100', sobrecosto: true })]);
  });
  it('no inventa presupuesto si no existe cotización', () => {
    expect(umbralesCostos(base({ rubros: [], directo: { cotizado: null, real: 100 } }))).toEqual([]);
  });
  it('no inventa sobrecosto por sumar centavos en distinto orden', () => {
    expect(umbralesCostos(base({ rubros: [], directo: { cotizado: 0.3, real: 0.1 }, indirecto: { cotizado: 0, real: 0.2 } }))).toEqual([]);
  });
  it('costo cotizado cero sí admite sobrecosto', () => {
    expect(umbralesCostos(base({ rubros: [], directo: { cotizado: 0, real: 1 } }))).toHaveLength(1);
  });
});

describe('avisos agrupados del maestro', () => {
  function fixture() {
    const guardados: any[] = [];
    const prisma = {
      operationalProject: { findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id.gt ? [] : [
        { id: 10, title: 'Obra A', companyId: 1, responsableId: 2, createdById: 3, vendorId: 4 },
        { id: 11, title: 'Obra B', companyId: 1, responsableId: 2, createdById: 2, vendorId: 4 },
      ])) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 5 }]), findFirst: jest.fn().mockResolvedValue({ id: 2 }) },
      notification: { findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(guardados.find(n =>
        n.companyId === where.companyId && n.userId === where.userId &&
        (!where.title || n.title === where.title) && (!where.message || n.message.includes(where.message.contains)) &&
        (!where.createdAt || (n.createdAt >= where.createdAt.gte && n.createdAt < where.createdAt.lt)),
      ) ?? null)) },
    };
    const costos = { contextoLectura: jest.fn().mockResolvedValue({ companyId: 1 }), proyecto: jest.fn().mockResolvedValue(base({ directo: { cotizado: 100, real: 101 } })) };
    const ahora = new Date('2026-11-17T16:00:00Z');
    const notifications = { createNotification: jest.fn().mockImplementation(async data => {
      const fila = { ...data, id: guardados.length + 1, createdAt: ahora };
      guardados.push(fila); return fila;
    }) };
    return { prisma, costos, notifications, ahora, guardados,
      service: new ProyectoCostosAvisosService(prisma as any, costos as any, notifications as any) };
  }
  it('agrupa dos proyectos por persona/día, incluye creador y supervisor sin duplicar responsable', async () => {
    const f = fixture();
    expect(await f.service.ejecutar(f.ahora)).toBe(3);
    const mensajes = f.notifications.createNotification.mock.calls.map(c => c[0]);
    expect(mensajes.map(m => m.userId).sort()).toEqual([2, 3, 5]);
    expect(mensajes.find(m => m.userId === 2).message).toContain('Obra B');
    expect(mensajes.find(m => m.userId === 3).message).not.toContain('consumido más');
    expect(f.costos.proyecto).toHaveBeenCalledWith(1, 10, { isSuperAdmin: true }, { companyId: 1 });
    expect(f.costos.contextoLectura).toHaveBeenCalledTimes(1);
    expect(f.prisma.user.findMany.mock.calls[0][0].where.companyMemberships).toEqual({ some: { companyId: 1 } });
    expect(await f.service.ejecutar(f.ahora)).toBe(0);
  });
  it('rubro avisa una sola vez; sobrecosto vuelve al día siguiente', async () => {
    const f = fixture();
    await f.service.ejecutar(f.ahora);
    expect(await f.service.ejecutar(new Date('2026-11-18T16:00:00Z'))).toBe(3);
    const siguientes = f.notifications.createNotification.mock.calls.slice(3).map(c => c[0]);
    expect(siguientes.every(m => !m.message.includes('consumido más'))).toBe(true);
    expect(siguientes.every(m => m.message.includes('Sobrecosto total'))).toBe(true);
  });
  it('no manda importes a un usuario inactivo o sin membresía en la empresa', async () => {
    const f = fixture(); f.prisma.user.findFirst.mockResolvedValue(null);
    expect(await f.service.ejecutar(f.ahora)).toBe(0);
    expect(f.notifications.createNotification).not.toHaveBeenCalled();
    expect(f.prisma.user.findFirst.mock.calls[0][0].where.companyMemberships).toEqual({ some: { companyId: 1 } });
  });
});
