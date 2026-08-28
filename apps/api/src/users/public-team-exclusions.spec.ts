import { UsersService } from './users.service.js';

/**
 * El equipo que se pinta en /nosotros sale de `GET users/public-team`, o sea de
 * la tabla User. Hay cuentas que existen en el ERP pero NO deben aparecer ahí.
 * El filtro vive en el servidor a propósito: el que había en la web era un
 * regex sobre el nombre, y un nombre se cambia desde el panel sin darse cuenta.
 */
describe('findPublicTeam · cuentas excluidas del equipo público', () => {
  const PUBLIC_COMPANY_ID = 1;
  let envBackup: string | undefined;

  const buildService = (findMany: jest.Mock) => {
    const prisma = { user: { findMany } } as any;
    return new UsersService(prisma, {} as any);
  };

  beforeEach(() => {
    envBackup = process.env.PUBLIC_COMPANY_ID;
    process.env.PUBLIC_COMPANY_ID = String(PUBLIC_COMPANY_ID);
  });

  afterEach(() => {
    if (envBackup === undefined) delete process.env.PUBLIC_COMPANY_ID;
    else process.env.PUBLIC_COMPANY_ID = envBackup;
  });

  const capturaWhere = async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await buildService(findMany).findPublicTeam(12, null);
    expect(findMany).toHaveBeenCalledTimes(1);
    return findMany.mock.calls[0][0].where;
  };

  it('excluye a claudia.bernal — cuenta interna de dirección, no equipo público', async () => {
    const where = await capturaWhere();
    expect(where.email.notIn).toContain('claudia.bernal@nexara.com.mx');
  });

  it('mantiene excluidas las cuentas que ya lo estaban', async () => {
    const where = await capturaWhere();
    expect(where.email.notIn).toEqual(
      expect.arrayContaining([
        'vendedor@nexara.com.mx',
        'gerencia@nexara.com.mx',
        'developer@nexara.com.mx',
      ]),
    );
  });

  it('sigue acotando el equipo a la empresa del sitio público', async () => {
    const where = await capturaWhere();
    expect(where.companyMemberships).toEqual({ some: { companyId: PUBLIC_COMPANY_ID } });
  });

  it('no excluye por nombre: si a Claudia la renombran, sigue fuera', async () => {
    // Regresión del filtro que había en apps/web (regex sobre u.nombre).
    const where = await capturaWhere();
    expect(JSON.stringify(where)).not.toMatch(/nombre/i);
    expect(where.email.notIn).toContain('claudia.bernal@nexara.com.mx');
  });
});
