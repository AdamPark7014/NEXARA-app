import {
  buildAuditChanges,
  redactAuditPayload,
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
