import { BadRequestException } from '@nestjs/common';
import { ToolRequestsService } from './tool-requests.service.js';
import { LARGO_PICKUP_CODE } from './pickup-code.js';

/**
 * «Con base en las instalaciones/servicios asignados, hacer el requerimiento de
 * herramientas particulares; una vez aprobada la solicitud se da acceso a almacén
 * para la recolección» (dueño, 18-09).
 */

const EMPRESA = 7;
const TECNICO = 3;

const HERRAMIENTA = {
  id: 42,
  companyId: EMPRESA,
  status: 'AVAILABLE',
  toolName: 'Ponchadora RJ45',
  model: 'PRO-2',
  serialNumber: 'SN-42',
  panoramicPhotoUrl: '/uploads/tools/a.jpg',
  serialPhotoUrl: '/uploads/tools/b.jpg',
};

function build(opts: { asignado?: unknown } = {}) {
  const prisma = {
    toolInventoryItem: { findFirst: jest.fn().mockResolvedValue(HERRAMIENTA) },
    toolRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 5,
        ...data,
        usuario: { id: TECNICO, nombre: 'Técnico' },
      })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 5, ...data })),
    },
    activityAssignee: {
      findFirst: jest.fn().mockResolvedValue(opts.asignado === undefined ? { id: 50 } : opts.asignado),
    },
  };
  const notificationHierarchy = {
    notifyToolRequested: jest.fn().mockResolvedValue(undefined),
    notifyToolReview: jest.fn().mockResolvedValue(undefined),
    notifyToolPickupReady: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ToolRequestsService(prisma as any, notificationHierarchy as any);
  return { service, prisma, notificationHierarchy };
}

const solicitudBase = {
  usuarioId: TECNICO,
  inventoryItemId: 42,
  reason: 'Alta de cámaras',
  startDate: new Date('2026-09-20T08:00:00.000Z'),
  expectedReturnDate: new Date('2026-09-25T18:00:00.000Z'),
};

describe('crear solicitud contra una OT', () => {
  it('guarda la OT cuando el técnico está asignado a ella', async () => {
    const { service, prisma } = build();
    await service.create({ ...solicitudBase, activityId: 10 }, EMPRESA, 'jose.ramirez@nexara.com.mx');

    expect(prisma.activityAssignee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ activityId: 10, userId: TECNICO, retiradoAt: null }),
      }),
    );
    expect(prisma.toolRequest.create.mock.calls[0][0].data.activityId).toBe(10);
  });

  it('para una OT que no es suya, no', async () => {
    const { service, prisma } = build({ asignado: null });
    await expect(
      service.create({ ...solicitudBase, activityId: 10 }, EMPRESA, 'jose.ramirez@nexara.com.mx'),
    ).rejects.toThrow(/actividad que tengas asignada/);
    expect(prisma.toolRequest.create).not.toHaveBeenCalled();
  });

  it('sin OT sigue siendo un préstamo suelto válido', async () => {
    const { service, prisma } = build();
    await service.create(solicitudBase, EMPRESA, 'jose.ramirez@nexara.com.mx');
    expect(prisma.activityAssignee.findFirst).not.toHaveBeenCalled();
    expect(prisma.toolRequest.create.mock.calls[0][0].data.activityId).toBeNull();
  });

  it('una OT que no es un número se rechaza antes de tocar la base', async () => {
    const { service, prisma } = build();
    await expect(
      service.create({ ...solicitudBase, activityId: -1 }, EMPRESA, 'jose.ramirez@nexara.com.mx'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.activityAssignee.findFirst).not.toHaveBeenCalled();
  });
});

describe('aprobar genera la credencial de recolección', () => {
  function conSolicitud(service: ToolRequestsService) {
    (service as any).findById = jest.fn().mockResolvedValue({
      id: 5,
      usuarioId: TECNICO,
      toolName: 'Ponchadora RJ45',
      companyId: EMPRESA,
    });
    return service;
  }

  it('escribe un código con vencimiento y limpia la recolección anterior', async () => {
    const { service, prisma } = build();
    conSolicitud(service);
    const antes = Date.now();
    await service.approve(5, 9, EMPRESA, 'gerencia@nexara.com.mx');

    const data = prisma.toolRequest.update.mock.calls[0][0].data;
    expect(data.status).toBe('APPROVED');
    expect(data.pickupCode).toHaveLength(LARGO_PICKUP_CODE);
    expect(data.pickupExpiresAt.getTime()).toBeGreaterThan(antes);
    expect(data.pickedUpAt).toBeNull();
    expect(data.pickedUpById).toBeNull();
  });

  it('avisa al solicitante y a quien aprobó', async () => {
    const { service, notificationHierarchy } = build();
    conSolicitud(service);
    await service.approve(5, 9, EMPRESA, 'gerencia@nexara.com.mx');

    expect(notificationHierarchy.notifyToolReview).toHaveBeenCalledWith(
      TECNICO,
      5,
      'approved',
      'Ponchadora RJ45',
    );
    expect(notificationHierarchy.notifyToolPickupReady).toHaveBeenCalledWith(
      expect.objectContaining({ requesterId: TECNICO, approverId: 9, toolRequestId: 5 }),
    );
  });
});

describe('entregar contra el código', () => {
  function servicioConEntrega(solicitud: Record<string, unknown>) {
    const tx = {
      toolInventoryItem: {
        findFirst: jest.fn().mockResolvedValue({ status: 'AVAILABLE' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      toolRequest: { update: jest.fn().mockResolvedValue({ id: 5 }) },
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new ToolRequestsService(prisma as any, {} as any);
    (service as any).findById = jest.fn().mockResolvedValue(solicitud);
    return { service, tx };
  }

  const aprobada = {
    id: 5,
    inventoryItemId: 42,
    usuarioId: TECNICO,
    toolName: 'Ponchadora RJ45',
    pickupCode: 'AC3F7K',
    pickupExpiresAt: new Date(Date.now() + 3600_000),
    pickedUpAt: null,
  };

  it('con el código correcto entrega y sella quién recogió', async () => {
    const { service, tx } = servicioConEntrega(aprobada);
    await service.deliver(5, EMPRESA, {
      pickupCode: 'ac3f7k',
      recogidaPorId: TECNICO,
      managerEmail: 'gerencia@nexara.com.mx',
    });

    const data = tx.toolRequest.update.mock.calls[0][0].data;
    expect(data.status).toBe('IN_USE');
    expect(data.pickedUpAt).toBeInstanceOf(Date);
    expect(data.pickedUpById).toBe(TECNICO);
  });

  it('sin código no entrega nada', async () => {
    const { service, tx } = servicioConEntrega(aprobada);
    await expect(service.deliver(5, EMPRESA, { managerEmail: 'gerencia@nexara.com.mx' })).rejects.toThrow(
      /no coincide/i,
    );
    expect(tx.toolRequest.update).not.toHaveBeenCalled();
  });

  it('con el código vencido tampoco', async () => {
    const { service } = servicioConEntrega({
      ...aprobada,
      pickupExpiresAt: new Date(Date.now() - 3600_000),
    });
    await expect(
      service.deliver(5, EMPRESA, {
        pickupCode: 'AC3F7K',
        managerEmail: 'gerencia@nexara.com.mx',
      }),
    ).rejects.toThrow(/venció/);
  });

  it('una solicitud vieja sin código se entrega como siempre', async () => {
    const { service, tx } = servicioConEntrega({ ...aprobada, pickupCode: null });
    await service.deliver(5, EMPRESA, { managerEmail: 'gerencia@nexara.com.mx' });
    expect(tx.toolRequest.update).toHaveBeenCalled();
    // A falta de quien la recoja, queda el solicitante.
    expect(tx.toolRequest.update.mock.calls[0][0].data.pickedUpById).toBe(TECNICO);
  });
});
