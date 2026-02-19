import { Injectable } from '@nestjs/common';
import { ClientTicketStatus } from '@prisma/client';
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

  assign(id: number, activityId: number) {
    return this.prisma['clientTicketRequest'].update({
      where: { id },
      data: { activityId, status: 'ASSIGNED' },
    });
  }

  updateStatus(id: number, status: ClientTicketStatus) {
    return this.prisma['clientTicketRequest'].update({
      where: { id },
      data: { status },
    });
  }
}
