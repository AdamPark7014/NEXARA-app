import { ActivitiesService } from './activities.service.js';

describe('alta de actividad: proyecto del cliente y empresa', () => {
  function preparar(proyecto: unknown) {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) }, operationalProject: { findFirst: jest.fn().mockResolvedValue(proyecto) }, activity: { create: jest.fn() } };
    const servicio = new ActivitiesService(prisma as any, {} as any, {} as any);
    return { servicio, prisma };
  }
  const dto = { titulo: 'Instalar cámaras en acceso', responsableId: 8, creadoPorId: 9, clientId: 10, ticketType: 'INSTALACION' as const };
  it('rechaza instalación sin proyecto si el cliente tiene uno vigente', async () => {
    const { servicio, prisma } = preparar({ id: 4 });
    await expect(servicio.create(dto, 7)).rejects.toThrow('¿De qué proyecto es?');
    expect(prisma.operationalProject.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 7, clientId: 10, deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }));
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });
  it('rechaza un proyecto de otro cliente', async () => {
    const { servicio, prisma } = preparar({ id: 4, clientId: 11 });
    await expect(servicio.create({ ...dto, projectId: 4 }, 7)).rejects.toThrow('este cliente y de tu empresa');
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });
  it('rechaza un proyecto fuera de empresa sin escribir la actividad', async () => {
    const { servicio, prisma } = preparar(null);
    await expect(servicio.create({ ...dto, projectId: 4 }, 7)).rejects.toThrow('este cliente y de tu empresa');
    expect(prisma.operationalProject.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 4, companyId: 7, deletedAt: null } }));
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });
});
