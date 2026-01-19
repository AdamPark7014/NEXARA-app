import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  // Dummy implementation to avoid controller errors
  toCSV(_data: any[]): string {
    return '';
  }

  importMany(_json: any[]): void {
    throw new Error('importMany no implementado en ActivitiesService');
  }


  async create(createActivityDto: CreateActivityDto) {
    return this.prisma['activity'].create({ data: createActivityDto });
  }

  async findAll() {
    return this.prisma['activity'].findMany({
      include: { creador: true, responsable: true },
    });
  }

  async findByDepartment(departmentId: number) {
    // Busca actividades donde el responsable es de ese departamento
    return this.prisma['activity'].findMany({
      where: { responsable: { departmentId } },
      include: { creador: true, responsable: true },
    });
  }

  async findByResponsible(userId: number) {
    return this.prisma['activity'].findMany({
      where: { responsableId: userId },
      include: { creador: true, responsable: true },
    });
  }

  async findOne(id: number) {
    return this.prisma['activity'].findUnique({
      where: { id },
      include: { creador: true, responsable: true },
    });
  }

  async update(id: number, updateActivityDto: UpdateActivityDto) {
    return this.prisma['activity'].update({
      where: { id },
      data: updateActivityDto,
    });
  }

  async remove(id: number) {
    return this.prisma['activity'].delete({ where: { id } });
  }
}
