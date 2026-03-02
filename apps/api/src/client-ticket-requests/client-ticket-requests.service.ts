import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityWorkType, ClientTicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ClientTicketRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(status?: ClientTicketStatus) {
    const where = status ? { status } : undefined;
    return this.prisma['clientTicketRequest'].findMany({
      where,
      include: { client: true, branch: true, activity: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assign(id: number, activityId: number) {
    const request = await this.prisma.clientTicketRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');

    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException('Actividad no encontrada');

    const workType: ActivityWorkType =
      request.requestType === 'PREVENTIVE_INVENTORY' ? 'PREVENTIVE_INVENTORY' : 'ISSUE';

    return this.prisma.$transaction(async (tx) => {
      await tx.activity.update({
        where: { id: activityId },
        data: { workType },
      });

      const assigned = await tx.clientTicketRequest.update({
        where: { id },
        data: { activityId, status: 'ASSIGNED' },
      });

      if (request.requestType === 'PREVENTIVE_INVENTORY' && request.clientId && request.branchId) {
        const previous = await tx.inventorySnapshot.findFirst({
          where: {
            clientId: request.clientId,
            branchId: request.branchId,
          },
          orderBy: { createdAt: 'desc' },
          include: { items: true },
        });

        await tx.inventorySnapshot.upsert({
          where: { requestId: request.id },
          update: {
            activityId,
            title: `Mantenimiento e inventario ${activity.anNumber || `ACT-${activity.id}`}`,
            previousCount: previous?.currentCount ?? previous?.items?.length ?? 0,
            currentCount: previous?.currentCount ?? previous?.items?.length ?? 0,
            deltaCount: 0,
          },
          create: {
            requestId: request.id,
            activityId,
            clientId: request.clientId,
            branchId: request.branchId,
            title: `Mantenimiento e inventario ${activity.anNumber || `ACT-${activity.id}`}`,
            status: 'PENDING',
            previousCount: previous?.currentCount ?? previous?.items?.length ?? 0,
            currentCount: previous?.currentCount ?? previous?.items?.length ?? 0,
            deltaCount: 0,
            createdByType: 'CONSOLE',
            createdById: activity.responsableId || activity.creadoPorId,
          },
        });
      }

      return assigned;
    });
  }

  updateStatus(id: number, status: ClientTicketStatus) {
    return this.prisma['clientTicketRequest'].update({
      where: { id },
      data: { status },
    });
  }
}
