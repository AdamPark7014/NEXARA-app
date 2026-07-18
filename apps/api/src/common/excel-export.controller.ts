import { Controller, Get, Param, Res, BadRequestException, Query, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExcelExportService } from './excel-export.service.js';
import { RBAC, RbacGuard } from './rbac.guard.js';
import { PERMISSIONS } from './permissions.js';

const ALLOWED_MODELS = ['viatic', 'vehicle', 'activity', 'evidence'];

@Controller('export')
@UseGuards(RbacGuard)
export class ExcelExportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelExport: ExcelExportService,
  ) {}

  @Get(':model')
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ACTIVITIES_EXPORT,
      PERMISSIONS.EVIDENCES_EXPORT,
      PERMISSIONS.VIATICS_EXPORT,
      PERMISSIONS.VEHICLES_EXPORT,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  async exportExcel(
    @Param('model') model: string,
    @Res() res: Response,
    @Query('fields') fields?: string,
  ) {
    const MODEL_MAP: Record<string, keyof PrismaService> = {
      viatic: 'viatico',
      vehicle: 'vehicleControl',
      activity: 'activity',
      evidence: 'evidence',
    };
    if (!ALLOWED_MODELS.includes(model)) throw new BadRequestException('Modelo no permitido');
    const prismaModel = MODEL_MAP[model];
    if (!prismaModel) throw new BadRequestException('Modelo no permitido');
    let data = await (this.prisma as any)[prismaModel].findMany();
    if (fields) {
      const fieldList = fields.split(',').map(f => f.trim());
      data = data.map((row: any) =>
        Object.fromEntries(Object.entries(row).filter(([k]) => fieldList.includes(k))),
      );
    }
    const buffer = await this.excelExport.exportToExcel(data, model);
    res.setHeader('Content-Disposition', `attachment; filename=${model}s.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buffer));
  }
}
