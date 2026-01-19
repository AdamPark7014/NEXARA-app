import { Injectable } from '@nestjs/common';

@Injectable()
export class ViaticosService {
  // constructor(private readonly prisma: PrismaService) {}

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

  create(_dto: any) {
    throw new Error('Modelo viatico no existe en Prisma.');
  }

  findAll() {
    throw new Error('Modelo viatico no existe en Prisma.');
  }

  findByDepartment(_departmentId: number) {
    throw new Error('Modelo viatico no existe en Prisma.');
  }

  findOne(_id: number) {
    throw new Error('Modelo viatico no existe en Prisma.');
  }

  update(_id: number, _dto: any) {
    throw new Error('Modelo viatico no existe en Prisma.');
  }

  remove(_id: number) {
    throw new Error('Modelo viatico no existe en Prisma.');
  }
}
