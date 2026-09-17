import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivityTeamService } from './activity-team.service.js';
import { REASSIGN_FORBIDDEN } from './activity-superiors.js';

/** Responsable (3) la ejecuta; la creó 6. Organigrama: 1 Christian → 4 jefe → 3; 5 compañero de 3. */
const ACTIVITY = {
  id: 10,
  companyId: 7,
  responsableId: 3,
  creadoPorId: 6,
  anNumber: 'A-010',
  titulo: 'Mantenimiento de CCTV',
  estatus: 'En Proceso',
  assignmentCharge: 'ejecucion',
  assignees: [{ userId: 3, rol: 'LEAD', asignadoAt: new Date('2026-09-17T15:00:00Z') }],
};
const USERS = [
  { id: 1, managerId: null, nombre: 'Christian' },
  { id: 3, managerId: 4, nombre: 'Alejandro' },
  { id: 4, managerId: 1, nombre: 'Antonio' },
  { id: 5, managerId: 4, nombre: 'Carolina' },
  { id: 6, managerId: 1, nombre: 'David' },
  { id: 9, managerId: 4, nombre: 'Roberto' },
];
/** Jefe directo de quien la ejecuta. */
const JEFE = { id: 4, email: 'jose.ramirez@nexara.com.mx' };
const MOTIVO = 'Se enfermó y no puede seguir';

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
    activityEvidence: { upsert: jest.fn().mockResolvedValue({ id: 3 }) },
    ...over.tx,
  };

  const prisma = {
    activity: { findFirst: jest.fn().mockResolvedValue(ACTIVITY) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 9 }), findMany: jest.fn().mockResolvedValue(USERS) },
    activityAssignee: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 2 }),
      update: jest.fn().mockResolvedValue({ id: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    activityReassignment: { findMany: jest.fn().mockResolvedValue([]) },
    activityEvidence: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
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

describe('reasignación («Pasar a otro compañero»)', () => {
  it('deja constancia de quién la tenía, quién la movió y por qué', async () => {
    const { service, tx } = build();
    await service.reassign(10, { aUsuarioId: 9, motivo: MOTIVO }, JEFE, 7);

    const args = tx.activityReassignment.create.mock.calls[0][0];
    expect(args.data.deUsuarioId).toBe(3);
    expect(args.data.aUsuarioId).toBe(9);
    expect(args.data.movidaPorId).toBe(4);
    expect(args.data.motivo).toBe(MOTIVO);
  });

  it('reinicia la fecha de asignación para que el SLA mida desde el nuevo responsable', async () => {
    const { service, tx } = build();
    await service.reassign(10, { aUsuarioId: 9, motivo: MOTIVO }, JEFE, 7);

    const args = tx.activity.update.mock.calls[0][0];
    expect(args.data.responsableId).toBe(9);
    expect(args.data.fechaAsignacion).toBeInstanceOf(Date);
  });

  it('el nuevo responsable entra como líder y con su propia evidencia desde la foto de entrada', async () => {
    const { service, tx } = build();
    await service.reassign(10, { aUsuarioId: 9, motivo: MOTIVO }, JEFE, 7);

    const creado = tx.activityAssignee.create.mock.calls.find((c: any) => c[0].data.userId === 9);
    expect(creado[0].data.rol).toBe('LEAD');
    const ev = tx.activityEvidence.upsert.mock.calls[0][0];
    expect(ev.where.activityId_userId).toEqual({ activityId: 10, userId: 9 });
    expect(ev.create.status).toBe('ENTRY_PHOTO');
  });

  it('por omisión retira al anterior (su avance parcial se conserva, no se borra evidencia)', async () => {
    const { service, tx } = build();
    await service.reassign(10, { aUsuarioId: 9, motivo: MOTIVO }, JEFE, 7);

    const retirado = tx.activityAssignee.create.mock.calls.find((c: any) => c[0].data.userId === 3);
    expect(retirado[0].data.retiradoAt).toBeInstanceOf(Date);
    expect((tx.activityEvidence as any).delete).toBeUndefined();
  });

  it('con retirarAnterior: false lo conserva como apoyo (centro de despacho)', async () => {
    const { service, tx } = build();
    await service.reassign(10, { aUsuarioId: 9, motivo: MOTIVO, retirarAnterior: false }, JEFE, 7);

    const anterior = tx.activityAssignee.create.mock.calls.find((c: any) => c[0].data.userId === 3);
    expect(anterior[0].data.rol).toBe('APOYO');
  });

  it('quien entra hereda el lugar de un técnico del equipo sin tocar al responsable', async () => {
    const lead = { userId: 3, rol: 'LEAD', asignadoAt: new Date('2026-09-17T15:00:00Z') };
    const tecnico = { userId: 5, rol: 'TECNICO', asignadoAt: new Date('2026-09-17T15:10:00Z') };
    const { service, tx } = build({
      prisma: {
        activity: {
          findFirst: jest.fn().mockResolvedValue({ ...ACTIVITY, assignees: [lead, tecnico] }),
        },
      },
      tx: {
        activityAssignee: {
          findFirst: jest.fn().mockImplementation(({ where }: any) =>
            Promise.resolve(where.userId === 5 ? { id: 55, ...tecnico, indicaciones: 'Llevar escalera' } : null),
          ),
          create: jest.fn().mockResolvedValue({ id: 2 }),
          update: jest.fn().mockResolvedValue({ id: 2 }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    await service.reassign(10, { aUsuarioId: 9, deUsuarioId: 5, motivo: MOTIVO }, JEFE, 7);

    expect(tx.activity.update).not.toHaveBeenCalled();
    const creado = tx.activityAssignee.create.mock.calls[0][0].data;
    expect(creado).toMatchObject({ userId: 9, rol: 'TECNICO', indicaciones: 'Llevar escalera', asignadoPorId: 4 });
    expect(creado.asignadoAt).toEqual(tecnico.asignadoAt);
    expect(tx.activityAssignee.updateMany.mock.calls[0][0].where.userId).toBe(5);
  });

  it('el motivo es obligatorio (mínimo 10 caracteres)', async () => {
    const { service, prisma } = build();
    await expect(service.reassign(10, { aUsuarioId: 9, motivo: 'porque sí' }, JEFE, 7)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('solo superiores: quien la ejecuta o un compañero reciben 403', async () => {
    const { service, prisma } = build();
    await expect(service.reassign(10, { aUsuarioId: 9, motivo: MOTIVO }, { id: 3 }, 7)).rejects.toThrow(
      new ForbiddenException(REASSIGN_FORBIDDEN),
    );
    await expect(service.reassign(10, { aUsuarioId: 9, motivo: MOTIVO }, { id: 5 }, 7)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('Christian puede pasarla aunque no esté en la cadena', async () => {
    const { service, prisma } = build();
    await service.reassign(10, { aUsuarioId: 9, motivo: MOTIVO }, { id: 1, email: 'gerencia@nexara.com.mx' }, 7);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rechaza pasarla a quien ya la tiene o está en el equipo', async () => {
    const { service } = build();
    await expect(service.reassign(10, { aUsuarioId: 3, motivo: MOTIVO }, JEFE, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('una actividad cerrada no se pasa a nadie', async () => {
    const { service } = build({
      prisma: { activity: { findFirst: jest.fn().mockResolvedValue({ ...ACTIVITY, estatus: 'Cancelada' }) } },
    });
    await expect(service.reassign(10, { aUsuarioId: 9, motivo: MOTIVO }, JEFE, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('expone a quién puede reemplazar cada superior', async () => {
    const { service } = build();
    const jefe = await service.superiorActions(10, JEFE, 7);
    expect(jefe.puedeCancelar).toBe(true);
    expect(jefe.personas.map((p) => p.userId)).toEqual([3]);

    const ejecutor = await service.superiorActions(10, { id: 3 }, 7);
    expect(ejecutor.puedeCancelar).toBe(false);
    expect(ejecutor.puedePasar).toBe(false);
  });

  it('todo ocurre en una transacción', async () => {
    // Si fallara a medias quedaria la actividad movida sin rastro de por que.
    const { service, prisma } = build();
    await service.reassign(10, { aUsuarioId: 9, motivo: MOTIVO }, JEFE, 7);
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
