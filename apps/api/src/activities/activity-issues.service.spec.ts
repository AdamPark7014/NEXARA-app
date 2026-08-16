import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityIssuesService } from './activity-issues.service.js';

const ACTIVITY = { id: 10, companyId: 7, anNumber: 'A-010' };

function build(over: Record<string, any> = {}) {
  const prisma = {
    activity: { findFirst: jest.fn().mockResolvedValue(ACTIVITY) },
    cotizacion: { findFirst: jest.fn().mockResolvedValue({ id: 33 }) },
    activityIncident: {
      findFirst: jest.fn().mockResolvedValue({ id: 1, resueltoAt: null, accionTomada: null }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { horasPerdidas: null } }),
    },
    activityRecommendation: {
      findFirst: jest.fn().mockResolvedValue({ id: 4, estado: 'ABIERTA', cerradoAt: null }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 4 }),
      update: jest.fn().mockResolvedValue({ id: 4 }),
    },
    ...over,
  };

  return { service: new ActivityIssuesService(prisma as any), prisma };
}

describe('incidencias', () => {
  it('tipifica en vez de guardar texto suelto', () => {
    // Antes esto iba en `ServiceSheet.observations` y no se podia contar.
    const { service } = build();
    return expect(
      service.addIncident(10, { tipo: 'INVENTADO' as any, descripcion: 'x' }, 3, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('acepta el tipo aunque venga en minúsculas', async () => {
    const { service, prisma } = build();
    await service.addIncident(10, { tipo: 'falta_material' as any, descripcion: 'no llegó' }, 3, 7);
    expect(prisma.activityIncident.create.mock.calls[0][0].data.tipo).toBe('FALTA_MATERIAL');
  });

  it('exige descripción', async () => {
    const { service } = build();
    await expect(
      service.addIncident(10, { tipo: 'CLIMA', descripcion: '   ' }, 3, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('la severidad por defecto es MEDIA', async () => {
    const { service, prisma } = build();
    await service.addIncident(10, { tipo: 'CLIMA', descripcion: 'lluvia' }, 3, 7);
    expect(prisma.activityIncident.create.mock.calls[0][0].data.severidad).toBe('MEDIA');
  });

  it('rechaza horas perdidas negativas', async () => {
    const { service } = build();
    await expect(
      service.addIncident(10, { tipo: 'CLIMA', descripcion: 'lluvia', horasPerdidas: -2 }, 3, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('resolver sella quién y cuándo', async () => {
    const { service, prisma } = build();
    await service.resolveIncident(10, 1, { accionTomada: 'se surtió' }, 9, 7);

    const args = prisma.activityIncident.update.mock.calls[0][0];
    expect(args.data.resueltoAt).toBeInstanceOf(Date);
    expect(args.data.resueltoPorId).toBe(9);
    expect(args.data.accionTomada).toBe('se surtió');
  });

  it('no deja recerrar una incidencia ya resuelta', async () => {
    // Sobrescribir `resueltoPorId` borraria a quien la atendio de verdad.
    const { service } = build({
      activityIncident: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, resueltoAt: new Date() }),
      },
    });
    await expect(service.resolveIncident(10, 1, {}, 9, 7)).rejects.toThrow(BadRequestException);
  });

  it('resolver sin acción nueva conserva la anterior', async () => {
    const { service, prisma } = build({
      activityIncident: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, resueltoAt: null, accionTomada: 'previa' }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
    });
    await service.resolveIncident(10, 1, {}, 9, 7);
    expect(prisma.activityIncident.update.mock.calls[0][0].data.accionTomada).toBe('previa');
  });

  it('reabrir sólo aplica a una resuelta', async () => {
    const { service } = build({
      activityIncident: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });
    await expect(service.reopenIncident(10, 1, 7)).rejects.toThrow(NotFoundException);
  });

  it('el resumen ordena los tipos por frecuencia', async () => {
    // Si "falta material" encabeza, el problema esta en almacen, no en campo.
    const { service } = build({
      activityIncident: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([
            { tipo: 'CLIMA', _count: { _all: 2 }, _sum: { horasPerdidas: 3 } },
            { tipo: 'FALTA_MATERIAL', _count: { _all: 9 }, _sum: { horasPerdidas: 20 } },
          ])
          .mockResolvedValueOnce([]),
        count: jest.fn().mockResolvedValue(11),
        aggregate: jest.fn().mockResolvedValue({ _sum: { horasPerdidas: 23 } }),
      },
    });

    const resumen = await service.incidentSummary(7);
    expect(resumen.porTipo[0].tipo).toBe('FALTA_MATERIAL');
    expect(resumen.horasPerdidas).toBe(23);
  });
});

describe('recomendaciones', () => {
  it('enlazar una cotización la marca COTIZADA aunque no se pida', async () => {
    // Dejarla ABIERTA la mantendria en la bandeja de Ventas como trabajo
    // pendiente cuando ya se hizo.
    const { service, prisma } = build();
    await service.updateRecommendation(10, 4, { cotizacionId: 33 }, 7);

    const args = prisma.activityRecommendation.update.mock.calls[0][0];
    expect(args.data.cotizacionId).toBe(33);
    expect(args.data.estado).toBe('COTIZADA');
  });

  it('no enlaza una cotización de otra empresa', async () => {
    const { service } = build({ cotizacion: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(service.updateRecommendation(10, 4, { cotizacionId: 99 }, 7)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('un estado explícito gana sobre el implícito del enlace', async () => {
    const { service, prisma } = build();
    await service.updateRecommendation(10, 4, { cotizacionId: 33, estado: 'ACEPTADA' }, 7);
    expect(prisma.activityRecommendation.update.mock.calls[0][0].data.estado).toBe('ACEPTADA');
  });

  it('un estado terminal sella la fecha de cierre', async () => {
    const { service, prisma } = build();
    await service.updateRecommendation(10, 4, { estado: 'RECHAZADA' }, 7);
    expect(prisma.activityRecommendation.update.mock.calls[0][0].data.cerradoAt).toBeInstanceOf(Date);
  });

  it('reabrir una cerrada limpia la fecha de cierre', async () => {
    const { service, prisma } = build({
      activityRecommendation: {
        findFirst: jest.fn().mockResolvedValue({ id: 4, estado: 'RECHAZADA', cerradoAt: new Date() }),
        update: jest.fn().mockResolvedValue({ id: 4 }),
      },
    });
    await service.updateRecommendation(10, 4, { estado: 'ABIERTA' }, 7);
    expect(prisma.activityRecommendation.update.mock.calls[0][0].data.cerradoAt).toBeNull();
  });

  it('no mueve la fecha de cierre original al reeditar una cerrada', async () => {
    const original = new Date('2026-01-05T10:00:00Z');
    const { service, prisma } = build({
      activityRecommendation: {
        findFirst: jest.fn().mockResolvedValue({ id: 4, estado: 'ACEPTADA', cerradoAt: original }),
        update: jest.fn().mockResolvedValue({ id: 4 }),
      },
    });
    await service.updateRecommendation(10, 4, { prioridad: 'ALTA' }, 7);
    expect(prisma.activityRecommendation.update.mock.calls[0][0].data.cerradoAt).toBe(original);
  });

  it('desenlazar la cotización no cambia el estado por su cuenta', async () => {
    const { service, prisma } = build();
    await service.updateRecommendation(10, 4, { cotizacionId: null }, 7);

    const args = prisma.activityRecommendation.update.mock.calls[0][0];
    expect(args.data.cotizacionId).toBeNull();
    expect(args.data.estado).toBeUndefined();
  });

  it('suma el valor potencial de lo que Ventas no ha convertido', async () => {
    const { service } = build({
      activityRecommendation: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ costoEstimado: 12000 }, { costoEstimado: null }, { costoEstimado: 8000 }]),
      },
    });

    const pendientes = await service.pendingRecommendations(7);
    expect(pendientes.total).toBe(3);
    expect(pendientes.valorPotencial).toBe(20000);
  });

  it('rechaza un tipo de recomendación inventado', async () => {
    const { service } = build();
    await expect(
      service.addRecommendation(10, { tipo: 'ALGO' as any, descripcion: 'x' }, 3, 7),
    ).rejects.toThrow(BadRequestException);
  });
});
