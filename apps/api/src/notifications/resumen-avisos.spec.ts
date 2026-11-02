import { ResumenAvisosService } from './resumen-avisos.service.js';

function armar(filas: Array<{ id: number; userId: number; category: string; companyId: number | null }>, marcadas = 1) {
  const prisma: any = {
    notification: {
      findMany: jest.fn().mockResolvedValue(filas),
      updateMany: jest.fn().mockResolvedValue({ count: marcadas }),
    },
  };
  const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 1 }) };
  return { service: new ResumenAvisosService(prisma, notifications as never), prisma, notifications };
}

describe('ResumenAvisosService', () => {
  it('una tarjeta por persona con lo suyo, y las filas quedan marcadas', async () => {
    const { service, prisma, notifications } = armar([
      { id: 1, userId: 5, category: 'sla-breach', companyId: 1 },
      { id: 2, userId: 5, category: 'attendance', companyId: 1 },
      { id: 3, userId: 6, category: 'evidences', companyId: 1 },
    ]);
    expect(await service.revisar()).toBe(2);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] }, entrega: 'resumen' },
      data: { entrega: 'resumida' },
    });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 5,
        category: 'resumen-avisos',
        title: 'Resumen: 2 avisos agrupados',
        message: '1 de asistencia · 1 vencidas',
        relatedUrl: '/erp/notifications-center?view=agrupados',
      }),
    );
  });

  it('si otra instancia ya las marcó, no manda otra tarjeta', async () => {
    const { service, notifications } = armar([{ id: 1, userId: 5, category: 'sales', companyId: 1 }], 0);
    expect(await service.revisar()).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('sin nada agrupado no hace nada', async () => {
    const { service, notifications } = armar([]);
    expect(await service.revisar()).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});
