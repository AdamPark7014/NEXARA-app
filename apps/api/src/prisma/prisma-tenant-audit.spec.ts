import {
  buildAuditChanges,
  planTenantQuery,
  readCompoundUniqueSelector,
  redactAuditPayload,
  runWithTenantScope,
  whereAlreadyHasCompanyScope,
} from './prisma.service.js';

describe('whereAlreadyHasCompanyScope', () => {
  it('detects a top-level companyId', () => {
    expect(whereAlreadyHasCompanyScope({ companyId: 7 })).toBe(true);
    expect(whereAlreadyHasCompanyScope({ id: 3, companyId: 7 })).toBe(true);
  });

  it('detects compound unique keys that carry companyId', () => {
    // @@unique([companyId, section]) -> companyId_section
    expect(
      whereAlreadyHasCompanyScope({ companyId_section: { companyId: 7, section: 'hero' } }),
    ).toBe(true);
    // @@unique([userId, companyId]) -> userId_companyId
    expect(
      whereAlreadyHasCompanyScope({ userId_companyId: { userId: 1, companyId: 7 } }),
    ).toBe(true);
    // @@unique([key, companyId]) -> key_companyId
    expect(whereAlreadyHasCompanyScope({ key_companyId: { key: 'k', companyId: 7 } })).toBe(true);
  });

  it('looks inside logical operators', () => {
    expect(whereAlreadyHasCompanyScope({ AND: [{ id: 1 }, { companyId: 7 }] })).toBe(true);
    expect(whereAlreadyHasCompanyScope({ NOT: { companyId: 7 } })).toBe(true);
  });

  it('does NOT accept a nested relation filter as tenant scope', () => {
    // Regression: `{ client: { companyId: 7 } }` constrains the relation, not
    // the model being queried. Treating it as scoped skipped tenant injection
    // entirely and returned rows belonging to other companies.
    expect(whereAlreadyHasCompanyScope({ client: { companyId: 7 } })).toBe(false);
    expect(whereAlreadyHasCompanyScope({ user: { companyId: 7 } })).toBe(false);
    expect(whereAlreadyHasCompanyScope({ project: { is: { companyId: 7 } } })).toBe(false);
  });

  it('returns false for unscoped wheres', () => {
    expect(whereAlreadyHasCompanyScope({ id: 1 })).toBe(false);
    expect(whereAlreadyHasCompanyScope({})).toBe(false);
    expect(whereAlreadyHasCompanyScope(null)).toBe(false);
    expect(whereAlreadyHasCompanyScope(undefined)).toBe(false);
  });
});

describe('redactAuditPayload', () => {
  it('redacts credential-bearing keys', () => {
    expect(redactAuditPayload({ email: 'a@b.com', password: 'hunter2' })).toEqual({
      email: 'a@b.com',
      password: '[redacted]',
    });
  });

  it('redacts regardless of casing or separators', () => {
    expect(
      redactAuditPayload({
        passwordHash: 'x',
        password_hash: 'x',
        refreshToken: 'x',
        apiKey: 'x',
        twoFactorSecret: 'x',
      }),
    ).toEqual({
      passwordHash: '[redacted]',
      password_hash: '[redacted]',
      refreshToken: '[redacted]',
      apiKey: '[redacted]',
      twoFactorSecret: '[redacted]',
    });
  });

  it('walks nested objects and arrays', () => {
    expect(
      redactAuditPayload({ users: [{ name: 'A', password: 'p' }], meta: { token: 't' } }),
    ).toEqual({
      users: [{ name: 'A', password: '[redacted]' }],
      meta: { token: '[redacted]' },
    });
  });

  it('leaves ordinary business data untouched', () => {
    const payload = { total: 1200.5, status: 'PAID', issuedAt: new Date('2026-01-01') };
    expect(redactAuditPayload(payload)).toEqual(payload);
  });

  it('passes through primitives and null', () => {
    expect(redactAuditPayload(null)).toBeNull();
    expect(redactAuditPayload(undefined)).toBeUndefined();
    expect(redactAuditPayload(42)).toBe(42);
    expect(redactAuditPayload('text')).toBe('text');
  });
});

describe('buildAuditChanges', () => {
  it('records the payload for single-row writes', () => {
    expect(buildAuditChanges('update', { data: { status: 'PAID' } }, { id: 3 })).toEqual({
      status: 'PAID',
    });
  });

  it('redacts secrets on single-row writes', () => {
    expect(buildAuditChanges('create', { data: { email: 'a@b.com', password: 'p' } }, { id: 1 })).toEqual(
      { email: 'a@b.com', password: '[redacted]' },
    );
  });

  it('records filter and affected count for bulk writes', () => {
    // Sin esto, un BULK_UPDATE quedaba registrado con entityId 0 y sin ninguna
    // pista de qué filas se modificaron.
    expect(
      buildAuditChanges(
        'updateMany',
        { data: { status: 'CLOSED' }, where: { companyId: 7, status: 'OPEN' } },
        { count: 12 },
      ),
    ).toEqual({
      data: { status: 'CLOSED' },
      where: { companyId: 7, status: 'OPEN' },
      affected: 12,
    });
  });

  it('redacts secrets inside the bulk filter too', () => {
    expect(
      buildAuditChanges('deleteMany', { where: { token: 'abc', companyId: 7 } }, { count: 1 }),
    ).toEqual({
      data: null,
      where: { token: '[redacted]', companyId: 7 },
      affected: 1,
    });
  });

  it('tolerates a missing count', () => {
    expect(buildAuditChanges('createMany', { data: [{ a: 1 }] }, undefined)).toEqual({
      data: [{ a: 1 }],
      where: null,
      affected: null,
    });
  });
});

const SELECT_ORIGEN = {
  entryLatitude: true,
  entryLongitude: true,
  entryPhotoUploadedAt: true,
  exitPhotoUploadedAt: true,
  status: true,
  companyId: true,
};

describe('planTenantQuery — llaves únicas compuestas', () => {
  it('no confunde un filtro de relación con una llave compuesta', () => {
    expect(readCompoundUniqueSelector({ client: { companyId: 7 } })).toBeNull();
    expect(readCompoundUniqueSelector({ activityId_userId: { activityId: 2, userId: 7 } })?.key).toBe(
      'activityId_userId',
    );
  });

  it('aplana activityId_userId en la foto de salida (el caso de producción)', () => {
    // El log era findUnique con AND: [ { activityId_userId }, { companyId } ].
    // Prisma nombra el método original, pero el where ya no es WhereUnique.
    const plan = planTenantQuery(
      'findUnique',
      {
        where: { activityId_userId: { activityId: 2, userId: 7 } },
        select: SELECT_ORIGEN,
      },
      1,
    );
    expect(plan).toEqual({
      type: 'query',
      action: 'findFirst',
      args: {
        where: { activityId: 2, userId: 7, companyId: 1 },
        select: SELECT_ORIGEN,
      },
    });
    expect(JSON.stringify(plan)).not.toContain('activityId_userId');
  });

  it('aplana update, delete y upsert de evidencias, horas extra y visitas', () => {
    const fecha = new Date('2026-09-28T00:00:00.000Z');
    const update = planTenantQuery(
      'update',
      { where: { userId_fecha: { userId: 7, fecha } }, data: { minutos: 30 } },
      1,
    );
    expect(update).toMatchObject({
      type: 'updateThenRead',
      where: { userId: 7, fecha, companyId: 1 },
      data: { minutos: 30 },
    });

    const deleted = planTenantQuery(
      'delete',
      { where: { activityId_userId: { activityId: 2, userId: 7 } } },
      1,
    );
    expect(deleted).toEqual({
      type: 'deleteMany',
      where: { activityId: 2, userId: 7, companyId: 1 },
    });

    const visita = planTenantQuery(
      'upsert',
      {
        where: { contractId_scheduledDate: { contractId: 4, scheduledDate: fecha } },
        create: { contractId: 4, scheduledDate: fecha, status: 'SCHEDULED' },
        update: {},
      },
      1,
    );
    expect(visita).toMatchObject({
      type: 'upsert',
      lookup: { contractId: 4, scheduledDate: fecha, companyId: 1 },
      create: { contractId: 4, scheduledDate: fecha, status: 'SCHEDULED', companyId: 1 },
      update: {},
    });
  });

  it('deja única la llave que ya trae companyId y fuerza la empresa del request', () => {
    const plan = planTenantQuery(
      'findUnique',
      { where: { companyId_section: { companyId: 9, section: 'hero' } } },
      1,
    );
    expect(plan).toEqual({
      type: 'query',
      action: 'findUnique',
      args: { where: { companyId_section: { companyId: 1, section: 'hero' } } },
    });
  });

  it('sigue acotando un findMany cuya relación menciona companyId', () => {
    const plan = planTenantQuery('findMany', { where: { client: { companyId: 7 } } }, 1);
    expect(plan).toEqual({
      type: 'query',
      action: 'findMany',
      args: { where: { AND: [{ client: { companyId: 7 } }, { companyId: 1 }] } },
    });
  });

  it('sin empresa no devuelve filas (companyId -1)', () => {
    const plan = planTenantQuery(
      'findUnique',
      { where: { activityId_userId: { activityId: 2, userId: 7 } } },
      null,
    );
    expect(plan).toMatchObject({
      type: 'query',
      action: 'findFirst',
      args: { where: { activityId: 2, userId: 7, companyId: -1 } },
    });
  });
});

describe('runWithTenantScope', () => {
  it('ejecuta la búsqueda de la foto como findFirst con companyId, sin la llave compuesta', async () => {
    const seen: Array<{ action: string; args: any }> = [];
    const row = await runWithTenantScope(
      {
        model: 'ActivityEvidence',
        action: 'findUnique',
        args: {
          where: { activityId_userId: { activityId: 2, userId: 7 } },
          select: SELECT_ORIGEN,
        },
      },
      1,
      async (planned) => {
        seen.push({ action: planned.action, args: planned.args });
        expect(planned.action).toBe('findFirst');
        expect(planned.args.where).toEqual({ activityId: 2, userId: 7, companyId: 1 });
        expect(JSON.stringify(planned.args.where)).not.toContain('activityId_userId');
        return {
          entryLatitude: 19.07409,
          entryLongitude: -98.27776,
          entryPhotoUploadedAt: new Date('2026-09-28T18:00:00Z'),
          exitPhotoUploadedAt: null,
          status: 'EXIT_PHOTO',
          companyId: 1,
        };
      },
    );
    expect(seen).toHaveLength(1);
    expect(row.companyId).toBe(1);
  });

  it('el upsert con update vacío no manda data vacío a updateMany', async () => {
    const acciones: string[] = [];
    const row = await runWithTenantScope(
      {
        model: 'ActivityEvidence',
        action: 'upsert',
        args: {
          where: { activityId_userId: { activityId: 2, userId: 7 } },
          create: { activityId: 2, userId: 7, status: 'ENTRY_PHOTO' },
          update: {},
        },
      },
      1,
      async (planned) => {
        acciones.push(planned.action);
        if (planned.action === 'findFirst' && planned.args.select?.id) return { id: 55 };
        if (planned.action === 'updateMany') throw new Error('update vacío no debe escribir');
        return { id: 55, activityId: 2, userId: 7, companyId: 1, status: 'ENTRY_PHOTO' };
      },
    );
    expect(acciones).toEqual(['findFirst', 'findFirst']);
    expect(row.id).toBe(55);
  });
});
