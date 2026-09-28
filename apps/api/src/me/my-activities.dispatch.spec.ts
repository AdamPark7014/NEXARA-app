import { ForbiddenException } from '@nestjs/common';
import { MyActivitiesService } from './my-activities.service.js';

/**
 * Luis despacha el servicio a Antonio. Antonio elige al ingeniero, aunque el
 * servicio lo haya creado Servicios y el ingeniero no le reporte en el organigrama.
 */
const ANTONIO = { id: 39, email: 'jose.ramirez@nexara.com.mx' };
const LUIS = { id: 7, email: 'direccion.operaciones@nexara.com.mx' };
const CAROLINA = 13;
const JOAN = 16;

const USERS = [
  { id: 39, email: 'jose.ramirez@nexara.com.mx', managerId: 1 },
  { id: 13, email: 'soporte@nexara.com.mx', managerId: 1 },
  { id: 40, email: 'alejandro.gonzalez@nexara.com.mx', managerId: 1 },
  { id: 41, email: 'roberto.vivanco@nexara.com.mx', managerId: 1 },
  { id: 7, email: 'direccion.operaciones@nexara.com.mx', managerId: 1 },
  { id: 16, email: 'joan.sanchez@nexara.com.mx', managerId: 8 },
];

function build(lead: unknown) {
  const prisma = {
    activityAssignee: { findFirst: jest.fn().mockResolvedValue(lead) },
    user: {
      findMany: jest.fn(async ({ where }: { where?: { id?: { in?: number[] } } }) => {
        if (where?.id?.in) return USERS.filter((u) => where.id!.in!.includes(u.id));
        return USERS;
      }),
    },
  };
  const team = { addMember: jest.fn().mockResolvedValue({}) };
  const service = new MyActivitiesService(
    prisma as any,
    {} as any,
    team as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma, team };
}

describe('despacho de un servicio', () => {
  it('Antonio se la pasa a su ingeniero aunque no le reporte y la haya creado otro departamento', async () => {
    const { service, prisma, team } = build({ id: 1 });

    const res = await service.dispatch(ANTONIO, 1, 90, { userIds: [CAROLINA] });

    expect(res).toEqual({ ok: true, asignados: 1 });
    const where = prisma.activityAssignee.findFirst.mock.calls[0][0].where;
    expect(where.userId).toBe(ANTONIO.id);
    expect(where.rol).toBe('LEAD');
    expect(where.activity).toEqual({ deletedAt: null, assignmentCharge: 'despacho' });
    expect(JSON.stringify(where)).not.toContain('department');
    expect(JSON.stringify(where)).not.toContain('creadoPor');
    expect(team.addMember).toHaveBeenCalledWith(
      90,
      expect.objectContaining({ userId: CAROLINA, rol: 'TECNICO' }),
      1,
      ANTONIO.id,
    );
  });

  it('Luis solo se la pasa a Antonio, no al ingeniero', async () => {
    const { service, team } = build({ id: 1 });

    await expect(service.dispatch(LUIS, 1, 90, { userIds: [CAROLINA] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(team.addMember).not.toHaveBeenCalled();

    const bien = build({ id: 1 });
    await bien.service.dispatch(LUIS, 1, 90, { userIds: [ANTONIO.id] });
    expect(bien.team.addMember).toHaveBeenCalledWith(
      90,
      expect.objectContaining({ userId: ANTONIO.id, rol: 'LEAD' }),
      1,
      LUIS.id,
    );
  });

  it('quien no reparte ese despacho no asigna a nadie', async () => {
    const { service, team } = build(null);
    await expect(
      service.dispatch({ id: JOAN, email: 'joan.sanchez@nexara.com.mx' }, 1, 90, { userIds: [CAROLINA] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(team.addMember).not.toHaveBeenCalled();
  });
});
