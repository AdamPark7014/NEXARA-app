import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from '../common/permissions.js';
import { ToolRequestsService } from './tool-requests.service.js';

/**
 * Defensa en profundidad: CONSOLE_ADMIN (David) no aprueba aunque el mock
 * lo tenga; RbacGuard puede dejar pasar isSuperAdmin — el service exige email.
 */
describe('ToolRequestsService approve RBAC por email', () => {
  const prisma = {
    toolRequest: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const notificationHierarchy = {
    notifyToolReview: jest.fn(),
    notifyToolPickupReady: jest.fn(),
  };
  const service = new ToolRequestsService(prisma as any, notificationHierarchy as any);

  beforeEach(() => {
    jest.clearAllMocks();
    (service as any).findById = jest.fn().mockResolvedValue({
      id: 1,
      usuarioId: 3,
      toolName: 'Taladro',
    });
  });

  it('operaciones@ con CONSOLE_ADMIN en mock NO puede approve', async () => {
    await expect(
      service.approve(1, 99, 7, 'operaciones@nexara.com.mx'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.toolRequest.update).not.toHaveBeenCalled();
  });

  it('developer@ (superadmin típico) tampoco aprueba por email', async () => {
    await expect(service.approve(1, 1, 7, 'developer@nexara.com.mx')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('Iván sí puede approve', async () => {
    prisma.toolRequest.update.mockResolvedValue({ id: 1, status: 'APPROVED', pickupCode: 'ABCDEF' });
    await service.approve(1, 2, 7, 'administracion.ventas@nexara.com.mx');
    expect(prisma.toolRequest.update).toHaveBeenCalled();
  });

  it('operaciones@ con CONSOLE_ADMIN no aprueba renovación', async () => {
    await expect(
      service.approveRenewal(
        10,
        {
          id: 99,
          email: 'operaciones@nexara.com.mx',
          isSuperAdmin: false,
          permissions: [PERMISSIONS.CONSOLE_ADMIN],
          departmentId: 1,
        },
        7,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Iván aprueba renovación sin CONSOLE_ADMIN', async () => {
    prisma.toolRequest.update = jest.fn().mockResolvedValue({});
    (prisma as any).toolRenewal = {
      findFirst: jest.fn().mockResolvedValue({
        id: 10,
        companyId: 7,
        toolRequestId: 1,
        newReturnDate: new Date('2026-10-01'),
        toolRequest: { usuarioId: 3, toolName: 'Taladro', usuario: { department: { id: 1 } } },
      }),
      update: jest.fn().mockResolvedValue({ id: 10, status: 'APPROVED' }),
    };
    (service as any).createNotification = jest.fn().mockResolvedValue(undefined);

    await service.approveRenewal(
      10,
      {
        id: 2,
        email: 'administracion.ventas@nexara.com.mx',
        permissions: [PERMISSIONS.TOOLS_MANAGE],
      },
      7,
    );
    expect((prisma as any).toolRenewal.update).toHaveBeenCalled();
  });
});
