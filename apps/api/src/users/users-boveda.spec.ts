import { UsersService } from './users.service.js';

/** La contraseña que pasa por `UsersService` (alta y cambio) llega a la bóveda del dueño; nada más la toca. */
describe('UsersService → bóveda de contraseñas', () => {
  function crear() {
    const vault = { guardar: jest.fn(async () => true), olvidar: jest.fn(async () => undefined) };
    const usuario = { id: 11, nombre: 'Persona Nueva', email: 'nueva@nexara.com.mx', employeeNumber: null, isActive: true, roleId: 3 };
    const tx: any = {
      user: { findFirst: jest.fn(async () => null), create: jest.fn(async () => usuario), update: jest.fn(async () => usuario) },
      userCompany: { count: jest.fn(async () => 0), upsert: jest.fn(async () => ({})) },
    };
    const prisma: any = {
      companyProfile: { findFirst: jest.fn(async () => ({ id: 7, seatLimit: 50, billingStatus: 'active' })) },
      userCompany: { count: jest.fn(async () => 1), updateMany: jest.fn(async () => ({ count: 1 })) },
      user: {
        findFirst: jest.fn(async () => ({ id: 11 })),
        findUnique: jest.fn(async () => usuario),
        update: jest.fn(async () => usuario),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const servicio = new UsersService(prisma, { addUserToOrgChannels: jest.fn(async () => undefined) } as any, {} as any, vault as any);
    const s = servicio as any;
    jest.spyOn(s, 'resolveRoleId').mockResolvedValue(3);
    jest.spyOn(s, 'resolveRoleKeyFromRoleId').mockResolvedValue('ing_soporte');
    jest.spyOn(s, 'resolveDepartmentId').mockResolvedValue(4);
    jest.spyOn(s, 'resolveManagerId').mockResolvedValue(null);
    jest.spyOn(s, 'resolveEmployeeNumber').mockResolvedValue('NXR25SYS011');
    jest.spyOn(s, 'pushAcsFromErp').mockResolvedValue(null);
    return { servicio, vault, prisma };
  }

  it('alta: la contraseña inicial se guarda en la bóveda con la empresa del alta', async () => {
    const { servicio, vault, prisma } = crear();
    prisma.user.findFirst.mockResolvedValueOnce(null); // el correo no está repetido
    await servicio.create({ nombre: 'Persona Nueva', email: 'Nueva@Nexara.com.mx', password: 'Alta-Prueba-4444', roleId: 3, departmentId: 4 } as any, 7);
    expect(vault.guardar).toHaveBeenCalledWith({ userId: 11, email: 'nueva@nexara.com.mx', password: 'Alta-Prueba-4444', companyId: 7 });
  });

  it('cambio de contraseña: se guarda la nueva; si la bóveda no puede, olvida la vieja', async () => {
    const { servicio, vault } = crear();
    await servicio.update(11, { password: 'Cambio-Prueba-5555' } as any, 7);
    expect(vault.guardar).toHaveBeenCalledWith({ userId: 11, email: 'nueva@nexara.com.mx', password: 'Cambio-Prueba-5555', companyId: 7 });
    expect(vault.olvidar).not.toHaveBeenCalled();

    vault.guardar.mockResolvedValueOnce(false as any);
    await servicio.update(11, { password: 'Otro-Prueba-6666' } as any, 7);
    expect(vault.olvidar).toHaveBeenCalledWith(11);
  });

  it('un cambio que no toca la contraseña no toca la bóveda', async () => {
    const { servicio, vault } = crear();
    await servicio.update(11, { nombre: 'Otro Nombre' } as any, 7);
    expect(vault.guardar).not.toHaveBeenCalled();
    expect(vault.olvidar).not.toHaveBeenCalled();
  });

  it('sin bóveda inyectada (pruebas, otros módulos) el alta y el cambio siguen funcionando', async () => {
    const prisma: any = crear().prisma;
    const servicio = new UsersService(prisma, {} as any, {} as any);
    jest.spyOn(servicio as any, 'resolveRoleId').mockResolvedValue(3);
    jest.spyOn(servicio as any, 'pushAcsFromErp').mockResolvedValue(null);
    await expect(servicio.update(11, { password: 'Sin-Boveda-7777' } as any, 7)).resolves.toBeTruthy();
  });
});
