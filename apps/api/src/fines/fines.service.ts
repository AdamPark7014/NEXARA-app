import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateFineDto {
  usuarioId: number;
  tipo: 'actividad' | 'vehiculo' | 'asistencia' | 'herramienta';
  razon: string;
  descripcion?: string;
  monto: number;
  referenciaId?: number;
}

export interface UpdateFineDto {
  razon?: string;
  descripcion?: string;
  monto?: number;
  estatusPago?: string;
  notas?: string;
}

@Injectable()
export class FinesService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateFineDto) {
    return this.prisma.fine.create({
      data: {
        usuarioId: data.usuarioId,
        tipo: data.tipo,
        razon: data.razon,
        descripcion: data.descripcion,
        monto: data.monto,
        referenciaId: data.referenciaId,
        estatusPago: 'Pendiente',
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
    return this.prisma.fine.findMany({
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });
  }

  async findByUser(usuarioId: number) {
    return this.prisma.fine.findMany({
      where: { usuarioId },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });
  }

  async findByType(tipo: string) {
    return this.prisma.fine.findMany({
      where: { tipo },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });
  }

  async findByUserAndType(usuarioId: number, tipo: string) {
    return this.prisma.fine.findMany({
      where: { usuarioId, tipo },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });
  }

  async update(id: number, data: UpdateFineDto) {
    return this.prisma.fine.update({
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
      },
    });
  }

  async delete(id: number) {
    return this.prisma.fine.delete({
      where: { id },
    });
  }

  async getTotalByUser(usuarioId: number, tipo?: string) {
    const fines = await this.prisma.fine.findMany({
      where: {
        usuarioId,
        ...(tipo && { tipo }),
      },
      select: {
        monto: true,
      },
    });
    return fines.reduce((sum, fine) => sum + Number(fine.monto), 0);
  }

  async getCountByUser(usuarioId: number, tipo?: string) {
    return this.prisma.fine.count({
      where: {
        usuarioId,
        ...(tipo && { tipo }),
      },
    });
  }
}
