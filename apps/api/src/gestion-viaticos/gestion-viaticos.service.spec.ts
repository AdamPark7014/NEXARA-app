import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GestionViaticosService } from './gestion-viaticos.service.js';
import { movimientosDeViatico } from '../costos/calculos/libro-costos.js';

function armar(overrides: {
  tickets?: any[];
  viatico?: any;
  users?: any[];
  contadoras?: any[];
} = {}) {
  const createNotification = jest.fn(async () => ({}));
  const ticketStore = [...(overrides.tickets ?? [])];
  const prisma: any = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => ({
        id: Number(where.id),
        email: Number(where.id) === 22 ? 'tec@nexara.com.mx' : 'liz@nexara.com.mx',
        roleKey: Number(where.id) === 22 ? 'ing_campo' : 'coord_admin',
        puesto: 'Gestora',
        nombre: 'Liz',
        isActive: true,
      })),
      findMany: jest.fn(async ({ where }: any) => {
        const reales = [{ id: 90, email: 'finanzas@nexara.com.mx' }, { id: 7, email: 'liz@nexara.com.mx' }, { id: 22, email: 'tec@nexara.com.mx' }];
        if (where?.id?.in) return [...(overrides.contadoras ?? []), ...(overrides.users ?? []), ...reales]
          .filter((u, i, a) => a.findIndex((x) => x.id === u.id) === i && where.id.in.includes(u.id))
          .map((u) => ({ ...reales.find((r) => r.id === u.id), ...u }));
        if (where?.OR) return (overrides.contadoras ?? [reales[0]]).map((u) => ({ ...reales.find((r) => r.id === u.id), ...u }));
        if (where?.roleKey === 'coord_admin') return (overrides.users ?? [reales[1]]).map((u) => ({ ...reales.find((r) => r.id === u.id), ...u }));
        return overrides.users ?? [];
      }),
    },
    viatico: {
      findFirst: jest.fn(async () => overrides.viatico ?? null),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    viaticoTicket: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.estado === 'APROBADO' && where?.puedeFacturar) {
          return ticketStore.filter((t) => t.estado === 'APROBADO' && t.puedeFacturar &&
            (where?.id?.gt == null || t.id > where.id.gt)).slice(0, 200);
        }
        return ticketStore.filter((t) => (!where?.estado || t.estado === where.estado) &&
          (where?.companyId == null || t.companyId === where.companyId) &&
          (where?.viaticoId == null || t.viaticoId === where.viaticoId) &&
          (where?.usuarioId == null || t.usuarioId === where.usuarioId));
      }),
      findFirst: jest.fn(async ({ where }: any) => ticketStore.find((t) => t.id === where.id) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: 501, createdAt: new Date(), updatedAt: new Date(), ...data };
        ticketStore.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const i = ticketStore.findIndex((t) => t.id === where.id);
        ticketStore[i] = { ...ticketStore[i], ...data };
        return ticketStore[i];
      }),
    },
    vehicleControl: { findMany: jest.fn(async () => []) },
    fine: { findMany: jest.fn(async () => []) },
    vehiculoServicioPlan: { findMany: jest.fn(async () => []) },
    vehicleAsset: { findMany: jest.fn(async () => []) },
    vehiculoServicio: { findMany: jest.fn(async () => []) },
    activity: { findMany: jest.fn(async () => [{ id: 3 }]) },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  prisma.$queryRaw = jest.fn(async () => [{ id: 10 }]);
  const lectura = { disponible: () => false, leerTicket: jest.fn() };
  const service = new GestionViaticosService(prisma, { createNotification } as any, lectura as any);
  return { service, prisma, createNotification, ticketStore };
}

const liz = { id: 7, roleKey: 'coord_admin', email: 'liz@nexara.com.mx', isSuperAdmin: false };
const tecnico = { id: 22, roleKey: 'ing_campo', email: 'tec@nexara.com.mx', isSuperAdmin: false };
const contadora = {
  id: 90,
  roleKey: 'administrativo',
  email: 'finanzas@nexara.com.mx',
  puesto: 'Contadora',
  isSuperAdmin: false,
};

describe('GestionViaticosService', () => {
  it('mis tickets filtra por propietario y empresa', async () => {
    const { service, prisma } = armar();
    await service.misTickets(tecnico, 1);
    expect(prisma.viaticoTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { usuarioId: 22, companyId: 1 } }));
  });

  it('no cambia el costo manual al rechazar un ticket y repetir el rechazo', async () => {
    const { service, prisma, createNotification } = armar({ tickets: [{ id: 501, companyId: 1, viaticoId: 10, estado: 'PENDIENTE', monto: 120, viatico: { usuarioId: 22 } }] });
    await service.revisarTicket(liz, 1, 501, { accion: 'rechazar', motivo: 'Foto ilegible' });
    await service.revisarTicket(liz, 1, 501, { accion: 'rechazar', motivo: 'Foto ilegible' });
    expect(prisma.viatico.updateMany).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('no publica avisos si la transacción del costo falla', async () => {
    const { service, prisma, createNotification } = armar({ tickets: [{ id: 501, companyId: 1, viaticoId: 10, estado: 'PENDIENTE', monto: 120, viatico: { usuarioId: 22 } }] });
    prisma.viatico.updateMany.mockRejectedValue(new Error('BD no disponible'));
    await expect(service.revisarTicket(liz, 1, 501, { accion: 'aprobar' })).rejects.toThrow('BD no disponible');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it.each([{ monto: 0 }, { monto: 10.123 }, { monto: 100000000 }, { monto: 10, fechaLimiteFacturacion: '2026-02-30' }, { monto: 10, puedeFacturar: 'quizá' }])('valida datos de ticket: %j', async (datos) => {
    const { service, prisma } = armar({ viatico: { id: 10, usuarioId: 22, estatus: 'Pagado' } });
    await expect(service.crearTicket(tecnico, 1, { viaticoId: 10, ...datos }, '/foto.jpg')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.viaticoTicket.create).not.toHaveBeenCalled();
  });
  it('un técnico no sube comprobantes de otra persona', async () => {
    const { service, prisma } = armar({ viatico: { id: 10, usuarioId: 33, estatus: 'Pagado' } });
    await expect(service.crearTicket(tecnico, 1, { viaticoId: 10, monto: 10 }, '/foto.jpg')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.viaticoTicket.create).not.toHaveBeenCalled();
  });

  it('niega empresa sin membresía y no consulta tickets', async () => {
    const { service, prisma } = armar();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.misTickets(tecnico, 2)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 22, companyMemberships: { some: { companyId: 2 } } } }));
    expect(prisma.viaticoTicket.findMany).not.toHaveBeenCalled();
  });

  it('rechaza actividad de otra empresa', async () => {
    const { service, prisma } = armar({ viatico: { id: 10, usuarioId: 22, estatus: 'Pagado', actividadId: 3 } });
    prisma.activity.findMany.mockResolvedValue([]);
    await expect(service.crearTicket(tecnico, 1, { viaticoId: 10, monto: 10, actividadId: 3 }, '/foto.jpg')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.viaticoTicket.create).not.toHaveBeenCalled();
  });

  it('Liz no puede facturar aunque pueda revisar tickets', async () => {
    const { service } = armar();
    await expect(service.facturarTicket(liz, 1, 501, { accion: 'no_facturable' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza acciones desconocidas antes de mutar', async () => {
    const { service, prisma } = armar();
    await expect(service.revisarTicket(liz, 1, 501, { accion: 'cualquier cosa' as any })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.viaticoTicket.update).not.toHaveBeenCalled();
  });

  it('aprobar dos veces no duplica avisos ni costo; facturar conserva el costo por actividad', async () => {
    const { service, prisma, createNotification } = armar({ tickets: [{ id: 501, companyId: 1, viaticoId: 10, estado: 'PENDIENTE', monto: 120, puedeFacturar: true, viatico: { usuarioId: 22 } }] });
    await service.revisarTicket(liz, 1, 501, { accion: 'aprobar' });
    const avisos = createNotification.mock.calls.length;
    await service.revisarTicket(liz, 1, 501, { accion: 'aprobar' });
    expect(createNotification).toHaveBeenCalledTimes(avisos);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.viatico.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 10, companyId: 1 }, data: expect.objectContaining({ montoComprobado: 120 }) }));
    prisma.user.findUnique.mockResolvedValue({ ...contadora, isActive: true });
    await service.facturarTicket(contadora, 1, 501, { accion: 'facturado', facturaXmlUrl: '/uploads/viatico-tickets/f.xml' });
    await service.facturarTicket(contadora, 1, 501, { accion: 'facturado', facturaXmlUrl: '/uploads/viatico-tickets/f.xml' });
    expect(prisma.viaticoTicket.update).toHaveBeenCalledTimes(2);
    const costo = movimientosDeViatico({ id: 10, actividadId: 3, usuarioId: 22, estatus: 'Pagado', montoSolicitado: 500, montoAprobado: 500, montoComprobado: 120, categoria: 'COMIDA', fecha: '2026-11-16', repartos: [] });
    expect(costo).toEqual([expect.objectContaining({ activityId: 3, importe: 120 })]);
  });

  it('excluye developer, demo y tester de los avisos', async () => {
    const { service, createNotification } = armar({ viatico: { id: 10, usuarioId: 22, estatus: 'Pagado' }, users: [
      { id: 7, email: 'liz@nexara.com.mx' }, { id: 8, email: 'developer@nexara.com.mx' },
      { id: 9, email: 'demo@nexara.com.mx' }, { id: 10, email: 'persona@nexara.com.mx', puesto: 'Tester' },
    ] });
    await service.crearTicket(tecnico, 1, { viaticoId: 10, monto: 10 }, '/foto.jpg');
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 7 }));
  });
  it('crearTicket avisa a Liz y deja el ticket pendiente', async () => {
    const { service, prisma, createNotification } = armar({
      viatico: { id: 10, usuarioId: 22, actividadId: 3, estatus: 'Pagado', motivo: 'Obra' },
    });
    const ticket = await service.crearTicket(
      tecnico,
      1,
      { viaticoId: 10, tipo: 'GASOLINA', monto: 450, puedeFacturar: true },
      '/uploads/viatico-tickets/a.jpg',
    );
    expect(ticket.estado).toBe('PENDIENTE');
    expect(prisma.viaticoTicket.create).toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'VIATICO_TICKET_NUEVO', userId: 7 }),
    );
  });

  it('revisarTicket aprobar avisa a la contadora y sincroniza el costo', async () => {
    const { service, prisma, createNotification } = armar({
      tickets: [
        {
          id: 501,
          companyId: 1,
          viaticoId: 10,
          estado: 'PENDIENTE',
          monto: 120,
          puedeFacturar: true,
          fechaLimiteFacturacion: new Date('2026-11-16T00:00:00.000Z'),
          viatico: { id: 10, usuarioId: 22, motivo: 'Obra' },
        },
      ],
      contadoras: [{ id: 90 }],
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 7,
      email: 'liz@nexara.com.mx',
      roleKey: 'coord_admin',
      puesto: 'Gestora',
      nombre: 'Liz',
      isActive: true,
    });
    const updated = await service.revisarTicket(liz, 1, 501, { accion: 'aprobar' });
    expect(updated.estado).toBe('APROBADO');
    expect(prisma.viatico.updateMany).toHaveBeenCalled();
    expect(createNotification.mock.calls.some((c: any[]) => c[0].type === 'VIATICO_TICKET_POR_FACTURAR')).toBe(
      true,
    );
  });

  it('revisarTicket rechazar exige motivo', async () => {
    const { service, prisma } = armar({
      tickets: [
        {
          id: 502,
          companyId: 1,
          viaticoId: 10,
          estado: 'PENDIENTE',
          monto: 50,
          puedeFacturar: false,
          viatico: { id: 10, usuarioId: 22, motivo: 'Obra' },
        },
      ],
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 7,
      email: 'liz@nexara.com.mx',
      roleKey: 'coord_admin',
      puesto: 'Gestora',
      nombre: 'Liz',
      isActive: true,
    });
    await expect(service.revisarTicket(liz, 1, 502, { accion: 'rechazar', motivo: 'no' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('facturarTicket exige XML o PDF cuando se marca facturado', async () => {
    const { service, prisma } = armar({
      tickets: [
        {
          id: 503,
          companyId: 1,
          viaticoId: 10,
          estado: 'APROBADO',
          monto: 80,
          puedeFacturar: true,
          notas: null,
        },
      ],
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 90,
      email: 'finanzas@nexara.com.mx',
      roleKey: 'administrativo',
      puesto: 'Contadora',
      nombre: 'Paulina',
      isActive: true,
    });
    await expect(
      service.facturarTicket(contadora, 1, 503, { accion: 'facturado' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recordarTicketsHoy avisa tickets con plazo de hoy', async () => {
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const { service, createNotification } = armar({
      tickets: [
        {
          id: 700,
          companyId: 1,
          estado: 'APROBADO',
          puedeFacturar: true,
          monto: 300,
          tipo: 'GASOLINA',
          fechaLimiteFacturacion: new Date(`${hoy}T00:00:00.000Z`),
        },
      ],
      contadoras: [{ id: 90 }],
      users: [{ id: 7 }],
    });
    const avisos = await service.recordarTicketsHoy();
    expect(avisos).toBeGreaterThan(0);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'VIATICO_TICKET_VENCE_HOY', priority: 'high' }),
    );
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 90, dedupeSeconds: 86400 }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, triggerUserId: undefined }));
  });

  it('recordatorios procesan más de una página sin perder tickets', async () => {
    const { service, createNotification } = armar({ tickets: Array.from({ length: 201 }, (_, i) => ({
      id: i + 1, companyId: 1, estado: 'APROBADO', puedeFacturar: true, monto: 10, tipo: 'COMIDA',
    })) });
    expect(await service.recordarTicketsHoy()).toBe(201);
    expect(createNotification).toHaveBeenCalledTimes(402);
  });

  it('bandeja niega a un técnico', async () => {
    const { service, prisma } = armar();
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 22,
      email: 'tec@nexara.com.mx',
      roleKey: 'ing_campo',
      puesto: 'Técnico',
      nombre: 'Tec',
      isActive: true,
    });
    await expect(service.bandeja(tecnico, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
