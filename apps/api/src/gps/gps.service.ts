import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateGpsDto } from './dto/create-gps.dto.js';

@Injectable()
export class GpsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createGpsDto: CreateGpsDto) {
    return this.prisma['locationTracking'].create({ data: createGpsDto });
  }

  findAll() {
    return this.prisma['locationTracking'].findMany({ include: { usuario: true, actividad: true } });
  }

  findByDepartment(departmentId: number) {
    return this.prisma['locationTracking'].findMany({
      where: { usuario: { departmentId } },
      include: { usuario: true, actividad: true },
    });
  }

  findOne(id: number) {
    return this.prisma['locationTracking'].findUnique({
      where: { id },
      include: { usuario: true, actividad: true },
    });
  }
}
