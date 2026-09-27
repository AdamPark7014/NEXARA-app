import { PurchaseOrderOverdueCronService, CATEGORIA_OC_ATRASADAS } from './purchase-order-overdue.cron';

// 2026-09-27 15:00 UTC = 09:00 en México.
const NOW = new Date('2026-09-27T15:00:00.000Z');

function orden(parcial: Record<string, unknown> & { id: number }) {
  return {
    poNumber: `OC-${String(parcial.id).padStart(4, '0')}`,
    companyId: 1,
    status: 'CONFIRMED',
    expectedDate: new Date('2026-09-26T00:00:00.000Z'),
    createdById: 10,
    approvedById: null,
    supplier: { name: 'Syscom' },
    createdBy: { nombre: 'Ana María López Ruiz' },
    approvedBy: null,
    items: [{ quantity: '5', receivedQty: '0' }],
    ...parcial,
  };
}

function build(opts: {
  ordenes?: any[];
  cadenas?: Record<number, number[]>;
  membresias?: Array<{ companyId: number; userId: number }>;
  yaAvisados?: Array<{ userId: number; companyId: number | null }>;
} = {}) {
  const prisma: any = {
    purchaseOrder: { findMany: jest.fn().mockResolvedValue(opts.ordenes ?? [orden({ id: 12 })]) },
    userCompany: { findMany: jest.fn().mockResolvedValue(opts.membresias ?? []) },
    notification: { findMany: jest.fn().mockResolvedValue(opts.yaAvisados ?? []) },
  };
  const notifications: any = { createNotification: jest.fn().mockResolvedValue({ id: 1 }) };
  const hierarchy: any = {
    cadenaDeMando: jest.fn(async (userId: number) => opts.cadenas?.[userId] ?? []),
  };
  const service = new PurchaseOrderOverdueCronService(prisma, notifications, hierarchy);
  return { service, prisma, notifications, hierarchy };
}

describe('PurchaseOrderOverdueCronService', () => {
  it('consulta sólo órdenes por recibir cuya fecha esperada es anterior al día de hoy en México', async () => {
    const { service, prisma } = build();
    await service.sendOverdueAlerts(NOW);

    const where = prisma.purchaseOrder.findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.status.in).toEqual(['SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED']);
    expect(where.expectedDate.lt).toEqual(new Date('2026-09-27T00:00:00.000Z'));
  });

  it('sin órdenes atrasadas no consulta jefes ni envía nada', async () => {
    const { service, notifications, hierarchy } = build({ ordenes: [] });

    await expect(service.sendOverdueAlerts(NOW)).resolves.toBe(0);
    expect(hierarchy.cadenaDeMando).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('avisa al comprador y a su jefe con un solo resumen cada uno', async () => {
    const { service, notifications } = build({
      ordenes: [orden({ id: 12 }), orden({ id: 13 })],
      cadenas: { 10: [50] },
      membresias: [
        { companyId: 1, userId: 10 },
        { companyId: 1, userId: 50 },
      ],
    });

    await expect(service.sendOverdueAlerts(NOW)).resolves.toBe(2);
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);

    const payloads = notifications.createNotification.mock.calls.map((c: any[]) => c[0]);
    const comprador = payloads.find((p: any) => p.userId === 10);
    const jefe = payloads.find((p: any) => p.userId === 50);

    expect(comprador.title).toBe('2 órdenes de compra atrasadas');
    expect(jefe.title).toBe('2 órdenes de compra atrasadas en tu equipo');
    for (const p of payloads) {
      expect(p.type).toBe('SLA_ALERT');
      expect(p.category).toBe(CATEGORIA_OC_ATRASADAS);
      expect(p.entityType).toBe('PurchaseOrder');
      expect(p.companyId).toBe(1);
      expect(p.dedupeSeconds).toBe(0);
      expect(p.relatedUrl).toBe('/erp/procurement?tab=orders');
    }
  });

  it('una sola orden lleva su id y enlaza directo a ella', async () => {
    const { service, notifications } = build();

    await service.sendOverdueAlerts(NOW);
    const p = notifications.createNotification.mock.calls[0][0];
    expect(p.userId).toBe(10);
    expect(p.relatedEntityId).toBe(12);
    expect(p.relatedUrl).toBe('/erp/procurement?tab=orders&id=12');
  });

  it('no avisa a jefes que no son de la empresa de la orden ni a los inactivos', async () => {
    const { service, notifications } = build({
      cadenas: { 10: [50, 77] }, // 77 (p. ej. Christian de otra empresa) no es miembro de la empresa 1
      membresias: [{ companyId: 1, userId: 50 }],
    });

    await service.sendOverdueAlerts(NOW);
    const destinatarios = notifications.createNotification.mock.calls.map((c: any[]) => c[0].userId).sort();
    expect(destinatarios).toEqual([10, 50]);
  });

  it('acota la búsqueda de miembros a las empresas de las órdenes y a usuarios activos', async () => {
    const { service, prisma } = build({
      ordenes: [orden({ id: 1, companyId: 1 }), orden({ id: 2, companyId: 2, createdById: 20 })],
      cadenas: { 10: [50], 20: [60] },
    });

    await service.sendOverdueAlerts(NOW);
    const where = prisma.userCompany.findMany.mock.calls[0][0].where;
    expect(where.companyId.in.sort()).toEqual([1, 2]);
    expect(where.userId.in.sort()).toEqual([10, 20, 50, 60]);
    expect(where.user).toEqual({ isActive: true });
  });

  it('no repite el resumen a quien ya lo recibió hoy', async () => {
    const { service, prisma, notifications } = build({
      cadenas: { 10: [50] },
      membresias: [{ companyId: 1, userId: 50 }],
      yaAvisados: [{ userId: 10, companyId: 1 }],
    });

    await expect(service.sendOverdueAlerts(NOW)).resolves.toBe(1);
    const destinatarios = notifications.createNotification.mock.calls.map((c: any[]) => c[0].userId);
    expect(destinatarios).toEqual([50]);

    // La revisión de «ya avisado» se limita al día de hoy en México y a esta categoría.
    const where = prisma.notification.findMany.mock.calls[0][0].where;
    expect(where.category).toBe(CATEGORIA_OC_ATRASADAS);
    expect(where.createdAt.gte).toEqual(new Date('2026-09-27T06:00:00.000Z'));
  });

  it('si falla el aviso de una persona, los demás se envían', async () => {
    const { service, notifications } = build({
      cadenas: { 10: [50] },
      membresias: [{ companyId: 1, userId: 50 }],
    });
    notifications.createNotification.mockRejectedValueOnce(new Error('sin conexión'));

    await expect(service.sendOverdueAlerts(NOW)).resolves.toBe(1);
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
  });

  it('si no se puede obtener la cadena de mando de alguien, al menos se avisa al comprador', async () => {
    const { service, notifications, hierarchy } = build();
    hierarchy.cadenaDeMando.mockRejectedValueOnce(new Error('bd caída'));

    await expect(service.sendOverdueAlerts(NOW)).resolves.toBe(1);
    expect(notifications.createNotification.mock.calls[0][0].userId).toBe(10);
  });
});
