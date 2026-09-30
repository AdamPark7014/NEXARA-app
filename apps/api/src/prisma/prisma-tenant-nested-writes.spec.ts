import { hasRelationWrites, planTenantQuery, runWithTenantScope } from './prisma.service';

/**
 * El aislamiento por empresa convertía todo `update({ where: { id } })` en `updateMany`.
 * `updateMany` no acepta escrituras anidadas, así que estos casos reales tronaban con
 * PrismaClientValidationError («Parámetros de la petición inválidos»):
 *   - enviar una cotización (`createdBy: { connect }`),
 *   - aprobar un paso de workflow con otro después (`approvals: { create }`),
 *   - cambiar el empleado de un pago (`user: { connect }`).
 */
describe('hasRelationWrites', () => {
  it('detecta connect / create anidados', () => {
    expect(hasRelationWrites({ createdBy: { connect: { id: 3 } } })).toBe(true);
    expect(hasRelationWrites({ approvals: { create: { stepId: 2, status: 'PENDING' } } })).toBe(true);
    expect(hasRelationWrites({ user: { disconnect: true } })).toBe(true);
  });

  it('no confunde columnas, operaciones atómicas ni fechas con relaciones', () => {
    expect(hasRelationWrites({ estatus: 'Por Validar', usesPersonalKit: true })).toBe(false);
    expect(hasRelationWrites({ failureCount: { increment: 1 } })).toBe(false);
    expect(hasRelationWrites({ sentAt: new Date(), evidencePhotos: ['/a.jpg'] })).toBe(false);
    expect(hasRelationWrites({ tags: { set: ['a'] } })).toBe(false);
    expect(hasRelationWrites(undefined)).toBe(false);
  });
});

describe('planTenantQuery — update con escrituras anidadas', () => {
  it('update por id con connect: update nativo con la empresa en el where único', () => {
    const plan = planTenantQuery(
      'update',
      {
        where: { id: 9 },
        data: { status: 'SENT', createdBy: { connect: { id: 4 } } },
        include: { items: true },
      },
      1,
    );
    expect(plan).toEqual({
      type: 'query',
      action: 'update',
      args: {
        where: { id: 9, companyId: 1 },
        data: { status: 'SENT', createdBy: { connect: { id: 4 } } },
        include: { items: true },
      },
    });
  });

  it('update de columnas sigue yendo por updateMany + relectura', () => {
    const plan = planTenantQuery('update', { where: { id: 9 }, data: { usesPersonalKit: true } }, 1);
    expect(plan).toMatchObject({
      type: 'updateThenRead',
      where: { id: 9, companyId: 1 },
      data: { usesPersonalKit: true },
      read: { where: { id: 9, companyId: 1 } },
    });
  });

  it('where con id y otro filtro: la empresa va al mismo nivel, no en un AND', () => {
    const plan = planTenantQuery(
      'update',
      { where: { id: 9, estatus: 'Pendiente' }, data: { estatus: 'En Proceso' } },
      1,
    );
    expect(plan).toMatchObject({
      type: 'updateThenRead',
      where: { id: 9, estatus: 'Pendiente', companyId: 1 },
      // La relectura no repite `estatus`: tras el update ya no se cumple.
      read: { where: { id: 9, companyId: 1 } },
    });
    expect(JSON.stringify(plan)).not.toContain('"AND"');

    const borrar = planTenantQuery('delete', { where: { id: 9, estatus: 'Pendiente' } }, 1);
    expect(borrar).toEqual({ type: 'deleteMany', where: { id: 9, estatus: 'Pendiente', companyId: 1 } });
  });

  it('llave compuesta con escritura anidada: queda única y con la empresa', () => {
    const plan = planTenantQuery(
      'update',
      {
        where: { activityId_userId: { activityId: 2, userId: 7 } },
        data: { reviewedBy: { connect: { id: 3 } } },
      },
      1,
    );
    expect(plan).toEqual({
      type: 'query',
      action: 'update',
      args: {
        where: { activityId_userId: { activityId: 2, userId: 7 }, companyId: 1 },
        data: { reviewedBy: { connect: { id: 3 } } },
      },
    });
  });

  it('sin empresa en contexto la escritura anidada tampoco toca filas (companyId -1)', () => {
    const plan = planTenantQuery(
      'update',
      { where: { id: 9 }, data: { approvals: { create: { stepId: 2 } } } },
      null,
    );
    expect(plan).toMatchObject({ type: 'query', action: 'update', args: { where: { id: 9, companyId: -1 } } });
  });
});

describe('runWithTenantScope — escrituras anidadas', () => {
  it('manda un solo update nativo (y nunca updateMany) para el paso siguiente del workflow', async () => {
    const acciones: Array<{ action: string; args: any }> = [];
    const row = await runWithTenantScope(
      {
        model: 'WorkflowInstance',
        action: 'update',
        args: {
          where: { id: 5 },
          data: { currentStep: 2, approvals: { create: { stepId: 11, status: 'PENDING' } } },
        },
      },
      1,
      async (planned) => {
        acciones.push({ action: planned.action, args: planned.args });
        if (planned.action === 'updateMany') throw new Error('updateMany no admite approvals.create');
        return { id: 5, currentStep: 2, companyId: 1 };
      },
    );
    expect(acciones).toHaveLength(1);
    expect(acciones[0].action).toBe('update');
    expect(acciones[0].args.where).toEqual({ id: 5, companyId: 1 });
    expect(row.currentStep).toBe(2);
  });

  it('upsert existente con escritura anidada en update: update nativo por id + empresa', async () => {
    const acciones: Array<{ action: string; args: any }> = [];
    await runWithTenantScope(
      {
        model: 'ActivityEvidence',
        action: 'upsert',
        args: {
          where: { activityId_userId: { activityId: 2, userId: 7 } },
          create: { activityId: 2, userId: 7, status: 'ENTRY_PHOTO' },
          update: { reviewedBy: { connect: { id: 3 } } },
        },
      },
      1,
      async (planned) => {
        acciones.push({ action: planned.action, args: planned.args });
        if (planned.action === 'findFirst') return { id: 55 };
        if (planned.action === 'updateMany') throw new Error('no debe usar updateMany');
        return { id: 55 };
      },
    );
    expect(acciones.map((a) => a.action)).toEqual(['findFirst', 'update']);
    expect(acciones[1].args.where).toEqual({ id: 55, companyId: 1 });
  });
});
