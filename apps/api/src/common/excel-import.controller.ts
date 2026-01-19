import {
  Controller, Post, UploadedFile, UseInterceptors, BadRequestException, Param
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service.js';
import { z } from 'zod';

const MODEL_SCHEMAS = {
  viatic: z.object({
    actividad: z.string().optional(),
    montoSolicitado: z.number().or(z.string()),
    razonGasto: z.string(),
    ticketEvidenciaUrl: z.string().optional(),
    estatusPago: z.string(),
    usuario: z.string().optional(),
  }),
  vehicle: z.object({
    placasVehiculo: z.string(),
    estatusAprobacion: z.string(),
    responsable: z.string().optional(),
    evidenciaEntregaUrl: z.string().optional(),
    evidenciaDevolucionUrl: z.string().optional(),
    fechaInicio: z.string().optional(),
    fechaFin: z.string().optional(),
  }),
  activity: z.object({
    anNumber: z.string(),
    titulo: z.string(),
    estatus: z.string(),
    prioridad: z.string(),
    responsable: z.string().optional(),
  }),
  evidence: z.object({
    tipoEvidencia: z.string(),
    archivoUrl: z.string().optional(),
    aprobada: z.boolean().or(z.string()),
    actividad: z.string().optional(),
    responsable: z.string().optional(),
    estatus: z.string().optional(),
    usuario: z.string().optional(),
  }),
};

@Controller('import')
export class ExcelImportController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(':model')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @Param('model') model: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!(model in MODEL_SCHEMAS)) throw new BadRequestException('Modelo no permitido');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('La hoja especificada no existe en el archivo.');
    }
    // Convertir worksheet a array de objetos (asumiendo primera fila como headers)
    // ExcelJS getRow(1).values puede tener el primer elemento undefined (por 1-based index)
    const headerRow = worksheet.getRow(1).values;
    const headers = Array.isArray(headerRow) ? headerRow.slice(1) : [];
    const rawData: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Saltar headers
      const obj: any = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // colNumber es 1-based, headers está alineado
        const header = headers[colNumber - 1];
        if (typeof header === 'string') {
          obj[header] = cell.value;
        }
      });
      rawData.push(obj);
    });
    const schema = MODEL_SCHEMAS[model as keyof typeof MODEL_SCHEMAS];
    const validData: any[] = [];
    const errors: any[] = [];
    for (const [i, row] of rawData.entries()) {
      try {
        const parsed = schema.parse(row);
        validData.push(parsed);
      } catch (err) {
        if (err instanceof Error && 'errors' in err) {
          errors.push({ row: i + 2, error: (err as any).errors });
        } else {
          errors.push({ row: i + 2, error: err });
        }
      }
    }
    if (validData.length === 0) {
      throw new BadRequestException({ message: 'No hay datos válidos', errors });
    }
    const MODEL_MAP: Record<string, keyof PrismaService> = {
      viatic: 'expense',
      vehicle: 'vehicleControl',
      activity: 'activity',
      evidence: 'evidence',
    };
    const prismaModel = MODEL_MAP[model];
    if (!prismaModel) throw new BadRequestException('Modelo no permitido');
    const result = await (this.prisma as any)[prismaModel].createMany({
      data: validData,
      skipDuplicates: true,
    });
    return {
      message: 'Importación finalizada',
      importados: result.count,
      errores: errors,
    };
  }
}
