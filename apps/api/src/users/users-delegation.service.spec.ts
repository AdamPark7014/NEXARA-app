import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersDelegationService } from './users-delegation.service.js';
import { PLATFORM_OWNER_EMAIL } from '../common/platform-accounts.js';

const GRANTS = JSON.stringify({
  'jose.ramirez@nexara.com.mx': ['ing_soporte'],
  'operaciones@nexara.com.mx': ['ing_campo'],
  'direccion.operaciones@nexara.com.mx': ['ing_soporte'],
});

const PERSONAS: Record<number, any> = {
  1: { id: 1, email: PLATFORM_OWNER_EMAIL, roleKey: 'ceo', departmentId: 10, isActive: true },
  2: { id: 2, email: 'jose.ramirez@nexara.com.mx', roleKey: 'ing_soporte', departmentId: 20, isActive: true },
  3: { id: 3, email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones', departmentId: 30, isActive: true },
  4: { id: 4, email: 'direccion.operaciones@nexara.com.mx', roleKey: 'coord_operaciones', departmentId: 31, isActive: true },
  5: { id: 5, email: 'carolina@nexara.com.mx', roleKey: 'ing_soporte', departmentId: 20, isActive: true },
  6: { id: 6, email: 'baja@nexara.com.mx', roleKey: 'ing_soporte', departmentId: 20, isActive: false },
};

const ROLES: Record<string, any> = {
  ing_soporte: { id: 101, accesoConsoleAdmin: false },
  ing_campo: { id: 102, accesoConsoleAdmin: false },
  dir_admin: { id: 103, accesoConsoleAdmin: true },
};

function crear(opts: { grants?: string | null; sinRol?: string; sinSubordinados?: boolean; departamentos?: { id: number; nombre: string }[] } = {}) {
  const create = jest.fn(async (dto: any) => ({ id: 500, nombre: dto.nombre, email: dto.email, departmentId: dto.departmentId, employeeNumber: 'NX-500', avatarUrl: dto.avatarUrl ?? null, passwordHash: 'x' }));
  const log = jest.fn(async () => ({}));
  const prisma: any = {
    systemSetting: { findMany: jest.fn(async () => (opts.grants === null ? [] : [{ companyId: 7, value: opts.grants ?? GRANTS }])) },
    user: {
      findUnique: jest.fn(async ({ where }: any) => PERSONAS[where.id] ?? null),
      count: jest.fn(async ({ where }: any) => (opts.sinSubordinados ? 0 : [1, 2, 3, 4].includes(where.managerId) ? 2 : 0)),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async ({ data }: any) => data),
    },
    department: {
      findMany: jest.fn(async () => opts.departamentos ?? []),
      findFirst: jest.fn(async ({ where }: any) => (where?.id ? { id: where.id } : null)),
    },
    userProfile: { upsert: jest.fn(async (args: any) => args) },
    role: { findFirst: jest.fn(async ({ where }: any) => (where.orgRoleKey === opts.sinRol ? null : ROLES[where.orgRoleKey] ?? null)) },
  };
  return { servicio: new UsersDelegationService(prisma, { create } as any, { log } as any), create, log, prisma };
}

const alta = (roleKey: string, extra: Record<string, unknown> = {}) => ({
  nombre: 'Persona Nueva Prueba',
  email: 'Nueva.Persona@Nexara.com.mx',
  password: 'Nexara2026x',
  telefono: '5512345678',
  roleKey,
  ...extra,
});

describe('UsersDelegationService.tiposCreables', () => {
  it('Antonio y Luis ven «Soporte»; David ve «Instalador»; Christian ve todos los de abajo', async () => {
    const { servicio } = crear();
    expect((await servicio.tiposCreables({ id: 2 }, 7)).map((t) => t.etiqueta)).toEqual(['Soporte']);
    expect((await servicio.tiposCreables({ id: 4 }, 7)).map((t) => t.etiqueta)).toEqual(['Soporte']);
    expect((await servicio.tiposCreables({ id: 3 }, 7)).map((t) => t.etiqueta)).toEqual(['Instalador']);
    const christian = (await servicio.tiposCreables({ id: 1 }, 7)).map((t) => t.roleKey);
    expect(christian).toEqual(expect.arrayContaining(['ing_soporte', 'ing_campo', 'coord_operaciones', 'dir_admin']));
    expect(christian).not.toContain('ceo');
  });

  it('quien no tiene concesión ve una lista vacía (no se le ofrece el botón)', async () => {
    const { servicio } = crear();
    expect(await servicio.tiposCreables({ id: 5 }, 7)).toEqual([]);
  });

  it('clientes del portal, sesiones sin usuario y usuarios dados de baja: prohibido', async () => {
    const { servicio } = crear();
    await expect(servicio.tiposCreables({ id: null, isClient: true }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.tiposCreables({ id: 1, isBranchUser: true }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.tiposCreables({ id: 6 }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.tiposCreables({ id: 999 }, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('UsersDelegationService.crear', () => {
  it('Antonio da de alta a alguien de soporte: queda debajo de él, con su departamento y el rol de soporte', async () => {
    const { servicio, create } = crear();
    const r = await servicio.crear({ id: 2 }, alta('ing_soporte'), 7);
    const dto = (create.mock.calls[0] as any[])[0];
    expect(dto).toMatchObject({
      nombre: 'Persona Nueva Prueba',
      email: 'nueva.persona@nexara.com.mx',
      roleId: 101,
      departmentId: 20,
      managerId: 2,
    });
    expect((create.mock.calls[0] as any[])[1]).toBe(7);
    expect(r).toMatchObject({ id: 500, roleKey: 'ing_soporte', managerId: 2 });
    // La respuesta no lleva contraseña ni hash.
    expect(JSON.stringify(r)).not.toMatch(/password|Nexara2026x|hash/i);
  });

  it('cada quien solo puede dar de alta lo suyo', async () => {
    const { servicio, create } = crear();
    await expect(servicio.crear({ id: 2 }, alta('ing_campo'), 7)).rejects.toBeInstanceOf(ForbiddenException); // Antonio → instalador
    await expect(servicio.crear({ id: 4 }, alta('ing_campo'), 7)).rejects.toBeInstanceOf(ForbiddenException); // Luis → instalador
    await expect(servicio.crear({ id: 3 }, alta('ing_soporte'), 7)).rejects.toBeInstanceOf(ForbiddenException); // David → soporte
    await expect(servicio.crear({ id: 5 }, alta('ing_soporte'), 7)).rejects.toBeInstanceOf(ForbiddenException); // sin concesión
    await expect(servicio.crear({ id: 2 }, alta('dir_admin'), 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.crear({ id: 2 }, alta('ceo'), 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('David y Luis (mismo rol) dan de alta cada uno lo suyo', async () => {
    const { servicio, create } = crear();
    await servicio.crear({ id: 3 }, alta('ing_campo'), 7);
    await servicio.crear({ id: 4 }, alta('ing_soporte'), 7);
    expect((create.mock.calls[0] as any[])[0]).toMatchObject({ roleId: 102, departmentId: 30, managerId: 3 });
    expect((create.mock.calls[1] as any[])[0]).toMatchObject({ roleId: 101, departmentId: 31, managerId: 4 });
  });

  it('Christian da de alta cualquier tipo por debajo, incluso los de administración, y puede elegir jefe', async () => {
    const { servicio, create } = crear({ grants: null });
    await servicio.crear({ id: 1 }, alta('dir_admin', { managerId: 1 }), 7);
    await servicio.crear({ id: 1 }, alta('ing_campo', { managerId: 3, departmentId: 44 }), 7);
    expect((create.mock.calls[0] as any[])[0]).toMatchObject({ roleId: 103, managerId: 1 });
    expect((create.mock.calls[1] as any[])[0]).toMatchObject({ roleId: 102, managerId: 3, departmentId: 44 });
    await expect(servicio.crear({ id: 1 }, alta('ceo'), 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un delegado no puede elegir a otro jefe ni un rol con poderes de administración', async () => {
    const { servicio, create } = crear();
    await servicio.crear({ id: 2 }, alta('ing_soporte', { managerId: 1 }), 7);
    expect((create.mock.calls[0] as any[])[0].managerId).toBe(2);

    // Aunque alguien le hubiera concedido un rol delegable cuyo Role del sistema tenga poderes, no pasa.
    const { servicio: s2, create: c2 } = crear({ grants: JSON.stringify({ 'jose.ramirez@nexara.com.mx': ['ing_soporte'] }) });
    ROLES.ing_soporte.accesoConsoleAdmin = true;
    try {
      await expect(s2.crear({ id: 2 }, alta('ing_soporte'), 7)).rejects.toThrow(/solo lo da de alta dirección/);
      expect(c2).not.toHaveBeenCalled();
    } finally {
      ROLES.ing_soporte.accesoConsoleAdmin = false;
    }
  });

  it('valida contraseña, nombre y correo antes de crear nada', async () => {
    const { servicio, create } = crear();
    await expect(servicio.crear({ id: 2 }, alta('ing_soporte', { password: 'corta1' }), 7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.crear({ id: 2 }, alta('ing_soporte', { password: 'sinnumeros' }), 7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.crear({ id: 2 }, alta('ing_soporte', { nombre: 'Al' }), 7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.crear({ id: 2 }, alta('ing_soporte', { email: 'no-es-correo' }), 7)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('si el tipo no existe como rol del sistema, lo dice', async () => {
    const { servicio } = crear({ sinRol: 'ing_soporte' });
    await expect(servicio.crear({ id: 2 }, alta('ing_soporte'), 7)).rejects.toThrow(/no está configurado/);
  });

  it('deja el rastro en la auditoría sin la contraseña', async () => {
    const { servicio, log } = crear();
    await servicio.crear({ id: 2 }, alta('ing_soporte'), 7);
    const [dto, actorId] = log.mock.calls[0] as any[];
    expect(actorId).toBe(2);
    expect(dto).toMatchObject({ entityType: 'User', entityId: 500, action: 'CREATE_DELEGATED', companyId: 7 });
    expect(JSON.stringify(dto)).not.toMatch(/Nexara2026x|password/i);
  });

  it('las concesiones de una empresa no valen en otra', async () => {
    const { servicio, prisma } = crear();
    prisma.systemSetting.findMany.mockImplementation(async (a: any) => (a.where.OR.some((o: any) => o.companyId === 7) ? [{ companyId: 7, value: GRANTS }] : []));
    await expect(servicio.crear({ id: 2 }, alta('ing_soporte'), 9)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.crear({ id: 2 }, alta('ing_soporte'), 7)).resolves.toBeTruthy();
  });

  it('sin subordinados no ve tipos y el alta responde prohibido, aunque tenga concesión', async () => {
    const { servicio, create } = crear({ sinSubordinados: true });
    expect(await servicio.tiposCreables({ id: 2 }, 7)).toEqual([]);
    const ctx = await servicio.contexto({ id: 2 }, 7);
    expect(ctx.puede).toBe(false);
    await expect(servicio.crear({ id: 2 }, alta('ing_soporte'), 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('el básico exige teléfono; dirección puede omitirlo; la foto fija viaja al alta', async () => {
    const { servicio, create, prisma } = crear();
    await expect(servicio.crear({ id: 2 }, alta('ing_soporte', { telefono: '' }), 7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.crear({ id: 2 }, alta('ing_soporte', { telefono: '123' }), 7)).rejects.toBeInstanceOf(BadRequestException);
    await servicio.crear({ id: 1 }, alta('ing_campo', { telefono: '', avatarUrl: '/uploads/users/cara.jpg' }), 7);
    expect((create.mock.calls[0] as any[])[0]).toMatchObject({ avatarUrl: '/uploads/users/cara.jpg', roleId: 102 });
    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();

    await servicio.crear({ id: 2 }, alta('ing_soporte', { avatarUrl: '/uploads/users/soporte.jpg' }), 7);
    expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: 500, telefono: '5512345678' } }),
    );
    expect((create.mock.calls[1] as any[])[0].avatarUrl).toBe('/uploads/users/soporte.jpg');
    expect((create.mock.calls[1] as any[])[0].managerId).toBe(2);
  });

  it('si el área del rol existe, el instalador o el de soporte caen ahí y no en el departamento del jefe', async () => {
    const { servicio, create } = crear({ departamentos: [{ id: 20, nombre: 'Soporte' }] });
    await servicio.crear({ id: 4 }, alta('ing_soporte'), 7);
    expect((create.mock.calls[0] as any[])[0].departmentId).toBe(20);
  });

  it('Antonio cambia la foto de quien le reporta; no la de otro. Christian sí puede con cualquiera', async () => {
    const { servicio, prisma } = crear();
    prisma.user.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.id === 57) return { id: 57, nombre: 'Instalador', managerId: 2, avatarUrl: '/uploads/users/vieja.jpg', isActive: true };
      if (where.id === 8) return { id: 8, nombre: 'David', managerId: 1, avatarUrl: null, isActive: true };
      return null;
    });
    const propia = await servicio.actualizarFoto({ id: 2 }, 57, { avatarUrl: '/uploads/users/nueva.jpg' }, 7);
    expect(propia).toMatchObject({ id: 57, avatarUrl: '/uploads/users/nueva.jpg', previousAvatar: '/uploads/users/vieja.jpg' });
    await expect(servicio.actualizarFoto({ id: 2 }, 8, { avatarUrl: '/uploads/users/no.jpg' }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.actualizarFoto({ id: 1 }, 8, { avatarUrl: '/uploads/users/ceo.jpg' }, 7)).resolves.toMatchObject({ id: 8 });
  });

  it('David ve el formulario básico con el rol automático; Christian el completo', async () => {
    const { servicio } = crear();
    const david = await servicio.contexto({ id: 3 }, 7);
    expect(david).toMatchObject({ formulario: 'basico', rolAutomatico: true, jefeAutomatico: true, telefonoObligatorio: true, puede: true });
    expect(david.tipos.map((t) => t.roleKey)).toEqual(['ing_campo']);
    expect(david.departamentos).toEqual([]);

    const christian = await servicio.contexto({ id: 1 }, 7);
    expect(christian.formulario).toBe('completo');
    expect(christian.rolAutomatico).toBe(false);
    expect(christian.jefeAutomatico).toBe(false);
    expect(christian.telefonoObligatorio).toBe(false);
    expect(christian.tipos.map((t) => t.roleKey)).toEqual(expect.arrayContaining(['ing_soporte', 'ing_campo', 'dir_admin']));
    expect(christian.tipos.map((t) => t.roleKey)).not.toContain('ceo');
  });
});
