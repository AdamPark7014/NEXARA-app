import { Injectable } from '@nestjs/common';
import { ActivityWorkType, ClientTicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

@Injectable()
export class ClientTicketRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(status?: ClientTicketStatus, query?: PaginationQueryDto, companyId?: number | null) {
    const where: any = { ...companyWhere(companyId ?? null) };
    if (status) where.status = status;
    const include = { client: true, branch: true, activity: true };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['clientTicketRequest'].findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma['clientTicketRequest'].count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['clientTicketRequest'].findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, companyId?: number | null) {
    const request = await this.prisma.clientTicketRequest.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: { client: true, branch: true, activity: true },
    });
    assertCompanyAccess(request, companyId ?? null, 'Solicitud');
    return request;
  }

  async assign(id: number, activityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const request = await this.prisma.clientTicketRequest.findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(request, tenantId, 'Solicitud');

    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(activity, tenantId, 'Actividad');

    const workType: ActivityWorkType =
      request.requestType === 'PREVENTIVE_INVENTORY' ? 'PREVENTIVE_INVENTORY' : 'ISSUE';

    return this.prisma.$transaction(async (tx) => {
      await tx.activity.update({
        where: { id: activityId },
        data:
          workType === 'PREVENTIVE_INVENTORY'
            ? { workType, ticketType: 'PREVENTIVO', ticketTypeCustom: null }
            : { workType },
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
            ...companyWhere(tenantId),
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
            companyId: tenantId,
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

  async updateStatus(id: number, status: ClientTicketStatus, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const request = await this.prisma.clientTicketRequest.findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(request, tenantId, 'Solicitud');
    return this.prisma.clientTicketRequest.update({
      where: { id },
      data: { status },
    });
  }
}
