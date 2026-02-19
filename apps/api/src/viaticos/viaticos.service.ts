import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ViaticosService {
  constructor(private readonly prisma: PrismaService) {}

  // Exportar a CSV
  toCSV(viatics: any[]): string {
    if (!viatics.length) return '';
    const fields = Object.keys(viatics[0]);
    const csvRows = [fields.join(',')];
    for (const row of viatics) {
      csvRows.push(
        fields
          .map((f) => {
            let val = row[f];
            if (typeof val === 'object' && val !== null) {
              val = JSON.stringify(val);
            }
            if (typeof val === 'string' && val.includes(',')) {
              val = '"' + val.replace(/"/g, '""') + '"';
            }
            return val ?? '';
          })
          .join(','),
      );
    }
    return csvRows.join('\n');
  }

  // Importar muchos viáticos desde JSON
  importMany(_json: any[]): never {
    throw new Error('Modelo viatico no existe en Prisma.');
  }

  create(dto: any) {
    return this.prisma['viatico'].create({
      data: dto,
    });
  }

  async findAll() {
    const data = await this.prisma['viatico'].findMany({
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
    }));
  }

  async findByDepartment(departmentId: number) {
    const data = await this.prisma['viatico'].findMany({
      where: { User: { departmentId } },
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
    }));
  }

  async findByUser(userId: number) {
    const data = await this.prisma['viatico'].findMany({
      where: { usuarioId: userId },
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
    }));
  }

  findOne(id: number) {
    return this.prisma['viatico'].findUnique({
      where: { id },
      include: { Activity: true, User: true },
    });
  }

  update(id: number, dto: any) {
    return this.prisma['viatico'].update({
      where: { id },
      data: dto,
    });
  }

  remove(id: number) {
    return this.prisma['viatico'].delete({
      where: { id },
    });
  }
}
