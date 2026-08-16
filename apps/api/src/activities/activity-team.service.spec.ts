import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityTeamService } from './activity-team.service.js';

const ACTIVITY = { id: 10, companyId: 7, responsableId: 3, anNumber: 'A-010' };

function build(over: Record<string, any> = {}) {
  const tx = {
    activity: { update: jest.fn().mockResolvedValue({}) },
    activityReassignment: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    activityAssignee: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 2 }),
      update: jest.fn().mockResolvedValue({ id: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...over.tx,
  };

  const prisma = {
    activity: { findFirst: jest.fn().mockResolvedValue(ACTIVITY) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 9 }) },
    activityAssignee: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 2 }),
      update: jest.fn().mockResolvedValue({ id: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    activityReassignment: { findMany: jest.fn().mockResolvedValue([]) },
    stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    ...over.prisma,
  };

  return { service: new ActivityTeamService(prisma as any), prisma, tx };
}

describe('equipo de la actividad', () => {
  it('añade a alguien como técnico por defecto', async () => {
    const { service, prisma } = build();
    await service.addMember(10, { userId: 9 }, 7);

    const args = (prisma.activityAssignee.create as jest.Mock).mock.calls[0][0];
    expect(args.data.rol).toBe('TECNICO');
    expect(args.data.companyId).toBe(7);
  });

  it('reincorporar reactiva la fila en vez de duplicarla', async () => {
    // Si se creara otra, las horas de esa persona quedarian fragmentadas.
    const { service, prisma } = build({
      prisma: {
        activityAssignee: {
          findFirst: jest.fn().mockResolvedValue({ id: 5, rol: 'APOYO', horasPlan: null }),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({ id: 5 }),
          updateMany: jest.fn(),
        },
      },
    });

    await service.addMember(10, { userId: 9 }, 7);

    expect(prisma.activityAssignee.create).not.toHaveBeenCalled();
    const args = (prisma.activityAssignee.update as jest.Mock).mock.calls[0][0];
    expect(args.data.retiradoAt).toBeNull();
  });

  it('rechaza un usuario inexistente o inactivo', async () => {
    const { service } = build({ prisma: { user: { findFirst: jest.fn().mockResolvedValue(null) } } });
    await expect(service.addMember(10, { userId: 99 }, 7)).rejects.toThrow(NotFoundException);
  });

  it('sacar del equipo marca la salida, no borra', async () => {
    // Las horas dedicadas y los viaticos solicitados siguen siendo suyos.
    const { service, prisma } = build();
    await service.removeMember(10, 9, 7);

    const args = (prisma.activityAssignee.updateMany as jest.Mock).mock.calls[0][0];
    expect(args.data.retiradoAt).toBeInstanceOf(Date);
    expect(args.where.retiradoAt).toBeNull();
  });

  it('rechaza horas negativas', async () => {
    const { service } = build();
    await expect(service.setActualHours(10, 9, -3, 7)).rejects.toThrow(BadRequestException);
  });
});

describe('reasignación', () => {
  it('deja constancia de quién la tenía, quién la movió y por qué', async () => {
    const { service, tx } = build();
    await service.reassign(10, { aUsuarioId: 9, motivo: 'incapacidad' }, 4, 7);

    const args = tx.activityReassignment.create.mock.calls[0][0];
    expect(args.data.deUsuarioId).toBe(3);
    expect(args.data.aUsuarioId).toBe(9);
    expect(args.data.movidaPorId).toBe(4);
    expect(args.data.motivo).toBe('incapacidad');
  });

  it('reinicia la fecha de asignación para que el SLA mida desde el nuevo responsable', async () => {
    const { service, tx } = build();
    await service.reassign(10, { aUsuarioId: 9 }, 4, 7);

    const args = tx.activity.update.mock.calls[0][0];
    expect(args.data.responsableId).toBe(9);
    expect(args.data.fechaAsignacion).toBeInstanceOf(Date);
  });

  it('el nuevo responsable entra como líder', async () => {
    const { service, tx } = build();
    await service.reassign(10, { aUsuarioId: 9 }, 4, 7);

    const creado = tx.activityAssignee.create.mock.calls.find((c: any) => c[0].data.userId === 9);
    expect(creado[0].data.rol).toBe('LEAD');
  });

  it('el anterior se queda como apoyo salvo que se pida retirarlo', async () => {
    // Conserva contexto del trabajo ya hecho.
    const { service, tx } = build();
    await service.reassign(10, { aUsuarioId: 9 }, 4, 7);

    const anterior = tx.activityAssignee.create.mock.calls.find((c: any) => c[0].data.userId === 3);
    expect(anterior[0].data.rol).toBe('APOYO');
  });

  it('retira al anterior si se pide explícitamente', async () => {
    const { service, tx } = build();
    await service.reassign(10, { aUsuarioId: 9, retirarAnterior: true }, 4, 7);

    const retiro = tx.activityAssignee.updateMany.mock.calls.find(
      (c: any) => c[0].where.userId === 3,
    );
    expect(retiro[0].data.retiradoAt).toBeInstanceOf(Date);
  });

  it('rechaza reasignar a quien ya es responsable', async () => {
    const { service } = build();
    await expect(service.reassign(10, { aUsuarioId: 3 }, 4, 7)).rejects.toThrow(BadRequestException);
  });

  it('todo ocurre en una transacción', async () => {
    // Si fallara a medias quedaria la actividad movida sin rastro de por que.
    const { service, prisma } = build();
    await service.reassign(10, { aUsuarioId: 9 }, 4, 7);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('material consumido', () => {
  it('suma el costo de los movimientos de la actividad', async () => {
    const { service } = build({
      prisma: {
        stockMovement: {
          findMany: jest.fn().mockResolvedValue([{ totalCost: 150.5 }, { totalCost: 49.5 }]),
        },
      },
    });

    const result = await service.listMaterials(10, 7);
    expect(result.costoTotal).toBe(200);
  });

  it('tolera movimientos sin costo', async () => {
    const { service } = build({
      prisma: {
        stockMovement: { findMany: jest.fn().mockResolvedValue([{ totalCost: null }, {}]) },
      },
    });
    expect((await service.listMaterials(10, 7)).costoTotal).toBe(0);
  });
});
