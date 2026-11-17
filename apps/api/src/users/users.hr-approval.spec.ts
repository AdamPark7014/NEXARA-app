jest.mock('../chat/chat.service.js', () => ({ ChatService: class {} }));
jest.mock('../integra/integra-acs-fanout.service.js', () => ({ IntegraAcsFanoutService: class {} }));
jest.mock('../credential-vault/credential-vault.service.js', () => ({ CredentialVaultService: class {} }));
import { UsersService } from './users.service.js';

describe('UsersService updateHrFields no elude aprobaciones', () => {
  function crear() {
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 50, puesto: 'Técnico' }),
        update: jest.fn().mockResolvedValue({ id: 50, puesto: 'Técnico', employeeNumber: null }),
      },
    };
    return { prisma, svc: new UsersService(prisma, {} as any, {} as any) };
  }

  it('rechaza cambio de puesto antes de escribir', async () => {
    const { svc, prisma } = crear();
    await expect(svc.updateHrFields(50, { puesto: 'Coordinador' }, 7)).rejects.toThrow('aprobación de dirección');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each(['managerId', 'sueldoSemanal', 'salary', 'sueldo'])('rechaza %s de forma explícita', async (campo) => {
    const { svc, prisma } = crear();
    await expect(svc.updateHrFields(50, { [campo]: 100 } as any, 7)).rejects.toThrow('aprobación de dirección');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('permite guardar otros campos aunque el formulario reenvíe el puesto sin cambios', async () => {
    const { svc, prisma } = crear();
    await svc.updateHrFields(50, { puesto: ' Técnico ', fechaIngreso: '2026-01-01' }, 7);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 50 }, data: { fechaIngreso: new Date('2026-01-01') } });
  });

  it('conserva aislamiento por empresa', async () => {
    const { svc, prisma } = crear();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(svc.updateHrFields(50, { puesto: 'Coordinador' }, 7)).rejects.toThrow('Usuario no encontrado');
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 50, companyMemberships: { some: { companyId: 7 } } } }));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
