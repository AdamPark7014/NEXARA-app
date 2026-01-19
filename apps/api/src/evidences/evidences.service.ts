import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';

@Injectable()
export class EvidencesService {
  constructor(private readonly prisma: PrismaService) {}

  // Exportar a CSV
  toCSV(evidences: any[]): string {
    if (!evidences.length) return '';
    const fields = Object.keys(evidences[0]);
    const csvRows = [fields.join(',')];
    for (const row of evidences) {
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

  // Importar muchas evidencias desde JSON
  async importMany(json: any[]): Promise<any[]> {
    if (!Array.isArray(json)) throw new Error('Formato inválido');
    // Validar campos mínimos
    const valid = json.filter(
      (e) => e.tipoEvidencia && e.archivoUrl && e.userId && e.actividadId,
    );
    const created: any[] = [];
    for (const dto of valid) {
      try {
        // Evitar duplicados por archivoUrl y actividadId
        const exists = await this.prisma['evidence'].findFirst({
          where: { archivoUrl: dto.archivoUrl, actividadId: dto.actividadId },
        });
        if (!exists) {
          created.push(await this.prisma['evidence'].create({ data: dto }));
        }
      } catch (err) {
        // opcional: log error
      }
    }
    return created;
  }

  create(createEvidenceDto: CreateEvidenceDto) {
    return this.prisma['evidence'].create({ data: createEvidenceDto });
  }

  findAll() {
    return this.prisma['evidence'].findMany({
      include: { user: true, actividad: true },
    });
  }

  findByDepartment(departmentId: number) {
    return this.prisma['evidence'].findMany({
      where: { user: { departmentId } },
      include: { user: true, actividad: true },
    });
  }

  findOne(id: number) {
    return this.prisma['evidence'].findUnique({
      where: { id },
      include: { user: true, actividad: true },
    });
  }

  update(id: number, updateEvidenceDto: UpdateEvidenceDto) {
    return this.prisma['evidence'].update({
      where: { id },
      data: updateEvidenceDto,
    });
  }

  remove(id: number) {
    return this.prisma['evidence'].delete({ where: { id } });
  }
}
