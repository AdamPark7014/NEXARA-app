import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ToolRequestStatus } from '@prisma/client';

export interface CreateToolRequestDto {
  usuarioId: number;
  toolName: string;
  model: string;
  serialNumber: string;
  reason: string;
  estimatedPeriod: string;
  generalPhotoUrl: string;
  specificationsPhotoUrl: string;
}

export interface UpdateToolRequestDto {
  status?: ToolRequestStatus;
  approvalDate?: Date;
  deliveryDate?: Date;
  returnDate?: Date;
  expectedReturnDate?: Date;
  damageDescription?: string;
  damagePhotoUrl?: string;
  adminNotes?: string;
  approvedBy?: number;
}

@Injectable()
export class ToolRequestsService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateToolRequestDto) {
    return this.prisma.toolRequest.create({
      data: {
        usuarioId: data.usuarioId,
        toolName: data.toolName,
        model: data.model,
        serialNumber: data.serialNumber,
        reason: data.reason,
        estimatedPeriod: data.estimatedPeriod,
        generalPhotoUrl: data.generalPhotoUrl,
        specificationsPhotoUrl: data.specificationsPhotoUrl,
        status: 'PENDING',
      },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.toolRequest.findMany({
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
            department: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        requestDate: 'desc',
      },
    });
  }

  async findByUser(usuarioId: number) {
    return this.prisma.toolRequest.findMany({
      where: { usuarioId },
      include: {
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        requestDate: 'desc',
      },
    });
  }

  async findByStatus(status: ToolRequestStatus) {
    return this.prisma.toolRequest.findMany({
      where: { status },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        requestDate: 'desc',
      },
    });
  }

  async findActiveByUser(usuarioId: number) {
    return this.prisma.toolRequest.findMany({
      where: {
        usuarioId,
        status: {
          in: ['APPROVED', 'IN_USE'],
        },
      },
      include: {
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        requestDate: 'desc',
      },
    });
  }

  async findById(id: number) {
    return this.prisma.toolRequest.findUnique({
      where: { id },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
            department: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  async update(id: number, data: UpdateToolRequestDto) {
    return this.prisma.toolRequest.update({
      where: { id },
      data,
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  async approve(id: number, approvedBy: number) {
    return this.prisma.toolRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvalDate: new Date(),
        approvedBy,
      },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  async deliver(id: number) {
    return this.prisma.toolRequest.update({
      where: { id },
      data: {
        status: 'IN_USE',
        deliveryDate: new Date(),
      },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  async return(id: number, damageDescription?: string, damagePhotoUrl?: string) {
    const status = damageDescription ? 'DAMAGED' : 'RETURNED';
    return this.prisma.toolRequest.update({
      where: { id },
      data: {
        status,
        returnDate: new Date(),
        damageDescription,
        damagePhotoUrl,
      },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  async reject(id: number, approvedBy: number, adminNotes: string) {
    return this.prisma.toolRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy,
        adminNotes,
      },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  async delete(id: number) {
    return this.prisma.toolRequest.delete({
      where: { id },
    });
  }

  async getStatsByUser(usuarioId: number) {
    const [inUse, pending, returned, damaged] = await Promise.all([
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'IN_USE' },
      }),
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'PENDING' },
      }),
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'RETURNED' },
      }),
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'DAMAGED' },
      }),
    ]);

    return {
      inUse,
      pending,
      returned,
      damaged,
      total: inUse + pending + returned + damaged,
    };
  }
}
